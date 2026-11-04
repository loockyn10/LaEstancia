import { type ReactNode, lazy } from "react";
import { ProductEditorPage } from "../features/catalog/ProductEditorPage";
import { ProductsPage } from "../features/catalog/ProductsPage";
import { ReferencesPage } from "../features/catalog/ReferencesPage";

/** Las pantallas pesadas se cargan bajo demanda: PDF, planillas e impresión no pesan en el primer render. */
const DashboardPage = lazy(() => import("../features/dashboard/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const PricingPage = lazy(() => import("../features/pricing/PricingPage").then((m) => ({ default: m.PricingPage })));
const StockPage = lazy(() => import("../features/stock/StockPage").then((m) => ({ default: m.StockPage })));
const LabelsPage = lazy(() => import("../features/labels/LabelsPage").then((m) => ({ default: m.LabelsPage })));
const CashPage = lazy(() => import("../features/cash/CashPage").then((m) => ({ default: m.CashPage })));
const SuppliersPage = lazy(() => import("../features/purchasing/SuppliersPage").then((m) => ({ default: m.SuppliersPage })));
const PurchasesListPage = lazy(() => import("../features/purchasing/PurchasesPages").then((m) => ({ default: m.PurchasesListPage })));
const PurchaseEditorPage = lazy(() => import("../features/purchasing/PurchasesPages").then((m) => ({ default: m.PurchaseEditorPage })));
const SalesListPage = lazy(() => import("../features/sales/SalesPages").then((m) => ({ default: m.SalesListPage })));
const SaleEditorPage = lazy(() => import("../features/sales/SalesPages").then((m) => ({ default: m.SaleEditorPage })));
const SaleDetailPage = lazy(() => import("../features/sales/SalesPages").then((m) => ({ default: m.SaleDetailPage })));
const SupplierPriceListsPage = lazy(() => import("../features/supplier-lists/SupplierPriceListsPage").then((m) => ({ default: m.SupplierPriceListsPage })));
const CatalogImportPage = lazy(() => import("../features/imports/CatalogImportPage").then((m) => ({ default: m.CatalogImportPage })));

export type AdminRoute = {
  /** Patrón con parámetros ":nombre". Las rutas más específicas van antes (por ejemplo "/products/new"). */
  path: string;
  render: (params: Record<string, string>) => ReactNode;
  /** Presente = aparece en el menú lateral. */
  nav?: { label: string };
};

/**
 * Tabla única de rutas y navegación de Administración. Todas las rutas son para owner/admin: el acceso se
 * resuelve antes de montar este árbol (auth/access.ts) y la autoridad real es RLS/RPC en PostgreSQL.
 */
export const routes: readonly AdminRoute[] = [
  { path: "/", render: () => <DashboardPage />, nav: { label: "Dashboard" } },
  { path: "/products", render: () => <ProductsPage />, nav: { label: "Productos" } },
  { path: "/products/new", render: () => <ProductEditorPage /> },
  { path: "/products/:id", render: ({ id }) => <ProductEditorPage productId={id} /> },
  { path: "/prices", render: () => <PricingPage />, nav: { label: "Precios" } },
  { path: "/stock", render: () => <StockPage />, nav: { label: "Stock" } },
  { path: "/suppliers", render: () => <SuppliersPage />, nav: { label: "Proveedores" } },
  { path: "/supplier-price-lists", render: () => <SupplierPriceListsPage />, nav: { label: "Listas de proveedores" } },
  { path: "/purchases", render: () => <PurchasesListPage />, nav: { label: "Compras" } },
  { path: "/purchases/new", render: () => <PurchaseEditorPage /> },
  { path: "/purchases/:id", render: ({ id }) => <PurchaseEditorPage purchaseId={id} /> },
  { path: "/sales", render: () => <SalesListPage />, nav: { label: "Ventas" } },
  { path: "/sales/new", render: () => <SaleEditorPage /> },
  { path: "/sales/:id", render: ({ id }) => <SaleDetailPage saleId={id} /> },
  { path: "/cash", render: () => <CashPage />, nav: { label: "Caja" } },
  { path: "/labels", render: () => <LabelsPage />, nav: { label: "Etiquetas" } },
  { path: "/brands", render: () => <ReferencesPage feminine singular="marca" table="brands" title="Marcas" />, nav: { label: "Marcas" } },
  { path: "/categories", render: () => <ReferencesPage feminine singular="categoría" table="categories" title="Categorías" />, nav: { label: "Categorías" } },
  { path: "/import", render: () => <CatalogImportPage />, nav: { label: "Importar" } },
];
