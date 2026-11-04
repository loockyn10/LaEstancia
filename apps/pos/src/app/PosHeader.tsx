import { formatDateTime, roleLabels } from "@pet-shop/domain";
import { Badge, Button } from "@pet-shop/ui";
import { config } from "../config/env";
import type { LocalAccessContext } from "../local-db/types";

type Props = {
  access: LocalAccessContext;
  branchName?: string;
  online: boolean;
  cashLabel: string;
  lastSync: string | null;
  syncing: boolean;
  onSync: () => void;
  onSignOut: () => void;
};

/** Cabecera (negocio, operador, accesos) y barra de estado (conexión, caja, última sincronización). */
export function PosHeader({ access, branchName, online, cashLabel, lastSync, syncing, onSync, onSignOut }: Props) {
  // Sólo owner/admin tienen Administración; staff no ve el enlace (y el backend no le entrega datos administrativos).
  const showAdmin = access.role !== "staff" && config.adminUrl;
  return (
    <>
      <header className="pos-header">
        <div>
          <p className="eyebrow">La Estancia POS</p>
          <strong>{access.businessName}</strong>
        </div>
        <div className="operator">
          <Badge tone="info">{roleLabels[access.role]}</Badge>
          <span>{branchName ?? "Sin sucursal"}</span>
          {showAdmin && <a href={config.adminUrl!}>Administración</a>}
          <Button onClick={onSignOut} variant="link">Salir</Button>
        </div>
      </header>
      <section aria-label="Estado" className="status">
        <Badge tone={online ? "success" : "danger"}>{online ? "Conectado" : "Sin conexión"}</Badge>
        <span>{cashLabel}</span>
        <span>{lastSync ? `Última sincronización: ${formatDateTime(lastSync)}` : "Sin sincronización previa"}</span>
        <Button compact disabled={!online} loading={syncing} onClick={onSync} variant="secondary">{syncing ? "Sincronizando…" : "Sincronizar"}</Button>
      </section>
    </>
  );
}
