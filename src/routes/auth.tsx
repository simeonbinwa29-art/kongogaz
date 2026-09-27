import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Flame, Lock, User as UserIcon, Phone, MapPin, Loader2, Gift } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { KINSHASA_COMMUNES } from "@/lib/kinshasa";
import { normalizePhone, phoneToAuthIdentifier, isMasterAdminPhone } from "@/lib/phone";

type AuthErrorLike = { message?: string; code?: string; status?: number | null };

const RATE_LIMIT_CODES = new Set([
  "over_request_rate_limit",
  "over_email_send_rate_limit",
  "over_sms_send_rate_limit",
]);

function isRateLimited(err: AuthErrorLike): boolean {
  return (
    (err.code != null && RATE_LIMIT_CODES.has(err.code)) ||
    err.status === 429 ||
    /rate limit|trop de tentatives/i.test(err.message ?? "")
  );
}

function isInvalidCredentials(err: AuthErrorLike): boolean {
  return err.code === "invalid_credentials" || /invalid login credentials/i.test(err.message ?? "");
}

function isAlreadyRegistered(err: AuthErrorLike): boolean {
  return (
    err.code === "user_already_exists" ||
    /user already registered|email already registered|already been registered/i.test(
      err.message ?? "",
    )
  );
}

function isNetworkError(err: AuthErrorLike): boolean {
  return /failed to fetch|network|connexion/i.test(err.message ?? "") && !isRateLimited(err);
}

const COLLAPSED_MESSAGE = "Une erreur est survenue. Réessayez dans un instant.";

/** Traduit une erreur Supabase en message clair et convivial pour l'utilisateur. */
function friendlyAuthError(
  err: AuthErrorLike,
  kind: "signin" | "signup",
): { title: string; description: string } {
  if (isRateLimited(err)) {
    return {
      title: "Trop de tentatives",
      description: "Patientez quelques minutes avant de réessayer.",
    };
  }
  if (err.code === "email_not_confirmed") {
    return {
      title: "Compte non confirmé",
      description: "Contactez le support KONGO GAZ pour activer votre compte.",
    };
  }
  if (kind === "signin" && isInvalidCredentials(err)) {
    return {
      title: "Numéro ou mot de passe incorrect",
      description: "Vérifiez vos identifiants, puis réessayez.",
    };
  }
  if (kind === "signup" && isAlreadyRegistered(err)) {
    return {
      title: "Numéro déjà enregistré",
      description: "Un compte existe déjà avec ce numéro. Connectez-vous pour continuer.",
    };
  }
  if (kind === "signup" && /weak password/i.test(err.message ?? "")) {
    return {
      title: "Mot de passe trop faible",
      description: "Utilisez au moins 6 caractères.",
    };
  }
  if (isNetworkError(err)) {
    return {
      title: "Connexion impossible",
      description: "Vérifiez votre connexion internet, puis réessayez.",
    };
  }
  return kind === "signin"
    ? { title: "Connexion impossible", description: COLLAPSED_MESSAGE }
    : { title: "Inscription impossible", description: COLLAPSED_MESSAGE };
}

/** Verrouille le bouton de soumission après un échec (ex. limite de débit 429) pour ne pas saturer l'API. */
function useRateLimitLock(seconds = 60) {
  const [lockedUntil, setLockedUntil] = useState(0);
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (lockedUntil <= Date.now()) return;
    const t = window.setInterval(() => forceTick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [lockedUntil]);

  const remaining = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
  return { remaining, lock: () => setLockedUntil(Date.now() + seconds * 1000) };
}

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Connexion — Kongo Gaz" },
      {
        name: "description",
        content:
          "Connectez-vous ou créez un compte Kongo Gaz pour commander votre gaz à domicile à Kinshasa.",
      },
      { property: "og:title", content: "Connexion — Kongo Gaz" },
      { property: "og:description", content: "Espace client Kongo Gaz Kinshasa." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) {
      const redirect =
        typeof window !== "undefined" ? sessionStorage.getItem("bg_redirect_after_auth") : null;
      if (redirect) sessionStorage.removeItem("bg_redirect_after_auth");
      navigate({ to: redirect || "/" });
    }
  }, [user, loading, navigate]);

  return (
    <div className="min-h-screen px-4 py-8" style={{ background: "var(--gradient-night)" }}>
      <div className="mx-auto flex max-w-md flex-col items-center gap-6 pt-6">
        <div className="grid h-16 w-16 place-items-center rounded-2xl bg-white/10 backdrop-blur">
          <Flame className="h-8 w-8 text-white" style={{ color: "var(--flame)" }} />
        </div>
        <div className="text-center text-white">
          <h1 className="font-display text-3xl font-extrabold">Kongo Gaz</h1>
          <p className="mt-1 text-sm text-white/70">Gaz livré à domicile à Kinshasa</p>
        </div>

        <div className="glass w-full rounded-3xl p-5 shadow-xl">
          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Se connecter</TabsTrigger>
              <TabsTrigger value="signup">Créer un compte</TabsTrigger>
            </TabsList>
            <TabsContent value="signin" className="mt-4">
              <SignInForm />
            </TabsContent>
            <TabsContent value="signup" className="mt-4">
              <SignUpForm />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function SignInForm() {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const { remaining, lock } = useRateLimitLock();
  const locked = remaining > 0;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || locked) return;
    const normalized = normalizePhone(phone);
    if (!normalized) {
      toast.error("Numéro invalide", {
        description: "Ex : +243 8XX XXX XXX ou 089 XXX XXX.",
      });
      return;
    }
    setBusy(true);
    const isMaster = isMasterAdminPhone(normalized);
    if (isMaster && typeof window !== "undefined") {
      // La session existe à ce stade : on vise directement l'écran du mot de
      // passe administrateur plutôt que de rebondir via /admin.
      sessionStorage.setItem("bg_redirect_after_auth", "/admin/acces");
    }
    const { data, error } = await supabase.auth.signInWithPassword({
      email: phoneToAuthIdentifier(normalized),
      password,
    });
    setBusy(false);
    if (error) {
      if (isMaster && typeof window !== "undefined") {
        sessionStorage.removeItem("bg_redirect_after_auth");
      }
      if (isRateLimited(error)) lock();
      const { title, description } = friendlyAuthError(error, "signin");
      toast.error(title, { description });
      return;
    }
    if (isMaster && data.user) {
      // Le rôle admin n'est plus accordé ici : il exige le mot de passe
      // administrateur, saisi une seule fois sur /admin/acces.
      toast.success("Connecté en tant qu'administrateur", {
        description: "Saisissez votre mot de passe administrateur pour ouvrir le tableau de bord.",
      });
      return;
    }
    toast.success("Connecté !");
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Field icon={<Phone className="h-4 w-4" />} label="Numéro de téléphone">
        <Input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+243 8XX XXX XXX"
        />
      </Field>
      <Field icon={<Lock className="h-4 w-4" />} label="Mot de passe">
        <Input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
      </Field>
      {isMasterAdminPhone(normalizePhone(phone) || "") && (
        <p className="rounded-lg bg-white/10 px-3 py-2 text-xs leading-relaxed text-white/80">
          Compte administrateur : saisissez ici votre <strong>mot de passe de compte</strong>. Le{" "}
          <strong>mot de passe administrateur</strong> vous sera demandé à l'étape suivante.
        </p>
      )}
      <button
        type="submit"
        disabled={busy || locked}
        className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
        style={{ background: "var(--gradient-flame)" }}
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {busy ? "Connexion…" : locked ? `Réessayer dans ${remaining} s` : "Se connecter"}
      </button>
    </form>
  );
}

function SignUpForm() {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [commune, setCommune] = useState("Gombe");
  const [password, setPassword] = useState("");
  const [referral, setReferral] = useState("");
  const [busy, setBusy] = useState(false);
  const { remaining, lock } = useRateLimitLock();
  const locked = remaining > 0;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || locked) return;
    const normalized = normalizePhone(phone);
    if (!normalized) {
      toast.error("Numéro invalide", {
        description: "Ex : +243 8XX XXX XXX ou 089 XXX XXX.",
      });
      return;
    }
    setBusy(true);
    const isMaster = isMasterAdminPhone(normalized);
    if (isMaster && typeof window !== "undefined") {
      sessionStorage.setItem("bg_redirect_after_auth", "/admin");
    }
    const { data, error } = await supabase.auth.signUp({
      email: phoneToAuthIdentifier(normalized),
      password,
      options: {
        data: {
          full_name: fullName.trim(),
          phone_whatsapp: normalized,
          default_commune: commune,
          referral_code: referral.trim().toUpperCase() || null,
        },
      },
    });
    setBusy(false);
    const clearMasterRedirect = () => {
      if (isMaster && typeof window !== "undefined") {
        sessionStorage.removeItem("bg_redirect_after_auth");
      }
    };
    if (error) {
      clearMasterRedirect();
      if (isRateLimited(error)) lock();
      const { title, description } = friendlyAuthError(error, "signup");
      toast.error(title, { description });
      return;
    }
    const alreadyExists = !data.user;
    if (alreadyExists) {
      clearMasterRedirect();
      toast.error("Numéro déjà enregistré", {
        description: "Un compte existe déjà avec ce numéro. Connectez-vous pour continuer.",
      });
      return;
    }
    if (isMaster && data.user) {
      // Le rôle admin n'est pas accordé ici : il exige le mot de passe
      // administrateur, saisi une seule fois sur /admin/acces.
      toast.success("Compte administrateur créé !", {
        description: data.session
          ? "Saisissez votre mot de passe administrateur pour ouvrir le tableau de bord."
          : "Connectez-vous, puis saisissez votre mot de passe administrateur.",
      });
      return;
    }
    // `mailer_autoconfirm` peut être actif : la session existe déjà, l'effet
    // ligne 131 redirige. Sinon une confirmation d'e-mail reste nécessaire.
    toast.success("Compte créé !", {
      description: data.session
        ? "Vous êtes connecté. Redirection…"
        : "Connectez-vous avec votre numéro de téléphone.",
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Field icon={<UserIcon className="h-4 w-4" />} label="Nom complet">
        <Input
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Jean Kabila"
        />
      </Field>
      <Field icon={<Phone className="h-4 w-4" />} label="Numéro de téléphone">
        <Input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+243 8XX XXX XXX"
        />
      </Field>
      <Field icon={<MapPin className="h-4 w-4" />} label="Commune par défaut">
        <select
          value={commune}
          onChange={(e) => setCommune(e.target.value)}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          {KINSHASA_COMMUNES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Field>
      <Field icon={<Lock className="h-4 w-4" />} label="Mot de passe (min. 6)">
        <Input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
      </Field>
      <Field icon={<Gift className="h-4 w-4" />} label="Code parrainage (optionnel)">
        <Input
          value={referral}
          onChange={(e) => setReferral(e.target.value)}
          placeholder="Ex : BGXXXXXX"
        />
      </Field>
      <button
        type="submit"
        disabled={busy || locked}
        className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
        style={{ background: "var(--gradient-flame)" }}
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {busy
          ? "Création du compte…"
          : locked
            ? `Réessayer dans ${remaining} s`
            : "Créer mon compte"}
      </button>
    </form>
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
    <div>
      <Label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-foreground">
        <span className="text-muted-foreground">{icon}</span>
        {label}
      </Label>
      {children}
    </div>
  );
}
