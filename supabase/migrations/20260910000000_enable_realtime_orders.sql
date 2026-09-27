-- Enable Supabase Realtime for local-order tables used by the client dashboards
-- (/commande/$orderId, facture/$orderId and the "Commandes" tab on the home page).
-- The admin panel and the client views subscribe to postgres_changes on these
-- tables so that a status change (Nouvelle -> En préparation -> En route -> Livrée)
-- is reflected without a manual page reload.

ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.order_items REPLICA IDENTITY FULL;
ALTER TABLE public.invoices REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.invoices;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;