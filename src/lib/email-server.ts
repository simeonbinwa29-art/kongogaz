import { createServerFn } from "@tanstack/react-start";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type ManagerEmailPayload = {
  to: string;
  subject: string;
  html: string;
};

/**
 * Envoi d'e-mail de notification réservé au serveur : la clé Resend est lue
 * uniquement ici, via `process.env.RESEND_API_KEY`, et n'est jamais exposée
 * dans le bundle client (pas de préfixe `VITE_`).
 */
export const sendManagerEmail = createServerFn({ method: "POST" })
  .validator((payload: ManagerEmailPayload) => {
    if (!payload?.to || typeof payload.to !== "string") {
      throw new Error("Destinataire e-mail manquant");
    }
    if (payload.to.length > 320) {
      throw new Error("Destinataire e-mail trop long");
    }
    return {
      to: payload.to,
      subject: String(payload.subject ?? "").slice(0, 200),
      html: String(payload.html ?? "").slice(0, 200_000),
    };
  })
  .handler(async ({ data }) => {
    const RESEND_API_KEY = process.env.RESEND_API_KEY || "";

    if (!RESEND_API_KEY) {
      console.warn("[email-server] RESEND_API_KEY non configurée — e-mail ignoré");
      return;
    }

    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Kongo Gaz <commandes@kongogaz.cd>",
        reply_to: "bellagaz29@gmail.com",
        to: [data.to],
        subject: data.subject,
        html: data.html,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Resend a refusé l'envoi (${response.status}) : ${detail.slice(0, 300)}`);
    }
  });
