GRANT SELECT, INSERT, UPDATE, DELETE ON public.deposits TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.drivers TO authenticated;
GRANT SELECT ON public.deposits TO anon;
GRANT SELECT ON public.drivers TO anon;
GRANT ALL ON public.deposits TO service_role;
GRANT ALL ON public.drivers TO service_role;

DROP POLICY IF EXISTS "Authenticated manage deposits" ON public.deposits;
CREATE POLICY "Authenticated manage deposits" ON public.deposits
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated manage drivers" ON public.drivers;
CREATE POLICY "Authenticated manage drivers" ON public.drivers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);