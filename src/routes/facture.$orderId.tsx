import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Flame, Printer, MessageCircle, ArrowLeft } from "lucide-react";
import {
  getOrderById,
  buildWhatsAppMessage,
  subscribeOrder,
  patchOrderFromRealtime,
  KONGO_GAZ_WHATSAPP,
  type Order,
} from "@/lib/orders-api";

export const Route = createFileRoute("/facture/$orderId")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Facture — Kongo Gaz" },
      { name: "description", content: "Facture officielle Kongo Gaz Kinshasa." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InvoicePage,
});

const COMMUNE_FEES: Record<string, number> = {
  Gombe: 2000,
  Limete: 2500,
  Lemba: 3000,
  Kalamu: 2500,
  Ngaliema: 3500,
  Bandalungwa: 2500,
  Masina: 4000,
  Kintambo: 2500,
};

function fc(n: number) {
  return new Intl.NumberFormat("fr-FR").format(n) + " FC";
}

function InvoicePage() {
  const { orderId } = useParams({ from: "/facture/$orderId" });
  const { token } = Route.useSearch();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = () =>
      getOrderById(orderId, token).then((o) => {
        if (active) setOrder(o);
      });
    load().finally(() => active && setLoading(false));
    const unsub = subscribeOrder(orderId, (payload) => {
      if (!active || payload?.table !== "orders") return;
      if (payload.eventType === "DELETE") {
        setOrder(null);
        return;
      }
      if (payload.eventType === "UPDATE") {
        setOrder((prev) => (prev ? patchOrderFromRealtime(prev, payload) : prev));
      }
      load();
    });
    const pollTimer = window.setInterval(load, 20000);
    return () => {
      active = false;
      unsub();
      window.clearInterval(pollTimer);
    };
  }, [orderId, token]);

  if (loading) {
    return (
      <div className="min-h-screen py-6">
        <div key="invoice-skeleton" className="skeleton-in mx-auto max-w-3xl space-y-4 px-4">
          <div className="skeleton h-10 rounded-2xl" />
          <div className="skeleton h-[520px] rounded-2xl" />
        </div>
      </div>
    );
  }
  if (!order) {
    return (
      <div className="grid min-h-screen place-items-center gap-3 p-6 text-center">
        <p className="font-display text-lg font-bold">Facture introuvable</p>
        <Link to="/" className="text-xs underline">
          ← Retour à l'accueil
        </Link>
      </div>
    );
  }

  const deliveryFee =
    order.deliveryFee > 0 ? order.deliveryFee : (COMMUNE_FEES[order.address.commune] ?? 3000);
  const subtotal = order.items.reduce((a, b) => a + b.unitPrice * b.qty, 0);
  const grandTotal = order.total > 0 ? order.total : subtotal + deliveryFee;
  const invoiceNumber =
    "FACT-" +
    new Date(order.createdAt).getFullYear() +
    "-" +
    order.orderNumber.replace(/^[A-Za-z]+/, "");
  const paid = order.payment !== "cash";

  return (
    <div className="min-h-screen bg-muted/40 py-6">
      {/* Top actions — hidden on print */}
      <div className="mx-auto mb-4 flex max-w-3xl items-center justify-between px-4 print:hidden">
        <Link to="/" className="flex items-center gap-1 text-xs font-semibold">
          <ArrowLeft className="h-3.5 w-3.5" /> Retour
        </Link>
        <div className="flex gap-2">
          <a
            href={`https://wa.me/${KONGO_GAZ_WHATSAPP}?text=${encodeURIComponent(buildWhatsAppMessage(order))}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-bold text-white"
            style={{ background: "oklch(0.6 0.15 150)" }}
          >
            <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
          </a>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-bold text-white"
            style={{ background: "var(--gradient-flame)" }}
          >
            <Printer className="h-3.5 w-3.5" /> Imprimer / PDF
          </button>
        </div>
      </div>

      <article className="mx-auto max-w-3xl bg-white p-8 shadow-sm print:shadow-none">
        <header className="flex items-start justify-between border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <div
              className="grid h-12 w-12 place-items-center rounded-xl text-white"
              style={{ background: "var(--gradient-flame)" }}
            >
              <Flame className="h-6 w-6" />
            </div>
            <div>
              <p className="font-display text-xl font-extrabold leading-none">Kongo Gaz</p>
              <p className="text-[11px] text-muted-foreground">
                Livraison de gaz à domicile · Kinshasa, RDC
              </p>
              <p className="text-[11px] text-muted-foreground">
                +243 899 697 012 · bellagaz29@gmail.com
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Facture</p>
            <p className="font-display text-base font-extrabold">{invoiceNumber}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">Commande #{order.orderNumber}</p>
            <p className="text-[11px] text-muted-foreground">
              {new Date(order.createdAt).toLocaleString("fr-FR")}
            </p>
          </div>
        </header>

        <section className="mt-5 grid grid-cols-2 gap-4 text-xs">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Facturé à
            </p>
            <p className="mt-1 font-bold">{order.customer.fullName}</p>
            <p>{order.customer.phone}</p>
            {order.customer.whatsapp && <p>WhatsApp : {order.customer.whatsapp}</p>}
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Adresse de livraison
            </p>
            <p className="mt-1">
              {order.address.avenue} N°{order.address.parcelle}, {order.address.quartier}
            </p>
            <p>{order.address.commune}, Kinshasa</p>
            <p className="mt-1 italic text-muted-foreground">Repère : {order.address.repere}</p>
          </div>
        </section>

        <table className="mt-6 w-full text-xs">
          <thead>
            <tr className="border-b border-border text-left uppercase tracking-widest text-[10px] text-muted-foreground">
              <th className="py-2">Désignation</th>
              <th className="py-2">Type</th>
              <th className="py-2 text-right">Qté</th>
              <th className="py-2 text-right">P.U.</th>
              <th className="py-2 text-right">Sous-total</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((it) => (
              <tr key={it.key} className="border-b border-border/60">
                <td className="py-2">{it.label ?? it.bottleId}</td>
                <td className="py-2">
                  {it.kit ? "Accessoire" : it.mode === "refill" ? "Recharge" : "Bouteille complète"}
                </td>
                <td className="py-2 text-right">{it.qty}</td>
                <td className="py-2 text-right">{fc(it.unitPrice)}</td>
                <td className="py-2 text-right font-bold">{fc(it.unitPrice * it.qty)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="mt-4 flex justify-end">
          <div className="w-64 space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Sous-total</span>
              <span>{fc(subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Livraison ({order.address.commune})</span>
              <span>{fc(deliveryFee)}</span>
            </div>
            <div
              className="mt-2 flex justify-between border-t border-border pt-2 font-display text-base font-extrabold"
              style={{ color: "var(--night)" }}
            >
              <span>Total TTC</span>
              <span>{fc(grandTotal)}</span>
            </div>
          </div>
        </section>

        <footer className="mt-6 flex items-center justify-between border-t border-border pt-3 text-[11px]">
          <span
            className="rounded-full px-3 py-1 font-bold text-white"
            style={{
              background: paid ? "oklch(0.6 0.15 150)" : "var(--gradient-flame)",
            }}
          >
            {paid
              ? `Payé via ${{ mpesa: "M-Pesa", orange: "Orange Money", airtel: "Airtel Money", cash: "" }[order.payment]}`
              : "À payer à la livraison (Cash)"}
          </span>
          <p className="text-muted-foreground">Merci de votre confiance — Kongo Gaz Kinshasa</p>
        </footer>
      </article>
    </div>
  );
}
