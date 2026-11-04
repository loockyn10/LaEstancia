import { useSyncExternalStore } from "react";

/** Router mínimo basado en History API: suficiente para un backoffice de rutas planas. */

export function navigate(path: string) {
  const target = new URL(path, window.location.origin);
  if (`${window.location.pathname}${window.location.search}` === `${target.pathname}${target.search}`) return;
  window.history.pushState(null, "", `${target.pathname}${target.search}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function subscribe(listener: () => void) {
  window.addEventListener("popstate", listener);
  return () => window.removeEventListener("popstate", listener);
}

export function usePathname(): string {
  return useSyncExternalStore(subscribe, () => window.location.pathname);
}

/** Parámetros de búsqueda actuales (por ejemplo filtros enlazados desde el Dashboard). */
export function readSearchParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

export type RouteMatch<T> = { route: T; params: Record<string, string> };

/** Resuelve "/products/:id" contra un pathname. Devuelve null si ninguna ruta coincide. */
export function matchRoute<T extends { path: string }>(routes: readonly T[], pathname: string): RouteMatch<T> | null {
  const segments = pathname.split("/").filter(Boolean);
  for (const route of routes) {
    const pattern = route.path.split("/").filter(Boolean);
    if (pattern.length !== segments.length) continue;
    const params: Record<string, string> = {};
    const matches = pattern.every((part, index) => {
      if (part.startsWith(":")) {
        params[part.slice(1)] = decodeURIComponent(segments[index]);
        return true;
      }
      return part === segments[index];
    });
    if (matches) return { route, params };
  }
  return null;
}
