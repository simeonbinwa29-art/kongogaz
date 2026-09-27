import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Bell,
  Circle,
  Flame,
  Loader2,
  LogOut,
  MapPin,
  MessageCircle,
  Package,
  Phone,
  Plus,
  Store,
  Trash2,
  TrendingUp,
  Truck,
  Users,
  Wallet,
  Wrench,
  X,
} from "lucide-react";
import {
  loadProducts,
  loadVendors,
  loadAccessories,
  saveProducts,
  saveVendors,
  saveAccessories,
  subscribe,
  type Product,
  type Vendor,
  type Accessory,
} from "@/lib/bella-store";
import {
  listOrders,
  subscribeOrders,
  updateOrder as apiUpdateOrder,
  purgeAllOrders,
  buildWhatsAppMessage,
  KONGO_GAZ_WHATSAPP,
  type Order,
  type OrderStatus,
} from "@/lib/orders-api";
import {
  signOutAdmin,
  isAdminUser,
  ensureMasterAdminRole,
  assignOrderDriver,
  dbUpdateErrorMessage,
} from "@/lib/admin-api";
import { MASTER_ADMIN_EMAIL } from "@/lib/phone";
import { supabase } from "@/integrations/supabase/client";
import { formatFC } from "./index";
import { DepositsAdminView } from "@/components/admin-deposits";
import { ThemeToggle } from "@/components/theme-toggle";
import { CommuneSelect } from "@/components/commune-select";
import {
  listDrivers as listFleet,
  listDeposits,
  subscribeDeposits,
  selectableOrderDrivers,
  upsertDriver,
  deleteDriver,
  type Driver as FleetDriver,
  type Deposit,
} from "@/lib/deposits-api";

import { DeliveryScaleView, OrderFeeEditor } from "@/components/delivery-scale";
import { toast } from "sonner";
import { FileText } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  listAllPromotions,
  createPromotion,
  updatePromotion,
  deletePromotion,
  subscribePromotions,
  type Promotion,
} from "@/lib/promotions-api";

export const Route = createFileRoute("/admin")({
  beforeLoad: async () => {
    // Protection au niveau du routeur : un utilisateur non connecté — ou n'ayant
    // pas le rôle admin — est redirigé vers /auth avant même que le composant ne
    // se monte. La vérification est consultée en backend (user_roles) via RLS.
    if (typeof window === "undefined") return;

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) {
      sessionStorage.setItem("bg_redirect_after_auth", "/admin");
      throw redirect({ to: "/auth" });
    }

    let admin = await isAdminUser(session.user.id);

    // Compte maître : auto-promotion du rôle admin, puis re-vérification.
    if (!admin && session.user.email === MASTER_ADMIN_EMAIL) {
      await ensureMasterAdminRole(session.user.id).catch(() => {});
      admin = await isAdminUser(session.user.id);
    }

    if (!admin) throw redirect({ to: "/auth" });
  },
  head: () => ({
    meta: [
      { title: "Admin — KONGO GAZ Dispatching" },
      {
        name: "description",
        content: "Tableau de bord d'administration et dispatching KONGO GAZ.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

const COLUMNS: { status: OrderStatus; label: string; color: string }[] = [
  { status: "Nouvelle", label: "Nouvelles", color: "var(--flame)" },
  { status: "En préparation", label: "En préparation", color: "oklch(0.7 0.15 80)" },
  { status: "En route", label: "En route", color: "oklch(0.65 0.15 240)" },
  { status: "Livrée", label: "Livrées", color: "oklch(0.6 0.15 150)" },
  { status: "Annulée", label: "Annulées", color: "oklch(0.55 0.05 20)" },
];

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  Nouvelle: "En préparation",
  "En préparation": "En route",
  "En route": "Livrée",
};

const STATUS_COLOR: Record<OrderStatus, string> = {
  Nouvelle: "var(--flame)",
  "En préparation": "oklch(0.7 0.15 80)",
  "En route": "oklch(0.65 0.15 240)",
  Livrée: "oklch(0.6 0.15 150)",
  Annulée: "oklch(0.55 0.05 20)",
};

type AdminGateState = "checking" | "granted";

function AdminPage() {
  const navigate = useNavigate();
  const [gate, setGate] = useState<AdminGateState>("checking");

  useEffect(() => {
    let alive = true;

    const redirectToAuth = (setReturnRedirect: boolean) => {
      if (setReturnRedirect && typeof window !== "undefined") {
        // Après connexion réussie via /auth, on reviendra sur /admin.
        sessionStorage.setItem("bg_redirect_after_auth", "/admin");
      }
      navigate({ to: "/auth" });
    };

    const evaluate = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!alive) return;

      // Pas de session : direction la page de connexion (avec retour sur /admin).
      if (!session?.user) {
        redirectToAuth(true);
        return;
      }

      let admin = await isAdminUser(session.user.id);
      if (!alive) return;

      // Compte maître : auto-promotion du rôle admin (couvre aussi la course à
      // la connexion, où la promotion n'a pas forcément abouti avant la redirection).
      if (!admin && session.user.email === MASTER_ADMIN_EMAIL) {
        await ensureMasterAdminRole(session.user.id).catch(() => {});
        if (!alive) return;
        admin = await isAdminUser(session.user.id);
        if (!alive) return;
      }

      if (admin) {
        setGate("granted");
        return;
      }

      // Connecté mais sans rôle admin : renvoyé vers la page de connexion.
      // (La page /auth redirigera elle-même un utilisateur déjà connecté vers /.)
      redirectToAuth(false);
    };

    evaluate();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      if (!session?.user) {
        redirectToAuth(true);
        return;
      }
      evaluate();
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  if (gate === "checking") {
    return (
      <div className="min-h-screen px-5 py-10">
        <div key="admin-gate-skeleton" className="skeleton-in mx-auto w-full max-w-md space-y-4">
          <div className="skeleton h-14 w-14 rounded-2xl" />
          <div className="skeleton h-6 w-3/4 rounded-xl" />
          <div className="skeleton h-4 w-1/2 rounded-lg" />
          <div className="skeleton h-44 rounded-3xl" />
          <div className="skeleton h-12 rounded-2xl" />
        </div>
      </div>
    );
  }
  return <AdminDashboard onLogout={() => navigate({ to: "/auth" })} />;
}

type AdminView =
  "kanban" | "stock" | "drivers" | "deposits" | "accessories" | "promotions" | "delivery";

function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [fleet, setFleet] = useState<FleetDriver[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [accessories, setAccessories] = useState<Accessory[]>([]);
  const [view, setView] = useState<AdminView>("kanban");
  const [pulse, setPulse] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [purging, setPurging] = useState(false);
  const orderIdsRef = useRef<Set<string>>(new Set());
  const aliveRef = useRef(true);
  const pulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshOrders = useCallback((announce: boolean) => {
    if (!aliveRef.current) return;
    listOrders()
      .then((next) => {
        if (!aliveRef.current) return;
        const prevIds = orderIdsRef.current;
        const fresh = announce
          ? next.find((o) => !prevIds.has(o.id) && o.status === "Nouvelle")
          : undefined;
        orderIdsRef.current = new Set(next.map((o) => o.id));
        setOrders(next);
        if (fresh) {
          setPulse(true);
          toast.success("Nouvelle commande reçue !", {
            description: `${fresh.customer.fullName} · ${fresh.address.commune}`,
          });
          if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
          pulseTimerRef.current = setTimeout(() => {
            if (aliveRef.current) setPulse(false);
          }, 4000);
        }
      })
      .catch((err) => {
        console.warn("[admin] actualisation des commandes impossible :", err);
      });
  }, []);

  const loadFleet = useCallback(() => {
    listFleet().then((d) => {
      if (aliveRef.current) setFleet(d);
    });
    listDeposits().then((d) => {
      if (aliveRef.current) setDeposits(d);
    });
  }, []);

  useEffect(() => {
    aliveRef.current = true;

    loadFleet();
    const unsubFleet = subscribeDeposits(loadFleet);
    listOrders()
      .then((initial) => {
        if (!aliveRef.current) return;
        orderIdsRef.current = new Set(initial.map((o) => o.id));
        setOrders(initial);
      })
      .catch(() => {});
    setProducts(loadProducts());
    setVendors(loadVendors());
    setAccessories(loadAccessories());

    const unsubStore = subscribe(() => {
      if (!aliveRef.current) return;
      setProducts(loadProducts());
      setVendors(loadVendors());
      setAccessories(loadAccessories());
    });
    // Realtime : une suppression (DELETE) retire IMMÉDIATEMENT la commande de
    // l'état local — on ne dépend plus d'un refetch qui peut échouer ou d'un
    // événement perdu, source de la "commande fantôme" (#BG895281).
    const unsubOrders = subscribeOrders((payload) => {
      if (!aliveRef.current) return;
      if (payload?.table === "orders" && payload.eventType === "DELETE") {
        const deletedId = payload.old?.id ?? payload.new?.id;
        if (deletedId) {
          orderIdsRef.current.delete(deletedId);
          setOrders((prev) => prev.filter((o) => o.id !== deletedId));
        }
      }
      refreshOrders(true);
    });
    // Filet de sécurité : même si Realtime est muet ou fermé, l'état converge.
    const pollTimer = window.setInterval(() => refreshOrders(false), 30000);
    return () => {
      aliveRef.current = false;
      if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
      window.clearInterval(pollTimer);
      unsubFleet();
      unsubStore();
      unsubOrders();
    };
  }, [refreshOrders, loadFleet]);

  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayOrders = orders.filter((o) => o.createdAt >= today.getTime());
    const inProgress = orders.filter(
      (o) => o.status === "Nouvelle" || o.status === "En préparation" || o.status === "En route",
    );
    const revenue = todayOrders
      .filter((o) => o.status !== "Annulée")
      .reduce((sum, o) => sum + o.total, 0);
    const activeDrivers = fleet.filter((d) => d.is_available).length;
    return {
      today: todayOrders.length,
      inProgress: inProgress.length,
      revenue,
      drivers: activeDrivers,
      totalDrivers: fleet.length,
    };
  }, [orders, fleet]);

  const persistPatch = async (
    id: string,
    dbPatch: {
      status?: OrderStatus;
      driverId?: string;
      cancelReason?: string;
      deliveryFee?: number;
    },
    successMsg?: string,
  ) => {
    setBusyId(id);
    try {
      await apiUpdateOrder(id, dbPatch);
      // Rafraîchit immédiatement la vérité DB après la mutation (en plus de
      // Realtime) pour que la réactualisation du state soit instantanée.
      refreshOrders(false);
      if (successMsg) toast.success(successMsg);
    } catch (e) {
      console.error("[admin] Mise à jour rejetée par la base", {
        id,
        dbPatch,
        cause: e,
      });
      toast.error("Mise à jour refusée", {
        description: dbUpdateErrorMessage(e),
      });
      refreshOrders(false);
    } finally {
      if (aliveRef.current) setBusyId(null);
    }
  };

  const assignDriver = async (order: Order, driverId: string | undefined) => {
    const driver = driverId ? fleet.find((d) => d.id === driverId) : undefined;
    // Attribuer un livreur fait progresser le dispatching :
    // "Nouvelle" -> "En préparation", "En préparation" -> "En route".
    let nextStatus: OrderStatus | undefined;
    if (driver) {
      if (order.status === "Nouvelle") nextStatus = "En préparation";
      else if (order.status === "En préparation") nextStatus = "En route";
    }
    // Optimiste : le select réagit instantanément à la sélection.
    setOrders((prev) =>
      prev.map((o) =>
        o.id === order.id ? { ...o, driverId, ...(nextStatus ? { status: nextStatus } : {}) } : o,
      ),
    );
    setBusyId(order.id);
    try {
      await assignOrderDriver(order.id, driverId, nextStatus);
      refreshOrders(false);
      toast.success(
        driver
          ? `${driver.full_name} assigné${nextStatus ? ` · ${nextStatus}` : ""}`
          : "Livreur retiré de la commande",
      );
    } catch (e) {
      console.error("[admin] Attribution du livreur rejetée", {
        orderId: order.id,
        driverId: driverId ?? null,
        cause: e,
      });
      toast.error("Attribution refusée", {
        description: e instanceof Error ? e.message : dbUpdateErrorMessage(e),
      });
      refreshOrders(false);
    } finally {
      if (aliveRef.current) setBusyId(null);
    }
  };

  const advanceStatus = (order: Order) => {
    const next = NEXT_STATUS[order.status];
    if (!next) return;
    setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status: next } : o)));
    persistPatch(order.id, { status: next }, `Statut mis à jour : ${next}`);
  };

  const confirmCancel = (order: Order) => {
    const reason = window.prompt(
      `Annuler la commande #${order.orderNumber} ?\nRaison (obligatoire) :`,
      "",
    );
    if (!reason || reason.trim().length < 3) return;
    setOrders((prev) =>
      prev.map((o) =>
        o.id === order.id ? { ...o, status: "Annulée", cancelReason: reason.trim() } : o,
      ),
    );
    persistPatch(order.id, { status: "Annulée", cancelReason: reason.trim() }, "Commande annulée");
  };

  const updateFee = (orderId: string, deliveryFee: number) => {
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, deliveryFee } : o)));
    persistPatch(orderId, { deliveryFee });
  };

  const purgeTestOrders = async () => {
    const ok = window.confirm(
      "Vider les commandes de test ?\n\nToutes les commandes (et leurs factures) seront supprimées définitivement.",
    );
    if (!ok) return;
    setPurging(true);
    try {
      await purgeAllOrders();
      if (aliveRef.current) {
        setOrders([]);
        orderIdsRef.current = new Set();
      }
      toast.success("Base vidée", {
        description: "Toutes les commandes ont été supprimées.",
      });
    } catch (e) {
      toast.error("Échec de la purge", {
        description: e instanceof Error ? e.message : String(e),
      });
      refreshOrders(false);
    } finally {
      if (aliveRef.current) setPurging(false);
    }
  };

  const updateProduct = (id: string, patch: Partial<Product>) => {
    const next = products.map((p) => (p.id === id ? { ...p, ...patch } : p));
    setProducts(next);
    saveProducts(next);
  };
  const persistVendors = (next: Vendor[]) => {
    setVendors(next);
    saveVendors(next);
  };
  const persistAccessories = (next: Accessory[]) => {
    setAccessories(next);
    saveAccessories(next);
  };

  const logout = () => {
    signOutAdmin().finally(onLogout);
  };

  const tabs: { id: AdminView; label: string }[] = [
    { id: "kanban", label: "Kanban" },
    { id: "stock", label: "Bouteilles" },
    { id: "accessories", label: "Accessoires" },
    { id: "drivers", label: "Livreurs" },
    { id: "deposits", label: "Dépôts Partenaires" },
    { id: "delivery", label: "Livraison" },
    { id: "promotions", label: "Offres" },
  ];

  return (
    <div className="min-h-screen pb-10">
      <header
        className="sticky top-0 z-20 px-5 py-4 text-white"
        style={{ background: "var(--gradient-night)" }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 hover:bg-white/20"
              aria-label="Retour"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <Flame className="h-4 w-4 text-[color:var(--flame)]" />
                <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">
                  KONGO GAZ · Admin
                </p>
              </div>
              <h1 className="font-display text-lg font-extrabold leading-tight sm:text-xl">
                Tableau de bord & Dispatching
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold text-glow ${
                pulse ? "glow-pulse" : ""
              }`}
              style={{
                background: pulse
                  ? "var(--gradient-flame)"
                  : "color-mix(in oklab, white 12%, transparent)",
              }}
            >
              <Circle className="h-2 w-2 fill-current" />
              {pulse ? "Nouvelle commande" : "En direct"}
            </span>
            <ThemeToggle />
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className="relative grid h-9 w-9 place-items-center rounded-xl bg-white/10 hover:bg-white/20"
                  aria-label="Notifications"
                >
                  <Bell className="h-4 w-4" />
                  {orders.filter((o) => o.status === "Nouvelle").length > 0 && (
                    <span
                      className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-bold text-white"
                      style={{ background: "var(--flame)" }}
                    >
                      {orders.filter((o) => o.status === "Nouvelle").length}
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-0">
                <div className="border-b border-border px-4 py-3">
                  <p className="text-sm font-extrabold">Nouvelles commandes</p>
                  <p className="text-[11px] text-muted-foreground">En attente de préparation</p>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {orders.filter((o) => o.status === "Nouvelle").length === 0 && (
                    <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                      Aucune nouvelle commande.
                    </p>
                  )}
                  {orders
                    .filter((o) => o.status === "Nouvelle")
                    .slice(0, 8)
                    .map((o) => (
                      <div
                        key={o.id}
                        className="border-b border-border px-4 py-3 text-xs last:border-none"
                      >
                        <div className="flex items-center justify-between">
                          <p className="font-bold">#{o.orderNumber}</p>
                          <p className="font-extrabold" style={{ color: "var(--flame)" }}>
                            {formatFC(o.total)}
                          </p>
                        </div>
                        <p className="mt-0.5 truncate text-muted-foreground">
                          {o.customer.fullName} · {o.address.commune}
                        </p>
                      </div>
                    ))}
                </div>
              </PopoverContent>
            </Popover>
            <button
              onClick={logout}
              className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 hover:bg-white/20"
              aria-label="Déconnexion"
              title="Déconnexion"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-5">
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard
            icon={<Package className="h-4 w-4" />}
            label="Commandes du jour"
            value={String(stats.today)}
            hint="reçues aujourd'hui"
            tone="flame"
          />
          <KpiCard
            icon={<TrendingUp className="h-4 w-4" />}
            label="En cours"
            value={String(stats.inProgress)}
            hint="Kanban actif"
            tone="amber"
          />
          <KpiCard
            icon={<Wallet className="h-4 w-4" />}
            label="CA du jour"
            value={formatFC(stats.revenue)}
            hint="hors annulations"
            tone="green"
          />
          <KpiCard
            icon={<Users className="h-4 w-4" />}
            label="Livreurs"
            value={`${stats.drivers} / ${stats.totalDrivers}`}
            hint="disponibles"
            tone="blue"
          />
        </section>

        <div className="mt-6 flex items-center gap-2">
          <div className="flex gap-2 overflow-x-auto">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setView(t.id)}
                className="t-spring press-scale whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-bold active:scale-95"
                style={{
                  background:
                    view === t.id
                      ? "var(--gradient-flame)"
                      : "color-mix(in oklab, var(--night) 6%, transparent)",
                  color: view === t.id ? "white" : "var(--foreground)",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            onClick={purgeTestOrders}
            disabled={purging || orders.length === 0}
            className="ml-auto flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-destructive/40 bg-destructive/5 px-3 py-1.5 text-xs font-bold text-destructive transition hover:bg-destructive/10 disabled:opacity-50"
            title="Supprime définitivement toutes les commandes (pour les tests)"
          >
            <span key="purge-loader" aria-hidden className="contents">
              {purging ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="icon-pop h-3.5 w-3.5" />
              )}
            </span>
            Vider les commandes de test
          </button>
        </div>

        <div className="mt-5">
          {view === "kanban" && (
            <KanbanView
              orders={orders}
              fleet={fleet}
              deposits={deposits}
              busyId={busyId}
              onAssignDriver={assignDriver}
              onAdvance={advanceStatus}
              onCancel={confirmCancel}
              onFeeChanged={updateFee}
            />
          )}
          {view === "stock" && <StockView products={products} onUpdate={updateProduct} />}
          {view === "accessories" && (
            <AccessoriesView items={accessories} onChange={persistAccessories} />
          )}
          {view === "drivers" && <DriversView drivers={fleet} onChanged={loadFleet} />}
          {view === "deposits" && <DepositsAdminView />}
          {view === "delivery" && <DeliveryScaleView />}
          {view === "promotions" && <PromotionsView />}
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  hint,
  tone = "flame",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone?: "flame" | "amber" | "green" | "blue";
}) {
  const tint: Record<string, string> = {
    flame: "var(--flame)",
    amber: "oklch(0.7 0.15 80)",
    green: "oklch(0.6 0.15 150)",
    blue: "oklch(0.6 0.15 240)",
  };
  const color = tint[tone];
  return (
    <div className="glow-cursor t-liquid glass glass-hover relative overflow-hidden rounded-2xl p-4">
      <span
        className="absolute inset-y-0 left-0 w-1"
        style={{ background: `linear-gradient(${color}, transparent)` }}
      />
      <div className="flex items-center gap-2 text-muted-foreground">
        <div
          className="grid h-7 w-7 place-items-center rounded-lg"
          style={{
            background: `color-mix(in oklab, ${color} 14%, transparent)`,
            color,
          }}
        >
          {icon}
        </div>
        <p className="text-[10px] font-bold uppercase tracking-widest">{label}</p>
      </div>
      <p className="mt-2 font-display text-2xl font-extrabold leading-tight" style={{ color }}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[10px] font-medium text-muted-foreground">{hint}</p>}
    </div>
  );
}

function KanbanView({
  orders,
  fleet,
  deposits,
  busyId,
  onAssignDriver,
  onAdvance,
  onCancel,
  onFeeChanged,
}: {
  orders: Order[];
  fleet: FleetDriver[];
  deposits: Deposit[];
  busyId: string | null;
  onAssignDriver: (order: Order, driverId: string | undefined) => void;
  onAdvance: (order: Order) => void;
  onCancel: (order: Order) => void;
  onFeeChanged: (orderId: string, deliveryFee: number) => void;
}) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {COLUMNS.map((col) => {
        const items = orders.filter((o) => o.status === col.status);
        return (
          <div
            key={col.status}
            className="glass-faint flex w-[290px] shrink-0 flex-col rounded-2xl p-3"
          >
            <div className="mb-3 flex items-center justify-between rounded-xl border border-white/40 bg-white/55 px-3 py-2 backdrop-blur-md">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: col.color }} />
                <p className="text-xs font-bold uppercase tracking-wider">{col.label}</p>
              </div>
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                style={{ background: col.color }}
              >
                {items.length}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {items.length === 0 ? (
                <p className="rounded-xl border border-dashed border-white/50 py-6 text-center text-[11px] text-glass-tertiary">
                  Aucune commande
                </p>
              ) : (
                items.map((o) => (
                  <OrderCard
                    key={o.id}
                    order={o}
                    fleet={fleet}
                    deposits={deposits}
                    busy={busyId === o.id}
                    expanded={o.status === "Nouvelle"}
                    onAssignDriver={onAssignDriver}
                    onAdvance={onAdvance}
                    onCancel={onCancel}
                    onFeeChanged={onFeeChanged}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ListView({
  orders,
  fleet,
  deposits,
  busyId,
  onAssignDriver,
  onAdvance,
  onCancel,
  onFeeChanged,
}: {
  orders: Order[];
  fleet: FleetDriver[];
  deposits: Deposit[];
  busyId: string | null;
  onAssignDriver: (order: Order, driverId: string | undefined) => void;
  onAdvance: (order: Order) => void;
  onCancel: (order: Order) => void;
  onFeeChanged: (orderId: string, deliveryFee: number) => void;
}) {
  if (orders.length === 0) {
    return (
      <p className="glass-faint rounded-2xl border border-dashed border-white/50 p-10 text-center text-sm text-glass-tertiary">
        Aucune commande pour le moment.
      </p>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {orders.map((o) => (
        <OrderCard
          key={o.id}
          order={o}
          fleet={fleet}
          deposits={deposits}
          busy={busyId === o.id}
          expanded
          onAssignDriver={onAssignDriver}
          onAdvance={onAdvance}
          onCancel={onCancel}
          onFeeChanged={onFeeChanged}
        />
      ))}
    </div>
  );
}

function OrderCard({
  order,
  fleet,
  deposits,
  onAssignDriver,
  onAdvance,
  onCancel,
  onFeeChanged,
  busy,
  expanded,
}: {
  order: Order;
  fleet: FleetDriver[];
  deposits: Deposit[];
  onAssignDriver: (order: Order, driverId: string | undefined) => void;
  onAdvance: (order: Order) => void;
  onCancel: (order: Order) => void;
  onFeeChanged: (orderId: string, deliveryFee: number) => void;
  busy: boolean;
  expanded?: boolean;
}) {
  const depositById = new Map(deposits.map((d) => [d.id, d.name]));
  // Tous les livreurs actifs disponibles (aucun filtre de commune/dépôt ici),
  // avec le livreur déjà assigné conservé dans la liste même s'il est indisponible.
  const assignedDriver = order.driverId
    ? (fleet.find((d) => d.id === order.driverId) ?? null)
    : null;
  const selectableDrivers = selectableOrderDrivers(fleet, order.driverId);

  const totalItems = order.items.reduce((a, b) => a + b.qty, 0);
  const next = NEXT_STATUS[order.status];
  const terminal = order.status === "Livrée" || order.status === "Annulée";
  const paymentLabel = {
    mpesa: "M-Pesa",
    orange: "Orange Money",
    airtel: "Airtel Money",
    cash: "Cash livraison",
  }[order.payment];
  const time = new Date(order.createdAt).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const hasPurchase = order.items.some((i) => i.mode === "purchase");
  const hasRefill = order.items.some((i) => i.mode === "refill");

  return (
    <article
      className="glow-cursor t-liquid glass glass-hover relative overflow-hidden rounded-xl p-3 text-xs"
      style={{ borderLeftWidth: 0 }}
    >
      <span
        className="absolute inset-y-0 left-0 w-1"
        style={{ background: STATUS_COLOR[order.status] }}
      />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            #{order.orderNumber} · {time}
          </p>
          <p className="truncate font-bold">{order.customer.fullName}</p>
        </div>
        <p className="whitespace-nowrap font-extrabold" style={{ color: "var(--flame)" }}>
          {formatFC(order.total)}
        </p>
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        <Badge>{totalItems} art.</Badge>
        {order.receiveMode !== "pickup" && <Badge>Livraison</Badge>}
        {hasRefill && <Badge>Recharge</Badge>}
        {hasPurchase && <Badge tone="flame">+ Consigne</Badge>}
        <Badge tone="night">{paymentLabel}</Badge>
      </div>

      <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
        <p className="flex items-start gap-1">
          <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
          <span className="line-clamp-2">
            {order.address.commune} · {order.address.repere}
          </span>
        </p>
        <p className="flex items-center gap-1">
          <Phone className="h-3 w-3" />
          {order.customer.phone}
        </p>
      </div>

      {expanded && (
        <div className="mt-2 rounded-lg border border-white/40 bg-white/55 p-2 text-[11px] backdrop-blur-sm">
          <p>
            {order.address.avenue} · N°{order.address.parcelle}, {order.address.quartier}
          </p>
          <p className="mt-1 text-glass-tertiary">
            Livraison :{" "}
            {order.delivery.mode === "express"
              ? "Express (60 min)"
              : `Programmée ${order.delivery.when ?? ""}`}
          </p>
        </div>
      )}

      {order.receiveMode !== "pickup" && (
        <OrderFeeEditor
          orderId={order.id}
          fee={order.deliveryFee}
          distanceKm={order.distanceKm}
          onSaved={(f) => onFeeChanged(order.id, f)}
        />
      )}

      {/* Dispatching : livreur */}
      <div className="mt-3 rounded-lg border border-white/50 bg-white/60 p-2 backdrop-blur-sm">
        <p className="mb-1.5 text-[9px] font-bold uppercase tracking-widest text-glass-tertiary">
          Livreur assigné
        </p>
        {assignedDriver ? (
          <div className="flex items-center gap-2">
            <span
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-extrabold text-white"
              style={{ background: STATUS_COLOR[order.status] }}
            >
              {assignedDriver.full_name
                .split(" ")
                .map((p) => p[0])
                .slice(0, 2)
                .join("")
                .toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-bold">{assignedDriver.full_name}</p>
              <p className="truncate text-[10px] text-muted-foreground">
                {assignedDriver.zone ?? "zone —"}
                {assignedDriver.phone ? ` · ${assignedDriver.phone}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {assignedDriver.phone && (
                <a
                  href={`tel:${assignedDriver.phone}`}
                  className="grid h-6 w-6 place-items-center rounded-md bg-white/65 hover:bg-white/85"
                  aria-label={`Appeler ${assignedDriver.full_name}`}
                  title={`Appeler ${assignedDriver.full_name}`}
                >
                  <Phone className="h-3 w-3" />
                </a>
              )}
              {!terminal && (
                <button
                  onClick={() => onAssignDriver(order, undefined)}
                  className="grid h-6 w-6 place-items-center rounded-md bg-white/65 text-destructive hover:bg-destructive/10"
                  aria-label="Retirer le livreur"
                  title="Retirer le livreur"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        ) : (
          <p className="text-[10px] italic text-muted-foreground">Aucun livreur assigné</p>
        )}
        {!terminal && (
          <div className="relative mt-2">
            <select
              value={order.driverId ?? ""}
              onChange={(e) => onAssignDriver(order, e.target.value || undefined)}
              disabled={busy}
              className="w-full rounded-lg border border-white/50 bg-white/65 px-2 py-1.5 text-[11px] disabled:opacity-60"
            >
              <option value="">— Attribuer un livreur —</option>
              {selectableDrivers.length === 0 && (
                <option value="" disabled>
                  Aucun livreur actif disponible
                </option>
              )}
              {selectableDrivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.full_name} · {d.zone ?? "zone —"}
                  {d.deposit_id ? ` · ${depositById.get(d.deposit_id) ?? "Dépôt"}` : ""}
                </option>
              ))}
            </select>
            <span key={`sel-loader-${order.id}`} aria-hidden className="contents">
              {busy && (
                <Loader2 className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
            </span>
          </div>
        )}
      </div>

      {/* Statut */}
      <div className="mt-2 flex gap-1">
        {next && !terminal && (
          <button
            onClick={() => onAdvance(order)}
            disabled={busy}
            className="press-scale flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[11px] font-bold text-white transition active:scale-95 disabled:opacity-60"
            style={{ background: "var(--gradient-flame)" }}
          >
            <span key={`adv-loader-${order.id}`} aria-hidden className="contents">
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Truck className="icon-pop h-3.5 w-3.5" />
              )}
            </span>
            Passer à · {next}
          </button>
        )}
        {!terminal && (
          <button
            onClick={() => onCancel(order)}
            className="press-scale rounded-lg border border-white/50 bg-white/65 px-2 py-1.5 text-[11px] font-bold text-destructive hover:bg-destructive/10 active:scale-95"
            aria-label="Annuler"
            title="Annuler avec motif"
          >
            ✕
          </button>
        )}
      </div>

      <div className="mt-2 flex gap-1">
        <a
          href={`tel:${order.customer.phone}`}
          className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-white/50 bg-white/65 py-1.5 text-[11px] font-bold hover:bg-white/85"
        >
          <Phone className="h-3 w-3" /> Appeler
        </a>
        <a
          href={`https://wa.me/${(order.customer.whatsapp || order.customer.phone).replace(/\D/g, "")}?text=${encodeURIComponent(buildWhatsAppMessage(order))}`}
          target="_blank"
          rel="noreferrer"
          className="flex flex-1 items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-bold text-white"
          style={{ background: "oklch(0.6 0.15 150)" }}
        >
          <MessageCircle className="h-3 w-3" /> WhatsApp
        </a>
      </div>

      <Link
        to="/facture/$orderId"
        params={{ orderId: order.id }}
        search={{ token: order.trackingToken }}
        target="_blank"
        className="mt-2 flex items-center justify-center gap-1 rounded-lg border border-white/50 bg-white/65 py-1.5 text-[11px] font-bold hover:bg-white/85"
      >
        <FileText className="h-3 w-3" /> Imprimer / Générer facture
      </Link>
    </article>
  );
}

function Badge({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "flame" | "night";
}) {
  const styles: Record<string, string> = {
    muted: "bg-muted text-foreground",
    flame: "text-white",
    night: "text-white",
  };
  const bg =
    tone === "flame"
      ? { background: "var(--gradient-flame)" }
      : tone === "night"
        ? { background: "var(--night)" }
        : undefined;
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${styles[tone]}`} style={bg}>
      {children}
    </span>
  );
}

function StockView({
  products,
  onUpdate,
}: {
  products: Product[];
  onUpdate: (id: string, patch: Partial<Product>) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {products.map((p) => (
        <div key={p.id} className="glass rounded-2xl p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {p.size}
              </p>
              <p className="font-display text-lg font-extrabold">{p.weight}</p>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2">
              <span className="text-[11px] font-bold">
                {p.available ? "Disponible" : "Rupture"}
              </span>
              <span
                className="relative h-6 w-11 rounded-full transition"
                style={{
                  background: p.available
                    ? "var(--gradient-flame)"
                    : "color-mix(in oklab, var(--night) 15%, transparent)",
                }}
              >
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={p.available}
                  onChange={(e) => onUpdate(p.id, { available: e.target.checked })}
                />
                <span
                  className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all"
                  style={{ left: p.available ? "1.375rem" : "0.125rem" }}
                />
              </span>
            </label>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <PriceInput
              label="Prix recharge"
              value={p.price}
              onChange={(v) => onUpdate(p.id, { price: v })}
            />
            <PriceInput
              label="Consigne bouteille"
              value={p.consigne}
              onChange={(v) => onUpdate(p.id, { consigne: v })}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function PriceInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="mt-1 flex items-center gap-1 rounded-xl border border-white/50 bg-white/60 px-2 backdrop-blur-sm">
        <input
          type="number"
          value={value}
          min={0}
          step={500}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="w-full bg-transparent py-2 text-sm font-bold outline-none"
        />
        <span className="text-[10px] font-bold text-muted-foreground">FC</span>
      </div>
    </label>
  );
}

/* ============ Drivers management ============ */
type DriverDraft = {
  id?: string;
  full_name: string;
  phone: string;
  zone: string | null;
  vehicle: string | null;
  deposit_id: string | null;
  is_available: boolean;
};

const EMPTY_DRIVER_DRAFT: DriverDraft = {
  full_name: "",
  phone: "",
  zone: null,
  vehicle: null,
  deposit_id: null,
  is_available: true,
};

function DriversView({ drivers, onChanged }: { drivers: FleetDriver[]; onChanged: () => void }) {
  const [draft, setDraft] = useState<DriverDraft>(EMPTY_DRIVER_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.full_name.trim() || !draft.phone.trim())
      return toast.error("Nom complet et téléphone requis");
    setSaving(true);
    try {
      await upsertDriver({
        ...draft,
        full_name: draft.full_name.trim(),
        phone: draft.phone.trim(),
      });
      toast.success(editingId ? "Livreur mis à jour" : "Livreur ajouté");
      onChanged();
    } catch (err) {
      console.error("[admin] Enregistrement du livreur refusé", { cause: err });
      toast.error("Enregistrement refusé", {
        description: dbUpdateErrorMessage(err),
      });
    } finally {
      setSaving(false);
      setDraft(EMPTY_DRIVER_DRAFT);
      setEditingId(null);
    }
  };

  const edit = (d: FleetDriver) => {
    setDraft({
      id: d.id,
      full_name: d.full_name,
      phone: d.phone,
      zone: d.zone,
      vehicle: d.vehicle,
      deposit_id: d.deposit_id,
      is_available: d.is_available,
    });
    setEditingId(d.id);
  };

  const remove = async (id: string) => {
    setSaving(true);
    try {
      await deleteDriver(id);
      toast.success("Livreur supprimé");
      onChanged();
    } catch (err) {
      console.error("[admin] Suppression du livreur refusée", { id, cause: err });
      toast.error("Suppression refusée", {
        description: dbUpdateErrorMessage(err),
      });
    } finally {
      setSaving(false);
      if (editingId === id) {
        setDraft(EMPTY_DRIVER_DRAFT);
        setEditingId(null);
      }
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <form onSubmit={submit} className="glass rounded-2xl p-4">
        <div className="mb-3 flex items-center gap-2">
          <Truck className="h-4 w-4 text-[color:var(--flame)]" />
          <p className="text-xs font-bold uppercase tracking-widest">
            {editingId ? "Modifier livreur" : "Nouveau livreur"}
          </p>
        </div>
        <div className="space-y-2">
          <TextField
            label="Nom complet"
            value={draft.full_name}
            onChange={(v) => setDraft({ ...draft, full_name: v })}
          />
          <TextField
            label="Téléphone"
            value={draft.phone}
            onChange={(v) => setDraft({ ...draft, phone: v })}
          />
          <div>
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Zone (commune)
            </span>
            <CommuneSelect
              value={draft.zone ?? ""}
              onChange={(c) => setDraft({ ...draft, zone: c })}
              placeholder="Choisir la commune d'intervention"
            />
          </div>
          <TextField
            label="Véhicule (ex: Moto, Camionnette)"
            value={draft.vehicle ?? ""}
            onChange={(v) => setDraft({ ...draft, vehicle: v })}
          />
          <label className="mt-1 flex items-center gap-2 text-xs font-semibold">
            <input
              type="checkbox"
              checked={draft.is_available}
              onChange={(e) => setDraft({ ...draft, is_available: e.target.checked })}
            />
            Actif (disponible pour livraison)
          </label>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-xl py-2 text-xs font-bold text-white disabled:opacity-60"
            style={{ background: "var(--gradient-flame)" }}
          >
            {saving ? (
              <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" />
            ) : editingId ? (
              "Enregistrer"
            ) : (
              <>
                <Plus className="mr-1 inline h-3 w-3" />
                Ajouter
              </>
            )}
          </button>
          {editingId && (
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setDraft(EMPTY_DRIVER_DRAFT);
                setEditingId(null);
              }}
              className="rounded-xl border border-white/50 bg-white/65 px-3 py-2 text-xs font-bold backdrop-blur-sm"
            >
              Annuler
            </button>
          )}
        </div>
      </form>

      <div className="grid gap-3 sm:grid-cols-2">
        {drivers.length === 0 && (
          <p className="rounded-2xl border border-dashed border-white/50 p-8 text-center text-sm text-muted-foreground sm:col-span-2">
            Aucun livreur enregistré.
          </p>
        )}
        {drivers.map((d) => (
          <div key={d.id} className="glass rounded-2xl p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-display text-base font-extrabold leading-tight">{d.full_name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {d.zone || "Zone non définie"} {d.vehicle ? `· ${d.vehicle}` : ""}
                </p>
              </div>
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                style={{
                  background: d.is_available ? "oklch(0.6 0.15 150)" : "oklch(0.55 0.05 20)",
                }}
              >
                {d.is_available ? "Actif" : "Inactif"}
              </span>
            </div>
            <p className="mt-2 flex items-center gap-1 text-xs">
              <Phone className="h-3 w-3" />
              {d.phone}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => edit(d)}
                disabled={saving}
                className="flex-1 rounded-lg border border-white/50 bg-white/65 py-1.5 text-[11px] font-bold hover:bg-white/85"
              >
                Modifier
              </button>
              <a
                href={`tel:${d.phone}`}
                className="rounded-lg border border-white/50 bg-white/65 px-3 py-1.5 text-[11px] font-bold hover:bg-white/85"
              >
                Appeler
              </a>
              <button
                onClick={() => remove(d.id)}
                disabled={saving}
                className="rounded-lg border border-white/50 bg-white/65 px-3 py-1.5 text-[11px] font-bold text-destructive hover:bg-destructive/10"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============ Vendors management ============ */
function VendorsView({
  vendors,
  onChange,
}: {
  vendors: Vendor[];
  onChange: (next: Vendor[]) => void;
}) {
  const empty: Vendor = {
    id: "",
    name: "",
    contact: "",
    phone: "",
    commune: "",
    address: "",
    lat: undefined,
    lng: undefined,
    active: true,
  };
  const [draft, setDraft] = useState<Vendor>(empty);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.name.trim() || !draft.phone.trim() || !draft.commune.trim())
      return toast.error("Nom, téléphone et commune requis");
    if (editingId) {
      onChange(vendors.map((v) => (v.id === editingId ? { ...draft, id: editingId } : v)));
      toast.success("Vendeur mis à jour");
    } else {
      onChange([...vendors, { ...draft, id: crypto.randomUUID() }]);
      toast.success("Vendeur ajouté");
    }
    setDraft(empty);
    setEditingId(null);
  };

  const useMyLocation = () => {
    if (!("geolocation" in navigator)) return toast.error("Géolocalisation non disponible");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDraft((d) => ({ ...d, lat: pos.coords.latitude, lng: pos.coords.longitude }));
        setLocating(false);
        toast.success("Position GPS capturée");
      },
      () => {
        setLocating(false);
        toast.error("Impossible d'obtenir la position");
      },
    );
  };

  const edit = (v: Vendor) => {
    setDraft(v);
    setEditingId(v.id);
  };
  const remove = (id: string) => {
    onChange(vendors.filter((v) => v.id !== id));
    if (editingId === id) {
      setDraft(empty);
      setEditingId(null);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[400px_1fr]">
      <form onSubmit={submit} className="glass rounded-2xl p-4">
        <div className="mb-3 flex items-center gap-2">
          <Store className="h-4 w-4 text-[color:var(--flame)]" />
          <p className="text-xs font-bold uppercase tracking-widest">
            {editingId ? "Modifier vendeur" : "Nouveau vendeur partenaire"}
          </p>
        </div>
        <div className="space-y-2">
          <TextField
            label="Nom du point de vente"
            value={draft.name}
            onChange={(v) => setDraft({ ...draft, name: v })}
          />
          <TextField
            label="Personne de contact"
            value={draft.contact}
            onChange={(v) => setDraft({ ...draft, contact: v })}
          />
          <TextField
            label="Téléphone"
            value={draft.phone}
            onChange={(v) => setDraft({ ...draft, phone: v })}
          />
          <TextField
            label="Commune"
            value={draft.commune}
            onChange={(v) => setDraft({ ...draft, commune: v })}
          />
          <TextField
            label="Adresse (avenue, N°, repère)"
            value={draft.address}
            onChange={(v) => setDraft({ ...draft, address: v })}
          />

          <div className="grid grid-cols-2 gap-2">
            <TextField
              label="Latitude"
              value={draft.lat?.toString() ?? ""}
              onChange={(v) => setDraft({ ...draft, lat: v ? Number(v) : undefined })}
            />
            <TextField
              label="Longitude"
              value={draft.lng?.toString() ?? ""}
              onChange={(v) => setDraft({ ...draft, lng: v ? Number(v) : undefined })}
            />
          </div>
          <button
            type="button"
            onClick={useMyLocation}
            disabled={locating}
            className="flex w-full items-center justify-center gap-1 rounded-xl border border-white/50 bg-white/60 py-2 text-[11px] font-bold hover:bg-white/85 backdrop-blur-sm"
          >
            <MapPin className="h-3 w-3" />
            {locating ? "Localisation…" : "Utiliser ma position GPS actuelle"}
          </button>

          <label className="mt-1 flex items-center gap-2 text-xs font-semibold">
            <input
              type="checkbox"
              checked={draft.active}
              onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
            />
            Actif (visible pour les clients)
          </label>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="submit"
            className="flex-1 rounded-xl py-2 text-xs font-bold text-white"
            style={{ background: "var(--gradient-flame)" }}
          >
            {editingId ? "Enregistrer" : "Ajouter"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={() => {
                setDraft(empty);
                setEditingId(null);
              }}
              className="rounded-xl border border-white/50 bg-white/65 px-3 py-2 text-xs font-bold backdrop-blur-sm"
            >
              Annuler
            </button>
          )}
        </div>
      </form>

      <div className="grid gap-3 sm:grid-cols-2">
        {vendors.length === 0 && (
          <p className="rounded-2xl border border-dashed border-white/50 p-8 text-center text-sm text-muted-foreground sm:col-span-2">
            Aucun vendeur partenaire enregistré.
          </p>
        )}
        {vendors.map((v) => (
          <div key={v.id} className="glass rounded-2xl p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-display text-base font-extrabold leading-tight">{v.name}</p>
                <p className="text-[11px] text-muted-foreground">{v.commune}</p>
              </div>
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                style={{ background: v.active ? "oklch(0.6 0.15 150)" : "oklch(0.55 0.05 20)" }}
              >
                {v.active ? "Actif" : "Inactif"}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{v.address}</p>
            <p className="mt-1 flex items-center gap-1 text-xs">
              <Phone className="h-3 w-3" />
              {v.phone} {v.contact && `· ${v.contact}`}
            </p>
            {typeof v.lat === "number" && typeof v.lng === "number" ? (
              <a
                href={`https://www.google.com/maps?q=${v.lat},${v.lng}`}
                target="_blank"
                rel="noreferrer"
                className="mt-1 flex items-center gap-1 text-[11px] font-bold text-[color:var(--flame)] hover:underline"
              >
                <MapPin className="h-3 w-3" />
                {v.lat.toFixed(5)}, {v.lng.toFixed(5)}
              </a>
            ) : (
              <p className="mt-1 text-[11px] text-muted-foreground">GPS non défini</p>
            )}
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => edit(v)}
                className="flex-1 rounded-lg border border-white/50 bg-white/65 py-1.5 text-[11px] font-bold hover:bg-white/85"
              >
                Modifier
              </button>
              <button
                onClick={() => remove(v.id)}
                className="rounded-lg border border-white/50 bg-white/65 px-3 py-1.5 text-[11px] font-bold text-destructive hover:bg-destructive/10"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============ Accessories management ============ */
function AccessoriesView({
  items,
  onChange,
}: {
  items: Accessory[];
  onChange: (next: Accessory[]) => void;
}) {
  const empty: Accessory = {
    id: "",
    name: "",
    description: "",
    price: 0,
    stock: 0,
    available: true,
  };
  const [draft, setDraft] = useState<Accessory>(empty);
  const [editingId, setEditingId] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.name.trim()) return toast.error("Nom requis");
    if (editingId) {
      onChange(items.map((a) => (a.id === editingId ? { ...draft, id: editingId } : a)));
      toast.success("Accessoire mis à jour");
    } else {
      onChange([...items, { ...draft, id: crypto.randomUUID() }]);
      toast.success("Accessoire ajouté");
    }
    setDraft(empty);
    setEditingId(null);
  };

  const patch = (id: string, p: Partial<Accessory>) => {
    onChange(items.map((a) => (a.id === id ? { ...a, ...p } : a)));
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <form onSubmit={submit} className="glass rounded-2xl p-4">
        <div className="mb-3 flex items-center gap-2">
          <Wrench className="h-4 w-4 text-[color:var(--flame)]" />
          <p className="text-xs font-bold uppercase tracking-widest">
            {editingId ? "Modifier accessoire" : "Nouvel accessoire"}
          </p>
        </div>
        <div className="space-y-2">
          <TextField
            label="Nom"
            value={draft.name}
            onChange={(v) => setDraft({ ...draft, name: v })}
          />
          <TextField
            label="Description"
            value={draft.description ?? ""}
            onChange={(v) => setDraft({ ...draft, description: v })}
          />
          <div className="grid grid-cols-2 gap-2">
            <TextField
              label="Prix (FC)"
              value={String(draft.price)}
              onChange={(v) => setDraft({ ...draft, price: Number(v) || 0 })}
              type="number"
            />
            <TextField
              label="Stock"
              value={String(draft.stock)}
              onChange={(v) => setDraft({ ...draft, stock: Number(v) || 0 })}
              type="number"
            />
          </div>
          <label className="mt-1 flex items-center gap-2 text-xs font-semibold">
            <input
              type="checkbox"
              checked={draft.available}
              onChange={(e) => setDraft({ ...draft, available: e.target.checked })}
            />
            Disponible à la vente
          </label>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="submit"
            className="flex-1 rounded-xl py-2 text-xs font-bold text-white"
            style={{ background: "var(--gradient-flame)" }}
          >
            {editingId ? "Enregistrer" : "Ajouter"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={() => {
                setDraft(empty);
                setEditingId(null);
              }}
              className="rounded-xl border border-white/50 bg-white/65 px-3 py-2 text-xs font-bold backdrop-blur-sm"
            >
              Annuler
            </button>
          )}
        </div>
      </form>

      <div className="grid gap-3 sm:grid-cols-2">
        {items.length === 0 && (
          <p className="rounded-2xl border border-dashed border-white/50 p-8 text-center text-sm text-muted-foreground sm:col-span-2">
            Aucun accessoire enregistré.
          </p>
        )}
        {items.map((a) => (
          <div key={a.id} className="glass rounded-2xl p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-display text-base font-extrabold leading-tight">{a.name}</p>
                {a.description && (
                  <p className="text-[11px] text-muted-foreground">{a.description}</p>
                )}
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2">
                <span className="text-[10px] font-bold">{a.available ? "Dispo" : "Rupture"}</span>
                <span
                  className="relative h-5 w-9 rounded-full transition"
                  style={{
                    background: a.available
                      ? "var(--gradient-flame)"
                      : "color-mix(in oklab, var(--night) 15%, transparent)",
                  }}
                >
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={a.available}
                    onChange={(e) => patch(a.id, { available: e.target.checked })}
                  />
                  <span
                    className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all"
                    style={{ left: a.available ? "1.125rem" : "0.125rem" }}
                  />
                </span>
              </label>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Prix (FC)
                </span>
                <input
                  type="number"
                  value={a.price}
                  min={0}
                  step={500}
                  onChange={(e) => patch(a.id, { price: Number(e.target.value) || 0 })}
                  className="mt-1 w-full rounded-lg border border-white/50 bg-white/60 px-2 py-1.5 text-sm font-bold backdrop-blur-sm"
                />
              </label>
              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Stock
                </span>
                <input
                  type="number"
                  value={a.stock}
                  min={0}
                  onChange={(e) => patch(a.id, { stock: Number(e.target.value) || 0 })}
                  className="mt-1 w-full rounded-lg border border-white/50 bg-white/60 px-2 py-1.5 text-sm font-bold backdrop-blur-sm"
                />
              </label>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => {
                  setDraft(a);
                  setEditingId(a.id);
                }}
                className="flex-1 rounded-lg border border-white/50 bg-white/65 py-1.5 text-[11px] font-bold hover:bg-white/85"
              >
                Modifier
              </button>
              <button
                onClick={() => onChange(items.filter((x) => x.id !== a.id))}
                className="rounded-lg border border-white/50 bg-white/65 px-3 py-1.5 text-[11px] font-bold text-destructive hover:bg-destructive/10"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-white/50 bg-white/60 px-2 py-2 text-sm outline-none backdrop-blur-sm focus:border-foreground/40"
      />
    </label>
  );
}

function PromotionsView() {
  const [items, setItems] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<{
    title: string;
    description: string;
    discount_type: string;
    discount_value: string;
  }>({
    title: "",
    description: "",
    discount_type: "percent",
    discount_value: "0",
  });
  const aliveRef = useRef(true);
  const refresh = () =>
    listAllPromotions().then((d) => {
      if (aliveRef.current) setItems(d);
    });
  useEffect(() => {
    aliveRef.current = true;
    refresh().finally(() => aliveRef.current && setLoading(false));
    const unsub = subscribePromotions(refresh);
    return () => {
      aliveRef.current = false;
      unsub();
    };
  }, []);

  const submit = async () => {
    if (!form.title.trim()) {
      toast.error("Titre requis");
      return;
    }
    try {
      await createPromotion({
        title: form.title.trim(),
        description: form.description.trim() || null,
        discount_type: form.discount_type,
        discount_value: Number(form.discount_value) || 0,
        is_active: true,
      });
      setForm({ title: "", description: "", discount_type: "percent", discount_value: "0" });
      toast.success("Offre créée");
    } catch {
      toast.error("Impossible de créer l'offre");
    }
  };

  return (
    <section className="space-y-4">
      <div className="glass rounded-2xl p-4">
        <p className="text-sm font-extrabold">Nouvelle offre</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <input
            placeholder="Titre de l'offre"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="rounded-lg border border-white/50 bg-white/60 px-3 py-2 text-sm backdrop-blur-sm"
          />
          <div className="flex gap-2">
            <select
              value={form.discount_type}
              onChange={(e) => setForm({ ...form, discount_type: e.target.value })}
              className="flex-1 rounded-lg border border-white/50 bg-white/60 px-3 py-2 text-sm backdrop-blur-sm"
            >
              <option value="percent">Pourcentage %</option>
              <option value="amount">Montant FC</option>
              <option value="shipping">Livraison</option>
              <option value="loyalty">Fidélité</option>
            </select>
            <input
              type="number"
              value={form.discount_value}
              onChange={(e) => setForm({ ...form, discount_value: e.target.value })}
              className="w-24 rounded-lg border border-white/50 bg-white/60 px-3 py-2 text-sm backdrop-blur-sm"
            />
          </div>
          <input
            placeholder="Description (optionnel)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="rounded-lg border border-white/50 bg-white/60 px-3 py-2 text-sm backdrop-blur-sm sm:col-span-2"
          />
        </div>
        <button
          onClick={submit}
          className="mt-3 rounded-lg px-4 py-2 text-xs font-bold text-white"
          style={{ background: "var(--gradient-flame)" }}
        >
          + Ajouter l'offre
        </button>
      </div>

      <div className="space-y-2">
        {loading && (
          <div key="promotions-skeleton" className="grid gap-2 sm:grid-cols-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton skeleton-in h-20 rounded-2xl" />
            ))}
          </div>
        )}
        {!loading && items.length === 0 && (
          <p className="rounded-2xl border border-dashed border-white/50 p-4 text-center text-xs text-muted-foreground">
            Aucune offre. Créez la première ci-dessus.
          </p>
        )}
        {items.map((p) => (
          <div key={p.id} className="glass flex items-start justify-between gap-3 rounded-2xl p-4">
            <div className="min-w-0">
              <p className="text-sm font-extrabold">{p.title}</p>
              {p.description && (
                <p className="mt-0.5 text-xs text-muted-foreground">{p.description}</p>
              )}
              <p className="mt-1 text-[11px] text-muted-foreground">
                {p.discount_type} · {p.discount_value}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={() =>
                  updatePromotion(p.id, { is_active: !p.is_active }).catch(() =>
                    toast.error("Échec"),
                  )
                }
                className="rounded-lg border border-white/50 bg-white/60 px-2 py-1 text-[11px] font-bold backdrop-blur-sm"
              >
                {p.is_active ? "Désactiver" : "Activer"}
              </button>
              <button
                onClick={() => {
                  if (!confirm("Supprimer cette offre ?")) return;
                  deletePromotion(p.id).catch(() => toast.error("Échec"));
                }}
                className="rounded-lg border border-destructive/40 px-2 py-1 text-[11px] font-bold text-destructive"
              >
                Suppr.
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
