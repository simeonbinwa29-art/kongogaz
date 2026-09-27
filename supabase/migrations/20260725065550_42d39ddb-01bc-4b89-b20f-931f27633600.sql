
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancel_reason text;

CREATE POLICY "Users cancel own orders"
  ON public.orders FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id AND status IN ('pending','processing'))
  WITH CHECK (auth.uid() = user_id AND status = 'cancelled');

CREATE TABLE public.promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  discount_type text NOT NULL DEFAULT 'percent',
  discount_value numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.promotions TO anon;
GRANT SELECT ON public.promotions TO authenticated;
GRANT ALL ON public.promotions TO service_role;

ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read active promotions"
  ON public.promotions FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins read all promotions"
  ON public.promotions FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage promotions"
  ON public.promotions FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_promotions_updated_at
  BEFORE UPDATE ON public.promotions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.promotions (title, description, discount_type, discount_value, is_active) VALUES
  ('Livraison gratuite dès 2 bouteilles', 'Sur toutes les communes de Kinshasa, aujourd''hui.', 'shipping', 100, true),
  ('-10% sur le kit détendeur', 'À l''achat d''une bouteille 12 kg complète.', 'percent', 10, true),
  ('Programme fidélité', 'Votre 10ᵉ recharge est offerte.', 'loyalty', 100, true);
