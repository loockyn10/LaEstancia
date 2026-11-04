import { Suspense } from "react";
import type { ManagerRole } from "@pet-shop/domain";
import { EmptyState, LoadingState } from "@pet-shop/ui";
import { CatalogProvider } from "../features/catalog/CatalogProvider";
import { matchRoute, navigate, usePathname } from "../lib/router";
import { Sidebar } from "./Sidebar";
import { routes } from "./routes";

function CurrentPage() {
  const pathname = usePathname();
  const match = matchRoute(routes, pathname);
  if (!match) return <EmptyState action={{ label: "Ir al Dashboard", onClick: () => navigate("/") }} text="La dirección no existe o fue movida." title="Página no encontrada" />;
  return <Suspense fallback={<LoadingState title="Cargando…" />}>{match.route.render(match.params)}</Suspense>;
}

/** Layout autenticado: menú, contenido y la carga única del catálogo compartida por las pantallas. */
export function AppShell({ businessId, businessName, role, onSignOut }: { businessId: string; businessName: string; role: ManagerRole; onSignOut: () => void }) {
  return (
    <CatalogProvider businessId={businessId}>
      <div className="admin">
        <Sidebar businessName={businessName} onSignOut={onSignOut} role={role} />
        <main>
          <CurrentPage />
        </main>
      </div>
    </CatalogProvider>
  );
}
