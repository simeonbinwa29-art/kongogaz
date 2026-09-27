-- 1. Remove owner-based (deposit account) access rules
DROP POLICY IF EXISTS "Owners read own deposit" ON public.deposits;
DROP POLICY IF EXISTS "Owners update own deposit" ON public.deposits;
DROP POLICY IF EXISTS "Deposit owners manage own drivers" ON public.drivers;
DROP POLICY IF EXISTS "Deposit owners read their orders" ON public.orders;
DROP POLICY IF EXISTS "Deposit owners update their orders" ON public.orders;

DROP FUNCTION IF EXISTS public.owns_deposit(uuid);

ALTER TABLE public.deposits DROP COLUMN IF EXISTS owner_user_id;
ALTER TABLE public.drivers DROP COLUMN IF EXISTS user_id;

-- 2. Realtime for orders
ALTER TABLE public.orders REPLICA IDENTITY FULL;
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.deposits;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.drivers;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
