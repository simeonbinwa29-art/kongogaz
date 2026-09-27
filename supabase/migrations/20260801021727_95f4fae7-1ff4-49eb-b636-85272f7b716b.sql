-- DEPOSITS
CREATE TABLE public.deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  commune text NOT NULL,
  neighborhood text,
  address text,
  phone text,
  whatsapp text,
  latitude numeric,
  longitude numeric,
  subscription_plan text NOT NULL DEFAULT 'standard',
  subscription_status text NOT NULL DEFAULT 'active',
  valid_until date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deposits_plan_chk CHECK (subscription_plan IN ('standard','premium')),
  CONSTRAINT deposits_status_chk CHECK (subscription_status IN ('active','expired'))
);

GRANT SELECT ON public.deposits TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deposits TO authenticated;
GRANT ALL ON public.deposits TO service_role;

ALTER TABLE public.deposits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read active deposits" ON public.deposits
  FOR SELECT USING (is_active = true);
CREATE POLICY "Owners read own deposit" ON public.deposits
  FOR SELECT TO authenticated USING (owner_user_id = auth.uid());
CREATE POLICY "Owners update own deposit" ON public.deposits
  FOR UPDATE TO authenticated USING (owner_user_id = auth.uid()) WITH CHECK (owner_user_id = auth.uid());
CREATE POLICY "Admins manage deposits" ON public.deposits
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER deposits_updated_at BEFORE UPDATE ON public.deposits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- helper: is the current user the owner of this deposit?
CREATE OR REPLACE FUNCTION public.owns_deposit(_deposit_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.deposits d WHERE d.id = _deposit_id AND d.owner_user_id = auth.uid())
$$;

-- DRIVERS
CREATE TABLE public.drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deposit_id uuid REFERENCES public.deposits(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  phone text NOT NULL,
  zone text,
  vehicle text,
  is_available boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.drivers TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.drivers TO authenticated;
GRANT ALL ON public.drivers TO service_role;

ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read drivers" ON public.drivers
  FOR SELECT USING (true);
CREATE POLICY "Deposit owners manage own drivers" ON public.drivers
  FOR ALL TO authenticated USING (public.owns_deposit(deposit_id)) WITH CHECK (public.owns_deposit(deposit_id));
CREATE POLICY "Admins manage drivers" ON public.drivers
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER drivers_updated_at BEFORE UPDATE ON public.drivers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ORDERS: deposit + driver assignment
ALTER TABLE public.orders
  ADD COLUMN deposit_id uuid REFERENCES public.deposits(id) ON DELETE SET NULL,
  ADD COLUMN driver_id uuid REFERENCES public.drivers(id) ON DELETE SET NULL;

CREATE POLICY "Deposit owners read their orders" ON public.orders
  FOR SELECT TO authenticated USING (public.owns_deposit(deposit_id));
CREATE POLICY "Deposit owners update their orders" ON public.orders
  FOR UPDATE TO authenticated USING (public.owns_deposit(deposit_id)) WITH CHECK (public.owns_deposit(deposit_id));

-- Realtime
ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.deposits REPLICA IDENTITY FULL;
ALTER TABLE public.drivers REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.deposits;
ALTER PUBLICATION supabase_realtime ADD TABLE public.drivers;

-- Demo deposits
INSERT INTO public.deposits (name, commune, neighborhood, address, phone, whatsapp, latitude, longitude, subscription_plan, subscription_status, valid_until)
VALUES
  ('Dépôt Bella Gombe', 'Gombe', 'Centre-ville', 'Av. du Commerce 45', '+243899697012', '+243899697012', -4.3050, 15.3130, 'premium', 'active', (now() + interval '180 days')::date),
  ('Dépôt Limete Energie', 'Limete', '7ème rue', 'Av. Kabambare 12', '+243810000002', '+243810000002', -4.3600, 15.3400, 'standard', 'active', (now() + interval '30 days')::date),
  ('Dépôt Ngaliema Gaz', 'Ngaliema', 'Ma Campagne', 'Av. de la Justice 8', '+243810000003', '+243810000003', -4.3720, 15.2560, 'premium', 'active', (now() + interval '90 days')::date);