import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();
  // Cualquier gestión que invalide datos de casos (seguimientos, aceptación,
  // ambulancia, cierre, ingreso, reactivación…) invalida también el historial
  // de cambios de estado, para que la fase nueva aparezca sin recargar.
  let pendiente = false;
  queryClient.getQueryCache().subscribe((ev) => {
    if (ev.type !== "updated" || ev.action.type !== "invalidate") return;
    const k = String(ev.query.queryKey[0] ?? "");
    if (k.startsWith("historial-cambios") || pendiente) return;
    pendiente = true;
    queueMicrotask(() => {
      pendiente = false;
      void queryClient.invalidateQueries({
        predicate: (q) => String(q.queryKey[0] ?? "").startsWith("historial-cambios"),
      });
    });
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
