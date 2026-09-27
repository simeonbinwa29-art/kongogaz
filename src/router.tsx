import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// One QueryClient per request on the server, a stable singleton on the client
// so cached data survives navigation. getRouter() is normally called once at
// startup; this guards against accidental repeated calls losing the client cache.
let clientQueryClient: QueryClient | undefined;

export const getRouter = () => {
  const queryClient =
    typeof window !== "undefined" ? (clientQueryClient ??= new QueryClient()) : new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 30_000,
  });

  return router;
};
