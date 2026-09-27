ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_mode text NOT NULL DEFAULT 'delivery',
  ADD COLUMN IF NOT EXISTS delivery_fee numeric NOT NULL DEFAULT 0;

ALTER TABLE public.deposits
  ADD COLUMN IF NOT EXISTS opening_hours text;