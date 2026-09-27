
-- Extend profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referral_code text UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS loyalty_credit integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_order_placed boolean NOT NULL DEFAULT false;

-- Extend orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS credit_applied integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referral_bonus_awarded boolean NOT NULL DEFAULT false;

-- Helper: generate a short unique referral code
CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  candidate text;
  exists_already boolean;
BEGIN
  LOOP
    candidate := 'BG' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    SELECT EXISTS(SELECT 1 FROM public.profiles WHERE referral_code = candidate) INTO exists_already;
    EXIT WHEN NOT exists_already;
  END LOOP;
  RETURN candidate;
END;
$$;

-- Backfill referral_code for existing profiles
UPDATE public.profiles SET referral_code = public.generate_referral_code() WHERE referral_code IS NULL;

-- Public lookup for referral codes (returns only the referrer's id)
CREATE OR REPLACE FUNCTION public.find_referrer_by_code(_code text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.profiles WHERE referral_code = upper(trim(_code)) LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.find_referrer_by_code(text) TO anon, authenticated;

-- Update handle_new_user: attach referral_code + referred_by from raw_user_meta_data
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  ref_code text;
  ref_uid uuid;
BEGIN
  ref_code := NULLIF(trim(NEW.raw_user_meta_data->>'referral_code'), '');
  IF ref_code IS NOT NULL THEN
    SELECT id INTO ref_uid FROM public.profiles WHERE referral_code = upper(ref_code);
  END IF;

  INSERT INTO public.profiles (id, full_name, phone_whatsapp, default_commune, referral_code, referred_by)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone_whatsapp', ''),
    COALESCE(NEW.raw_user_meta_data->>'default_commune', ''),
    public.generate_referral_code(),
    ref_uid
  );
  RETURN NEW;
END;
$$;

-- Award referral bonus on delivery
CREATE OR REPLACE FUNCTION public.award_referral_on_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  buyer_profile public.profiles;
  ref_id uuid;
BEGIN
  IF NEW.status <> 'delivered' OR OLD.status = 'delivered' OR NEW.referral_bonus_awarded THEN
    RETURN NEW;
  END IF;
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT * INTO buyer_profile FROM public.profiles WHERE id = NEW.user_id;
  IF NOT FOUND OR buyer_profile.first_order_placed THEN
    RETURN NEW;
  END IF;

  UPDATE public.profiles SET first_order_placed = true WHERE id = NEW.user_id;

  ref_id := buyer_profile.referred_by;
  IF ref_id IS NOT NULL THEN
    UPDATE public.profiles
      SET loyalty_credit = loyalty_credit + 5000
      WHERE id = ref_id;
    NEW.referral_bonus_awarded := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_award_referral ON public.orders;
CREATE TRIGGER trg_award_referral
BEFORE UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.award_referral_on_delivery();

-- Debit loyalty credit safely (used at checkout)
CREATE OR REPLACE FUNCTION public.consume_loyalty_credit(_amount integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  available integer;
  used integer;
BEGIN
  IF uid IS NULL OR _amount <= 0 THEN RETURN 0; END IF;
  SELECT loyalty_credit INTO available FROM public.profiles WHERE id = uid;
  used := LEAST(available, _amount);
  UPDATE public.profiles SET loyalty_credit = loyalty_credit - used WHERE id = uid;
  RETURN used;
END;
$$;

GRANT EXECUTE ON FUNCTION public.consume_loyalty_credit(integer) TO authenticated;
