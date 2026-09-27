import { supabase } from "@/integrations/supabase/client";
import { resolveAuthIdentifier } from "./phone";
import { updateOrder, type OrderStatus } from "./orders-api";

/**
 * Vérifie côté serveur (via RLS) que l'utilisateur détient bien le rôle `admin`
 * dans la table `user_roles`. Aucune confiance n'est accordée à un flag local.
 */
export async function isAdminUser(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) return false;
  return data?.role === "admin";
}

/**
 * Connexion administrateur : identifiant (téléphone RDC ou e-mail) + mot de passe.
 * Refuse l'accès si le compte n'a pas le rôle `admin` (l'utilisateur est alors
 * déconnecté pour éviter toute session client conservée dans le navigateur).
 */
export async function signInAsAdmin(identifier: string, password: string) {
  const email = resolveAuthIdentifier(identifier);
  if (!email) throw new Error("Identifiant invalide (numéro RDC ou e-mail attendu).");

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw error ?? new Error("Échec de la connexion.");

  const admin = await isAdminUser(data.user.id);
  if (!admin) {
    await supabase.auth.signOut().catch(() => {});
    throw new Error("Accès refusé : ce compte n'est pas administrateur.");
  }
  return data.user;
}

/** Déconnexion explicite de la session Supabase active. */
export async function signOutAdmin(): Promise<void> {
  await supabase.auth.signOut().catch(() => {});
}

/* -------------------------------------------------------------------------- */
/*  Erreurs DB / attribution livreur                                          */
/* -------------------------------------------------------------------------- */

/**
 * Message d'erreur lisible pour une mutation refusée par Supabase/Postgres
 * (RLS, contraintes FK, etc.) — à afficher dans un toast et/ou logger en console.
 */
export function dbUpdateErrorMessage(e: unknown): string {
  const err = (e ?? {}) as { code?: string; message?: string };
  const code = err.code ?? "";
  const msg = err.message ?? "";
  if (code === "42501" || /permission denied|row-level security/i.test(msg))
    return "Permission refusée : rôle administrateur requis. Reconnectez-vous puis réessayez.";
  if (code === "23503" || /violates foreign key/i.test(msg))
    return "Référence introuvable (livreur ou dépôt supprimé). Actualisez la liste puis réessayez.";
  if (code === "23502" || /null value/i.test(msg))
    return "Champ obligatoire manquant. Actualisez la page puis réessayez.";
  if (code === "22P02") return "Valeur invalide envoyée à la base de données.";
  return msg.trim() || "La mise à jour a été rejetée par la base de données.";
}

/**
 * Attribution (ou retrait) d'un livreur à une commande (`orders.driver_id`).
 * Journalise les rejets en console et remonte une erreur compréhensible pour le
 * consommateur (toast, `try/catch`, etc.).
 */
export async function assignOrderDriver(
  orderId: string,
  driverId: string | undefined,
  nextStatus?: OrderStatus,
): Promise<void> {
  const patch: Parameters<typeof updateOrder>[1] = { driverId };
  if (nextStatus) patch.status = nextStatus;
  try {
    await updateOrder(orderId, patch);
  } catch (e) {
    console.error("[admin-api] Attribution du livreur échouée", {
      orderId,
      driverId: driverId ?? null,
      nextStatus: nextStatus ?? null,
      cause: e,
    });
    throw new Error(dbUpdateErrorMessage(e));
  }
}
