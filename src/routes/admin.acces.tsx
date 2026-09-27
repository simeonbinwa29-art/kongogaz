import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Flame, KeyRound, Loader2, LogOut, ShieldCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/theme-toggle";
import { isAdminUser } from "@/lib/admin-api";
import { grantMasterAdminRole } from "@/lib/master-admin-server";
import { MASTER_ADMIN_EMAIL, MASTER_ADMIN_PHONE } from "@/lib/phone";

type GateState = { kind: "checking" } | { kind: "form" } | { kind: "wrong-account"; email: string };

export const Route = createFileRoute("/admin/acces")({
  head: () => ({
    meta: [{ title: "Accès administrateur — KONGO GAZ" }, { name: "robots", content: "noindex" }],
  }),
  component: AdminAccessPage,
});

function AdminAccessPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<GateState>({ kind: "checking" });

  // Vérifie la session avant d'afficher quoi que ce soit. On ne redirige plus
  // silencieusement : un simple `navigate("/auth")` envoyait l'utilisateur vers la
  // page client, qui renvoyait à son tour vers "/", sans aucune explication.
  useEffect(() => {
    let alive = true;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!alive) return;
      if (!session?.user) {
        sessionStorage.setItem("bg_redirect_after_auth", "/admin/acces");
        navigate({ to: "/auth", replace: true });
        return;
      }
      if (session.user.email !== MASTER_ADMIN_EMAIL) {
        setState({ kind: "wrong-account", email: session.user.email ?? "" });
        return;
      }
      if (await isAdminUser(session.user.id)) {
        if (alive) navigate({ to: "/admin", replace: true });
        return;
      }
      if (alive) setState({ kind: "form" });
    })();

    return () => {
      alive = false;
    };
  }, [navigate]);

  const signOut = async () => {
    await supabase.auth.signOut();
    sessionStorage.setItem("bg_redirect_after_auth", "/admin/acces");
    navigate({ to: "/auth", replace: true });
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !password) return;
    setBusy(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setBusy(false);
      toast.error("Session expirée", { description: "Reconnectez-vous puis réessayez." });
      return;
    }

    try {
      await grantMasterAdminRole({
        data: { adminPassword: password, accessToken: session.access_token },
      });
      toast.success("Accès administrateur activé", {
        description: "Redirection vers le tableau de bord…",
      });
      // Le champ est vidé avant la navigation pour ne pas laisser le secret en mémoire.
      setPassword("");
      navigate({ to: "/admin", replace: true });
    } catch (err) {
      setPassword("");
      toast.error("Accès refusé", {
        description: err instanceof Error ? err.message : "Mot de passe incorrect.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen px-4 py-8" style={{ background: "var(--gradient-night)" }}>
      <div className="mx-auto flex max-w-md flex-col items-center gap-6 pt-6">
        <div className="grid h-16 w-16 place-items-center rounded-2xl bg-white/10 backdrop-blur">
          <ShieldCheck className="h-8 w-8 text-white" style={{ color: "var(--flame)" }} />
        </div>

        <div className="text-center text-white">
          <h1 className="font-display text-2xl font-extrabold">Accès administrateur</h1>
          <p className="mt-1 text-sm text-white/70">
            Confirmez votre identité pour ouvrir le tableau de bord.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-white/50">
            Ce mot de passe est <strong>différent</strong> de votre mot de passe de compte : il est
            demandé une seule fois, pour ouvrir l'accès administrateur.
          </p>
        </div>

        <div className="glass w-full rounded-3xl p-5 shadow-xl">
          {state.kind === "checking" ? (
            <div className="grid place-items-center py-6 text-white/70">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : state.kind === "wrong-account" ? (
            <div className="space-y-3 text-center">
              <p className="flex items-start gap-2 rounded-lg bg-amber-500/15 px-3 py-2.5 text-left text-sm leading-relaxed text-amber-100">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Vous êtes connecté avec <strong>{state.email}</strong>, qui n'est pas le compte
                  administrateur. Déconnectez-vous, puis reconnectez-vous avec le{" "}
                  <strong>{MASTER_ADMIN_PHONE}</strong>.
                </span>
              </p>
              <button
                type="button"
                onClick={signOut}
                className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 font-semibold text-white transition hover:opacity-90"
                style={{ background: "var(--flame)" }}
              >
                <LogOut className="h-4 w-4" />
                Se déconnecter
              </button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-3">
              <Field icon={<KeyRound className="h-4 w-4" />} label="Mot de passe administrateur">
                <Input
                  type="password"
                  required
                  autoFocus
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </Field>

              <button
                type="submit"
                disabled={busy || !password}
                className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 font-semibold text-white transition disabled:opacity-50"
                style={{ background: "var(--flame)" }}
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {busy ? "Vérification…" : "Déverrouiller le tableau de bord"}
              </button>

              <p className="flex items-center justify-center gap-1.5 pt-1 text-center text-xs text-white/50">
                <Flame className="h-3 w-3" />
                Kongo Gaz
              </p>
            </form>
          )}
        </div>

        <ThemeToggle />
      </div>
    </div>
  );
}

function Field({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5 text-white/80">
        {icon}
        {label}
      </Label>
      {children}
    </div>
  );
}
