import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/callback")({
  head: () => ({
    meta: [{ title: "Connexion en cours… — Kongo Gaz" }],
  }),
  component: OAuthCallbackPage,
});

function OAuthCallbackPage() {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      // Supabase may exchange the PKCE code from the URL hash automatically.
      // If a session already exists, we can proceed immediately.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!cancelled && session) {
        redirectAfterAuth();
        return;
      }

      // Otherwise wait briefly for onAuthStateChange to fire after the exchange.
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, s) => {
        if (!cancelled && s) {
          subscription.unsubscribe();
          redirectAfterAuth();
        }
      });

      // Fallback: if nothing happens within 5 s, send the user to /auth.
      const timeout = setTimeout(() => {
        if (!cancelled) {
          subscription.unsubscribe();
          navigate({ to: "/auth" });
        }
      }, 5000);

      return () => {
        clearTimeout(timeout);
        subscription.unsubscribe();
      };
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-6">
      <div
        key="auth-callback-skeleton"
        className="skeleton-in flex w-full max-w-xs flex-col items-center gap-4"
      >
        <div className="skeleton h-16 w-16 rounded-2xl" />
        <div className="skeleton h-4 w-40 rounded-full" />
        <div className="skeleton h-3 w-52 rounded-full" />
      </div>
      <p className="text-xs text-muted-foreground">Connexion en cours…</p>
    </div>
  );
}

function redirectAfterAuth() {
  const target =
    typeof window !== "undefined" ? (sessionStorage.getItem("bg_redirect_after_auth") ?? "/") : "/";
  if (typeof window !== "undefined") {
    sessionStorage.removeItem("bg_redirect_after_auth");
  }
  window.location.replace(target);
}
