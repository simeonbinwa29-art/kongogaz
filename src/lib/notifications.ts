import type { Order } from "@/lib/orders-api";
import { getDepositById, listDepositsByCommune, type Deposit } from "@/lib/deposits-api";
import { sendManagerEmail } from "@/lib/email-server";

/** Adresse officielle de contact : réponse aux notifications + destinataire
 *  par défaut lorsqu'aucun gérant n'est assigné au dépôt. */
export const OFFICIAL_CONTACT_EMAIL = "bellagaz29@gmail.com";

const formatFC = (n: number) => new Intl.NumberFormat("fr-FR").format(n) + " FC";

const PAY_LABEL: Record<string, string> = {
  mpesa: "M-Pesa",
  orange: "Orange Money",
  airtel: "Airtel Money",
  cash: "Cash livraison",
};

/** Écrase les caractères HTML sensibles des champs saisis par l'utilisateur. */
function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function resolveDepositForOrder(order: Order): Promise<Deposit | null> {
  if (order.depositId) return getDepositById(order.depositId);
  const candidates = await listDepositsByCommune(order.address.commune);
  return candidates[0] ?? null;
}

function buildManagerEmailHtml(order: Order, deposit: Deposit | null): string {
  const itemsHtml = order.items
    .map(
      (it) =>
        `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;">${esc(
            it.label ?? it.bottleId,
          )}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">${it.qty} × ${
            it.mode === "refill" ? "Recharge" : it.kit ? "Accessoire" : "Complète"
          }</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap;">${formatFC(
            it.unitPrice * it.qty,
          )}</td>
        </tr>`,
    )
    .join("");

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
    <div style="background:#0b1a33;border-radius:16px 16px 0 0;padding:24px;color:#ffffff;">
      <h1 style="margin:0;font-size:20px;">🔥 Nouvelle commande Kongo Gaz</h1>
      <p style="margin:6px 0 0;font-size:14px;opacity:.85;">Commande N° #${esc(order.orderNumber)}</p>
    </div>
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 16px 16px;padding:24px;font-size:14px;color:#111827;">
      <h2 style="margin:0 0 12px;font-size:16px;">Détails de la commande</h2>
      <table style="width:100%;border-collapse:collapse;">
        ${itemsHtml}
      </table>
      <div style="margin-top:16px;border-top:2px solid #0b1a33;padding-top:12px;font-weight:bold;font-size:16px;">
        Total à payer : ${formatFC(order.total)}
      </div>
      <div style="margin-top:16px;">
        <p style="margin:4px 0;"><strong>Client :</strong> ${esc(order.customer.fullName)}</p>
        <p style="margin:4px 0;"><strong>Téléphone :</strong> ${esc(order.customer.phone)}${
          order.customer.whatsapp ? ` / ${esc(order.customer.whatsapp)}` : ""
        }</p>
        <p style="margin:4px 0;"><strong>Adresse :</strong> ${esc(order.address.avenue)} N°${esc(
          order.address.parcelle,
        )}, ${esc(order.address.quartier)}, ${esc(order.address.commune)}</p>
        <p style="margin:4px 0;"><strong>Repère :</strong> ${esc(order.address.repere)}</p>
      </div>
      <div style="margin-top:16px;">
      <p style="margin:4px 0;"><strong>Paiement :</strong> ${esc(
        PAY_LABEL[order.payment] ?? order.payment,
      )}</p>
      ${deposit ? `<p style="margin:4px 0;"><strong>Dépôt rattaché :</strong> ${esc(deposit.name)}</p>` : ""}
      </div>
      <p style="margin-top:20px;font-size:12px;color:#6b7280;">
        Merci de confirmer la prise en charge de cette commande.
      </p>
    </div>
  </div>`;
}

/**
 * Envoie une notification e-mail au gérant du dépôt rattaché à la commune du
 * client. Sans gérant assigné, la notification part à l'adresse officielle
 * (`bellagaz29@gmail.com`). Non bloquant : tout échec (clé absente, réseau)
 * est absorbé ici pour ne jamais perturber la confirmation d'une commande.
 *
 * La clé Resend reste stockée côté serveur : le client appelle la fonction
 * `sendManagerEmail` (TanStack Start, `createServerFn`) et n'a jamais accès
 * à la clé d'API.
 */
export async function sendOrderNotificationToManager(
  order: Order,
  deposit?: Deposit | null,
): Promise<void> {
  try {
    const resolved = deposit ?? (await resolveDepositForOrder(order));
    const email = resolved?.manager_email?.trim() || OFFICIAL_CONTACT_EMAIL;

    await sendManagerEmail({
      data: {
        to: email,
        subject: `🔔 Nouvelle commande Kongo Gaz - #${order.orderNumber}`,
        html: buildManagerEmailHtml(order, resolved),
      },
    });
  } catch (err) {
    console.warn("[notifications] envoi e-mail au gérant impossible :", err);
  }
}
