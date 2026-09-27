import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Truck } from "lucide-react";
import {
  getDeliverySettings,
  updateDeliverySettings,
  DEFAULT_DELIVERY_SETTINGS,
  computeDeliveryFee,
  type DeliverySettings,
} from "@/lib/delivery-pricing";
import { updateOrder } from "@/lib/orders-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const fmt = (n: number) => new Intl.NumberFormat("fr-FR").format(n) + " FC";

/** Barème global de livraison (forfait de base + prix/km + minimum). */
export function DeliveryScaleView() {
  const [s, setS] = useState<DeliverySettings>(DEFAULT_DELIVERY_SETTINGS);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getDeliverySettings()
      .then(setS)
      .catch(() => undefined);
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      await updateDeliverySettings(s);
      toast.success("Barème de livraison mis à jour");
    } catch {
      toast.error("Enregistrement impossible");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="glass rounded-2xl p-4">
        <h3 className="flex items-center gap-2 font-display text-sm font-extrabold">
          <Truck className="h-4 w-4" /> Barème de livraison (Dépôt ➔ Client)
        </h3>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Frais = forfait de base + (prix par km × distance GPS), jamais en dessous du minimum. Le
          retrait au dépôt reste à 0 FC.
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <label className="text-[11px] font-bold">
            Forfait de base (FC)
            <Input
              type="number"
              value={s.base_fee}
              onChange={(e) => setS({ ...s, base_fee: Number(e.target.value) || 0 })}
            />
          </label>
          <label className="text-[11px] font-bold">
            Prix par km (FC)
            <Input
              type="number"
              value={s.price_per_km}
              onChange={(e) => setS({ ...s, price_per_km: Number(e.target.value) || 0 })}
            />
          </label>
          <label className="text-[11px] font-bold">
            Minimum facturé (FC)
            <Input
              type="number"
              value={s.min_fee}
              onChange={(e) => setS({ ...s, min_fee: Number(e.target.value) || 0 })}
            />
          </label>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Button size="sm" disabled={busy} onClick={save}>
            Enregistrer le barème
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Exemples : 3 km → {fmt(computeDeliveryFee(s, 3))} · 7 km →{" "}
            {fmt(computeDeliveryFee(s, 7))} · 12 km → {fmt(computeDeliveryFee(s, 12))}
          </p>
        </div>
      </section>
    </div>
  );
}

/** Ajustement du frais de livraison d'une commande en cours. */
export function OrderFeeEditor({
  orderId,
  fee,
  distanceKm,
  onSaved,
}: {
  orderId: string;
  fee: number;
  distanceKm?: number | null;
  onSaved?: (fee: number) => void;
}) {
  const [value, setValue] = useState(String(fee));
  const [busy, setBusy] = useState(false);
  useEffect(() => setValue(String(fee)), [fee]);

  return (
    <div className="mt-2 flex items-center gap-2 rounded-lg border border-white/50 bg-white/55 p-2 backdrop-blur-sm">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        Frais {distanceKm != null ? `(~${distanceKm} km)` : ""}
      </span>
      <Input
        className="h-7 w-24 text-xs"
        type="number"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-[11px]"
        disabled={busy || Number(value) === fee}
        onClick={async () => {
          setBusy(true);
          try {
            const next = Number(value) || 0;
            await updateOrder(orderId, { deliveryFee: next });
            onSaved?.(next);
            toast.success("Frais de livraison mis à jour");
          } catch {
            toast.error("Mise à jour impossible");
          } finally {
            setBusy(false);
          }
        }}
      >
        OK
      </Button>
    </div>
  );
}
