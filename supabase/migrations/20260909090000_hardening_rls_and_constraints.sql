-- Hardening pass: RLS scoping, FK indexes, ON DELETE behaviour, CHECK constraints,
-- and persistence of delivery timing (express/scheduled) used by src/lib/orders-api.ts.
-- Applies after 20260806104831 (migration 9). Safe to run in order on an existing DB.

-- 1) Deposits / drivers: migration 9 replaced owner-scoped policies with
--    "FOR ALL USING (true) WITH CHECK (true)" which lets ANY authenticated user
--    insert/update/delete every deposit and driver. Restore admin-only writes.
DROP POLICY IF EXISTS "Authenticated manage deposits" ON public.deposits;
DROP POLICY IF EXISTS "Authenticated manage drivers" ON public.drivers;

-- "Admins manage deposits"/"Admins manage drivers" (admin-scoped, m3) remain in effect.

-- 2) Guest checkout: anon INSERT was "WITH CHECK (true)" allowing writes on behalf
--    of any user. Scope inserts: guests create orders w/o user_id, signed-in users
--    may only create orders linked to their own account.
DROP POLICY IF EXISTS "Anyone can insert orders" ON public.orders;
CREATE POLICY "Guests insert orders"
  ON public.orders FOR INSERT TO anon WITH CHECK (user_id IS NULL);
CREATE POLICY "Users insert own orders"
  ON public.orders FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Anyone insert order_items" ON public.order_items;
CREATE POLICY "Insert items for own order" ON public.order_items FOR INSERT TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND (o.user_id IS NULL OR o.user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Anyone insert invoices" ON public.invoices;
CREATE POLICY "Insert invoice for own order" ON public.invoices FOR INSERT TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = invoices.order_id
        AND (o.user_id IS NULL OR o.user_id = auth.uid())
    )
  );

-- 3) Missing FK indexes.
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON public.order_items (product_id);
CREATE INDEX IF NOT EXISTS idx_invoices_order_id ON public.invoices (order_id);
CREATE INDEX IF NOT EXISTS idx_drivers_deposit_id ON public.drivers (deposit_id);
CREATE INDEX IF NOT EXISTS idx_orders_deposit_id ON public.orders (deposit_id);
CREATE INDEX IF NOT EXISTS idx_orders_driver_id ON public.orders (driver_id);
CREATE INDEX IF NOT EXISTS idx_profiles_referred_by ON public.profiles (referred_by);

-- 4) Deleting a product fails while any order_item references it: allow SET NULL.
ALTER TABLE public.order_items
  DROP CONSTRAINT IF EXISTS order_items_product_id_fkey,
  ADD CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id)
    REFERENCES public.products(id) ON DELETE SET NULL;

-- 5) Persist the express/scheduled delivery mode + scheduled time (orders-api reads them).
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_timing text,
  ADD COLUMN IF NOT EXISTS delivery_time text;

-- 6) Normalise legacy free-text statuses, then enforce canonical values.
UPDATE public.orders SET status = 'pending'    WHERE lower(status) IN ('nouvelle', 'new');
UPDATE public.orders SET status = 'processing' WHERE lower(status) IN ('en_preparation', 'en_preparations', 'preparing');
UPDATE public.orders SET status = 'delivering' WHERE lower(status) IN ('en_route', 'shipped', 'out_for_delivery');
UPDATE public.orders SET status = 'delivered'  WHERE lower(status) IN ('livree', 'completed');
UPDATE public.orders SET status = 'cancelled'  WHERE lower(status) IN ('annulee', 'canceled');

-- 7) CHECK constraints (lifecycle + data sanity).
ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check CHECK (status IN ('pending','processing','delivering','delivered','cancelled')),
  ADD CONSTRAINT orders_payment_method_check CHECK (payment_method IN ('mpesa','orange','airtel','cash')),
  ADD CONSTRAINT orders_delivery_mode_check CHECK (delivery_mode IN ('delivery','pickup')),
  ADD CONSTRAINT orders_delivery_timing_check CHECK (delivery_timing IS NULL OR delivery_timing IN ('express','scheduled')),
  ADD CONSTRAINT orders_total_amount_check CHECK (total_amount >= 0),
  ADD CONSTRAINT orders_credit_applied_check CHECK (credit_applied >= 0),
  ADD CONSTRAINT orders_distance_km_check CHECK (distance_km IS NULL OR distance_km >= 0);

ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_quantity_check CHECK (quantity > 0),
  ADD CONSTRAINT order_items_unit_price_check CHECK (unit_price >= 0);

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_payment_status_check CHECK (payment_status IN ('pending','paid'));

ALTER TABLE public.products
  ADD CONSTRAINT products_weight_check CHECK (weight_kg > 0),
  ADD CONSTRAINT products_price_refill_check CHECK (price_refill >= 0),
  ADD CONSTRAINT products_price_full_check CHECK (price_full >= 0),
  ADD CONSTRAINT products_stock_check CHECK (stock_quantity >= 0);

ALTER TABLE public.promotions
  ADD CONSTRAINT promotions_discount_type_check CHECK (discount_type IN ('shipping','percent','loyalty')),
  ADD CONSTRAINT promotions_discount_value_check CHECK (discount_value >= 0);

ALTER TABLE public.deposits
  ADD CONSTRAINT deposits_latitude_check CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  ADD CONSTRAINT deposits_longitude_check CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180);

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_loyalty_credit_check CHECK (loyalty_credit >= 0);

-- 8) Dead grant: authenticated never had a delivery_settings write policy.
REVOKE INSERT, UPDATE ON public.delivery_settings FROM authenticated;

-- 9) Atomic deposit subscription extension (avoids read-modify-write race and
--    UTC/Local "Africa/Kinshasa" date skew previously computed client-side).
CREATE OR REPLACE FUNCTION public.extend_deposit_subscription(_deposit_id uuid, _days integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cur date;
BEGIN
  IF _days <= 0 THEN RETURN; END IF;
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;
  SELECT GREATEST(valid_until, (now() AT TIME ZONE 'Africa/Kinshasa')::date)
    INTO cur FROM public.deposits WHERE id = _deposit_id;
  IF cur IS NULL THEN RETURN; END IF;
  UPDATE public.deposits
    SET valid_until = cur + _days,
        subscription_status = 'active',
        updated_at = now()
    WHERE id = _deposit_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.extend_deposit_subscription(uuid, integer) TO authenticated;

ALTER TABLE public.orders REPLICA IDENTITY FULL;