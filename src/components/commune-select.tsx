import { useMemo, useState } from "react";
import { Check, ChevronDown, MapPin, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { searchCommunes, districtOf } from "@/lib/kinshasa";

/** Sélecteur des 24 communes de Kinshasa avec recherche rapide, groupé par district. */
export function CommuneSelect({
  value,
  onChange,
  placeholder = "Choisir une commune",
  className = "",
}: {
  value: string;
  onChange: (commune: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const groups = useMemo(() => searchCommunes(query), [query]);
  const district = value ? districtOf(value) : undefined;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          className={`flex w-full items-center gap-2 rounded-xl border border-white/50 bg-white/55 px-3 py-2.5 text-left text-sm outline-none backdrop-blur-sm ${className}`}
        >
          <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className={`min-w-0 flex-1 truncate ${value ? "" : "text-muted-foreground"}`}>
            {value || placeholder}
            {district && (
              <span className="ml-1 text-[11px] text-muted-foreground">· district {district}</span>
            )}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="border-b border-white/50 px-4 py-3 text-left">
          <DialogTitle className="font-display text-base font-extrabold">
            Communes de Kinshasa
          </DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-2 border-b border-white/50 px-4 py-2.5">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher une commune ou un district…"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="max-h-[60vh] overflow-y-auto px-2 py-2">
          {groups.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              Aucune commune pour « {query} ».
            </p>
          )}
          {groups.map((g) => (
            <div key={g.district} className="mb-2">
              <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                District de {g.district}
              </p>
              {g.communes.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    onChange(c);
                    setOpen(false);
                    setQuery("");
                  }}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <span>{c}</span>
                  {c === value && <Check className="h-4 w-4" style={{ color: "var(--flame)" }} />}
                </button>
              ))}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
