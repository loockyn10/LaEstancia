import { Button } from "@pet-shop/ui";
import { FIRST_SYNC_MESSAGE, FIRST_SYNC_TITLE } from "./local-db/messages";
import { LoginScreen, StatusScreen } from "./auth/AuthScreens";
import { usePosAccess } from "./auth/useAccess";
import { PosScreen } from "./app/PosScreen";
import { useOnlineStatus } from "./connectivity/useOnlineStatus";

/** Puerta de entrada del POS: sesión → acceso (con contexto local para arrancar offline) → pantalla de venta. */
export function App() {
  const online = useOnlineStatus();
  const { state, signOut } = usePosAccess(online);

  switch (state.status) {
    case "configuration-error":
      return <StatusScreen title="Configuración pendiente"><p>{state.message}</p></StatusScreen>;
    case "loading":
      return <StatusScreen title="Preparando POS…" />;
    case "signed-out":
      return <LoginScreen expiredOffline={state.expiredOffline} online={online} />;
    case "first-sync-required":
      return <StatusScreen title={FIRST_SYNC_TITLE}><p>{FIRST_SYNC_MESSAGE}</p></StatusScreen>;
    case "no-access":
      return (
        <StatusScreen title="Sin acceso asignado">
          <p>Tu cuenta no tiene una membresía activa.</p>
          <Button onClick={() => void signOut()} variant="secondary">Cerrar sesión</Button>
        </StatusScreen>
      );
    case "ready":
      return <PosScreen access={state.access} onSignOut={() => void signOut()} online={online} />;
  }
}
