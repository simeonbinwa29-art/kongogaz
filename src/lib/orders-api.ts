import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { sendOrderNotificationToManager } from "@/lib/notifications";

type OrderRow = Database["public"]["Tables"]["orders"]["Row"];
type OrderItemRow = Database["public"]["Tables"]["order_items"]["Row"];

export type OrderStatus = "Nouvelle" | "En préparation" | "En route" | "Livrée" | "Annulée";

const DB_TO_UI: Record<string, OrderStatus> = {
  // canonical
  pending: "Nouvelle",
  processing: "En préparation",
  delivering: "En route",
  delivered: "Livrée",
  cancelled: "Annulée",
  // aliases tolérés (anciennes données / saisies françaises)
  nouvelle: "Nouvelle",
  new: "Nouvelle",
  en_preparation: "En préparation",
  en_preparations: "En préparation",
  preparing: "En préparation",
  en_route: "En route",
  shipped: "En route",
  out_for_delivery: "En route",
  livree: "Livrée",
  completed: "Livrée",
  annulee: "Annulée",
  canceled: "Annulée",
};

export function toUiStatus(dbStatus: string | null | undefined): OrderStatus {
  if (!dbStatus) return "Nouvelle";
  return DB_TO_UI[String(dbStatus).trim().toLowerCase()] ?? "Nouvelle";
}

/** Étape du stepper client : 1 → 4 */
export function statusStep(status: OrderStatus): 0 | 1 | 2 | 3 | 4 {
  return status === "Annulée"
    ? 0
    : status === "En préparation"
      ? 2
      : status === "En route"
        ? 3
        : status === "Livrée"
          ? 4
          : 1;
}

const UI_TO_DB: Record<OrderStatus, string> = {
  Nouvelle: "pending",
  "En préparation": "processing",
  "En route": "delivering",
  Livrée: "delivered",
  Annulée: "cancelled",
};

export type CartItem = {
  key: string;
  bottleId: string;
  mode: "refill" | "purchase";
  kit: boolean;
  qty: number;
  unitPrice: number;
  label?: string;
};

export type Order = {
  id: string; // uuid
  orderNumber: string;
  createdAt: number;
  items: CartItem[];
  total: number;
  customer: { fullName: string; phone: string; whatsapp: string };
  address: {
    commune: string;
    quartier: string;
    avenue: string;
    parcelle: string;
    repere: string;
  };
  delivery: { mode: "express" | "scheduled"; when?: string };
  payment: "mpesa" | "orange" | "airtel" | "cash";
  status: OrderStatus;
  driverId?: string;
  depositId?: string;
  creditApplied?: number;
  /** Mode de réception : livraison à domicile ou retrait au dépôt (Click & Collect). */
  receiveMode: "delivery" | "pickup";
  deliveryFee: number;
  /** Position GPS du client (livraison à domicile). */
  customerLat?: number | null;
  customerLng?: number | null;
  /** Distance dépôt → client utilisée pour le calcul des frais. */
  distanceKm?: number | null;
  /** Jeton unique de suivi/facture (accès invité, au lieu de lectures publiques). */
  trackingToken?: string;
};

export type NewOrderInput = Omit<Order, "id" | "orderNumber" | "createdAt" | "status">;

const KIT_LABEL = "Kit détendeur + tuyau";
const KIT_PRICE = 15000;

function genOrderNumber() {
  return "BG" + Math.floor(100000 + Math.random() * 900000);
}

async function genUniqueOrderNumber(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = genOrderNumber();
    const { data } = await supabase
      .from("orders")
      .select("id")
      .eq("order_number", candidate)
      .maybeSingle();
    if (!data) return candidate;
  }
  return "BG" + String(Date.now()).slice(-8);
}

export async function createOrder(input: NewOrderInput): Promise<Order> {
  const orderNumber = await genUniqueOrderNumber();
  const { data: auth } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("orders")
    .insert({
      order_number: orderNumber,
      customer_name: input.customer.fullName,
      phone_primary: input.customer.phone,
      phone_whatsapp: input.customer.whatsapp || null,
      commune: input.address.commune,
      neighborhood: input.address.quartier,
      address_details: `${input.address.avenue} · N°${input.address.parcelle}`,
      landmark: input.address.repere,
      total_amount: input.total,
      payment_method: input.payment,
      status: "pending",
      user_id: auth.user?.id ?? null,
      credit_applied: input.creditApplied ?? 0,
      deposit_id: input.depositId ?? null,
      delivery_mode: input.receiveMode,
      delivery_timing: input.delivery.mode,
      delivery_time: input.delivery.when ?? null,
      delivery_fee: input.deliveryFee,
      customer_lat: input.customerLat ?? null,
      customer_lng: input.customerLng ?? null,
      distance_km: input.distanceKm ?? null,
    })
    .select()
    .single();
  if (error || !data) throw error ?? new Error("Insert failed");

  const rows = input.items.flatMap((it) => {
    const list = [
      {
        order_id: data.id,
        product_label: it.label ?? `Bouteille ${it.bottleId}`,
        order_type: it.mode === "refill" ? "refill" : "full_cylinder",
        quantity: it.qty,
        unit_price: Math.max(0, it.unitPrice - (it.kit ? KIT_PRICE : 0)),
      },
    ];
    if (it.kit) {
      list.push({
        order_id: data.id,
        product_label: KIT_LABEL,
        order_type: "accessory",
        quantity: it.qty,
        unit_price: KIT_PRICE,
      });
    }
    return list;
  });
  if (rows.length) {
    const { error: itemsErr } = await supabase.from("order_items").insert(rows);
    if (itemsErr) throw itemsErr;
  }

  await supabase.from("invoices").insert({
    order_id: data.id,
    invoice_number: "FACT-" + new Date().getFullYear() + "-" + orderNumber.slice(2),
    payment_status: input.payment === "cash" ? "pending" : "paid",
  });

  const createdOrder = {
    id: data.id,
    orderNumber,
    createdAt: new Date(data.created_at).getTime(),
    items: input.items,
    total: input.total,
    customer: input.customer,
    address: input.address,
    delivery: input.delivery,
    payment: input.payment,
    receiveMode: input.receiveMode,
    deliveryFee: input.deliveryFee,
    customerLat: input.customerLat ?? null,
    customerLng: input.customerLng ?? null,
    distanceKm: input.distanceKm ?? null,
    depositId: input.depositId,
    creditApplied: input.creditApplied,
    status: "Nouvelle",
    trackingToken: data.tracking_token,
  } as const;

  // Notification e-mail non bloquante au gérant du dépôt rattaché à la commune.
  void sendOrderNotificationToManager(createdOrder).catch(() => {});

  return createdOrder;
}

function toPrice(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function rowToOrder(row: OrderRow, items: OrderItemRow[]): Order {
  const grouped = new Map<string, CartItem>();
  for (const it of items) {
    if (it.order_type === "accessory") {
      // attach kit to any bottle-mode entry sharing insert timing; simplest: separate
      grouped.set("kit-" + it.id, {
        key: "kit-" + it.id,
        bottleId: "kit",
        mode: "refill",
        kit: true,
        qty: it.quantity,
        unitPrice: toPrice(it.unit_price),
        label: it.product_label,
      });
    } else {
      grouped.set(it.id, {
        key: it.id,
        bottleId: it.product_id ?? it.product_label,
        mode: it.order_type === "refill" ? "refill" : "purchase",
        kit: false,
        qty: it.quantity,
        unitPrice: toPrice(it.unit_price),
        label: it.product_label,
      });
    }
  }
  const rawAddress = String(row.address_details ?? "");
  const addrMatch = rawAddress.match(/^(.*?)\s*·?\s*N°\s*(\S+)/);
  const avenue = (addrMatch?.[1] ?? rawAddress).trim();
  const parcelle = addrMatch?.[2] ?? "";
  return {
    id: row.id,
    orderNumber: row.order_number,
    createdAt: new Date(row.created_at).getTime(),
    items: [...grouped.values()],
    total: Number(row.total_amount),
    customer: {
      fullName: row.customer_name,
      phone: row.phone_primary,
      whatsapp: row.phone_whatsapp ?? "",
    },
    address: {
      commune: row.commune,
      quartier: row.neighborhood ?? "",
      avenue,
      parcelle,
      repere: row.landmark,
    },
    delivery: {
      mode: row.delivery_timing === "scheduled" ? "scheduled" : "express",
      when: row.delivery_time ?? undefined,
    },
    payment: row.payment_method as Order["payment"],
    receiveMode: row.delivery_mode === "pickup" ? "pickup" : "delivery",
    deliveryFee: Number(row.delivery_fee ?? 0),
    creditApplied: Number(row.credit_applied ?? 0),
    customerLat: row.customer_lat != null ? Number(row.customer_lat) : null,
    customerLng: row.customer_lng != null ? Number(row.customer_lng) : null,
    distanceKm: row.distance_km != null ? Number(row.distance_km) : null,
    status: toUiStatus(row.status),
    depositId: row.deposit_id ?? undefined,
    driverId: row.driver_id ?? undefined,
    trackingToken: row.tracking_token,
  };
}

export async function listOrders(): Promise<Order[]> {
  const { data: orders, error } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false });
  if (error || !orders) return [];
  const ids = orders.map((o) => o.id);
  if (!ids.length) return [];
  const { data: items } = await supabase.from("order_items").select("*").in("order_id", ids);
  const byOrder = new Map<string, OrderItemRow[]>();
  for (const it of items ?? []) {
    const arr = byOrder.get(it.order_id) ?? [];
    arr.push(it);
    byOrder.set(it.order_id, arr);
  }
  return orders.map((o) => rowToOrder(o, byOrder.get(o.id) ?? []));
}

export async function getOrderById(id: string, token?: string): Promise<Order | null> {
  let rows: OrderRow[] = [];
  let items: OrderItemRow[] = [];

  if (token) {
    // Invité (ou propriétaire partageant son lien) : lecture via token, pas de
    // sélection publique. Les fonctions sont SECURITY DEFINER et ne renvoient
    // la commande (et ses lignes) que si le token correspond exactement.
    const { data: orderData } =
      ((await supabase.rpc("get_order_for_guest", {
        p_order_id: id,
        p_token: token,
      })) as unknown as { data: OrderRow[] | null }) || {};
    rows = orderData ?? [];
    if (!rows.length) return null;
    const { data: itemData } =
      ((await supabase.rpc("get_order_items_for_guest", {
        p_order_id: id,
        p_token: token,
      })) as unknown as { data: OrderItemRow[] | null }) || {};
    items = itemData ?? [];
  } else {
    const { data: order } = await supabase.from("orders").select("*").eq("id", id).maybeSingle();
    if (!order) return null;
    rows = [order];
    const { data: itemRows } = await supabase.from("order_items").select("*").eq("order_id", id);
    items = itemRows ?? [];
  }

  return rowToOrder(rows[0], items);
}

export async function updateOrder(
  id: string,
  patch: {
    status?: OrderStatus;
    driverId?: string;
    depositId?: string;
    cancelReason?: string;
    deliveryFee?: number;
  },
) {
  const dbPatch: {
    status?: string;
    cancel_reason?: string | null;
    driver_id?: string | null;
    deposit_id?: string | null;
    delivery_fee?: number;
  } = {};
  if (patch.status) dbPatch.status = UI_TO_DB[patch.status];
  if (patch.cancelReason !== undefined) dbPatch.cancel_reason = patch.cancelReason;
  if (patch.driverId !== undefined) dbPatch.driver_id = patch.driverId || null;
  if (patch.depositId !== undefined) dbPatch.deposit_id = patch.depositId || null;
  if (patch.deliveryFee !== undefined) dbPatch.delivery_fee = patch.deliveryFee;
  if (Object.keys(dbPatch).length === 0) return;
  const { error } = await supabase.from("orders").update(dbPatch).eq("id", id);
  if (error) throw error;
}

export async function cancelOrder(id: string, reason: string) {
  const { error } = await supabase
    .from("orders")
    .update({ status: "cancelled", cancel_reason: reason })
    .eq("id", id);
  if (error) throw error;
}

/** Purge de test (admin) : supprime toutes les commandes. Les lignes `order_items`
 *  et `invoices` sont retirées automatiquement par la cascade `ON DELETE`. */
export async function purgeAllOrders(): Promise<void> {
  const { error } = await supabase
    .from("orders")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) throw error;
}

export type OrdersRealtimePayload = {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  new?: OrderRow | null;
  old?: OrderRow | null;
};

function logRealtimeError(channelName: string, status: string, err?: Error) {
  console.warn(`[realtime] canal ${channelName}: ${status}`, err);
}

const REALTIME_RETRIES_MAX = 10;
const REALTIME_RETRY_DELAY_MS = 2000;

/** Événement synthétique émis à la reconnexion du canal pour forcer un refetch. */
const REALTIME_RESYNC_EVENT: OrdersRealtimePayload = {
  eventType: "UPDATE",
  table: "orders",
  old: null,
  new: null,
};

/**
 * Souscription Realtime résiliente.
 *
 * En cas de `CHANNEL_ERROR` / `TIMED_OUT` / `CLOSED`, le canal est recréé
 * automatiquement avec un backoff exponentiel plafonné (2 s → 10 s) au lieu de
 * rester silencieusement mort jusqu'au rechargement de la page. À chaque
 * reconnexion, un événement de resynchronisation est émis pour déclencher un
 * refetch chez les consommateurs : ainsi un événement perdu — notamment un
 * DELETE de commande — ne peut plus laisser une "commande fantôme" dans l'état
 * local React.
 */
function subscribeOrdersResilient(
  channelPrefix: string,
  bind: (channel: RealtimeChannel) => RealtimeChannel,
  onData: (payload: OrdersRealtimePayload) => void,
): () => void {
  const name = `${channelPrefix}-${Math.random().toString(36).slice(2)}`;
  let channel: RealtimeChannel | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retries = 0;
  let disposed = false;

  const tearDown = () => {
    if (channel) {
      supabase.removeChannel(channel);
      channel = null;
    }
  };

  const start = () => {
    if (disposed) return;
    const ch = bind(supabase.channel(name));
    channel = ch;
    ch.subscribe((status, err) => {
      if (disposed) return;
      if (status === "SUBSCRIBED") {
        if (retries > 0) onData({ ...REALTIME_RESYNC_EVENT });
        retries = 0;
        return;
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        logRealtimeError(name, status, err);
        if (retries < REALTIME_RETRIES_MAX) {
          retries += 1;
          tearDown();
          retryTimer = setTimeout(start, REALTIME_RETRY_DELAY_MS * Math.min(retries, 5));
        }
      }
    });
  };

  start();

  return () => {
    disposed = true;
    if (retryTimer) clearTimeout(retryTimer);
    tearDown();
  };
}

export function subscribeOrders(cb: (payload: OrdersRealtimePayload) => void) {
  return subscribeOrdersResilient(
    "orders-live",
    (channel) =>
      channel
        .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, (payload) =>
          cb(payload as unknown as OrdersRealtimePayload),
        )
        .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, (payload) =>
          cb(payload as unknown as OrdersRealtimePayload),
        ),
    cb,
  );
}

/** Realtime limited to a single order (+ its items), avoids re-fetching on unrelated changes. */
export function subscribeOrder(orderId: string, cb: (payload: OrdersRealtimePayload) => void) {
  return subscribeOrdersResilient(
    "order-live",
    (channel) =>
      channel
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "orders", filter: `id=eq.${orderId}` },
          (payload) => cb(payload as unknown as OrdersRealtimePayload),
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "order_items", filter: `order_id=eq.${orderId}` },
          (payload) => cb(payload as unknown as OrdersRealtimePayload),
        ),
    cb,
  );
}

/** Applique un payload Realtime `UPDATE` sur la table `orders` à une commande locale. */
export function patchOrderFromRealtime(
  order: Order,
  payload: OrdersRealtimePayload | null | undefined,
): Order {
  if (!payload || payload.table !== "orders" || payload.eventType !== "UPDATE" || !payload.new) {
    return order;
  }
  const row = payload.new;
  return {
    ...order,
    status: toUiStatus(row.status),
    driverId: row.driver_id ?? order.driverId,
    depositId: row.deposit_id ?? order.depositId,
    deliveryFee: Number(row.delivery_fee ?? order.deliveryFee),
    customerLat: row.customer_lat != null ? Number(row.customer_lat) : order.customerLat,
    customerLng: row.customer_lng != null ? Number(row.customer_lng) : order.customerLng,
    distanceKm: row.distance_km != null ? Number(row.distance_km) : order.distanceKm,
  };
}

export function buildWhatsAppMessage(o: Order) {
  const lines = [
    "🔥 NOUVELLE COMMANDE - KONGO GAZ",
    `Commande N° : #${o.orderNumber}`,
    `Client : ${o.customer.fullName}`,
    `Tél : ${o.customer.phone}${o.customer.whatsapp ? " / " + o.customer.whatsapp : ""}`,
    `Adresse : ${o.address.commune}, ${o.address.quartier}, ${o.address.avenue} N°${o.address.parcelle}`,
    `Repère visuel : ${o.address.repere}`,
    "Articles :",
    ...o.items.map(
      (i) =>
        `  • ${i.qty} × ${i.label ?? i.bottleId} (${i.mode === "refill" ? "Recharge" : i.kit ? "Accessoire" : "Complète"})`,
    ),
    `Paiement : ${{ mpesa: "M-Pesa", orange: "Orange Money", airtel: "Airtel Money", cash: "Cash livraison" }[o.payment]}`,
    `Total à payer : ${new Intl.NumberFormat("fr-FR").format(o.total)} FC`,
    "Merci de confirmer la prise en charge !",
  ];
  return lines.join("\n");
}

export const KONGO_GAZ_WHATSAPP = "243899697012"; // Support client KONGO GAZ
