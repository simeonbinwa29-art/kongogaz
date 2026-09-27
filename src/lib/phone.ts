/** Numéro E.164 du compte administrateur maître (RDC). */
export const MASTER_ADMIN_PHONE = "+243973032968";

/** Identifiant e-mail interne du compte administrateur maître (`243973032968@bellagaz.local`). */
export const MASTER_ADMIN_EMAIL = phoneToAuthIdentifier(MASTER_ADMIN_PHONE);

/** Vrai si le numéro normalisé (E.164) correspond au compte administrateur maître. */
export function isMasterAdminPhone(normalizedPhone: string): boolean {
  return normalizedPhone === MASTER_ADMIN_PHONE;
}

/**
 * Normalisation des numéros congolais (RDC) vers le format E.164 (+243XXXXXXXXX).
 * Retourne "" si le numéro est invalide.
 */
export function normalizePhone(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 9) digits = "243" + digits;
  return /^243\d{9}$/.test(digits) ? `+${digits}` : "";
}

/**
 * Identifiant e-mail interne dérivé du numéro de téléphone.
 * Conserve la méthode e-mail de Supabase (aucune vérification par e-mail demandée)
 * et évite d'exiger le provider téléphone / OTP SMS.
 *
 * Le numéro E.164 (sans "+") est utilisé tel quel pour que l'identifiant soit
 * stable quel que soit le format de saisie (ex. : `243899123456` → `243899123456@bellagaz.local`).
 */
export function phoneToAuthIdentifier(normalizedPhone: string): string {
  return normalizedPhone.replace("+", "") + "@bellagaz.local";
}

/**
 * Résout un identifiant de connexion libre (champ utilisateur) vers l'adresse
 * e-mail Supabase correspondante : un numéro RDC est traduit en identifiant
 * `+243…@bellagaz.local`, tout autre texte est traité comme une adresse e-mail.
 */
export function resolveAuthIdentifier(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const normalized = normalizePhone(trimmed);
  return normalized ? phoneToAuthIdentifier(normalized) : trimmed;
}
