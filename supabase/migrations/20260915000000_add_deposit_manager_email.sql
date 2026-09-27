-- Notification e-mail aux gérants de dépôts : colonne `manager_email` sur la
-- table `deposits`. Elle reçoit l'adresse e-mail du gérant afin d'envoyer une
-- notification automatique (via Resend) à chaque nouvelle commande rattachée
-- à la commune du dépôt.

-- Ajout de la colonne manager_email à la table deposits
ALTER TABLE public.deposits ADD COLUMN IF NOT EXISTS manager_email TEXT;

-- (Optionnel) Ajout de la colonne manager_name si nécessaire
ALTER TABLE public.deposits ADD COLUMN IF NOT EXISTS manager_name TEXT;

-- Rafraîchir le cache du schéma Supabase
NOTIFY pgrst, 'reload schema';