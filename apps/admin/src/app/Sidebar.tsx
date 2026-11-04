import { roleLabels } from "@pet-shop/domain";
import { Button } from "@pet-shop/ui";
import type { ManagerRole } from "@pet-shop/domain";
import { config } from "../config/env";
import { navigate, usePathname } from "../lib/router";
import { routes } from "./routes";

const navItems = routes.flatMap((route) => (route.nav ? [{ href: route.path, label: route.nav.label }] : []));
const isCurrent = (pathname: string, href: string) => pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));

export function Sidebar({ businessName, role, onSignOut }: { businessName: string; role: ManagerRole; onSignOut: () => void }) {
  const pathname = usePathname();
  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <button className="wordmark" onClick={() => navigate("/")} type="button">La Estancia</button>
        <p>{businessName}</p>
        <nav aria-label="Principal">
          {config.posUrl && <a className="nav-item" href={config.posUrl}>Ir al POS</a>}
          {navItems.map((item) => (
            <button aria-current={isCurrent(pathname, item.href) ? "page" : undefined} className={`nav-item ${isCurrent(pathname, item.href) ? "selected" : ""}`.trim()} key={item.href} onClick={() => navigate(item.href)} type="button">
              {item.label}
            </button>
          ))}
        </nav>
      </div>
      <div className="sidebar-bottom">
        <span>{roleLabels[role]}</span>
        <Button className="signout" onClick={onSignOut} variant="link">Cerrar sesión</Button>
      </div>
    </aside>
  );
}
