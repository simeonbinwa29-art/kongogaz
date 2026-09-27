-- Durcissement de l'attribution du rôle `admin` au compte maître (+243973032968).
--
-- Tant que la RPC `promote_master_admin` est exécutable par `authenticated`,
-- n'importe quel client authentifié peut l'appeler depuis la console du
-- navigateur avec son propre id et s'attribuer le rôle admin, en contournant
-- le mot de passe administrateur vérifié côté serveur.
--
-- On restreint donc l'exécution au rôle `service_role` : seule la route serveur
-- (qui détient la service-role key et vérifie le mot de passe admin) peut
-- promouvoir un compte.

REVOKE ALL ON FUNCTION public.promote_master_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.promote_master_admin(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.promote_master_admin(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.promote_master_admin(uuid) TO service_role;

COMMENT ON FUNCTION public.promote_master_admin(uuid) IS
  'Attribue le rôle admin au seul compte maître (243973032968@bellagaz.local). '
  'Exécution restreinte à service_role : passer par la route serveur qui vérifie '
  'le mot de passe administrateur.';
