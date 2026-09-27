-- Harden guest reads on PII-bearing tables (orders, order_items, invoices, drivers).
--
-- Problem:
--   "Public read orders" / "Public read order_items" / "Public read invoices" /
--   "Public read drivers" all used `USING (true)`, so the `anon` JWT could list
--   EVERY order via PostgREST (names, phones, addresses) and every driver.
--
-- Fix (summary):
--   1. Each order gets an unguessable `tracking_token` (32 hex chars).
--   2. The broad public reads are dropped.
--   3. Admins keep a read-all SELECT on orders (items/invoices/drivers already
--      covered by their "Admins manage …" FOR ALL policies).
--   4. Authenticated users can read rows belonging to their own orders.
--   5. Guests read a *specific* order (and its items/driver) only through
--      SECURITY DEFINER functions gated by the tracking token carried in the
--      tracking/invoice links. The unguessable token acts as the capability.
--
-- Realtime note: guests lose postgres_changes on orders (no anon SELECT policy);
-- the tracking/invoice pages already fall back to a 20 s polling filet.

-- 1) tracking_token per order
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tracking_token text;

UPDATE public.orders
   SET tracking_token = encode(gen_random_bytes(16), 'hex')
 WHERE tracking_token IS NULL;

ALTER TABLE public.orders
  ALTER COLUMN tracking_token SET DEFAULT encode(gen_random_bytes(16), 'hex');
ALTER TABLE public.orders ALTER COLUMN tracking_token SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS orders_tracking_token_key ON public.orders (tracking_token);

-- 2) Drop the "anyone can read everything" SELECT policies
DROP POLICY IF EXISTS "Public read orders" ON public.orders;
DROP POLICY IF EXISTS "Public read order_items" ON public.order_items;
DROP POLICY IF EXISTS "Public read invoices" ON public.invoices;
DROP POLICY IF EXISTS "Public read drivers" ON public.drivers;

-- 3) Admins read all orders (previously guaranteed by the public read).
CREATE POLICY "Admins read all orders"
  ON public.orders FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 4) Authenticated users read rows attached to their own orders.
CREATE POLICY "Users read own order_items"
  ON public.order_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id AND o.user_id = auth.uid()
    )
  );

CREATE POLICY "Users read own invoices"
  ON public.invoices FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = invoices.order_id AND o.user_id = auth.uid()
    )
  );

-- The driver assigned to one of the user's orders (shown on /commande/$orderId).
CREATE POLICY "Users read own order's driver"
  ON public.drivers FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.driver_id = drivers.id AND o.user_id = auth.uid()
    )
  );

-- 5) Guest access via unguessable tracking token (SECURITY DEFINER bypasses RLS,
--    but only returns rows whose tracking_token matches the caller's token).
CREATE OR REPLACE FUNCTION public.get_order_for_guest(p_order_id uuid, p_token text)
RETURNS SETOF public.orders
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.orders
  WHERE id = p_order_id AND tracking_token = p_token;
$$;
REVOKE ALL ON FUNCTION public.get_order_for_guest(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_order_for_guest(uuid, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_order_items_for_guest(p_order_id uuid, p_token text)
RETURNS SETOF public.order_items
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT oi.*
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE o.id = p_order_id AND o.tracking_token = p_token;
$$;
REVOKE ALL ON FUNCTION public.get_order_items_for_guest(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_order_items_for_guest(uuid, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_driver_for_guest(p_driver_id uuid, p_token text)
RETURNS SETOF public.drivers
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.*
  FROM public.drivers d
  JOIN public.orders o ON o.driver_id = d.id
  WHERE d.id = p_driver_id AND o.tracking_token = p_token;
$$;
REVOKE ALL ON FUNCTION public.get_driver_for_guest(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_driver_for_guest(uuid, text) TO anon, authenticated;