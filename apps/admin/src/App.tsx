import { useEffect } from "react";
import { Button } from "@pet-shop/ui";
import { LoginScreen, StatusScreen } from "./auth/AuthScreens";
import { useAccess } from "./auth/useAccess";
import { AppShell } from "./app/AppShell";
import { config } from "./config/env";
import { navigate } from "./lib/router";

const LOGIN_PATH = "/login";

/** Puerta de entrada: sesión → acceso → (login | sin acceso | POS para staff | Administración). */
export function App() {
  const { access, signOut } = useAccess();
  const staffRedirect = access.status === "staff" ? config.posUrl : null;

  useEffect(() => {
    if (access.status === "signed-out" && window.location.pathname !== LOGIN_PATH) navigate(LOGIN_PATH);
    if (access.status === "authorized" && window.location.pathname === LOGIN_PATH) navigate("/");
    if (staffRedirect) window.location.replace(staffRedirect);
  }, [access.status, staffRedirect]);

  switch (access.status) {
    case "configuration-error":
      return <StatusScreen message={access.message} title="Configuración pendiente" />;
    case "resolving-session":
      return <StatusScreen message="Restaurando tu sesión…" title="Preparando tu sesión" />;
    case "resolving-access":
      return <StatusScreen message="Verificando tu acceso…" title="Preparando tu sesión" />;
    case "signed-out":
      return <LoginScreen />;
    case "no-access":
      return (
        <StatusScreen message="Tu cuenta no tiene una membresía activa en ningún negocio. Pedile acceso a la persona administradora." title="Sin acceso asignado">
          <Button onClick={() => void signOut()} variant="secondary">Cerrar sesión</Button>
        </StatusScreen>
      );
    case "staff":
      return (
        <StatusScreen
          message={staffRedirect ? "Tu usuario opera desde el punto de venta. Te estamos redirigiendo…" : "Tu usuario opera desde el punto de venta, pero la dirección del POS no está configurada. Avisale a la persona administradora."}
          title="Este usuario usa el POS"
        >
          <Button onClick={() => void signOut()} variant="secondary">Cerrar sesión</Button>
        </StatusScreen>
      );
    case "error":
      return <StatusScreen message={`No se pudo resolver el acceso: ${access.message}`} title="No pudimos verificar tu acceso" />;
    case "authorized":
      return <AppShell businessId={access.businessId} businessName={access.businessName} onSignOut={() => void signOut()} role={access.role} />;
  }
}
