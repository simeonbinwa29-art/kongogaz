import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth, fetchProfile } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, LogIn, Gift, Copy, Share2, Sparkles } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  fetchLoyalty,
  consumeCredit,
  buildReferralShareText,
  REFERRAL_BONUS,
  type LoyaltyInfo,
} from "@/lib/loyalty-api";
import {
  DEFAULT_PRODUCTS,
  loadProducts,
  loadProfile,
  saveProfile,
  subscribe,
  type ClientProfile,
  type Product,
} from "@/lib/bella-store";
import {
  createOrder,
  listOrders,
  subscribeOrders,
  patchOrderFromRealtime,
  buildWhatsAppMessage,
  cancelOrder,
  KONGO_GAZ_WHATSAPP,
  type Order,
  type OrderStatus,
  type CartItem,
} from "@/lib/orders-api";
import { Button } from "@/components/ui/button";
import {
  listDepositsByCommune,
  subscribeDeposits,
  sortDeposits,
  isPremium,
  mapsUrl,
  getDepositById,
  type Deposit,
} from "@/lib/deposits-api";
import { Textarea } from "@/components/ui/textarea";
import { DialogFooter } from "@/components/ui/dialog";
import { listActivePromotions, subscribePromotions, type Promotion } from "@/lib/promotions-api";
import {
  Flame,
  MapPin,
  ShoppingCart,
  Plus,
  Minus,
  Clock,
  ShieldCheck,
  Phone,
  Home,
  Package,
  User,
  ChevronRight,
  Search,
  Check,
  X,
  Wrench,
  CreditCard,
  Truck,
  CalendarClock,
  CheckCircle2,
  Loader2,
  MessageCircle,
  FileText,
} from "lucide-react";
import gasCylinder from "@/assets/gas-cylinder.png";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import { CommuneSelect } from "@/components/commune-select";
import { KINSHASA_COMMUNES } from "@/lib/kinshasa";
import { directionsUrl } from "@/lib/deposits-api";
import { downloadInvoicePdf, shareInvoiceOnWhatsApp } from "@/lib/invoice-pdf";
import {
  getDeliverySettings,
  effectiveScale,
  computeDeliveryFee,
  roadDistanceKm,
  depositCoords,
  getBrowserPosition,
  directionsBetween,
  DEFAULT_DELIVERY_SETTINGS,
  type DeliverySettings,
} from "@/lib/delivery-pricing";

/** Frais de trajet Dépôt ➔ Client (0 FC en retrait au dépôt). */
export const DELIVERY_FEE = 3000;

export type { Order, OrderStatus } from "@/lib/orders-api";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Kongo Gaz — Livraison de gaz GPL à domicile à Kinshasa" },
      {
        name: "description",
        content:
          "Commandez votre bouteille de gaz ménager en quelques clics. Livraison rapide à domicile partout à Kinshasa avec Kongo Gaz.",
      },
      { property: "og:title", content: "Kongo Gaz — Livraison de gaz GPL à domicile à Kinshasa" },
      {
        property: "og:description",
        content:
          "Commandez votre bouteille de gaz ménager en quelques clics. Livraison rapide à domicile partout à Kinshasa avec Kongo Gaz.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type Bottle = Product;

type Tab = "home" | "orders" | "offers" | "account";

const KIT_PRICE = 15000;

const COMMUNES = KINSHASA_COMMUNES;

export function formatFC(n: number) {
  return new Intl.NumberFormat("fr-FR").format(n) + " FC";
}

function Index() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<Tab>("home");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [commune, setCommune] = useState("Gombe");
  const [modalBottle, setModalBottle] = useState<Bottle | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [products, setProducts] = useState<Product[]>(DEFAULT_PRODUCTS);
  const [orders, setOrders] = useState<Order[]>([]);
  const [successOrder, setSuccessOrder] = useState<Order | null>(null);
  const [loyalty, setLoyalty] = useState<LoyaltyInfo | null>(null);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [depositId, setDepositId] = useState<string | null>(null);
  const selectedDeposit = useMemo(
    () => deposits.find((d) => d.id === depositId) ?? null,
    [deposits, depositId],
  );
  const aliveRef = useRef(true);

  // Login-first: unauthenticated visitors are sent to /auth unless they picked "guest"
  useEffect(() => {
    if (authLoading) return;
    if (user) return;
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("bg_guest_ok")) return;
    navigate({ to: "/auth" });
  }, [authLoading, user, navigate]);

  const refreshLoyalty = useCallback(() => {
    if (user)
      fetchLoyalty(user.id)
        .then(setLoyalty)
        .catch(() => {});
  }, [user]);

  useEffect(() => {
    aliveRef.current = true;
    setProducts(loadProducts());
    listOrders().then((d) => {
      if (aliveRef.current) setOrders(d);
    });
    const unsubProducts = subscribe(() => {
      if (aliveRef.current) setProducts(loadProducts());
    });
    // Realtime : toute modification d'une commande (nouvelle, statut, livreur, frais)
    // est répercutée immédiatement via la payload UPDATE, confirmée par un refetch,
    // et toute suppression (ex: purge admin) retire la commande de la liste sur-le-champ.
    const unsubOrders = subscribeOrders((payload) => {
      if (!aliveRef.current || payload?.table !== "orders") return;
      if (payload.eventType === "DELETE") {
        const deletedId = payload.old?.id;
        if (deletedId) setOrders((prev) => prev.filter((o) => o.id !== deletedId));
        return;
      }
      if (payload.eventType === "UPDATE" && payload.new?.id) {
        setOrders((prev) =>
          prev.map((o) => (o.id === payload.new!.id ? patchOrderFromRealtime(o, payload) : o)),
        );
      }
      listOrders().then((d) => {
        if (aliveRef.current) setOrders(d);
      });
    });
    // Filet de sécurité : même si Realtime est inactif côté serveur, l'état reste synchronisé.
    const pollTimer = window.setInterval(() => {
      if (aliveRef.current)
        listOrders().then((d) => {
          if (aliveRef.current) setOrders(d);
        });
    }, 30000);
    return () => {
      aliveRef.current = false;
      unsubProducts();
      unsubOrders();
      window.clearInterval(pollTimer);
    };
  }, []);

  // Sync signed-in user's profile into local ClientProfile store (prefill checkout)
  useEffect(() => {
    if (!user) {
      setLoyalty(null);
      return;
    }
    fetchProfile(user.id).then((p) => {
      if (!p) return;
      const local = loadProfile();
      saveProfile({
        ...local,
        fullName: local.fullName || p.full_name || "",
        phone: local.phone || p.phone_whatsapp || "",
        whatsapp: local.whatsapp || p.phone_whatsapp || "",
      });
      if (p.default_commune) setCommune((c) => (c === "Gombe" ? p.default_commune! : c));
    });
    fetchLoyalty(user.id)
      .then(setLoyalty)
      .catch(() => {});
  }, [user]);

  // Dépôts partenaires de la commune (Premium en tête) + temps réel
  useEffect(() => {
    let alive = true;
    const load = () =>
      listDepositsByCommune(commune).then((list) => {
        if (!alive) return;
        const sorted = sortDeposits(list);
        setDeposits(sorted);
        setDepositId((cur) =>
          cur && sorted.some((d) => d.id === cur) ? cur : (sorted[0]?.id ?? null),
        );
      });
    load();
    const unsub = subscribeDeposits(load);
    return () => {
      alive = false;
      unsub();
    };
  }, [commune]);

  const total = useMemo(() => cart.reduce((sum, i) => sum + i.unitPrice * i.qty, 0), [cart]);
  const itemCount = useMemo(() => cart.reduce((a, b) => a + b.qty, 0), [cart]);

  const addToCart = (item: CartItem) => {
    setCart((c) => {
      const existing = c.find((x) => x.key === item.key);
      if (existing) {
        return c.map((x) => (x.key === item.key ? { ...x, qty: x.qty + item.qty } : x));
      }
      return [...c, item];
    });
    toast.success("Ajouté au panier", { description: `${item.qty} × ${item.key}` });
  };

  const updateQty = (key: string, delta: number) => {
    setCart((c) =>
      c.map((x) => (x.key === key ? { ...x, qty: x.qty + delta } : x)).filter((x) => x.qty > 0),
    );
  };

  const submitOrder = async (
    partial: Omit<Order, "id" | "orderNumber" | "createdAt" | "status">,
  ) => {
    try {
      const created = await createOrder({ ...partial, depositId: depositId ?? undefined });
      setCart([]);
      setCheckoutOpen(false);
      setSuccessOrder(created);
      setOrders((o) => [created, ...o]);
      if (user)
        fetchLoyalty(user.id)
          .then(setLoyalty)
          .catch(() => {});
      toast.success("Commande confirmée !", {
        description: `#${created.orderNumber} transmise au dispatching.`,
      });
    } catch (e) {
      console.error(e);
      toast.error("Impossible d'enregistrer la commande", {
        description: "Vérifiez votre connexion et réessayez.",
      });
    }
  };

  return (
    <div className="min-h-screen pb-32">
      {tab === "home" && (
        <HomeView
          cart={cart}
          commune={commune}
          setCommune={setCommune}
          onOpenBottle={setModalBottle}
          bottles={products}
          deposits={deposits}
          depositId={depositId}
          onSelectDeposit={setDepositId}
        />
      )}
      {tab === "orders" && (
        <OrdersView
          orders={orders}
          onGoHome={() => setTab("home")}
          onCancelled={(id) =>
            setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status: "Annulée" } : o)))
          }
        />
      )}
      {tab === "offers" && <OffersView />}
      {tab === "account" && <AccountView loyalty={loyalty} onLoyaltyRefresh={refreshLoyalty} />}

      {/* Floating cart bar */}
      {itemCount > 0 && tab === "home" && (
        <div className="fixed inset-x-0 bottom-24 z-40 px-4">
          <button
            onClick={() => {
              if (!user) {
                if (typeof window !== "undefined")
                  sessionStorage.setItem("bg_redirect_after_auth", "/");
                toast.info("Connectez-vous pour valider votre commande");
                navigate({ to: "/auth" });
                return;
              }
              setCheckoutOpen(true);
            }}
            className="glass-night t-spring mx-auto flex w-full max-w-md items-center justify-between rounded-2xl px-4 py-3 text-white active:scale-[0.98]"
          >
            <div className="flex items-center gap-3">
              <div
                className="relative grid h-9 w-9 place-items-center rounded-xl"
                style={{ background: "var(--gradient-flame)" }}
              >
                <ShoppingCart className="h-4 w-4" />
                <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-white px-1 text-[10px] font-bold text-foreground">
                  {itemCount}
                </span>
              </div>
              <div className="text-left leading-tight">
                <p className="text-[10px] uppercase tracking-wider text-white/60 text-glow">
                  {itemCount} article{itemCount > 1 ? "s" : ""}
                </p>
                <p className="text-sm font-bold text-glow">Valider la commande →</p>
              </div>
            </div>
            <span className="font-display text-sm font-extrabold text-glow">{formatFC(total)}</span>
          </button>
        </div>
      )}

      {/* Bottom nav (remonté au-dessus du pied de page global © Kongo Gaz) */}
      <nav className="fixed inset-x-0 bottom-7 z-30 border-t border-white/50 bg-white/70 backdrop-blur-xl dark:border-white/10 dark:bg-white/10">
        <div className="mx-auto grid max-w-md grid-cols-4">
          <NavItem
            icon={<Home className="h-5 w-5" />}
            label="Accueil"
            active={tab === "home"}
            onClick={() => setTab("home")}
          />
          <NavItem
            icon={<Package className="h-5 w-5" />}
            label="Commandes"
            active={tab === "orders"}
            onClick={() => setTab("orders")}
            badge={orders.length}
          />
          <NavItem
            icon={<Flame className="h-5 w-5" />}
            label="Offres"
            active={tab === "offers"}
            onClick={() => setTab("offers")}
          />
          <NavItem
            icon={<User className="h-5 w-5" />}
            label="Compte"
            active={tab === "account"}
            onClick={() => setTab("account")}
          />
        </div>
      </nav>

      {/* Options modal */}
      <BottleOptionsModal
        bottle={modalBottle}
        onClose={() => setModalBottle(null)}
        onAdd={(item) => {
          addToCart(item);
          setModalBottle(null);
        }}
      />

      {/* Checkout sheet */}
      <CheckoutSheet
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        cart={cart}
        total={total}
        commune={commune}
        onUpdateQty={updateQty}
        onSubmit={submitOrder}
        loyalty={loyalty}
        deposit={selectedDeposit}
      />

      {/* Success dialog */}
      <SuccessDialog
        order={successOrder}
        deposit={selectedDeposit}
        onClose={() => {
          setSuccessOrder(null);
          setTab("orders");
        }}
      />
    </div>
  );
}

function SuccessDialog({
  order,
  deposit,
  onClose,
}: {
  order: Order | null;
  deposit?: Deposit | null;
  onClose: () => void;
}) {
  // PDF généré automatiquement à la validation de la commande
  useEffect(() => {
    if (order) downloadInvoicePdf(order, deposit ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id]);

  return (
    <Dialog open={!!order} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm gap-0 rounded-3xl p-0">
        {order && (
          <>
            <div
              className="rounded-t-3xl px-5 pb-5 pt-6 text-center text-white"
              style={{ background: "var(--gradient-night)" }}
            >
              <div
                className="mx-auto grid h-14 w-14 place-items-center rounded-2xl"
                style={{ background: "var(--gradient-flame)" }}
              >
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <DialogHeader className="mt-3">
                <DialogTitle className="font-display text-lg font-extrabold text-white">
                  Commande confirmée !
                </DialogTitle>
                <DialogDescription className="text-white/70">
                  #{order.orderNumber} · {formatFC(order.total)} ·{" "}
                  {order.receiveMode === "pickup" ? "Retrait au dépôt" : "Livraison à domicile"}
                </DialogDescription>
              </DialogHeader>
            </div>
            <div className="space-y-2 p-5">
              <p className="rounded-xl bg-muted px-3 py-2 text-center text-[11px] text-muted-foreground">
                Votre facture PDF a été téléchargée automatiquement.
              </p>
              <button
                onClick={() => shareInvoiceOnWhatsApp(order, deposit ?? null)}
                className="flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold text-white"
                style={{ background: "oklch(0.6 0.15 150)" }}
              >
                <MessageCircle className="h-4 w-4" />
                Envoyer la facture sur WhatsApp
              </button>
              <a
                href={`https://wa.me/${KONGO_GAZ_WHATSAPP}?text=${encodeURIComponent(buildWhatsAppMessage(order))}`}
                target="_blank"
                rel="noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/50 bg-white/55 py-3 text-sm font-bold backdrop-blur-sm active:scale-[0.98]"
              >
                <MessageCircle className="h-4 w-4" />
                Envoyer ma commande au support
              </a>
              <button
                onClick={() => downloadInvoicePdf(order, deposit ?? null)}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/50 bg-white/55 py-3 text-sm font-bold backdrop-blur-sm active:scale-[0.98]"
              >
                <FileText className="h-4 w-4" />
                Retélécharger la facture PDF
              </button>
              <Link
                to="/facture/$orderId"
                params={{ orderId: order.id }}
                search={{ token: order.trackingToken }}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/50 bg-white/55 py-3 text-sm font-bold backdrop-blur-sm active:scale-[0.98]"
              >
                <FileText className="h-4 w-4" />
                Voir le reçu imprimable
              </Link>
              <button
                onClick={onClose}
                className="mt-1 w-full py-2 text-xs font-semibold text-muted-foreground"
              >
                Continuer
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ------------ HOME VIEW ------------ */

function DepositPicker({
  deposits,
  depositId,
  onSelect,
  commune,
}: {
  deposits: Deposit[];
  depositId: string | null;
  onSelect: (id: string) => void;
  commune: string;
}) {
  return (
    <section className="mt-6 px-5">
      <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
        Dépôt le plus proche · {commune}
      </h2>
      {deposits.length === 0 ? (
        <p className="glass-faint rounded-2xl border border-dashed border-white/50 p-4 text-center text-xs text-glass-tertiary">
          Aucun dépôt partenaire dans cette commune — nous livrons depuis le dépôt central.
        </p>
      ) : (
        <div className="space-y-2">
          {deposits.map((d) => {
            const active = d.id === depositId;
            const premium = isPremium(d);
            return (
              <button
                key={d.id}
                onClick={() => onSelect(d.id)}
                className="t-liquid glass flex w-full items-center gap-3 rounded-2xl p-3 text-left active:scale-[0.98]"
                style={{
                  borderColor: active ? "var(--flame)" : "var(--glass-border)",
                  boxShadow: active ? "var(--shadow-flame)" : undefined,
                }}
              >
                <div
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white"
                  style={{ background: premium ? "var(--gradient-flame)" : "var(--night)" }}
                >
                  {premium ? <Sparkles className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 truncate text-sm font-bold">
                    {d.name}
                    {premium && (
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[9px] font-bold text-white"
                        style={{ background: "var(--gradient-flame)" }}
                      >
                        Partenaire Prioritaire ⭐
                      </span>
                    )}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {d.neighborhood ? d.neighborhood + " · " : ""}
                    {d.address ?? d.commune}
                  </p>
                </div>
                <a
                  href={mapsUrl(d)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="shrink-0 rounded-lg border border-white/50 bg-white/55 px-2 py-1 text-[10px] font-bold backdrop-blur-sm"
                >
                  Carte
                </a>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function HomeView({
  cart,
  commune,
  setCommune,
  onOpenBottle,
  bottles,
  deposits,
  depositId,
  onSelectDeposit,
}: {
  cart: CartItem[];
  commune: string;
  setCommune: (c: string) => void;
  onOpenBottle: (b: Bottle) => void;
  bottles: Bottle[];
  deposits: Deposit[];
  depositId: string | null;
  onSelectDeposit: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return bottles;
    return bottles.filter((b) =>
      [b.size, b.weight, b.tag ?? ""].join(" ").toLowerCase().includes(q),
    );
  }, [bottles, query]);
  const qtyForBottle = (id: string) =>
    cart.filter((c) => c.bottleId === id).reduce((a, b) => a + b.qty, 0);

  return (
    <>
      <header
        className="relative overflow-hidden rounded-b-[2rem] px-5 pb-8 pt-6 text-white"
        style={{ background: "var(--gradient-night)" }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full opacity-40 blur-3xl"
          style={{ background: "var(--gradient-flame)" }}
        />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="grid h-10 w-10 place-items-center rounded-xl"
              style={{ background: "var(--gradient-flame)", boxShadow: "var(--shadow-flame)" }}
            >
              <Flame className="h-5 w-5" strokeWidth={2.5} />
            </div>
            <div className="leading-tight">
              <p className="font-display text-lg font-extrabold tracking-tight">Kongo Gaz</p>
              <p className="text-[10px] uppercase tracking-[0.2em] text-white/60">Kinshasa</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle className="h-10 w-10 rounded-full" />
            <button
              aria-label="Appeler le service client"
              className="grid h-10 w-10 place-items-center rounded-full bg-white/10 backdrop-blur transition hover:bg-white/20"
            >
              <Phone className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="relative mt-6">
          <p className="text-sm text-white/70">Bonjour 👋</p>
          <h1 className="mt-1 font-display text-[28px] font-extrabold leading-[1.1]">
            Du gaz à domicile,
            <br />
            <span style={{ color: "var(--flame)" }}>en 60 minutes.</span>
          </h1>
        </div>

        <button className="relative mt-5 flex w-full items-center gap-3 rounded-2xl bg-white/10 px-4 py-3 backdrop-blur-md transition hover:bg-white/15">
          <MapPin className="h-4 w-4 shrink-0" style={{ color: "var(--flame)" }} />
          <div className="min-w-0 flex-1 text-left">
            <p className="text-[10px] uppercase tracking-wider text-white/60">Livrer à</p>
            <p className="truncate text-sm font-semibold">{commune}, Kinshasa</p>
          </div>
          <ChevronRight className="h-4 w-4 text-white/60" />
        </button>

        <div className="relative mt-3 flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-foreground shadow-lg dark:bg-white/10">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher une bouteille (6 kg, 12 kg…)"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="text-xs font-semibold text-muted-foreground"
              aria-label="Effacer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      <section className="mx-5 -mt-4 grid grid-cols-3 gap-2 rounded-2xl glass p-3 shadow-sm">
        <Badge icon={<Clock className="h-4 w-4" />} label="60 min" sub="Livraison" />
        <Badge icon={<ShieldCheck className="h-4 w-4" />} label="Certifié" sub="Sécurisé" />
        <Badge icon={<Flame className="h-4 w-4" />} label="24/7" sub="Service" />
      </section>

      <section className="mt-6 px-5">
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Votre commune</h2>
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {COMMUNES.map((c) => {
            const active = c === commune;
            return (
              <button
                key={c}
                onClick={() => setCommune(c)}
                className={`shrink-0 rounded-full border px-4 py-2 text-xs font-semibold transition ${
                  active
                    ? "border-transparent text-white"
                    : "border-white/50 bg-white/55 text-foreground backdrop-blur-sm hover:border-white/85"
                }`}
                style={active ? { background: "var(--night)" } : undefined}
              >
                {c}
              </button>
            );
          })}
        </div>
      </section>

      <DepositPicker
        deposits={deposits}
        depositId={depositId}
        onSelect={onSelectDeposit}
        commune={commune}
      />

      <section className="mt-6 px-5">
        <div className="mb-3 flex items-end justify-between">
          <h2 className="font-display text-xl font-extrabold">Nos bouteilles</h2>
          <a className="text-xs font-semibold" style={{ color: "var(--flame)" }}>
            Tout voir
          </a>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {filtered.length === 0 && (
            <p className="glass-faint col-span-2 rounded-2xl border border-dashed border-white/50 p-4 text-center text-xs text-glass-tertiary">
              Aucun résultat pour « {query} ».
            </p>
          )}
          {filtered.map((b) => {
            const qty = qtyForBottle(b.id);
            const disabled = !b.available;
            return (
              <article
                key={b.id}
                className={`glow-cursor t-liquid glass relative flex flex-col overflow-hidden rounded-2xl p-3 ${
                  disabled ? "opacity-70" : "glass-hover"
                }`}
              >
                {disabled ? (
                  <span className="absolute right-2 top-2 z-10 rounded-full bg-destructive px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                    En rupture
                  </span>
                ) : (
                  b.tag && (
                    <span
                      className="absolute right-2 top-2 z-10 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white"
                      style={{ background: "var(--gradient-flame)" }}
                    >
                      {b.tag}
                    </span>
                  )
                )}
                <div
                  className="mb-2 grid aspect-square place-items-center rounded-xl"
                  style={{
                    background:
                      "radial-gradient(circle at 50% 30%, oklch(0.96 0.02 250) 0%, oklch(0.92 0.02 250) 100%)",
                  }}
                >
                  <img
                    src={gasCylinder}
                    alt={`Bouteille de gaz ${b.weight}`}
                    className="h-[85%] w-auto object-contain drop-shadow-md"
                    loading="lazy"
                    width={800}
                    height={800}
                  />
                </div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {b.size}
                </p>
                <p className="font-display text-base font-bold leading-tight">{b.weight}</p>
                <p className="mt-1 text-sm font-extrabold" style={{ color: "var(--night)" }}>
                  {formatFC(b.price)}
                </p>

                <div className="mt-3">
                  <button
                    onClick={() => !disabled && onOpenBottle(b)}
                    disabled={disabled}
                    className="flex w-full items-center justify-center gap-1 rounded-xl py-2 text-xs font-bold text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                    style={{
                      background: disabled
                        ? "color-mix(in oklab, var(--night) 40%, transparent)"
                        : "var(--gradient-flame)",
                      boxShadow: disabled ? undefined : "var(--shadow-flame)",
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" strokeWidth={3} />
                    {disabled ? "Indisponible" : qty > 0 ? `Ajouter (${qty} au panier)` : "Ajouter"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="mt-6 px-5">
        <div
          className="relative overflow-hidden rounded-2xl p-5 text-white"
          style={{ background: "var(--gradient-night)" }}
        >
          <div
            aria-hidden
            className="absolute -bottom-10 -right-10 h-40 w-40 rounded-full opacity-30 blur-2xl"
            style={{ background: "var(--gradient-flame)" }}
          />
          <p
            className="text-[10px] font-bold uppercase tracking-widest"
            style={{ color: "var(--flame)" }}
          >
            Offre du jour
          </p>
          <h3 className="mt-1 font-display text-lg font-extrabold leading-tight">
            Livraison gratuite dès 2 bouteilles
          </h3>
          <p className="mt-1 text-xs text-white/70">Valable aujourd'hui sur toutes les communes.</p>
        </div>
      </section>
    </>
  );
}

/* ------------ OPTIONS MODAL ------------ */

function BottleOptionsModal({
  bottle,
  onClose,
  onAdd,
}: {
  bottle: Bottle | null;
  onClose: () => void;
  onAdd: (item: CartItem) => void;
}) {
  const [mode, setMode] = useState<"refill" | "purchase">("refill");
  const [kit, setKit] = useState(false);
  const [qty, setQty] = useState(1);

  // reset on open
  const open = !!bottle;

  const unit = bottle
    ? (mode === "refill" ? bottle.price : bottle.price + bottle.consigne) + (kit ? KIT_PRICE : 0)
    : 0;

  const submit = () => {
    if (!bottle) return;
    onAdd({
      key: `${bottle.id}-${mode}${kit ? "-kit" : ""}`,
      bottleId: bottle.id,
      mode,
      kit,
      qty,
      unitPrice: unit,
    });
    setMode("refill");
    setKit(false);
    setQty(1);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          setMode("refill");
          setKit(false);
          setQty(1);
        }
      }}
    >
      <DialogContent className="max-w-md gap-0 rounded-3xl p-0 sm:rounded-3xl">
        {bottle && (
          <>
            <div
              className="relative overflow-hidden rounded-t-3xl px-5 pb-5 pt-6 text-white"
              style={{ background: "var(--gradient-night)" }}
            >
              <div
                aria-hidden
                className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full opacity-40 blur-3xl"
                style={{ background: "var(--gradient-flame)" }}
              />
              <DialogHeader className="text-left">
                <DialogTitle className="font-display text-xl font-extrabold text-white">
                  Bouteille {bottle.weight}
                </DialogTitle>
                <DialogDescription className="text-white/70">
                  Choisissez votre option de commande
                </DialogDescription>
              </DialogHeader>
            </div>

            <div className="max-h-[65vh] space-y-5 overflow-y-auto p-5">
              {/* Mode */}
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Type de commande
                </p>
                <OptionCard
                  selected={mode === "refill"}
                  onClick={() => setMode("refill")}
                  title="Recharge simple (Échange)"
                  desc="J'ai déjà une bouteille vide à échanger"
                  price={formatFC(bottle.price)}
                />
                <OptionCard
                  selected={mode === "purchase"}
                  onClick={() => setMode("purchase")}
                  title="Achat bouteille complète"
                  desc={`Je n'ai pas de bouteille vide (+ Consigne ${formatFC(bottle.consigne)})`}
                  price={formatFC(bottle.price + bottle.consigne)}
                />
              </div>

              {/* Accessories */}
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Accessoires
                </p>
                <button
                  onClick={() => setKit((k) => !k)}
                  className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${
                    kit ? "border-transparent" : "border-border"
                  }`}
                  style={
                    kit
                      ? { background: "color-mix(in oklab, var(--flame) 8%, transparent)" }
                      : undefined
                  }
                >
                  <div
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
                    style={{
                      background: "color-mix(in oklab, var(--flame) 12%, transparent)",
                      color: "var(--flame)",
                    }}
                  >
                    <Wrench className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold">Kit détendeur + tuyau</p>
                    <p className="text-xs text-muted-foreground">
                      Recommandé pour une première installation
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-extrabold" style={{ color: "var(--night)" }}>
                      +{formatFC(KIT_PRICE)}
                    </p>
                    <div
                      className={`ml-auto mt-1 grid h-5 w-5 place-items-center rounded-md border ${
                        kit ? "border-transparent" : "border-border"
                      }`}
                      style={
                        kit ? { background: "var(--gradient-flame)", color: "white" } : undefined
                      }
                    >
                      {kit && <Check className="h-3 w-3" strokeWidth={3} />}
                    </div>
                  </div>
                </button>
              </div>

              {/* Quantity */}
              <div className="flex items-center justify-between rounded-2xl border border-white/50 bg-white/55 p-3 backdrop-blur-sm">
                <div>
                  <p className="text-sm font-bold">Quantité</p>
                  <p className="text-xs text-muted-foreground">Nombre de bouteilles</p>
                </div>
                <div
                  className="flex items-center gap-1 rounded-xl p-1 text-white"
                  style={{ background: "var(--night)" }}
                >
                  <button
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    aria-label="Diminuer"
                    className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white/10"
                  >
                    <Minus className="h-3.5 w-3.5" strokeWidth={3} />
                  </button>
                  <span className="w-8 text-center text-sm font-bold tabular-nums">{qty}</span>
                  <button
                    onClick={() => setQty((q) => q + 1)}
                    aria-label="Augmenter"
                    className="grid h-8 w-8 place-items-center rounded-lg"
                    style={{ background: "var(--gradient-flame)" }}
                  >
                    <Plus className="h-3.5 w-3.5" strokeWidth={3} />
                  </button>
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 z-10 shrink-0 border-t border-white/50 bg-white/60 px-5 py-4 backdrop-blur-xl">
              <button
                onClick={submit}
                className="press-scale flex w-full items-center justify-between gap-2 rounded-2xl px-5 py-3.5 text-white transition active:scale-[0.98]"
                style={{
                  background: "var(--gradient-flame)",
                  boxShadow: "var(--shadow-flame)",
                }}
              >
                <span className="text-sm font-bold">Ajouter au panier</span>
                <span className="font-display text-base font-extrabold">
                  {formatFC(unit * qty)}
                </span>
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function OptionCard({
  selected,
  onClick,
  title,
  desc,
  price,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  desc: string;
  price: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition ${
        selected ? "border-transparent ring-2" : "border-border"
      }`}
      style={
        selected
          ? {
              background: "color-mix(in oklab, var(--flame) 8%, transparent)",
              boxShadow: "0 0 0 2px var(--flame) inset",
            }
          : undefined
      }
    >
      <div
        className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
          selected ? "border-transparent" : "border-border"
        }`}
        style={selected ? { background: "var(--gradient-flame)", color: "white" } : undefined}
      >
        {selected && <Check className="h-3 w-3" strokeWidth={3} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">{title}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      <p className="whitespace-nowrap text-sm font-extrabold" style={{ color: "var(--night)" }}>
        {price}
      </p>
    </button>
  );
}

/* ------------ CHECKOUT ------------ */

function CheckoutSheet({
  open,
  onOpenChange,
  cart,
  total,
  commune,
  onUpdateQty,
  onSubmit,
  loyalty,
  deposit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  cart: CartItem[];
  total: number;
  commune: string;
  onUpdateQty: (key: string, delta: number) => void;
  onSubmit: (o: Omit<Order, "id" | "orderNumber" | "createdAt" | "status">) => Promise<void> | void;
  loyalty: LoyaltyInfo | null;
  deposit?: Deposit | null;
}) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [selCommune, setSelCommune] = useState(commune);
  const [quartier, setQuartier] = useState("");
  const [avenue, setAvenue] = useState("");
  const [parcelle, setParcelle] = useState("");
  const [repere, setRepere] = useState("");
  const [receiveMode, setReceiveMode] = useState<"delivery" | "pickup">("delivery");
  const [deliveryMode, setDeliveryMode] = useState<"express" | "scheduled">("express");
  const [scheduledAt, setScheduledAt] = useState("");
  const [payment, setPayment] = useState<Order["payment"]>("mpesa");
  const [useCredit, setUseCredit] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [scale, setScale] = useState<DeliverySettings>(DEFAULT_DELIVERY_SETTINGS);

  useEffect(() => {
    getDeliverySettings()
      .then(setScale)
      .catch(() => undefined);
  }, []);

  const pickup = receiveMode === "pickup";
  const activeScale = effectiveScale(scale, deposit);
  const depotPoint = depositCoords(deposit);
  const distanceKm = !pickup && coords && depotPoint ? roadDistanceKm(depotPoint, coords) : null;
  const deliveryFee = pickup ? 0 : computeDeliveryFee(activeScale, distanceKm);

  const referralBonus =
    loyalty && loyalty.referredBy && !loyalty.firstOrderPlaced ? REFERRAL_BONUS : 0;
  const availableCredit = loyalty?.credit ?? 0;
  const grossTotal = total + deliveryFee;
  const creditToUse = useCredit
    ? Math.min(availableCredit, Math.max(0, grossTotal - referralBonus))
    : 0;
  const finalTotal = Math.max(0, grossTotal - referralBonus - creditToUse);

  const canSubmit =
    fullName.trim() &&
    phone.trim() &&
    (pickup
      ? !!deposit
      : selCommune && quartier.trim() && avenue.trim() && parcelle.trim() && repere.trim()) &&
    (deliveryMode === "express" || scheduledAt);

  const handleSubmit = async () => {
    if (!canSubmit) {
      toast.error("Formulaire incomplet", {
        description: pickup
          ? "Sélectionnez un dépôt de retrait et renseignez vos coordonnées."
          : "Merci de renseigner tous les champs obligatoires.",
      });
      return;
    }
    setSubmitting(true);
    try {
      if (creditToUse > 0) {
        try {
          await consumeCredit(creditToUse);
        } catch {
          toast.error("Impossible d'appliquer votre crédit fidélité.");
        }
      }
      await onSubmit({
        items: cart,
        total: finalTotal,
        customer: { fullName, phone, whatsapp },
        address: pickup
          ? {
              commune: deposit?.commune ?? selCommune,
              quartier: deposit?.neighborhood ?? "",
              avenue: deposit?.address ?? "",
              parcelle: "-",
              repere: `Retrait au dépôt ${deposit?.name ?? ""}`,
            }
          : { commune: selCommune, quartier, avenue, parcelle, repere },
        delivery: { mode: deliveryMode, when: scheduledAt || undefined },
        payment,
        receiveMode,
        deliveryFee,
        customerLat: pickup ? null : (coords?.lat ?? null),
        customerLng: pickup ? null : (coords?.lng ?? null),
        distanceKm,
        creditApplied: referralBonus + creditToUse,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="flex h-[90vh] max-h-[90vh] flex-col rounded-t-3xl p-0 [&>button]:top-4"
      >
        <SheetHeader className="shrink-0 border-b border-white/50 px-5 py-4 text-left">
          <SheetTitle className="font-display text-xl font-extrabold">
            Valider la commande
          </SheetTitle>
          <SheetDescription>Livraison à domicile à Kinshasa</SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {/* Cart summary */}
          <Section title="Votre panier">
            <div className="space-y-2">
              {cart.map((item) => {
                const bottle = DEFAULT_PRODUCTS.find((b) => b.id === item.bottleId) ??
                  loadProducts().find((b) => b.id === item.bottleId) ?? {
                    weight: item.label ?? item.bottleId,
                  };
                return (
                  <div
                    key={item.key}
                    className="flex items-center gap-3 rounded-xl border border-white/50 bg-white/55 p-3 backdrop-blur-sm"
                  >
                    <img
                      src={gasCylinder}
                      alt=""
                      className="h-12 w-12 object-contain"
                      loading="lazy"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold">{bottle.weight}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {item.mode === "refill" ? "Recharge" : "Achat complet"}
                        {item.kit && " · Kit"}
                      </p>
                      <p className="text-xs font-extrabold" style={{ color: "var(--night)" }}>
                        {formatFC(item.unitPrice)}
                      </p>
                    </div>
                    <div
                      className="flex items-center gap-1 rounded-lg p-0.5 text-white"
                      style={{ background: "var(--night)" }}
                    >
                      <button
                        onClick={() => onUpdateQty(item.key, -1)}
                        className="grid h-7 w-7 place-items-center rounded-md hover:bg-white/10"
                        aria-label="Diminuer"
                      >
                        <Minus className="h-3 w-3" strokeWidth={3} />
                      </button>
                      <span className="w-6 text-center text-xs font-bold">{item.qty}</span>
                      <button
                        onClick={() => onUpdateQty(item.key, 1)}
                        className="grid h-7 w-7 place-items-center rounded-md"
                        style={{ background: "var(--gradient-flame)" }}
                        aria-label="Augmenter"
                      >
                        <Plus className="h-3 w-3" strokeWidth={3} />
                      </button>
                    </div>
                  </div>
                );
              })}
              {cart.length === 0 && <p className="text-sm text-muted-foreground">Panier vide.</p>}
            </div>
          </Section>

          <Section title="Informations client">
            <Field label="Nom complet *">
              <TextInput value={fullName} onChange={setFullName} placeholder="Ex : Jean Kabila" />
            </Field>
            <Field label="Téléphone principal (Mobile Money) *">
              <TextInput
                value={phone}
                onChange={setPhone}
                placeholder="+243 8XX XXX XXX"
                type="tel"
              />
            </Field>
            <Field label="Téléphone secondaire / WhatsApp">
              <TextInput
                value={whatsapp}
                onChange={setWhatsapp}
                placeholder="+243 8XX XXX XXX"
                type="tel"
              />
            </Field>
          </Section>

          <Section title="Mode de réception">
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  {
                    id: "delivery",
                    title: "Livraison à domicile",
                    sub: formatFC(computeDeliveryFee(activeScale, distanceKm)),
                  },
                  { id: "pickup", title: "Retrait au dépôt", sub: "0 FC" },
                ] as const
              ).map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setReceiveMode(o.id)}
                  className={`t-liquid rounded-2xl border p-3 text-left backdrop-blur-sm active:scale-[0.98] ${
                    receiveMode === o.id
                      ? "border-foreground/40 bg-white/70"
                      : "border-white/50 bg-white/55"
                  }`}
                >
                  <p className="text-xs font-extrabold">{o.title}</p>
                  <p className="text-[11px] text-muted-foreground">{o.sub}</p>
                </button>
              ))}
            </div>
            {pickup && (
              <div className="mt-2 rounded-2xl border border-white/50 bg-white/55 p-3 text-[11px] backdrop-blur-sm">
                {deposit ? (
                  <>
                    <p className="text-xs font-extrabold">{deposit.name}</p>
                    <p className="text-muted-foreground">
                      {deposit.address ? `${deposit.address} · ` : ""}
                      {deposit.neighborhood ? `${deposit.neighborhood}, ` : ""}
                      {deposit.commune}
                    </p>
                    <p className="text-muted-foreground">
                      Horaires : {deposit.opening_hours ?? "08h00 – 18h00 (lun. – sam.)"}
                    </p>
                    <a
                      href={directionsUrl(deposit)}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1 rounded-xl border border-white/50 bg-white/55 px-3 py-1.5 font-bold backdrop-blur-sm"
                    >
                      <MapPin className="h-3 w-3" /> Itinéraire Google Maps
                    </a>
                  </>
                ) : (
                  <p className="text-muted-foreground">
                    Choisissez d'abord un dépôt partenaire sur l'accueil pour activer le retrait.
                  </p>
                )}
              </div>
            )}
          </Section>

          {!pickup && (
            <Section title="Adresse de livraison">
              <div className="mb-2 rounded-2xl border border-white/50 bg-white/55 p-3 backdrop-blur-sm">
                <p className="text-[11px] font-extrabold">
                  Position GPS (pour le calcul du trajet)
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {coords
                    ? distanceKm != null
                      ? `Distance dépôt ➔ vous : ~ ${distanceKm} km · Frais ${formatFC(deliveryFee)}`
                      : "Position enregistrée. Choisissez un dépôt pour calculer la distance."
                    : depotPoint
                      ? `Sans position, le forfait minimum de ${formatFC(activeScale.min_fee)} s'applique.`
                      : "Le dépôt sélectionné n'a pas encore de coordonnées GPS."}
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    disabled={locating}
                    onClick={async () => {
                      setLocating(true);
                      try {
                        setCoords(await getBrowserPosition());
                        toast.success("Position GPS enregistrée");
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Position indisponible");
                      } finally {
                        setLocating(false);
                      }
                    }}
                    className="inline-flex items-center gap-1 rounded-xl border border-white/50 bg-white/55 px-3 py-1.5 text-[11px] font-bold backdrop-blur-sm"
                  >
                    <MapPin className="h-3 w-3" />
                    {locating
                      ? "Localisation…"
                      : coords
                        ? "Actualiser ma position"
                        : "Utiliser ma position"}
                  </button>
                  {coords && depotPoint && (
                    <a
                      href={directionsBetween(depotPoint, coords)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-xl border border-white/50 bg-white/55 px-3 py-1.5 text-[11px] font-bold backdrop-blur-sm"
                    >
                      Voir le trajet
                    </a>
                  )}
                </div>
              </div>
              <Field label="Commune *">
                <CommuneSelect value={selCommune} onChange={setSelCommune} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Quartier *">
                  <TextInput value={quartier} onChange={setQuartier} placeholder="Ex : Righini" />
                </Field>
                <Field label="Avenue *">
                  <TextInput value={avenue} onChange={setAvenue} placeholder="Ex : Kasa-Vubu" />
                </Field>
              </div>
              <Field label="N° de parcelle *">
                <TextInput value={parcelle} onChange={setParcelle} placeholder="Ex : 24 bis" />
              </Field>
              <Field label="Point de repère * (obligatoire)">
                <textarea
                  value={repere}
                  onChange={(e) => setRepere(e.target.value)}
                  placeholder="Ex : En face de l'école Sainte-Marie, à côté de la station Engen"
                  rows={2}
                  className="w-full resize-none rounded-xl border border-white/50 bg-white/55 px-3 py-2.5 text-sm outline-none backdrop-blur-sm focus:border-foreground/30"
                />
              </Field>
            </Section>
          )}

          <Section title="Mode de livraison">
            <div className="grid grid-cols-2 gap-2">
              <ChoiceTile
                selected={deliveryMode === "express"}
                onClick={() => setDeliveryMode("express")}
                icon={<Truck className="h-4 w-4" />}
                title="Express"
                sub="Sous 60 min"
              />
              <ChoiceTile
                selected={deliveryMode === "scheduled"}
                onClick={() => setDeliveryMode("scheduled")}
                icon={<CalendarClock className="h-4 w-4" />}
                title="Programmé"
                sub="Date & heure"
              />
            </div>
            {deliveryMode === "scheduled" && (
              <Field label="Date & heure de livraison *">
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="w-full rounded-xl border border-white/50 bg-white/55 px-3 py-2.5 text-sm outline-none backdrop-blur-sm focus:border-foreground/30"
                />
              </Field>
            )}
          </Section>

          <Section title="Mode de paiement">
            <div className="space-y-2">
              <PayRadio
                selected={payment === "mpesa"}
                onClick={() => setPayment("mpesa")}
                label="M-Pesa"
                sub="Vodacom Mobile Money"
              />
              <PayRadio
                selected={payment === "orange"}
                onClick={() => setPayment("orange")}
                label="Orange Money"
                sub="Orange Mobile Money"
              />
              <PayRadio
                selected={payment === "airtel"}
                onClick={() => setPayment("airtel")}
                label="Airtel Money"
                sub="Airtel Mobile Money"
              />
              <PayRadio
                selected={payment === "cash"}
                onClick={() => setPayment("cash")}
                label="Cash à la livraison"
                sub="Payer le livreur en espèces"
              />
            </div>
          </Section>

          {(referralBonus > 0 || availableCredit > 0) && (
            <Section title="Fidélité & Parrainage">
              {referralBonus > 0 && (
                <div className="flex items-center gap-2 rounded-xl border border-white/50 bg-white/55 p-3 backdrop-blur-sm">
                  <div
                    className="grid h-8 w-8 place-items-center rounded-lg text-white"
                    style={{ background: "var(--gradient-flame)" }}
                  >
                    <Gift className="h-4 w-4" />
                  </div>
                  <div className="flex-1 text-xs">
                    <p className="font-bold">Bonus parrainage appliqué</p>
                    <p className="text-muted-foreground">
                      –{formatFC(referralBonus)} sur votre 1re commande
                    </p>
                  </div>
                </div>
              )}
              {availableCredit > 0 && (
                <label className="flex items-center gap-2 rounded-xl border border-white/50 bg-white/55 p-3 backdrop-blur-sm">
                  <input
                    type="checkbox"
                    checked={useCredit}
                    onChange={(e) => setUseCredit(e.target.checked)}
                    className="h-4 w-4"
                  />
                  <div className="flex-1 text-xs">
                    <p className="font-bold">Utiliser mon crédit fidélité</p>
                    <p className="text-muted-foreground">
                      Solde : {formatFC(availableCredit)} · sera déduit du total
                    </p>
                  </div>
                </label>
              )}
            </Section>
          )}
        </div>

        <div className="border-t border-white/50 bg-white/60 px-5 py-4 backdrop-blur-xl">
          <div className="mb-2 space-y-0.5 text-[11px]">
            <div className="flex justify-between text-muted-foreground">
              <span>Sous-total</span>
              <span>{formatFC(total)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>{pickup ? "Retrait au dépôt" : "Frais de livraison"}</span>
              <span>{pickup ? "0 FC" : formatFC(deliveryFee)}</span>
            </div>
            {referralBonus > 0 && (
              <div className="flex justify-between" style={{ color: "var(--flame)" }}>
                <span>Bonus parrainage</span>
                <span>−{formatFC(referralBonus)}</span>
              </div>
            )}
            {creditToUse > 0 && (
              <div className="flex justify-between" style={{ color: "var(--flame)" }}>
                <span>Crédit fidélité</span>
                <span>−{formatFC(creditToUse)}</span>
              </div>
            )}
          </div>

          <div className="mb-3 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Total à payer</span>
            <span className="font-display text-lg font-extrabold" style={{ color: "var(--night)" }}>
              {formatFC(finalTotal)}
            </span>
          </div>
          <button
            disabled={submitting || cart.length === 0}
            onClick={handleSubmit}
            className="press-scale flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-white transition active:scale-95 disabled:opacity-60"
            style={{ background: "var(--gradient-flame)", boxShadow: "var(--shadow-flame)" }}
          >
            <span key="checkout-cta-icon" aria-hidden className="contents">
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CreditCard className="icon-pop h-4 w-4" />
              )}
            </span>
            <span className="text-sm font-bold">
              Confirmer la commande ({formatFC(finalTotal)})
            </span>
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-foreground">{label}</span>
      {children}
    </label>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-xl border border-white/50 bg-white/55 px-3 py-2.5 text-sm outline-none backdrop-blur-sm focus:border-foreground/30"
    />
  );
}

function ChoiceTile({
  selected,
  onClick,
  icon,
  title,
  sub,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  sub: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-start gap-1 rounded-2xl border p-3 text-left transition ${
        selected ? "border-transparent" : "border-border"
      }`}
      style={
        selected
          ? {
              background: "color-mix(in oklab, var(--flame) 8%, transparent)",
              boxShadow: "0 0 0 2px var(--flame) inset",
            }
          : undefined
      }
    >
      <div
        className="grid h-8 w-8 place-items-center rounded-lg"
        style={{
          background: "color-mix(in oklab, var(--flame) 12%, transparent)",
          color: "var(--flame)",
        }}
      >
        {icon}
      </div>
      <p className="text-sm font-bold">{title}</p>
      <p className="text-[11px] text-muted-foreground">{sub}</p>
    </button>
  );
}

function PayRadio({
  selected,
  onClick,
  label,
  sub,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  sub: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
        selected ? "border-transparent" : "border-border"
      }`}
      style={
        selected
          ? {
              background: "color-mix(in oklab, var(--flame) 8%, transparent)",
              boxShadow: "0 0 0 2px var(--flame) inset",
            }
          : undefined
      }
    >
      <div
        className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
          selected ? "border-transparent" : "border-border"
        }`}
        style={selected ? { background: "var(--gradient-flame)" } : undefined}
      >
        {selected && <div className="h-2 w-2 rounded-full bg-white" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">{label}</p>
        <p className="text-[11px] text-muted-foreground">{sub}</p>
      </div>
    </button>
  );
}

/* ------------ ORDERS VIEW ------------ */

function OrdersView({
  orders,
  onGoHome,
  onCancelled,
}: {
  orders: Order[];
  onGoHome: () => void;
  onCancelled: (id: string) => void;
}) {
  return (
    <>
      <TabHeader title="Mes commandes" subtitle="Suivez vos livraisons en temps réel" />
      <div className="px-5 pt-4">
        {orders.length === 0 ? (
          <EmptyState
            icon={<Package className="h-6 w-6" />}
            title="Aucune commande"
            desc="Vos commandes s'afficheront ici. Passez votre première commande dès maintenant."
            action={
              <button
                onClick={onGoHome}
                className="rounded-xl px-4 py-2 text-xs font-bold text-white"
                style={{ background: "var(--gradient-flame)" }}
              >
                Commander maintenant
              </button>
            }
          />
        ) : (
          <div className="space-y-3">
            {orders.map((o) => (
              <OrderCard key={o.id} order={o} onCancelled={onCancelled} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function OrderCard({ order, onCancelled }: { order: Order; onCancelled: (id: string) => void }) {
  const [askCancel, setAskCancel] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const canCancel = order.status === "Nouvelle" || order.status === "En préparation";
  const cancelled = order.status === "Annulée";
  const stepIndex =
    order.status === "Nouvelle"
      ? 0
      : order.status === "En préparation"
        ? 1
        : order.status === "En route"
          ? 2
          : order.status === "Livrée"
            ? 3
            : 0;
  return (
    <article className="glow-cursor t-liquid glass rounded-2xl p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Commande #{order.orderNumber}
          </p>
          <p className="font-display text-base font-extrabold">
            {order.items.reduce((a, b) => a + b.qty, 0)} article
            {order.items.reduce((a, b) => a + b.qty, 0) > 1 ? "s" : ""}
          </p>
        </div>
        <span
          className="rounded-full px-2 py-1 text-[10px] font-bold text-white"
          style={{
            background: cancelled ? "var(--destructive)" : "var(--gradient-flame)",
          }}
        >
          {order.status}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-2">
        {["Reçue", "Préparation", "En route", "Livrée"].map((s, i) => (
          <div key={s} className="flex flex-1 items-center gap-2">
            <div
              className="grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold"
              style={{
                background: cancelled
                  ? "color-mix(in oklab, var(--night) 8%, transparent)"
                  : i <= stepIndex
                    ? "var(--gradient-flame)"
                    : "color-mix(in oklab, var(--night) 8%, transparent)",
                color: !cancelled && i <= stepIndex ? "white" : "var(--muted-foreground)",
              }}
            >
              {!cancelled && i < stepIndex ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
            </div>
            {i < 3 && (
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

      {(order.status === "En route" ||
        (order.receiveMode === "pickup" && order.status === "En préparation")) && (
        <DeliveryTracker order={order} />
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <InfoLine
          label="Livraison"
          value={order.delivery.mode === "express" ? "Express (60 min)" : "Programmée"}
        />
        <InfoLine
          label="Paiement"
          value={
            {
              mpesa: "M-Pesa",
              orange: "Orange Money",
              airtel: "Airtel Money",
              cash: "Cash",
            }[order.payment]
          }
        />
        <InfoLine label="Commune" value={order.address.commune} />
        <InfoLine label="Total" value={formatFC(order.total)} bold />
      </div>

      <div className="mt-3">
        <Link
          to="/commande/$orderId"
          params={{ orderId: order.id }}
          search={{ token: order.trackingToken }}
          className="flex items-center justify-center gap-1 rounded-lg py-2 text-[11px] font-bold text-white"
          style={{ background: "var(--gradient-flame)" }}
        >
          Suivre ma commande en direct →
        </Link>
      </div>

      <div className="mt-3 flex gap-2">
        <Link
          to="/facture/$orderId"
          params={{ orderId: order.id }}
          search={{ token: order.trackingToken }}
          className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-white/50 bg-white/55 py-2 text-[11px] font-bold hover:bg-white/85 backdrop-blur-sm"
        >
          <FileText className="h-3 w-3" /> Facture / Reçu
        </Link>
        <a
          href={`https://wa.me/${BELLA_GAZ_WHATSAPP}?text=${encodeURIComponent(buildWhatsAppMessage(order))}`}
          target="_blank"
          rel="noreferrer"
          className="flex flex-1 items-center justify-center gap-1 rounded-lg py-2 text-[11px] font-bold text-white"
          style={{ background: "oklch(0.6 0.15 150)" }}
        >
          <MessageCircle className="h-3 w-3" /> WhatsApp
        </a>
      </div>
      {canCancel && (
        <button
          onClick={() => setAskCancel(true)}
          className="mt-2 w-full rounded-lg border border-destructive/40 py-2 text-[11px] font-bold text-destructive hover:bg-destructive/5"
        >
          Annuler ma commande
        </button>
      )}
      <Dialog open={askCancel} onOpenChange={setAskCancel}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Annuler la commande #{order.orderNumber} ?</DialogTitle>
            <DialogDescription>
              Merci de préciser la raison — ça nous aide à mieux vous servir.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex. Je ne suis plus disponible, changement d'adresse…"
            rows={3}
          />
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setAskCancel(false)}>
              Garder
            </Button>
            <Button
              variant="destructive"
              disabled={busy || reason.trim().length < 3}
              onClick={async () => {
                setBusy(true);
                try {
                  await cancelOrder(order.id, reason.trim());
                  toast.success("Commande annulée");
                  onCancelled(order.id);
                  setAskCancel(false);
                } catch (e) {
                  toast.error("Impossible d'annuler cette commande");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Confirmer l'annulation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  );
}

function InfoLine({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={bold ? "font-extrabold" : "font-semibold"} style={{ color: "var(--night)" }}>
        {value}
      </p>
    </div>
  );
}

/* ------------ OFFERS / ACCOUNT ------------ */

function OffersView() {
  const [promos, setPromos] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    listActivePromotions()
      .then((p) => {
        if (alive) setPromos(p);
      })
      .finally(() => alive && setLoading(false));
    const unsub = subscribePromotions(() => {
      listActivePromotions().then((p) => alive && setPromos(p));
    });
    return () => {
      alive = false;
      unsub();
    };
  }, []);
  return (
    <>
      <TabHeader title="Offres" subtitle="Promotions du moment à Kinshasa" />
      <div className="space-y-3 px-5 pt-4 pb-6">
        {loading && (
          <div key="offers-skeleton" className="space-y-3">
            {[0, 1].map((i) => (
              <div key={i} className="skeleton skeleton-in h-32 rounded-2xl" />
            ))}
          </div>
        )}
        {!loading && promos.length === 0 && (
          <p className="glass-faint rounded-2xl border border-dashed border-white/50 p-4 text-center text-xs text-glass-tertiary">
            Aucune promotion active pour le moment.
          </p>
        )}
        {promos.map((p) => (
          <PromoCard key={p.id} title={p.title} desc={p.description ?? ""} />
        ))}
      </div>
    </>
  );
}

function PromoCard({ title, desc }: { title: string; desc: string }) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl p-5 text-white"
      style={{ background: "var(--gradient-night)" }}
    >
      <div
        aria-hidden
        className="absolute -bottom-10 -right-10 h-40 w-40 rounded-full opacity-30 blur-2xl"
        style={{ background: "var(--gradient-flame)" }}
      />
      <p
        className="text-[10px] font-bold uppercase tracking-widest"
        style={{ color: "var(--flame)" }}
      >
        Offre
      </p>
      <h3 className="mt-1 font-display text-lg font-extrabold leading-tight">{title}</h3>
      <p className="mt-1 text-xs text-white/70">{desc}</p>
    </div>
  );
}

/* ------------ DELIVERY TRACKER ------------ */

function DeliveryTracker({ order }: { order: Order }) {
  // Suivi adaptatif : 3 repères (dépôt, livreur, client) en livraison,
  // 1 repère (dépôt) en retrait Click & Collect.
  const [now, setNow] = useState(() => Date.now());
  const [deposit, setDeposit] = useState<Deposit | null>(null);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    let alive = true;
    if (order.depositId) {
      getDepositById(order.depositId).then((d) => alive && setDeposit(d));
    }
    return () => {
      alive = false;
    };
  }, [order.depositId]);

  const pickup = order.receiveMode === "pickup";
  const depot = depositCoords(deposit);
  const client =
    order.customerLat != null && order.customerLng != null
      ? { lat: order.customerLat, lng: order.customerLng }
      : null;
  const addressText = `${order.address.avenue} ${order.address.quartier} ${order.address.commune} Kinshasa`;
  const elapsedMin = (now - order.createdAt) / 60000;
  const eta = Math.max(
    1,
    Math.round((order.distanceKm ? 10 + order.distanceKm * 3 : 60) - elapsedMin),
  );
  // Progression simulée du livreur entre le dépôt et le client.
  const progress = Math.min(0.92, Math.max(0.08, elapsedMin / Math.max(15, eta + elapsedMin)));
  const driver =
    depot && client
      ? {
          lat: depot.lat + (client.lat - depot.lat) * progress,
          lng: depot.lng + (client.lng - depot.lng) * progress,
        }
      : null;

  if (pickup) {
    return (
      <div
        className="mt-4 overflow-hidden rounded-2xl p-4 text-white"
        style={{ background: "var(--gradient-night)" }}
      >
        <p className="text-[10px] uppercase tracking-wider text-white/60">Retrait au dépôt</p>
        <p className="font-display text-base font-extrabold">
          {deposit?.name ?? "Votre dépôt partenaire"}
        </p>
        <p className="mt-1 text-[11px] text-white/70">
          {deposit
            ? `${deposit.address ? deposit.address + " · " : ""}${deposit.commune} · ${deposit.opening_hours ?? "08h00 – 18h00"}`
            : "Adresse du dépôt en cours de chargement…"}
        </p>
        <div className="mt-3 flex items-center gap-2">
          <div
            className="grid h-8 w-8 place-items-center rounded-full"
            style={{ background: "var(--gradient-flame)" }}
          >
            <Home className="h-4 w-4" />
          </div>
          <p className="text-[11px] text-white/70">
            Votre commande vous attend sur place (0 FC de frais).
          </p>
        </div>
        <a
          href={depot ? directionsBetween(null, depot) : deposit ? mapsUrl(deposit) : "#"}
          target="_blank"
          rel="noreferrer"
          className="mt-3 flex items-center justify-center gap-1 rounded-lg bg-white/15 py-2 text-[11px] font-bold"
        >
          <MapPin className="h-3 w-3" /> Itinéraire vers le Dépôt
        </a>
      </div>
    );
  }

  return (
    <div
      className="mt-4 overflow-hidden rounded-2xl p-4 text-white"
      style={{ background: "var(--gradient-night)" }}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-white/60">Livreur en route</p>
          <p className="font-display text-base font-extrabold">Arrivée dans ~ {eta} min</p>
          {order.distanceKm != null && (
            <p className="text-[11px] text-white/60">
              Trajet dépôt ➔ vous : ~ {order.distanceKm} km
            </p>
          )}
        </div>
        <div className="relative">
          <span
            className="absolute inset-0 animate-ping rounded-full opacity-60"
            style={{ background: "var(--flame)" }}
          />
          <div
            className="relative grid h-10 w-10 place-items-center rounded-full"
            style={{ background: "var(--gradient-flame)" }}
          >
            <Truck className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* 3 repères : Dépôt · Livreur · Client */}
      <div className="relative mt-4 h-10">
        <div className="absolute inset-x-4 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-white/15">
          <div
            className="h-full rounded-full"
            style={{ width: `${progress * 100}%`, background: "var(--gradient-flame)" }}
          />
        </div>
        <div className="absolute left-0 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-white/15">
          <Package className="h-3.5 w-3.5" />
        </div>
        <div
          className="absolute top-1/2 grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full transition-all duration-1000"
          style={{ left: `${8 + progress * 84}%`, background: "var(--gradient-flame)" }}
        >
          <Truck className="h-3.5 w-3.5" />
        </div>
        <div className="absolute right-0 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-white/15">
          <Home className="h-3.5 w-3.5" />
        </div>
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-white/60">
        <span>{deposit?.name ?? "Dépôt"}</span>
        <span>Livreur</span>
        <span>Vous</span>
      </div>

      <p className="mt-2 text-[11px] text-white/60">
        Notre livreur approche de {order.address.commune}. Restez joignable au{" "}
        {order.customer.phone}.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <a
          href={
            depot
              ? directionsBetween(depot, client ?? addressText)
              : directionsBetween(null, addressText)
          }
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-1 rounded-lg bg-white/15 py-2 text-[11px] font-bold"
        >
          <MapPin className="h-3 w-3" /> Itinéraire livreur
        </a>
        <a
          href={deposit ? mapsUrl(deposit) : directionsBetween(null, addressText)}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-1 rounded-lg bg-white/15 py-2 text-[11px] font-bold"
        >
          <Package className="h-3 w-3" /> Voir le dépôt
        </a>
      </div>
    </div>
  );
}

/* ------------ LOYALTY & REFERRAL ------------ */

function LoyaltyCard({ loyalty, onRefresh }: { loyalty: LoyaltyInfo; onRefresh: () => void }) {
  const copy = async () => {
    if (!loyalty.code) return;
    try {
      await navigator.clipboard.writeText(loyalty.code);
      toast.success("Code copié !");
    } catch {
      toast.error("Copie impossible");
    }
  };
  const share = async () => {
    if (!loyalty.code) return;
    const text = buildReferralShareText(loyalty.code);
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "Kongo Gaz", text });
        return;
      } catch {
        // Partage annulé par l'utilisateur — on retombe sur WhatsApp.
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };
  return (
    <div
      className="relative overflow-hidden rounded-2xl p-4 text-white"
      style={{ background: "var(--gradient-night)" }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full opacity-30 blur-2xl"
        style={{ background: "var(--gradient-flame)" }}
      />
      <div className="relative flex items-center gap-2">
        <div
          className="grid h-9 w-9 place-items-center rounded-xl"
          style={{ background: "var(--gradient-flame)" }}
        >
          <Sparkles className="h-4 w-4" />
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-white/60">Crédit fidélité</p>
          <p className="font-display text-xl font-extrabold">{formatFC(loyalty.credit)}</p>
        </div>
        <button
          onClick={onRefresh}
          className="ml-auto rounded-lg border border-white/20 px-2 py-1 text-[10px] font-bold text-white/80 hover:bg-white/10"
        >
          Actualiser
        </button>
      </div>

      <div className="relative mt-3 rounded-xl bg-white/10 p-3 backdrop-blur">
        <p className="text-[10px] uppercase tracking-wider text-white/60">Votre code parrainage</p>
        <div className="mt-1 flex items-center gap-2">
          <p className="font-display text-lg font-extrabold tracking-widest">
            {loyalty.code ?? "—"}
          </p>
          <button
            onClick={copy}
            aria-label="Copier"
            className="ml-auto grid h-8 w-8 place-items-center rounded-lg bg-white/10 hover:bg-white/20"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={share}
            aria-label="Partager"
            className="grid h-8 w-8 place-items-center rounded-lg"
            style={{ background: "var(--gradient-flame)" }}
          >
            <Share2 className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="mt-2 text-[11px] text-white/70">
          Invitez un ami : il reçoit 5 000 FC de remise sur sa 1re commande, et vous gagnez 5 000 FC
          de crédit dès qu'elle est livrée.
        </p>
      </div>
    </div>
  );
}

type ProfileSection = "identity" | "addresses" | "payments" | "support" | "privacy";

function AccountView({
  loyalty,
  onLoyaltyRefresh,
}: {
  loyalty: LoyaltyInfo | null;
  onLoyaltyRefresh: () => void;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(() => loadProfile());
  const [section, setSection] = useState<ProfileSection | null>(null);

  useEffect(() => {
    return subscribe(() => setProfile(loadProfile()));
  }, []);

  return (
    <>
      <TabHeader
        title="Mon compte"
        subtitle={
          user?.user_metadata?.phone_whatsapp ??
          (profile.fullName ? profile.fullName : "Complétez votre profil")
        }
      />
      <div className="space-y-3 px-5 pt-4">
        {!user ? (
          <button
            onClick={() => navigate({ to: "/auth" })}
            className="flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold text-white"
            style={{ background: "var(--gradient-flame)" }}
          >
            <LogIn className="h-4 w-4" />
            Se connecter / Créer un compte
          </button>
        ) : (
          <div className="glass flex items-center justify-between rounded-2xl p-3 text-sm">
            <div className="min-w-0">
              <p className="truncate font-semibold">
                {user.user_metadata?.full_name || profile.fullName || "Client Kongo Gaz"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {user.user_metadata?.phone_whatsapp || profile.phone}
              </p>
            </div>
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                toast.success("Déconnecté");
              }}
              className="flex shrink-0 items-center gap-1 rounded-lg border border-white/50 bg-white/60 px-2.5 py-1.5 text-xs font-semibold hover:bg-white/85 backdrop-blur-sm"
            >
              <LogOut className="h-3.5 w-3.5" />
              Déconnexion
            </button>
          </div>
        )}

        {user && loyalty && <LoyaltyCard loyalty={loyalty} onRefresh={onLoyaltyRefresh} />}

        <button
          onClick={() => setSection("identity")}
          className="flex w-full items-center gap-3 rounded-2xl glass p-4 text-left active:scale-[0.98]"
        >
          <div
            className="grid h-14 w-14 place-items-center rounded-full text-white"
            style={{ background: "var(--gradient-flame)" }}
          >
            <User className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-base font-extrabold">
              {profile.fullName || "Ajouter mon nom"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {profile.phone || "Numéro Mobile Money"}
            </p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>

        <AccountRow
          icon={<MapPin className="h-4 w-4" />}
          label="Mes adresses"
          hint={`${profile.addresses.length} enregistrée(s)`}
          onClick={() => setSection("addresses")}
        />
        <AccountRow
          icon={<CreditCard className="h-4 w-4" />}
          label="Moyens de paiement"
          hint={`${profile.payments.length} enregistré(s)`}
          onClick={() => setSection("payments")}
        />
        <AccountRow
          icon={<Phone className="h-4 w-4" />}
          label="Support client"
          onClick={() => setSection("support")}
        />
        <AccountRow
          icon={<ShieldCheck className="h-4 w-4" />}
          label="Confidentialité"
          onClick={() => setSection("privacy")}
        />
      </div>

      <ProfileDialog
        section={section}
        profile={profile}
        onChange={(p) => {
          setProfile(p);
          saveProfile(p);
        }}
        onClose={() => setSection(null)}
      />
    </>
  );
}

function AccountRow({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl glass p-4 text-left transition hover:border-white/80 active:scale-[0.98]"
    >
      <div
        className="grid h-9 w-9 place-items-center rounded-xl"
        style={{
          background: "color-mix(in oklab, var(--flame) 12%, transparent)",
          color: "var(--flame)",
        }}
      >
        {icon}
      </div>
      <div className="flex-1">
        <span className="block text-sm font-semibold">{label}</span>
        {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}

function ProfileDialog({
  section,
  profile,
  onChange,
  onClose,
}: {
  section: ProfileSection | null;
  profile: ClientProfile;
  onChange: (p: ClientProfile) => void;
  onClose: () => void;
}) {
  const open = section !== null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {section === "identity" && "Mes informations"}
            {section === "addresses" && "Mes adresses"}
            {section === "payments" && "Moyens de paiement"}
            {section === "support" && "Support client"}
            {section === "privacy" && "Confidentialité"}
          </DialogTitle>
          <DialogDescription>
            {section === "support"
              ? "Contactez-nous pour toute assistance."
              : section === "privacy"
                ? "Vos données restent privées et sécurisées."
                : "Ces informations facilitent vos commandes."}
          </DialogDescription>
        </DialogHeader>

        {section === "identity" && (
          <div className="space-y-3">
            <ProfileField
              label="Nom complet"
              value={profile.fullName}
              onChange={(v) => onChange({ ...profile, fullName: v })}
            />
            <ProfileField
              label="Téléphone principal (Mobile Money)"
              value={profile.phone}
              onChange={(v) => onChange({ ...profile, phone: v })}
            />
            <ProfileField
              label="WhatsApp / Secondaire"
              value={profile.whatsapp}
              onChange={(v) => onChange({ ...profile, whatsapp: v })}
            />
          </div>
        )}

        {section === "addresses" && (
          <div className="space-y-3">
            {profile.addresses.map((a, i) => (
              <div
                key={a.id}
                className="rounded-xl border border-white/50 bg-white/55 p-3 backdrop-blur-sm"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Adresse {i + 1}
                  </p>
                  <button
                    onClick={() =>
                      onChange({
                        ...profile,
                        addresses: profile.addresses.filter((x) => x.id !== a.id),
                      })
                    }
                    className="text-xs text-destructive"
                  >
                    Supprimer
                  </button>
                </div>
                <div className="mt-2 grid gap-2">
                  <ProfileField
                    label="Libellé (Maison, Bureau...)"
                    value={a.label}
                    onChange={(v) =>
                      onChange({
                        ...profile,
                        addresses: profile.addresses.map((x) =>
                          x.id === a.id ? { ...x, label: v } : x,
                        ),
                      })
                    }
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <ProfileField
                      label="Commune"
                      value={a.commune}
                      onChange={(v) =>
                        onChange({
                          ...profile,
                          addresses: profile.addresses.map((x) =>
                            x.id === a.id ? { ...x, commune: v } : x,
                          ),
                        })
                      }
                    />
                    <ProfileField
                      label="Quartier"
                      value={a.quartier}
                      onChange={(v) =>
                        onChange({
                          ...profile,
                          addresses: profile.addresses.map((x) =>
                            x.id === a.id ? { ...x, quartier: v } : x,
                          ),
                        })
                      }
                    />
                    <ProfileField
                      label="Avenue"
                      value={a.avenue}
                      onChange={(v) =>
                        onChange({
                          ...profile,
                          addresses: profile.addresses.map((x) =>
                            x.id === a.id ? { ...x, avenue: v } : x,
                          ),
                        })
                      }
                    />
                    <ProfileField
                      label="N° parcelle"
                      value={a.parcelle}
                      onChange={(v) =>
                        onChange({
                          ...profile,
                          addresses: profile.addresses.map((x) =>
                            x.id === a.id ? { ...x, parcelle: v } : x,
                          ),
                        })
                      }
                    />
                  </div>
                  <ProfileField
                    label="Point de repère"
                    value={a.repere}
                    onChange={(v) =>
                      onChange({
                        ...profile,
                        addresses: profile.addresses.map((x) =>
                          x.id === a.id ? { ...x, repere: v } : x,
                        ),
                      })
                    }
                  />
                </div>
              </div>
            ))}
            <button
              onClick={() =>
                onChange({
                  ...profile,
                  addresses: [
                    ...profile.addresses,
                    {
                      id: Math.random().toString(36).slice(2, 9),
                      label: "",
                      commune: "",
                      quartier: "",
                      avenue: "",
                      parcelle: "",
                      repere: "",
                    },
                  ],
                })
              }
              className="w-full rounded-xl py-2 text-sm font-bold text-white"
              style={{ background: "var(--gradient-flame)" }}
            >
              + Ajouter une adresse
            </button>
          </div>
        )}

        {section === "payments" && (
          <div className="space-y-3">
            {profile.payments.map((p) => (
              <div
                key={p.id}
                className="rounded-xl border border-white/50 bg-white/55 p-3 backdrop-blur-sm"
              >
                <div className="flex items-center justify-between">
                  <select
                    value={p.method}
                    onChange={(e) =>
                      onChange({
                        ...profile,
                        payments: profile.payments.map((x) =>
                          x.id === p.id ? { ...x, method: e.target.value as typeof p.method } : x,
                        ),
                      })
                    }
                    className="rounded-lg border border-white/50 bg-white/60 px-2 py-1 text-xs font-bold backdrop-blur-sm"
                  >
                    <option value="mpesa">M-Pesa</option>
                    <option value="orange">Orange Money</option>
                    <option value="airtel">Airtel Money</option>
                    <option value="cash">Cash livraison</option>
                  </select>
                  <button
                    onClick={() =>
                      onChange({
                        ...profile,
                        payments: profile.payments.filter((x) => x.id !== p.id),
                      })
                    }
                    className="text-xs text-destructive"
                  >
                    Supprimer
                  </button>
                </div>
                {p.method !== "cash" && (
                  <div className="mt-2">
                    <ProfileField
                      label="Numéro"
                      value={p.number}
                      onChange={(v) =>
                        onChange({
                          ...profile,
                          payments: profile.payments.map((x) =>
                            x.id === p.id ? { ...x, number: v } : x,
                          ),
                        })
                      }
                    />
                  </div>
                )}
              </div>
            ))}
            <button
              onClick={() =>
                onChange({
                  ...profile,
                  payments: [
                    ...profile.payments,
                    {
                      id: Math.random().toString(36).slice(2, 9),
                      method: "mpesa",
                      number: "",
                    },
                  ],
                })
              }
              className="w-full rounded-xl py-2 text-sm font-bold text-white"
              style={{ background: "var(--gradient-flame)" }}
            >
              + Ajouter un moyen de paiement
            </button>
          </div>
        )}

        {section === "support" && (
          <div className="space-y-2 text-sm">
            <a
              href="tel:+243899697012"
              className="flex items-center gap-2 rounded-xl border border-white/50 bg-white/55 p-3 font-bold backdrop-blur-sm"
            >
              <Phone className="h-4 w-4" /> +243 899 697 012
            </a>
            <a
              href={`https://wa.me/${BELLA_GAZ_WHATSAPP}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-xl p-3 font-bold text-white"
              style={{ background: "oklch(0.6 0.15 150)" }}
            >
              WhatsApp support
            </a>
            <p className="text-xs text-muted-foreground">Disponible 7j/7 de 7h à 22h.</p>
          </div>
        )}

        {section === "privacy" && (
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              Vos données personnelles sont stockées sur votre appareil et ne sont utilisées que
              pour traiter vos commandes.
            </p>
            <button
              onClick={() => {
                onChange({ fullName: "", phone: "", whatsapp: "", addresses: [], payments: [] });
                toast.success("Données effacées");
              }}
              className="mt-2 w-full rounded-xl border border-destructive/30 py-2 text-sm font-bold text-destructive"
            >
              Effacer toutes mes données
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ProfileField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-white/50 bg-white/60 px-3 py-2 text-sm outline-none backdrop-blur-sm focus:border-foreground/30"
      />
    </label>
  );
}

/* ------------ SHARED ------------ */

function TabHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header
      className="relative overflow-hidden rounded-b-[2rem] px-5 pb-8 pt-6 text-white"
      style={{ background: "var(--gradient-night)" }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full opacity-40 blur-3xl"
        style={{ background: "var(--gradient-flame)" }}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold">{title}</h1>
          <p className="mt-1 text-sm text-white/70">{subtitle}</p>
        </div>
        <ThemeToggle className="h-10 w-10 shrink-0 rounded-full" />
      </div>
    </header>
  );
}

function EmptyState({
  icon,
  title,
  desc,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="glass-faint flex flex-col items-center gap-2 rounded-2xl border border-dashed border-white/50 px-6 py-10 text-center">
      <div
        className="grid h-12 w-12 place-items-center rounded-2xl"
        style={{
          background: "color-mix(in oklab, var(--flame) 12%, transparent)",
          color: "var(--flame)",
        }}
      >
        {icon}
      </div>
      <p className="font-display text-base font-extrabold">{title}</p>
      <p className="max-w-xs text-xs text-muted-foreground">{desc}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

function Badge({ icon, label, sub }: { icon: React.ReactNode; label: string; sub: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl py-2 text-center">
      <div
        className="grid h-8 w-8 place-items-center rounded-lg"
        style={{
          background: "color-mix(in oklab, var(--flame) 12%, transparent)",
          color: "var(--flame)",
        }}
      >
        {icon}
      </div>
      <p className="text-xs font-bold leading-none">{label}</p>
      <p className="text-[10px] text-muted-foreground">{sub}</p>
    </div>
  );
}

function NavItem({
  icon,
  label,
  active,
  onClick,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className="relative flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold transition"
      style={{ color: active ? "var(--flame)" : "var(--muted-foreground)" }}
    >
      <span className="relative">
        {icon}
        {!!badge && badge > 0 && (
          <span
            className="absolute -right-2 -top-1 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[9px] font-bold text-white"
            style={{ background: "var(--gradient-flame)" }}
          >
            {badge}
          </span>
        )}
      </span>
      {label}
    </button>
  );
}
