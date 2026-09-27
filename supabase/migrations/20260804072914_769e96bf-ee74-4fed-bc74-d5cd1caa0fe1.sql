CREATE TABLE public.delivery_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  base_fee integer NOT NULL DEFAULT 1000,
  price_per_km integer NOT NULL DEFAULT 800,
  min_fee integer NOT NULL DEFAULT 3000,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.delivery_settings TO anon;
GRANT SELECT, INSERT, UPDATE ON public.delivery_settings TO authenticated;
GRANT ALL ON public.delivery_settings TO service_role;
ALTER TABLE public.delivery_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read delivery settings" ON public.delivery_settings FOR SELECT USING (true);
CREATE POLICY "Admins manage delivery settings" ON public.delivery_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER delivery_settings_updated_at BEFORE UPDATE ON public.delivery_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
INSERT INTO public.delivery_settings (id) VALUES (true);

ALTER TABLE public.deposits
  ADD COLUMN IF NOT EXISTS delivery_base_fee integer,
  ADD COLUMN IF NOT EXISTS delivery_price_per_km integer,
  ADD COLUMN IF NOT EXISTS delivery_min_fee integer;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS customer_lat numeric,
  ADD COLUMN IF NOT EXISTS customer_lng numeric,
  ADD COLUMN IF NOT EXISTS distance_km numeric;

CREATE POLICY "Admins manage user roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
GRANT INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;

ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.deposits REPLICA IDENTITY FULL;
ALTER TABLE public.drivers REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.deposits;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.drivers;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;