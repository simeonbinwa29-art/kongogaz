import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type DepositUpdate = Database["public"]["Tables"]["deposits"]["Update"];
type DepositInsert = Database["public"]["Tables"]["deposits"]["Insert"];
type DriverUpdate = Database["public"]["Tables"]["drivers"]["Update"];
type DriverInsert = Database["public"]["Tables"]["drivers"]["Insert"];

export type SubscriptionPlan = "standard" | "premium";
export type SubscriptionStatus = "active" | "expired";

export type Deposit = {
  id: string;
  name: string;

  commune: string;
  neighborhood: string | null;
  address: string | null;
  phone: string | null;
  whatsapp: string | null;
  manager_email: string | null;
  latitude: number | null;
  longitude: number | null;
  subscription_plan: SubscriptionPlan;
  subscription_status: SubscriptionStatus;
  valid_until: string | null;
  is_active: boolean;
  opening_hours: string | null;
  delivery_base_fee?: number | null;
  delivery_price_per_km?: number | null;
  delivery_min_fee?: number | null;
  created_at: string;
  updated_at: string;
};

export type Driver = {
  id: string;
  deposit_id: string | null;
  full_name: string;
  phone: string;
  zone: string | null;
  vehicle: string | null;
  is_available: boolean;
  created_at: string;
  updated_at: string;
};

export function isPremium(d: Deposit) {
  return d.subscription_plan === "premium" && d.subscription_status === "active";
}

/** Premium (actifs) d'abord, puis alphabétique. */
export function sortDeposits(list: Deposit[]) {
  return [...list].sort((a, b) => {
    const pa = isPremium(a) ? 0 : 1;
    const pb = isPremium(b) ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return a.name.localeCompare(b.name);
  });
}

export function mapsUrl(d: Deposit) {
  if (d.latitude != null && d.longitude != null) {
    return `https://www.google.com/maps/search/?api=1&query=${d.latitude},${d.longitude}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${d.name} ${d.address ?? ""} ${d.commune} Kinshasa`,
  )}`;
}

export async function listDeposits(): Promise<Deposit[]> {
  const { data, error } = await supabase.from("deposits").select("*");
  if (error || !data) return [];
  return sortDeposits(data as Deposit[]);
}

export async function listDepositsByCommune(commune: string): Promise<Deposit[]> {
  const { data, error } = await supabase
    .from("deposits")
    .select("*")
    .eq("is_active", true)
    .eq("commune", commune);
  if (error || !data) return [];
  return sortDeposits(data as Deposit[]);
}

const DEPOSIT_COLUMNS = [
  "name",
  "commune",
  "neighborhood",
  "address",
  "phone",
  "whatsapp",
  "manager_email",
  "latitude",
  "longitude",
  "subscription_plan",
  "subscription_status",
  "valid_until",
  "is_active",
  "opening_hours",
  "delivery_base_fee",
  "delivery_price_per_km",
  "delivery_min_fee",
] as const;

/** Ne garde que les colonnes réelles de la table (évite les rejets Supabase). */
function cleanDeposit(d: Partial<Deposit>): DepositInsert {
  const out: Record<string, unknown> = {};
  for (const k of DEPOSIT_COLUMNS) {
    const v = (d as Record<string, unknown>)[k];
    if (v === undefined) continue;
    out[k] = v === "" ? null : v;
  }
  if (typeof out.name === "string") out.name = (out.name as string).trim();
  if (typeof out.commune === "string") out.commune = (out.commune as string).trim();
  return out as DepositInsert;
}

export async function upsertDeposit(d: Partial<Deposit>) {
  const payload = cleanDeposit(d);
  if (d.id) {
    const { error } = await supabase
      .from("deposits")
      .update(payload as DepositUpdate)
      .eq("id", d.id);
    if (error) throw error;
    return d.id;
  }
  if (!d.name?.trim() || !d.commune?.trim()) {
    throw new Error("Nom du dépôt et commune requis");
  }
  const { data, error } = await supabase.from("deposits").insert(payload).select("id").single();
  if (error) throw error;
  return data.id as string;
}

export async function deleteDeposit(id: string) {
  const { error } = await supabase.from("deposits").delete().eq("id", id);
  if (error) throw error;
}

export async function extendSubscription(id: string, days: number) {
  const { error } = await supabase.rpc("extend_deposit_subscription", {
    _deposit_id: id,
    _days: days,
  });
  if (error) throw error;
}

/* ---------------- Drivers ---------------- */

export async function listDrivers(depositId?: string): Promise<Driver[]> {
  let q = supabase.from("drivers").select("*");
  if (depositId) q = q.eq("deposit_id", depositId);
  const { data, error } = await q;
  if (error || !data) return [];
  return (data as Driver[]).sort((a, b) => a.full_name.localeCompare(b.full_name));
}

const DRIVER_COLUMNS = [
  "deposit_id",
  "full_name",
  "phone",
  "zone",
  "vehicle",
  "is_available",
] as const;

function cleanDriver(d: Partial<Driver>): DriverInsert {
  const out: Record<string, unknown> = {};
  for (const k of DRIVER_COLUMNS) {
    const v = (d as Record<string, unknown>)[k];
    if (v === undefined) continue;
    out[k] = typeof v === "string" ? (v.trim() === "" ? null : v.trim()) : v;
  }
  return out as DriverInsert;
}

export async function upsertDriver(d: Partial<Driver> & { full_name: string; phone: string }) {
  const payload = cleanDriver(d);
  if (d.id) {
    const { error } = await supabase
      .from("drivers")
      .update(payload as DriverUpdate)
      .eq("id", d.id);
    if (error) throw error;
    return d.id;
  }
  const { data, error } = await supabase.from("drivers").insert(payload).select("id").single();
  if (error) throw error;
  return data.id as string;
}

export async function deleteDriver(id: string) {
  const { error } = await supabase.from("drivers").delete().eq("id", id);
  if (error) throw error;
}

/** Rattache (ou détache si depositId = null) un livreur existant à un dépôt. */
export async function setDriverDeposit(driverId: string, depositId: string | null) {
  const { error } = await supabase
    .from("drivers")
    .update({ deposit_id: depositId })
    .eq("id", driverId);
  if (error) throw error;
}

/**
 * Livreurs proposables pour l'attribution d'une commande : tous les livreurs
 * actifs (`is_available`) disponibles, plus le livreur déjà assigné (même s'il
 * est momentanément indisponible) pour conserver la sélection à l'écran.
 *
 * Aucun filtre de commune/dépôt n'est appliqué : la lecture de la table
 * `drivers` est ouverte ("Public read drivers"), elle n'est donc jamais bloquée
 * par RLS ou par la zone du livreur.
 */
export function selectableOrderDrivers(drivers: Driver[], assignedDriverId?: string): Driver[] {
  return [...drivers]
    .filter((d) => d.is_available || d.id === assignedDriverId)
    .sort((a, b) => {
      if (a.id === assignedDriverId) return -1;
      if (b.id === assignedDriverId) return 1;
      return a.full_name.localeCompare(b.full_name);
    });
}

export async function getDriverById(id: string, token?: string): Promise<Driver | null> {
  if (token) {
    // Invité : le livreur n'est retourné que si le token du lien correspond à
    // une commande à laquelle ce livreur est (ou a été) rattaché.
    const { data } =
      ((await supabase.rpc("get_driver_for_guest", {
        p_driver_id: id,
        p_token: token,
      })) as unknown as { data: Driver[] | null }) || {};
    return data?.[0] ?? null;
  }
  const { data } = await supabase.from("drivers").select("*").eq("id", id).maybeSingle();
  return (data as Driver | null) ?? null;
}

/* ---------------- Realtime ---------------- */

export function subscribeDeposits(cb: () => void) {
  const channel = supabase
    .channel("deposits-live-" + Math.random().toString(36).slice(2))
    .on("postgres_changes", { event: "*", schema: "public", table: "deposits" }, cb)
    .on("postgres_changes", { event: "*", schema: "public", table: "drivers" }, cb)
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

/* ---------------- Rattachement gérant / itinéraire ---------------- */

export async function getDepositById(id: string): Promise<Deposit | null> {
  const { data } = await supabase.from("deposits").select("*").eq("id", id).maybeSingle();
  return (data as Deposit | null) ?? null;
}

/** Lien Google Maps « itinéraire » vers le dépôt (Click & Collect). */
export function directionsUrl(d: Deposit) {
  const dest =
    d.latitude != null && d.longitude != null
      ? `${d.latitude},${d.longitude}`
      : `${d.name} ${d.address ?? ""} ${d.commune} Kinshasa`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
}
