import { useEffect, useState } from "react";
import {
  MapPin,
  Plus,
  Star,
  Trash2,
  CalendarClock,
  Truck,
  LocateFixed,
  Unlink,
} from "lucide-react";
import { toast } from "sonner";
import {
  listDeposits,
  listDrivers,
  subscribeDeposits,
  upsertDeposit,
  deleteDeposit,
  setDriverDeposit,
  extendSubscription,
  isPremium,
  mapsUrl,
  type Deposit,
  type Driver,
} from "@/lib/deposits-api";
import { CommuneSelect } from "@/components/commune-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const EMPTY: Partial<Deposit> = {
  name: "",
  commune: "Gombe",
  neighborhood: "",
  address: "",
  phone: "",
  whatsapp: "",
  manager_email: "",
  opening_hours: "",
  subscription_plan: "standard",
  subscription_status: "active",
  is_active: true,
};

function daysLeft(d: Deposit) {
  if (!d.valid_until) return null;
  const t = new Date(d.valid_until).getTime();
  return Number.isFinite(t) ? Math.ceil((t - Date.now()) / 86_400_000) : null;
}

export function DepositsAdminView() {
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [draft, setDraft] = useState<Partial<Deposit>>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState<Record<string, string>>({});

  const reload = () => {
    listDeposits().then((d) => setDeposits(d ?? []));
    listDrivers().then((list) => {
      const safe = list ?? [];
      console.log("[admin-deposits] livreurs chargés:", safe.length, safe);
      setDrivers(safe);
    });
  };

  useEffect(() => {
    reload();
    return subscribeDeposits(reload);
  }, []);

  const save = async () => {
    if (!draft.name?.trim()) return toast.error("Nom du dépôt requis");
    if (!draft.commune?.trim()) return toast.error("Commune requise");
    setBusy(true);
    try {
      await upsertDeposit({ ...(draft as Deposit), id: editingId ?? undefined });
      toast.success(editingId ? "Dépôt mis à jour" : "Dépôt créé");
      setDraft(EMPTY);
      setEditingId(null);
      reload();
    } catch (e) {
      console.error(e);
      toast.error("Enregistrement impossible", {
        description: (e as { message?: string })?.message ?? "Connectez-vous avec le compte admin.",
      });
    } finally {
      setBusy(false);
    }
  };

  const useMyPosition = () => {
    if (!navigator.geolocation) return toast.error("GPS indisponible");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDraft((d) => ({
          ...d,
          latitude: Number(pos.coords.latitude.toFixed(6)),
          longitude: Number(pos.coords.longitude.toFixed(6)),
        }));
        toast.success("Position GPS enregistrée");
      },
      () => toast.error("Position refusée"),
    );
  };

  const patch = async (id: string, values: Partial<Deposit>) => {
    try {
      await upsertDeposit({ ...values, id });
      reload();
    } catch {
      toast.error("Mise à jour impossible");
    }
  };

  const norm = (s: string) => s.trim().toLowerCase();
  const matchesZone = (dr: Driver, dep: Deposit) =>
    !!dr.zone && norm(dr.zone).includes(norm(dep.commune));

  /** TOUS les livreurs, sans filtre de commune ; zone correspondante en tête. */
  const availableFor = (dep: Deposit) =>
    [...(drivers ?? [])].sort((a, b) => {
      const za = matchesZone(a, dep) ? 0 : 1;
      const zb = matchesZone(b, dep) ? 0 : 1;
      if (za !== zb) return za - zb;
      return a.full_name.localeCompare(b.full_name);
    });

  const attach = async (depositId: string) => {
    const driverId = pick[depositId];
    if (!driverId) return toast.error("Sélectionnez un livreur");
    try {
      await setDriverDeposit(driverId, depositId);
      setPick({ ...pick, [depositId]: "" });
      toast.success("Livreur rattaché au dépôt");
      reload();
    } catch (e) {
      console.error(e);
      toast.error("Rattachement impossible", {
        description: (e as { message?: string })?.message ?? "Connectez-vous avec le compte admin.",
      });
    }
  };

  const detach = async (dr: Driver) => {
    try {
      await setDriverDeposit(dr.id, null);
      toast.success(`${dr.full_name} détaché`);
      reload();
    } catch (e) {
      console.error(e);
      toast.error("Détachement impossible", {
        description: (e as { message?: string })?.message ?? "Connectez-vous avec le compte admin.",
      });
    }
  };

  const extend = (id: string, days: number) => {
    extendSubscription(id, days)
      .then(reload)
      .catch((e) => {
        console.error(e);
        toast.error("Extension impossible", {
          description:
            (e as { message?: string })?.message ?? "Connectez-vous avec le compte admin.",
        });
      });
  };

  const removeDeposit = (d: Deposit) => {
    if (!confirm(`Supprimer ${d.name} ?`)) return;
    deleteDeposit(d.id)
      .then(reload)
      .catch((e) => {
        console.error(e);
        toast.error("Suppression impossible", {
          description:
            (e as { message?: string })?.message ?? "Connectez-vous avec le compte admin.",
        });
      });
  };

  return (
    <div className="space-y-5">
      <section className="glass rounded-2xl p-4">
        <h3 className="font-display text-sm font-extrabold">
          {editingId ? "Modifier le dépôt" : "Nouveau dépôt partenaire"}
        </h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Input
            placeholder="Nom du dépôt"
            value={draft.name ?? ""}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          <CommuneSelect
            value={draft.commune ?? ""}
            onChange={(c) => setDraft({ ...draft, commune: c })}
            className="h-9 py-1.5"
          />
          <Input
            placeholder="Quartier"
            value={draft.neighborhood ?? ""}
            onChange={(e) => setDraft({ ...draft, neighborhood: e.target.value })}
          />
          <Input
            placeholder="Adresse"
            value={draft.address ?? ""}
            onChange={(e) => setDraft({ ...draft, address: e.target.value })}
          />
          <Input
            placeholder="Téléphone"
            value={draft.phone ?? ""}
            onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
          />
          <Input
            placeholder="WhatsApp"
            value={draft.whatsapp ?? ""}
            onChange={(e) => setDraft({ ...draft, whatsapp: e.target.value })}
          />
          <Input
            type="email"
            placeholder="E-mail du gérant (pour notifications)"
            value={draft.manager_email ?? ""}
            onChange={(e) => setDraft({ ...draft, manager_email: e.target.value })}
          />
          <Input
            placeholder="Horaires (ex: Lun-Sam 7h-19h)"
            value={draft.opening_hours ?? ""}
            onChange={(e) => setDraft({ ...draft, opening_hours: e.target.value })}
          />
          <div className="flex gap-2">
            <Input
              placeholder="Latitude"
              value={draft.latitude ?? ""}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  latitude: e.target.value.trim() === "" ? null : Number(e.target.value),
                })
              }
            />
            <Input
              placeholder="Longitude"
              value={draft.longitude ?? ""}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  longitude: e.target.value.trim() === "" ? null : Number(e.target.value),
                })
              }
            />
          </div>
          <Button size="sm" variant="outline" onClick={useMyPosition}>
            <LocateFixed className="mr-1 h-3.5 w-3.5" /> Utiliser ma position
          </Button>
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={draft.subscription_plan ?? "standard"}
            onChange={(e) =>
              setDraft({
                ...draft,
                subscription_plan: e.target.value as Deposit["subscription_plan"],
              })
            }
          >
            <option value="standard">Forfait Standard</option>
            <option value="premium">Forfait Premium ⭐</option>
          </select>
          <Input
            type="date"
            value={draft.valid_until ?? ""}
            onChange={(e) => setDraft({ ...draft, valid_until: e.target.value })}
          />
        </div>
        <div className="mt-3 flex gap-2">
          <Button size="sm" disabled={busy} onClick={save}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            {editingId ? "Enregistrer" : "Ajouter le dépôt"}
          </Button>
          {editingId && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraft(EMPTY);
                setEditingId(null);
              }}
            >
              Annuler
            </Button>
          )}
        </div>
      </section>

      <div className="space-y-3">
        {deposits.length === 0 && (
          <p className="text-xs text-muted-foreground">Aucun dépôt partenaire enregistré.</p>
        )}
        {deposits.map((d) => {
          const left = daysLeft(d);
          const expired = d.subscription_status === "expired" || (left !== null && left < 0);
          const fleet = drivers.filter((x) => x.deposit_id === d.id);

          return (
            <article key={d.id} className="glass rounded-2xl p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-display text-sm font-extrabold">{d.name}</p>
                  <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <MapPin className="h-3 w-3" /> {d.commune}
                    {d.neighborhood ? ` · ${d.neighborhood}` : ""}
                  </p>
                </div>
                {isPremium(d) && !expired ? (
                  <span
                    className="flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold text-white"
                    style={{ background: "var(--gradient-flame)" }}
                  >
                    <Star className="h-3 w-3" /> Partenaire Prioritaire
                  </span>
                ) : (
                  <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-bold text-muted-foreground">
                    {expired ? "Abonnement expiré" : "Standard"}
                  </span>
                )}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                <p>
                  <span className="text-muted-foreground">Échéance : </span>
                  <b>{d.valid_until ?? "—"}</b>
                  {left !== null && (
                    <span className={left < 7 ? "text-destructive" : "text-muted-foreground"}>
                      {" "}
                      ({left} j)
                    </span>
                  )}
                </p>
                <p className="flex items-center gap-1">
                  <Truck className="h-3 w-3" /> {fleet.length} livreur{fleet.length > 1 ? "s" : ""}
                </p>
              </div>

              {/* Livreurs rattachés */}
              <div className="mt-3 rounded-xl border border-white/50 bg-white/55 p-2 backdrop-blur-sm">
                <p className="text-[11px] font-bold">Livreurs affiliés</p>
                <div className="mt-2 space-y-1">
                  {fleet.length === 0 && (
                    <p className="text-[11px] text-muted-foreground">Aucun livreur rattaché.</p>
                  )}
                  {fleet.map((dr) => (
                    <div
                      key={dr.id}
                      className="flex items-center justify-between rounded-lg bg-muted/50 px-2 py-1 text-[11px]"
                    >
                      <span>
                        <b>{dr.full_name}</b> · {dr.phone}
                        {dr.zone ? ` · ${dr.zone}` : ""}
                        {dr.vehicle ? ` · ${dr.vehicle}` : ""}
                      </span>
                      <button
                        onClick={() => detach(dr)}
                        className="rounded-md border border-white/50 bg-white/60 px-2 py-0.5 text-[10px] font-bold hover:bg-white/85 backdrop-blur-sm"
                        aria-label="Détacher le livreur"
                      >
                        <Unlink className="mr-1 inline h-3 w-3" /> Détacher
                      </button>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <select
                    className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-xs"
                    value={pick[d.id] ?? ""}
                    onChange={(e) => setPick({ ...pick, [d.id]: e.target.value })}
                  >
                    <option value="">Sélectionner un livreur…</option>
                    {drivers.length === 0 && (
                      <option value="" disabled>
                        Aucun livreur trouvé dans la base
                      </option>
                    )}
                    {availableFor(d).map((dr) => (
                      <option key={dr.id} value={dr.id}>
                        {matchesZone(dr, d) ? "⭐ " : ""}
                        {dr.full_name} ({dr.phone}) - {dr.zone || "commune —"}
                        {dr.deposit_id === d.id
                          ? " · déjà dans ce dépôt"
                          : dr.deposit_id
                            ? " · déjà rattaché"
                            : ""}
                      </option>
                    ))}
                  </select>
                  <Button size="sm" variant="outline" onClick={() => attach(d.id)}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> Rattacher
                  </Button>
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  ⭐ = zone du livreur correspondant à {d.commune}. Créez de nouveaux livreurs dans
                  l'onglet « Livreurs ».
                </p>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => extend(d.id, 30)}>
                  <CalendarClock className="mr-1 h-3.5 w-3.5" /> +30 j
                </Button>
                <Button size="sm" variant="outline" onClick={() => extend(d.id, 365)}>
                  +1 an
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    patch(d.id, {
                      subscription_plan: d.subscription_plan === "premium" ? "standard" : "premium",
                    })
                  }
                >
                  {d.subscription_plan === "premium" ? "Passer Standard" : "Passer Premium ⭐"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    patch(d.id, {
                      subscription_status: expired ? "active" : "expired",
                    })
                  }
                >
                  {expired ? "Réactiver" : "Suspendre"}
                </Button>
                <a
                  href={mapsUrl(d)}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md border border-white/50 bg-white/60 px-3 py-1.5 text-[11px] font-bold backdrop-blur-sm"
                >
                  Carte
                </a>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setDraft(d);
                    setEditingId(d.id);
                  }}
                >
                  Modifier
                </Button>
                <Button size="sm" variant="ghost" onClick={() => removeDeposit(d)}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
