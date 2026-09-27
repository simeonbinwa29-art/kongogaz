import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { type ReactNode } from "react";

import appCss from "../styles.css?url";
import { Toaster } from "../components/ui/sonner";
import { ThemeProvider, useTheme } from "../components/theme-toggle";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#12183a" },
      { title: "Kongo Gaz - Livraison de gaz GPL à domicile" },
      { property: "og:title", content: "Kongo Gaz - Livraison de gaz GPL à domicile" },
      { name: "twitter:title", content: "Kongo Gaz - Livraison de gaz GPL à domicile" },
      {
        name: "description",
        content:
          "Commandez votre bouteille de gaz ménager en quelques clics. Livraison rapide à domicile partout à Kinshasa avec Kongo Gaz.",
      },
      {
        property: "og:description",
        content:
          "Commandez votre bouteille de gaz ménager en quelques clics. Livraison rapide à domicile partout à Kinshasa avec Kongo Gaz.",
      },
      {
        name: "twitter:description",
        content:
          "Commandez votre bouteille de gaz ménager en quelques clics. Livraison rapide à domicile partout à Kinshasa avec Kongo Gaz.",
      },
      {
        property: "og:image",
        content:
          "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/53b440cc-20c5-4dc3-b755-3bd75460672b",
      },
      {
        name: "twitter:image",
        content:
          "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/53b440cc-20c5-4dc3-b755-3bd75460672b",
      },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=Inter:wght@400;500;600&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function AppShell() {
  const { theme } = useTheme();
  return (
    <>
      {/* Layout global : toutes les routes (client, admin, commande, facture…) se
          rendent dans <Outlet />. Le pied de page © Kongo Gaz reste donc visible
          au bas de l'écran sur TOUTES les pages après connexion. */}
      <div className="flex min-h-screen flex-col">
        <div className="flex-1 pb-7">
          {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
          <Outlet />
        </div>
      </div>
      <footer className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-white/60 py-1.5 text-center text-[10px] font-medium text-gray-500 backdrop-blur-md dark:bg-black/50 dark:text-gray-400">
        <p className="pb-[max(0.25rem,env(safe-area-inset-bottom))]">© made by Kongo Gaz</p>
      </footer>
      <Toaster theme={theme} />
    </>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AppShell />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
