import { supabase } from "@/integrations/supabase/client";
import type { Deposit } from "@/lib/deposits-api";

export type DeliverySettings = {
  base_fee: number;
  price_per_km: number;
  min_fee: number;
};

export const DEFAULT_DELIVERY_SETTINGS: DeliverySettings = {
  base_fee: 1000,
  price_per_km: 800,
  min_fee: 3000,
};

export async function getDeliverySettings(): Promise<DeliverySettings> {
  const { data } = await supabase
    .from("delivery_settings")
    .select("base_fee, price_per_km, min_fee")
    .maybeSingle();
  return (data as DeliverySettings | null) ?? DEFAULT_DELIVERY_SETTINGS;
}

export async function updateDeliverySettings(s: Partial<DeliverySettings>) {
  const { error } = await supabase.from("delivery_settings").update(s).eq("id", true);
  if (error) throw error;
}

/** Barème effectif : celui du dépôt s'il est défini, sinon le barème global. */
export function effectiveScale(
  settings: DeliverySettings,
  deposit?: Deposit | null,
): DeliverySettings {
  return {
    base_fee: deposit?.delivery_base_fee ?? settings.base_fee,
    price_per_km: deposit?.delivery_price_per_km ?? settings.price_per_km,
    min_fee: deposit?.delivery_min_fee ?? settings.min_fee,
  };
}

/** Distance à vol d'oiseau (km), formule de Haversine. */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Facteur d'itinéraire routier moyen appliqué à la distance à vol d'oiseau. */
const ROAD_FACTOR = 1.35;

export function roadDistanceKm(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
) {
  return Math.round(haversineKm(from, to) * ROAD_FACTOR * 10) / 10;
}

/** Frais de livraison arrondis à la centaine de FC, jamais sous le forfait minimum. */
export function computeDeliveryFee(scale: DeliverySettings, distanceKm: number | null): number {
  if (distanceKm == null) return scale.min_fee;
  const raw = scale.base_fee + scale.price_per_km * distanceKm;
  return Math.max(scale.min_fee, Math.round(raw / 100) * 100);
}

export function depositCoords(d?: Deposit | null) {
  if (d?.latitude != null && d?.longitude != null) {
    return { lat: Number(d.latitude), lng: Number(d.longitude) };
  }
  return null;
}

/** Position GPS du navigateur. */
export function getBrowserPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Géolocalisation indisponible sur cet appareil"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) => reject(new Error(e.message || "Position refusée")),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  });
}

export function directionsBetween(
  from: { lat: number; lng: number } | null,
  to: { lat: number; lng: number } | string,
) {
  const dest = typeof to === "string" ? to : `${to.lat},${to.lng}`;
  const origin = from ? `&origin=${from.lat},${from.lng}` : "";
  return `https://www.google.com/maps/dir/?api=1${origin}&destination=${encodeURIComponent(dest)}`;
}
