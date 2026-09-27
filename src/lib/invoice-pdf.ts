import { jsPDF } from "jspdf";
import type { Order } from "@/lib/orders-api";
import type { Deposit } from "@/lib/deposits-api";
import { KONGO_GAZ_WHATSAPP } from "@/lib/orders-api";

const fc = (n: number) => new Intl.NumberFormat("fr-FR").format(n) + " FC";

const PAY_LABEL: Record<string, string> = {
  mpesa: "M-Pesa",
  orange: "Orange Money",
  airtel: "Airtel Money",
  cash: "Cash à la livraison",
};

export function invoiceFileName(o: Order) {
  return `KONGO-GAZ-Facture-${o.orderNumber}.pdf`;
}

/** Facture PDF professionnelle KONGO GAZ. */
export function buildInvoicePdf(o: Order, deposit?: Deposit | null): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 40;
  const night: [number, number, number] = [11, 26, 51];
  const flame: [number, number, number] = [255, 106, 19];

  // En-tête
  doc.setFillColor(...night);
  doc.rect(0, 0, W, 100, "F");
  doc.setFillColor(...flame);
  doc.circle(M + 14, 46, 14, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold").setFontSize(20);
  doc.text("KONGO GAZ", M + 38, 44);
  doc.setFont("helvetica", "normal").setFontSize(9);
  doc.text("Livraison de gaz ménager à Kinshasa", M + 38, 60);
  doc.text("WhatsApp : +243 899 697 012", M + 38, 74);

  doc.setFont("helvetica", "bold").setFontSize(14);
  doc.text("FACTURE", W - M, 44, { align: "right" });
  doc.setFont("helvetica", "normal").setFontSize(9);
  doc.text(`N° ${o.orderNumber}`, W - M, 60, { align: "right" });
  doc.text(new Date(o.createdAt).toLocaleString("fr-FR"), W - M, 74, { align: "right" });

  let y = 135;
  doc.setTextColor(30, 30, 30);

  // Client
  doc.setFont("helvetica", "bold").setFontSize(10);
  doc.text("CLIENT", M, y);
  doc.setFont("helvetica", "normal").setFontSize(10);
  y += 16;
  doc.text(o.customer.fullName, M, y);
  y += 14;
  doc.text(o.customer.phone + (o.customer.whatsapp ? ` / ${o.customer.whatsapp}` : ""), M, y);

  // Mode de réception
  const pickup = o.receiveMode === "pickup";
  let ry = 135;
  doc.setFont("helvetica", "bold").setFontSize(10);
  doc.text("MODE", W / 2, ry);
  doc.setFont("helvetica", "normal");
  ry += 16;
  doc.setTextColor(...flame);
  doc.setFont("helvetica", "bold");
  doc.text(
    pickup ? "Retrait au Dépôt (0 FC)" : `Livraison à domicile (${fc(o.deliveryFee ?? 0)})`,
    W / 2,
    ry,
  );
  doc.setFont("helvetica", "normal").setTextColor(30, 30, 30);
  ry += 14;
  const lines = pickup
    ? [
        deposit?.name ?? "Dépôt partenaire",
        [deposit?.address, deposit?.neighborhood, deposit?.commune].filter(Boolean).join(", ") ||
          "—",
        deposit?.opening_hours ? `Horaires : ${deposit.opening_hours}` : "Horaires : 8h – 18h",
      ]
    : [
        `${o.address.avenue} N°${o.address.parcelle}`,
        `${o.address.quartier}, ${o.address.commune}`,
        `Repère : ${o.address.repere}`,
      ];
  for (const l of lines) {
    doc.text(doc.splitTextToSize(l, W / 2 - M), W / 2, ry);
    ry += 14;
  }

  y = Math.max(y, ry) + 26;

  // Tableau articles
  doc.setFillColor(...night);
  doc.rect(M, y, W - 2 * M, 22, "F");
  doc.setTextColor(255, 255, 255).setFont("helvetica", "bold").setFontSize(9);
  doc.text("DÉSIGNATION", M + 10, y + 15);
  doc.text("QTÉ", W - M - 170, y + 15, { align: "right" });
  doc.text("P.U.", W - M - 90, y + 15, { align: "right" });
  doc.text("TOTAL", W - M - 10, y + 15, { align: "right" });
  y += 22;

  doc.setTextColor(30, 30, 30).setFont("helvetica", "normal").setFontSize(9);
  let subtotal = 0;
  for (const it of o.items) {
    const line = it.qty * it.unitPrice;
    subtotal += line;
    const label = `${it.label ?? it.bottleId}${
      it.kit ? "" : it.mode === "refill" ? " (Recharge)" : " (Bouteille complète)"
    }`;
    const wrapped = doc.splitTextToSize(label, W - 2 * M - 210);
    const lines = wrapped.length > 1 ? [wrapped[0] + "…"] : wrapped;
    doc.text(lines, M + 10, y + 15);
    doc.text(String(it.qty), W - M - 170, y + 15, { align: "right" });
    doc.text(fc(it.unitPrice), W - M - 90, y + 15, { align: "right" });
    doc.text(fc(line), W - M - 10, y + 15, { align: "right" });
    doc.setDrawColor(230, 230, 230);
    doc.line(M, y + 22, W - M, y + 22);
    y += 22;
  }

  // Totaux
  y += 14;
  const right = (label: string, val: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal").setFontSize(bold ? 12 : 10);
    doc.text(label, W - M - 150, y, { align: "left" });
    doc.text(val, W - M, y, { align: "right" });
    y += bold ? 20 : 16;
  };
  right("Sous-total gaz", fc(subtotal));
  right("Frais de livraison", pickup ? "0 FC (retrait)" : fc(o.deliveryFee ?? 0));
  if (o.creditApplied) right("Remises / crédit", "−" + fc(o.creditApplied));
  doc.setDrawColor(...night);
  doc.line(W - M - 160, y - 8, W - M, y - 8);
  right("TOTAL À PAYER", fc(o.total), true);

  doc.setFont("helvetica", "normal").setFontSize(10);
  doc.text(`Paiement : ${PAY_LABEL[o.payment] ?? o.payment}`, M, y - 20);
  doc.text(`Statut : ${o.status}`, M, y - 4);

  // Pied de page
  const H = doc.internal.pageSize.getHeight();
  doc.setDrawColor(230, 230, 230);
  doc.line(M, H - 70, W - M, H - 70);
  doc.setFontSize(8).setTextColor(120, 120, 120);
  doc.text(
    "Merci de votre confiance — KONGO GAZ Kinshasa · Support WhatsApp +243 899 697 012",
    W / 2,
    H - 50,
    { align: "center" },
  );
  doc.text("Document généré automatiquement, valant reçu de commande.", W / 2, H - 36, {
    align: "center",
  });

  return doc;
}

export function downloadInvoicePdf(o: Order, deposit?: Deposit | null) {
  buildInvoicePdf(o, deposit).save(invoiceFileName(o));
}

export function invoiceWhatsAppText(o: Order, deposit?: Deposit | null) {
  const pickup = o.receiveMode === "pickup";
  return [
    "🧾 *FACTURE KONGO GAZ*",
    `Commande N° #${o.orderNumber}`,
    `Client : ${o.customer.fullName}`,
    ...o.items.map((i) => `• ${i.qty} × ${i.label ?? i.bottleId}`),
    pickup
      ? `Mode : Retrait au Dépôt (0 FC) — ${deposit?.name ?? "dépôt"}${
          deposit?.address ? `, ${deposit.address}` : ""
        }`
      : `Mode : Livraison à domicile (${fc(o.deliveryFee ?? 0)})`,
    `Total : ${fc(o.total)}`,
    `Paiement : ${PAY_LABEL[o.payment] ?? o.payment}`,
    "",
    `La facture PDF (${invoiceFileName(o)}) vient d'être téléchargée sur votre téléphone : joignez-la à cette discussion.`,
  ].join("\n");
}

/** Télécharge le PDF puis ouvre WhatsApp avec un message pré-rempli. */
export function shareInvoiceOnWhatsApp(o: Order, deposit?: Deposit | null, phone?: string) {
  downloadInvoicePdf(o, deposit);
  const to = (phone ?? KONGO_GAZ_WHATSAPP).replace(/[^\d]/g, "");
  window.open(
    `https://wa.me/${to}?text=${encodeURIComponent(invoiceWhatsAppText(o, deposit))}`,
    "_blank",
  );
}
