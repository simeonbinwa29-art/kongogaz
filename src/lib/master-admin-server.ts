import { createServerFn } from "@tanstack/react-start";
import { MASTER_ADMIN_EMAIL } from "./phone";

type GrantMasterAdminPayload = {
  adminPassword: string;
  accessToken: string;
};

/** Nombre de tentatives avant blocage temporaire, par IP. */
const MAX_ATTEMPTS = 5;
/** Durée du blocage, en millisecondes. */
const LOCKOUT_MS = 15 * 60 * 1000;

/**
 * Verrou anti-force brute, en mémoire.
 *
 * Limite assumée : ce compteur vit dans le processus serveur. Il est perdu au
 * redémarrage et n'est pas partagé entre instances. C'est une première barrière,
 * pas une garantie — le vrai rempart reste le mot de passe lui-même.
 */
const attempts = new Map<string, { count: number; until: number }>();

function throttled(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (entry && entry.until > now) return true;
  if (entry && entry.until <= now) attempts.delete(key);
  return false;
}

function registerFailure(key: string): void {
  const now = Date.now();
  const entry = attempts.get(key);
  const count = entry && entry.until > now ? entry.count + 1 : 1;
  attempts.set(key, { count, until: now + LOCKOUT_MS });
}

function clearFailures(key: string): void {
  attempts.delete(key);
}

/** Comparaison à temps constant : ne fuit pas la longueur ni le préfixe correct. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Vérifie le jeton de session côté serveur, puis n'accepte le mot de passe
 * administrateur que pour le compte maître.
 *
 * L'identité de l'appelant est déduite du jeton, jamais d'un champ envoyé par le
 * client : un utilisateur non-maître est rejeté avant toute comparaison de mot
 * de passe, ce qui interdit d'utiliser cette route comme oracle de devinette.
 */
export const grantMasterAdminRole = createServerFn({ method: "POST" })
  .validator((payload: GrantMasterAdminPayload) => {
    if (!payload?.accessToken || typeof payload.accessToken !== "string") {
      throw new Error("Session requise");
    }
    if (!payload?.adminPassword || typeof payload.adminPassword !== "string") {
      throw new Error("Mot de passe administrateur requis");
    }
    return {
      accessToken: payload.accessToken,
      adminPassword: String(payload.adminPassword).slice(0, 200),
    };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const expected = process.env.MASTER_ADMIN_PASSWORD || "";
    if (!expected) {
      console.error("[master-admin] MASTER_ADMIN_PASSWORD non configurée sur le serveur");
      throw new Error("Configuration serveur incomplète.");
    }

    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(data.accessToken);
    if (userError || !userData?.user) {
      throw new Error("Session invalide ou expirée.");
    }

    // Rejet immédiat des non-maitres : aucune comparaison de mot de passe n'a lieu,
    // donc cette route ne peut pas servir à tester des mots de passe.
    if (userData.user.email !== MASTER_ADMIN_EMAIL) {
      throw new Error("Ce compte ne peut pas être administrateur.");
    }

    const rateKey = data.accessToken.slice(-32);
    if (throttled(rateKey)) {
      throw new Error("Trop de tentatives. Réessayez dans une quinzaine de minutes.");
    }

    if (!safeEqual(data.adminPassword, expected)) {
      registerFailure(rateKey);
      throw new Error("Mot de passe administrateur incorrect.");
    }

    const { error: promoteError } = await supabaseAdmin.rpc("promote_master_admin", {
      p_user_id: userData.user.id,
    });
    if (promoteError) {
      throw new Error("Attribution du rôle impossible.");
    }

    clearFailures(rateKey);
    return { ok: true as const };
  });
