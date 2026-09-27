import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, FileText, Phone, Truck } from "lucide-react";
import { getOrderById, subscribeOrder, patchOrderFromRealtime, type Order } from "@/lib/orders-api";
import { getDriverById, getDepositById, type Deposit, type Driver } from "@/lib/deposits-api";

export const Route = createFileRoute("/commande/$orderId")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  component: OrderTrackingPage,
  head: () => ({
    meta: [
      { title: "Suivi de commande · Kongo Gaz Kinshasa" },
      {
        name: "description",
        content:
          "Suivez en direct votre commande de gaz Kongo Gaz à Kinshasa : préparation, départ du dépôt, livreur assigné et livraison.",
      },
      { property: "og:title", content: "Suivi de commande · Kongo Gaz" },
      {
        property: "og:description",
        content: "Statut en temps réel de votre livraison de bouteille de gaz à Kinshasa.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const formatFC = (n: number) => new Intl.NumberFormat("fr-FR").format(n) + " FC";

const STEPS = ["Reçue", "Préparation", "En route", "Livrée"];

function OrderTrackingPage() {
  const { orderId } = Route.useParams();
  const { token } = Route.useSearch();
  const [order, setOrder] = useState<Order | null>(null);
  const [driver, setDriver] = useState<Driver | null>(null);
  const [deposit, setDeposit] = useState<Deposit | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = () =>
      getOrderById(orderId, token).then((o) => {
        if (!alive) return;
        setOrder(o);
        setLoading(false);
      });
    load();
    // Realtime : toute modification de CETTE commande (statut, livreur, frais)
    // est appliquée immédiatement via la payload UPDATE, confirmée par un refetch,
    // et une suppression (ex: purge admin) bascule le suivi sur "introuvable".
    const unsub = subscribeOrder(orderId, (payload) => {
      if (!alive || payload?.table !== "orders") return;
      if (payload.eventType === "DELETE") {
        setOrder(null);
        setLoading(false);
        return;
      }
      if (payload.eventType === "UPDATE") {
        setOrder((prev) => (prev ? patchOrderFromRealtime(prev, payload) : prev));
      }
      load();
    });
    // Filet de sécurité : même si Realtime est inactif côté serveur, le suivi reste à jour.
    const pollTimer = window.setInterval(load, 20000);
    return () => {
      alive = false;
      unsub();
      window.clearInterval(pollTimer);
    };
  }, [orderId, token]);

  useEffect(() => {
    let alive = true;
    if (order?.driverId) getDriverById(order.driverId, token).then((d) => alive && setDriver(d));
    else setDriver(null);
    if (order?.depositId) getDepositById(order.depositId).then((d) => alive && setDeposit(d));
    return () => {
      alive = false;
    };
  }, [order?.driverId, order?.depositId, token]);

  if (loading) {
    return (
      <div className="min-h-screen px-5 py-8">
        <div key="tracking-skeleton" className="skeleton-in mx-auto max-w-2xl space-y-4">
          <div className="skeleton h-28 rounded-2xl" />
          <div className="skeleton h-24 rounded-2xl" />
          <div className="skeleton h-40 rounded-2xl" />
        </div>
      </div>
    );
  }
  if (!order) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-muted-foreground">Commande introuvable.</p>
        <Link to="/" className="mt-3 inline-block text-xs font-bold underline">
          Retour à l'accueil
        </Link>
      </div>
    );
  }

  const cancelled = order.status === "Annulée";
  const stepIndex =
    order.status === "En préparation"
      ? 1
      : order.status === "En route"
        ? 2
        : order.status === "Livrée"
          ? 3
          : 0;

  return (
    <div className="min-h-screen pb-12">
      <header className="px-5 py-4 text-white" style={{ background: "var(--gradient-night)" }}>
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <Link
            to="/"
            className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 hover:bg-white/20"
            aria-label="Retour"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">
              KONGO GAZ · Suivi en direct
            </p>
            <h1 className="font-display text-lg font-extrabold">Commande #{order.orderNumber}</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 py-5">
        <section className="glass rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <p className="font-display text-sm font-extrabold">Statut</p>
            <span
              className="rounded-full px-2 py-1 text-[10px] font-bold text-white"
              style={{ background: cancelled ? "var(--destructive)" : "var(--gradient-flame)" }}
            >
              {order.status}
            </span>
          </div>

          <div className="mt-4 flex items-center gap-2">
            {STEPS.map((s, i) => (
              <div key={s} className="flex flex-1 items-center gap-2">
                <div
                  className="grid h-7 w-7 place-items-center rounded-full text-[10px] font-bold"
                  style={{
                    background:
                      !cancelled && i <= stepIndex
                        ? "var(--gradient-flame)"
                        : "color-mix(in oklab, var(--night) 8%, transparent)",
                    color: !cancelled && i <= stepIndex ? "white" : "var(--muted-foreground)",
                  }}
                >
                  {!cancelled && i < stepIndex ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className="h-0.5 flex-1"
                    style={{
                      background:
                        !cancelled && i < stepIndex
                          ? "var(--flame)"
                          : "color-mix(in oklab, var(--night) 8%, transparent)",
                    }}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
            {STEPS.map((s) => (
              <span key={s}>{s}</span>
            ))}
          </div>
        </section>

        <section className="mt-4 rounded-2xl border border-border bg-card p-4">
          <p className="font-display text-sm font-extrabold">Livreur assigné</p>
          {driver ? (
            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="text-xs">
                <p className="flex items-center gap-1 font-bold">
                  <Truck className="h-3.5 w-3.5" /> {driver.full_name}
                </p>
                <p className="text-muted-foreground">
                  {driver.zone ? `Zone ${driver.zone}` : "Zone non précisée"}
                  {driver.vehicle ? ` · ${driver.vehicle}` : ""}
                  {deposit ? ` · Dépôt ${deposit.name}` : ""}
                </p>
              </div>
              <a
                href={`tel:${driver.phone}`}
                className="flex items-center gap-1 rounded-lg px-3 py-2 text-[11px] font-bold text-white"
                style={{ background: "var(--gradient-flame)" }}
              >
                <Phone className="h-3 w-3" /> Appeler
              </a>
            </div>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              Aucun livreur assigné pour le moment — assignation en cours par notre équipe.
            </p>
          )}
        </section>

        <section className="mt-4 glass rounded-2xl p-4 text-xs">
          <p className="font-display text-sm font-extrabold">Récapitulatif</p>
          <ul className="mt-2 space-y-1">
            {order.items.map((i) => (
              <li key={i.key} className="flex justify-between">
                <span>
                  {i.qty} × {i.label ?? i.bottleId}
                </span>
                <span className="font-bold">{formatFC(i.qty * i.unitPrice)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex justify-between border-t border-white/50 pt-2">
            <span className="text-muted-foreground">
              {order.receiveMode === "pickup" ? "Retrait au dépôt" : "Frais de livraison"}
            </span>
            <span className="font-bold">{formatFC(order.deliveryFee)}</span>
          </div>
          <div className="mt-1 flex justify-between">
            <span className="font-bold">Total</span>
            <span className="font-extrabold" style={{ color: "var(--flame)" }}>
              {formatFC(order.total)}
            </span>
          </div>
          <Link
            to="/facture/$orderId"
            params={{ orderId: order.id }}
            search={{ token }}
            className="mt-3 flex items-center justify-center gap-1 rounded-lg border border-white/50 bg-white/55 py-2 text-[11px] font-bold hover:bg-white/85 backdrop-blur-sm"
          >
            <FileText className="h-3 w-3" /> Facture / Reçu à jour
          </Link>
        </section>
      </main>
    </div>
  );
}
