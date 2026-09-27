-- Compte administrateur maître : +243973032968 (identifiant 243973032968@bellagaz.local)
-- À l'inscription ou à la connexion de ce compte, son rôle est promu en `admin`.

CREATE OR REPLACE FUNCTION public.promote_master_admin(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Garde-fou : on ne promeut que le compte maître (email interne dédié).
  IF NOT EXISTS (
    SELECT 1
    FROM auth.users
    WHERE id = p_user_id
      AND email = '243973032968@bellagaz.local'
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, 'admin'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.promote_master_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.promote_master_admin(uuid) TO authenticated;