import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { PostgrestError } from "@supabase/supabase-js";
import {
  getSupabaseClient,
  getSupabaseConfigurationError,
} from "./lib/supabase";
import { CatalogImport } from "./CatalogImport";
import { Purchases, Suppliers } from "./Purchasing";
import { Sales } from "./Sales";

type Role = "owner" | "admin" | "staff";
type Access =
  | { status: "configuration-error"; message: string }
  | {
      status:
        "resolving-session" | "signed-out" | "resolving-access" | "no-access";
    }
  | {
      status: "authorized";
      businessId: string;
      businessName: string;
      role: Role;
    }
  | { status: "error"; message: string };
type Brand = { id: string; name: string; is_active: boolean };
type Category = Brand;
type Barcode = { id?: string; code: string; is_primary: boolean };
type Offer = {
  id: string;
  variant_id: string;
  promotional_price_cents: number;
  starts_at: string;
  ends_at: string | null;
  active: boolean;
};
type Variant = {
  id?: string;
  name: string;
  sku: string;
  is_active: boolean;
  barcodes: Barcode[];
};
type Product = {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
  brand_id: string | null;
  category_id: string | null;
  variants: Variant[];
};
type ProductDraft = Omit<Product, "id">;
type Branch = { id: string; name: string; is_active: boolean };
type InventoryMovementType = "initial" | "inbound" | "outbound" | "adjustment" | "purchase" | "sale";
type InventoryRow = {
  branchId: string;
  branchName: string;
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  barcode: string;
  quantity: number;
  minimumQuantity: number | null;
};
type InventoryHistoryItem = {
  id: string;
  type: InventoryMovementType;
  quantity_delta: number;
  resulting_quantity: number;
  note: string | null;
  created_at: string;
  created_by: string;
  created_by_name: string | null;
};

const loginPath = "/login";
const blankVariant = (): Variant => ({
  name: "Presentación única",
  sku: "",
  is_active: true,
  barcodes: [],
});
const blankProduct = (): ProductDraft => ({
  name: "",
  description: "",
  is_active: true,
  brand_id: null,
  category_id: null,
  variants: [blankVariant()],
});
const productDraft = (product?: Product): ProductDraft =>
  product
    ? {
        name: product.name,
        description: product.description,
        is_active: product.is_active,
        brand_id: product.brand_id,
        category_id: product.category_id,
        variants: product.variants.length ? product.variants : [blankVariant()],
      }
    : blankProduct();
const navigate = (path: string) => {
  if (window.location.pathname !== path) {
    window.history.pushState(null, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }
};
function humanError(error: PostgrestError | null) {
  const message =
    `${error?.code ?? ""} ${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase();
  if (
    message.includes("product_variants_business_sku_key") ||
    message.includes("sku")
  )
    return "Ese SKU ya está asignado a otro producto.";
  if (
    message.includes("product_barcodes_business_code_key") ||
    message.includes("barcode") ||
    message.includes("code_key")
  )
    return "Ese código de barras ya está asignado a otro producto.";
  if (message.includes("variant_offers_no_active_overlap"))
    return "Esta vigencia se superpone con otra oferta activa de la misma presentación.";
  if (message.includes("ends_at") || message.includes("check constraint"))
    return "La fecha de fin debe ser posterior a la fecha de inicio.";
  if (message.includes("insufficient inventory")) return "Stock insuficiente.";
  if (message.includes("invalid inventory quantity") || message.includes("quantity must be greater"))
    return "Cantidad inválida.";
  if (message.includes("invalid inventory branch") || message.includes("invalid inventory variant"))
    return "Producto/sucursal inválidos.";
  if (message.includes("not authorized")) return "No tenés permisos para realizar esta acción.";
  if (
    message.includes("row-level security") ||
    message.includes("permission denied")
  )
    return "No tenés permiso para realizar esta acción.";
  return "No se pudo guardar. Verificá los datos e intentá nuevamente.";
}
function formatPesos(amountCents: number | null | undefined) {
  if (amountCents === null || amountCents === undefined) return "Sin definir";
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: amountCents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amountCents / 100);
}
function parsePesos(value: string): number | null {
  const raw = value.replace(/[\s$]/g, "");
  if (!raw) return null;
  let integer = "";
  let decimals = "";
  const argentine = raw.match(/^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/);
  const decimalDot = raw.match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (argentine) [, integer, decimals = ""] = argentine;
  else if (decimalDot) [, integer, decimals = ""] = decimalDot;
  else return null;
  const cents = Number(integer.split(".").join("")) * 100 + Number(`${decimals}00`.slice(0, 2));
  return Number.isSafeInteger(cents) ? cents : null;
}
function pesosInput(amountCents: number | null | undefined) {
  if (amountCents === null || amountCents === undefined) return "";
  const whole = Math.floor(amountCents / 100);
  const decimals = amountCents % 100;
  return decimals ? `${whole},${decimals.toString().padStart(2, "0")}` : `${whole}`;
}
function localDateTimeInput(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
function offerStatus(offer: Offer, now = new Date()) {
  if (!offer.active) return "Desactivada";
  if (new Date(offer.starts_at) > now) return "Próxima";
  if (offer.ends_at && new Date(offer.ends_at) <= now) return "Vencida";
  return "Vigente";
}
function offerStatusClass(offer: Offer) {
  return offerStatus(offer).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function formatDateRange(startsAt: string, endsAt: string | null) {
  const format = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" });
  return `${format.format(new Date(startsAt))}${endsAt ? ` a ${format.format(new Date(endsAt))}` : " en adelante"}`;
}
function parsePercent(value: string): number | null {
  const raw = value.trim().replace(",", ".");
  if (!/^-?\d+(?:\.\d+)?$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= -100 ? parsed : null;
}
const quantityScale = 1000n;
function parseQuantity(value: string): bigint | null {
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  const match = normalized.match(/^(\d+)(?:\.(\d{1,3}))?$/);
  if (!match) return null;
  const [, whole, fraction = ""] = match;
  return BigInt(whole) * quantityScale + BigInt(fraction.padEnd(3, "0"));
}
function quantityFromDatabase(value: number) {
  const raw = String(value);
  const negative = raw.startsWith("-");
  const parsed = parseQuantity(negative ? raw.slice(1) : raw);
  return parsed === null ? 0n : negative ? -parsed : parsed;
}
function formatQuantity(quantity: bigint | number | null | undefined) {
  if (quantity === null || quantity === undefined) return "—";
  const scaled = typeof quantity === "bigint" ? quantity : quantityFromDatabase(quantity);
  const negative = scaled < 0n;
  const absolute = negative ? -scaled : scaled;
  const whole = absolute / quantityScale;
  const fraction = (absolute % quantityScale).toString().padStart(3, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole.toLocaleString("es-AR")}${fraction ? `,${fraction}` : ""}`;
}
function quantityInput(quantity: number | null | undefined) {
  return quantity === null || quantity === undefined ? "" : formatQuantity(quantity).replace(/\./g, "");
}
function movementLabel(type: InventoryMovementType) {
  return type === "inbound" || type === "initial" || type === "purchase"
    ? "Entrada"
    : type === "outbound"
      ? "Salida"
      : "Ajuste";
}
function Loading({ message }: { message: string }) {
  return (
    <main className="shell">
      <section aria-live="polite" className="welcome-card">
        <p className="eyebrow">La Estancia</p>
        <h1>Preparando tu sesión</h1>
        <p className="message">{message}</p>
      </section>
    </main>
  );
}
function Badge({ active }: { active: boolean }) {
  return (
    <span className={`badge ${active ? "badge-active" : ""}`}>
      {active ? "Activo" : "Inactivo"}
    </span>
  );
}

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = getSupabaseClient();
    if (!supabase) return setError(getSupabaseConfigurationError());
    setSubmitting(true);
    setError(null);
    const { error: loginError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setSubmitting(false);
    if (loginError)
      setError("No pudimos iniciar sesión. Revisá tu email y contraseña.");
  }
  return (
    <main className="shell">
      <section className="welcome-card login-card">
        <p className="eyebrow">La Estancia · Backoffice</p>
        <h1>Iniciar sesión</h1>
        <p className="message">
          Ingresá con tu cuenta asignada para gestionar el catálogo.
        </p>
        <form className="login-form" onSubmit={(event) => void submit(event)}>
          <label>
            Email
            <input
              autoComplete="email"
              disabled={submitting}
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <label>
            Contraseña
            <input
              autoComplete="current-password"
              disabled={submitting}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button disabled={submitting} type="submit">
            {submitting ? "Ingresando…" : "Ingresar"}
          </button>
        </form>
      </section>
    </main>
  );
}
function NoAccess({ onLogout }: { onLogout: () => Promise<void> }) {
  return (
    <main className="shell">
      <section className="welcome-card">
        <p className="eyebrow">La Estancia</p>
        <h1>Sin acceso asignado</h1>
        <p className="message">
          Tu cuenta no tiene una membresía activa en ningún negocio. Pedile
          acceso a la persona administradora.
        </p>
        <button
          className="secondary"
          onClick={() => void onLogout()}
          type="button"
        >
          Cerrar sesión
        </button>
      </section>
    </main>
  );
}

function Sidebar({
  name,
  role,
  logout,
}: {
  name: string;
  role: Role;
  logout: () => Promise<void>;
}) {
  const path = window.location.pathname;
  const item = (href: string, text: string) => (
    <button
      className={`nav-item ${path === href || path.startsWith(`${href}/`) || (href === "/" && path.startsWith("/products")) ? "selected" : ""}`}
      onClick={() => navigate(href)}
      type="button"
    >
      {text}
    </button>
  );
  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <button
          className="wordmark"
          onClick={() => navigate("/")}
          type="button"
        >
          La Estancia
        </button>
        <p>{name}</p>
        <nav>
          {item("/", "Productos")}
          {item("/prices", "Precios")}
          {item("/stock", "Stock")}
          {item("/suppliers", "Proveedores")}
          {item("/purchases", "Compras")}
          {item("/sales", "Ventas")}
          {item("/labels", "Etiquetas")}
          {item("/brands", "Marcas")}
          {item("/categories", "Categorías")}
          {role !== "staff" && item("/import", "Importar")}
        </nav>
      </div>
      <div className="sidebar-bottom">
        <span>{role === "staff" ? "Solo consulta" : role}</span>
        <button className="signout" onClick={() => void logout()} type="button">
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}

function Catalog({
  businessId,
  businessName,
  role,
  onLogout,
}: {
  businessId: string;
  businessName: string;
  role: Role;
  onLogout: () => Promise<void>;
}) {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [, forceRoute] = useState(0);
  const canEdit = role === "owner" || role === "admin";
  useEffect(() => {
    const listener = () => forceRoute((value) => value + 1);
    window.addEventListener("popstate", listener);
    return () => window.removeEventListener("popstate", listener);
  }, []);
  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setLoading(true);
    setLoadError(null);
    const [
      brandResult,
      categoryResult,
      productResult,
      variantResult,
      barcodeResult,
      branchResult,
    ] = await Promise.all([
      supabase
        .from("brands")
        .select("id,name,is_active")
        .eq("business_id", businessId)
        .order("name"),
      supabase
        .from("categories")
        .select("id,name,is_active")
        .eq("business_id", businessId)
        .order("name"),
      supabase
        .from("products")
        .select("id,name,description,is_active,brand_id,category_id")
        .eq("business_id", businessId)
        .order("name"),
      supabase
        .from("product_variants")
        .select("id,product_id,name,sku,is_active")
        .eq("business_id", businessId)
        .order("created_at"),
      supabase
        .from("product_barcodes")
        .select("id,variant_id,code,is_primary")
        .eq("business_id", businessId)
        .order("created_at"),
      supabase
        .from("branches")
        .select("id,name,is_active")
        .eq("business_id", businessId)
        .order("name"),
    ]);
    const error =
      brandResult.error ??
      categoryResult.error ??
      productResult.error ??
      variantResult.error ??
      barcodeResult.error ??
      branchResult.error;
    if (error) {
      setLoadError(humanError(error));
      setLoading(false);
      return;
    }
    const barcodeMap = new Map<string, Barcode[]>();
    for (const item of barcodeResult.data ?? [])
      barcodeMap.set(item.variant_id, [
        ...(barcodeMap.get(item.variant_id) ?? []),
        { id: item.id, code: item.code, is_primary: item.is_primary },
      ]);
    const variantMap = new Map<string, Variant[]>();
    for (const item of variantResult.data ?? [])
      variantMap.set(item.product_id, [
        ...(variantMap.get(item.product_id) ?? []),
        {
          id: item.id,
          name: item.name,
          sku: item.sku ?? "",
          is_active: item.is_active,
          barcodes: barcodeMap.get(item.id) ?? [],
        },
      ]);
    setBrands(brandResult.data ?? []);
    setCategories(categoryResult.data ?? []);
    setBranches(branchResult.data ?? []);
    setProducts(
      (productResult.data ?? []).map((item) => ({
        ...item,
        description: item.description ?? "",
        variants: variantMap.get(item.id) ?? [],
      })),
    );
    setLoading(false);
  }, [businessId]);
  useEffect(() => {
    void load();
  }, [load]);
  const path = window.location.pathname;
  let page: JSX.Element;
  if (path === "/brands")
    page = (
      <References
        title="Marcas"
        table="brands"
        items={brands}
        businessId={businessId}
        canEdit={canEdit}
        reload={load}
      />
    );
  else if (path === "/categories")
    page = (
      <References
        title="Categorías"
        table="categories"
        items={categories}
        businessId={businessId}
        canEdit={canEdit}
        reload={load}
      />
    );
  else if (path === "/products/new")
    page = (
      <Editor
        businessId={businessId}
        brands={brands}
        categories={categories}
        canEdit={canEdit}
        reload={load}
      />
    );
  else if (path === "/prices")
    page = (
      <Pricing
        businessId={businessId}
        canEdit={canEdit}
        products={products}
        role={role}
      />
    );
  else if (path === "/suppliers")
    page = <Suppliers businessId={businessId} role={role} />;
  else if (path === "/sales" || path === "/sales/new" || path.startsWith("/sales/"))
    page = (
      <Sales
        branches={branches}
        businessId={businessId}
        navigate={navigate}
        path={path}
        products={products}
      />
    );
  else if (path === "/purchases" || path === "/purchases/new" || path.startsWith("/purchases/"))
    page = (
      <Purchases
        branches={branches}
        businessId={businessId}
        navigate={navigate}
        path={path}
        products={products}
        role={role}
      />
    );
  else if (path === "/stock")
    page = (
      <Stock
        businessId={businessId}
        canEdit={canEdit}
        products={products}
        role={role}
      />
    );
  else if (path === "/labels")
    page = <Labels businessId={businessId} products={products} />;
  else if (path === "/import")
    page = (
      <CatalogImport
        branches={branches}
        businessId={businessId}
        canEdit={canEdit}
        existing={products.flatMap((product) =>
          product.variants.map((variant) => ({
            id: variant.id ?? "",
            productName: product.name,
            variantName: variant.name,
            sku: variant.sku,
            barcodes: variant.barcodes.map((barcode) => barcode.code),
          })),
        )}
      />
    );
  else if (path.startsWith("/products/"))
    page = loading ? (
      <StateBox title="Cargando producto…" />
    ) : (
      <Editor
        businessId={businessId}
        brands={brands}
        categories={categories}
        canEdit={canEdit}
        product={products.find((item) => item.id === path.split("/")[2])}
        reload={load}
      />
    );
  else
    page = (
      <Products
        products={products}
        brands={brands}
        categories={categories}
        canEdit={canEdit}
        loading={loading}
        error={loadError}
        reload={load}
      />
    );
  return (
    <div className="admin">
      <Sidebar logout={onLogout} name={businessName} role={role} />
      <main>{page}</main>
    </div>
  );
}

function Products({
  products,
  brands,
  categories,
  canEdit,
  loading,
  error,
  reload,
}: {
  products: Product[];
  brands: Brand[];
  categories: Category[];
  canEdit: boolean;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [state, setState] = useState("active");
  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return products.filter(
      (product) =>
        (!brand || product.brand_id === brand) &&
        (!category || product.category_id === category) &&
        (state === "all" || product.is_active === (state === "active")) &&
        (!search ||
          product.name.toLowerCase().includes(search) ||
          product.variants.some(
            (variant) =>
              variant.sku.toLowerCase().includes(search) ||
              variant.barcodes.some((barcode) =>
                barcode.code.toLowerCase().includes(search),
              ),
          )),
    );
  }, [products, query, brand, category, state]);
  const name = (list: Brand[], id: string | null) =>
    list.find((item) => item.id === id)?.name ?? "—";
  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Catálogo</p>
          <h1>Productos</h1>
          <p className="subtle">Organizá lo que vendés y sus presentaciones.</p>
        </div>
        {canEdit && (
          <button onClick={() => navigate("/products/new")} type="button">
            Nuevo producto
          </button>
        )}
      </header>
      <section className="filters">
        <input
          aria-label="Buscar productos"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por nombre, SKU o código"
          type="search"
          value={query}
        />
        <select
          aria-label="Marca"
          onChange={(event) => setBrand(event.target.value)}
          value={brand}
        >
          <option value="">Todas las marcas</option>
          {brands.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Categoría"
          onChange={(event) => setCategory(event.target.value)}
          value={category}
        >
          <option value="">Todas las categorías</option>
          {categories.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Estado"
          onChange={(event) => setState(event.target.value)}
          value={state}
        >
          <option value="active">Activos</option>
          <option value="inactive">Inactivos</option>
          <option value="all">Todos</option>
        </select>
      </section>
      {loading ? (
        <StateBox title="Cargando productos…" />
      ) : error ? (
        <StateBox action={() => void reload()} title={error} />
      ) : !filtered.length ? (
        <StateBox
          action={
            canEdit && !products.length
              ? () => navigate("/products/new")
              : undefined
          }
          title="No encontramos productos"
          text={
            products.length
              ? "Probá con otra búsqueda o filtro."
              : "Cuando agregues el primero, va a aparecer acá."
          }
        />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th>Marca</th>
                <th>Categoría</th>
                <th>Presentaciones</th>
                <th>Estado</th>
                {canEdit && <th />}
              </tr>
            </thead>
            <tbody>
              {filtered.map((product) => (
                <tr key={product.id}>
                  <td>
                    <strong>{product.name}</strong>
                  </td>
                  <td>{name(brands, product.brand_id)}</td>
                  <td>{name(categories, product.category_id)}</td>
                  <td>{product.variants.length}</td>
                  <td>
                    <Badge active={product.is_active} />
                  </td>
                  {canEdit && (
                    <td>
                      <button
                        className="link-button"
                        onClick={() => navigate(`/products/${product.id}`)}
                        type="button"
                      >
                        Editar
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Stock({
  businessId,
  canEdit,
  products,
  role,
}: {
  businessId: string;
  canEdit: boolean;
  products: Product[];
  role: Role;
}) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [balances, setBalances] = useState<Record<string, { quantity: number; minimumQuantity: number | null }>>({});
  const [branchFilter, setBranchFilter] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [movementTarget, setMovementTarget] = useState<InventoryRow | null>(null);
  const [movementType, setMovementType] = useState<InventoryMovementType>("inbound");
  const [movementInput, setMovementInput] = useState("");
  const [movementNote, setMovementNote] = useState("");
  const [movementSaving, setMovementSaving] = useState(false);
  const [minimumTarget, setMinimumTarget] = useState<InventoryRow | null>(null);
  const [minimumInput, setMinimumInput] = useState("");
  const [minimumSaving, setMinimumSaving] = useState(false);
  const [historyTarget, setHistoryTarget] = useState<InventoryRow | null>(null);
  const [history, setHistory] = useState<InventoryHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setLoading(true);
    setError(null);
    const [branchResult, balanceResult] = await Promise.all([
      supabase.from("branches").select("id,name,is_active").eq("business_id", businessId).order("name"),
      supabase.from("inventory_balances").select("branch_id,variant_id,quantity,minimum_quantity").eq("business_id", businessId),
    ]);
    const failure = branchResult.error ?? balanceResult.error;
    if (failure) {
      setError(humanError(failure));
      setLoading(false);
      return;
    }
    const nextBranches = branchResult.data ?? [];
    setBranches(nextBranches);
    setBranchFilter((current) => current || nextBranches.find((branch) => branch.is_active)?.id || nextBranches[0]?.id || "");
    setBalances(Object.fromEntries((balanceResult.data ?? []).map((balance) => [
      `${balance.branch_id}:${balance.variant_id}`,
      { quantity: balance.quantity, minimumQuantity: balance.minimum_quantity },
    ])));
    setLoading(false);
  }, [businessId]);
  useEffect(() => { void load(); }, [load]);

  const rows = useMemo<InventoryRow[]>(() => {
    const visibleBranches = branchFilter ? branches.filter((branch) => branch.id === branchFilter) : branches;
    return visibleBranches.flatMap((branch) => products.flatMap((product) => product.variants
      .filter((variant): variant is Variant & { id: string } => Boolean(variant.id))
      .map((variant) => {
        const balance = balances[`${branch.id}:${variant.id}`];
        return {
          branchId: branch.id,
          branchName: branch.name,
          variantId: variant.id,
          productName: product.name,
          variantName: variant.name,
          sku: variant.sku,
          barcode: variant.barcodes.find((barcode) => barcode.is_primary)?.code ?? variant.barcodes[0]?.code ?? "",
          quantity: balance?.quantity ?? 0,
          minimumQuantity: balance?.minimumQuantity ?? null,
        };
      })));
  }, [balances, branchFilter, branches, products]);
  const stockStatus = (row: InventoryRow) => {
    if (quantityFromDatabase(row.quantity) === 0n) return "out";
    if (row.minimumQuantity !== null && quantityFromDatabase(row.quantity) <= quantityFromDatabase(row.minimumQuantity)) return "low";
    return "ok";
  };
  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("es-AR");
    return rows.filter((row) => (
      (statusFilter === "all" || stockStatus(row) === statusFilter) &&
      (!search || [row.productName, row.variantName, row.sku, row.barcode].some((value) => value.toLocaleLowerCase("es-AR").includes(search)))
    ));
  }, [query, rows, statusFilter]);
  const movementQuantity = parseQuantity(movementInput);
  const movementPreview = useMemo(() => {
    if (!movementTarget || movementQuantity === null) return null;
    const current = quantityFromDatabase(movementTarget.quantity);
    const next = movementType === "adjustment"
      ? movementQuantity
      : movementType === "outbound"
        ? current - movementQuantity
        : current + movementQuantity;
    return { current, delta: next - current, next };
  }, [movementQuantity, movementTarget, movementType]);

  function startMovement(row: InventoryRow) {
    setMovementTarget(row);
    setMovementType("inbound");
    setMovementInput("");
    setMovementNote("");
    setError(null);
    setNotice(null);
  }
  async function saveMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!movementTarget || !canEdit || movementQuantity === null || !movementPreview) {
      setError("Cantidad inválida.");
      return;
    }
    if ((movementType !== "adjustment" && movementQuantity === 0n) || movementPreview.next < 0n || movementPreview.delta === 0n) {
      setError(movementPreview.next < 0n ? "Stock insuficiente." : "Cantidad inválida.");
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setMovementSaving(true);
    setError(null);
    const { error: saveError } = await supabase.rpc("record_inventory_movement", {
      target_business_id: businessId,
      target_branch_id: movementTarget.branchId,
      target_variant_id: movementTarget.variantId,
      movement_type: movementType,
      movement_quantity: Number(movementQuantity) / Number(quantityScale),
      movement_note: movementNote.trim() || undefined,
    });
    setMovementSaving(false);
    if (saveError) return setError(humanError(saveError));
    setMovementTarget(null);
    setNotice("El movimiento se registró correctamente.");
    await load();
  }
  function startMinimum(row: InventoryRow) {
    setMinimumTarget(row);
    setMinimumInput(quantityInput(row.minimumQuantity));
    setError(null);
    setNotice(null);
  }
  async function saveMinimum(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!minimumTarget || !canEdit) return;
    const minimum = minimumInput.trim() ? parseQuantity(minimumInput) : null;
    if (minimumInput.trim() && minimum === null) {
      setError("Cantidad inválida.");
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setMinimumSaving(true);
    setError(null);
    const minimumParams = {
      target_business_id: businessId,
      target_branch_id: minimumTarget.branchId,
      target_variant_id: minimumTarget.variantId,
      ...(minimum === null ? {} : { target_minimum_quantity: Number(minimum) / Number(quantityScale) }),
    };
    const { error: saveError } = await supabase.rpc("set_inventory_minimum", minimumParams);
    setMinimumSaving(false);
    if (saveError) return setError(humanError(saveError));
    setMinimumTarget(null);
    setNotice("El stock mínimo se guardó correctamente.");
    await load();
  }
  async function openHistory(row: InventoryRow) {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setHistoryTarget(row);
    setHistory([]);
    setHistoryLoading(true);
    setError(null);
    const { data, error: historyError } = await supabase.rpc("list_inventory_movements", {
      target_business_id: businessId,
      target_branch_id: row.branchId,
      target_variant_id: row.variantId,
    });
    setHistoryLoading(false);
    if (historyError) return setError(humanError(historyError));
    setHistory(data ?? []);
  }
  const statusText = (row: InventoryRow) => stockStatus(row) === "out" ? "Sin stock" : stockStatus(row) === "low" ? "Bajo" : "OK";

  return <>
    <header className="page-header"><div><p className="eyebrow">Inventario</p><h1>Stock</h1><p className="subtle">El stock se controla por presentación y sucursal. {role === "staff" ? "Podés consultarlo, pero no registrar movimientos." : "Registrá entradas, salidas y ajustes con trazabilidad."}</p></div></header>
    {notice && <p className="notice" role="status">{notice}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <section className="filters"><input aria-label="Buscar stock" onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre, SKU o código" type="search" value={query} /><select aria-label="Sucursal" onChange={(event) => setBranchFilter(event.target.value)} value={branchFilter}><option value="">Todas las sucursales</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}{branch.is_active ? "" : " (inactiva)"}</option>)}</select><select aria-label="Estado de stock" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}><option value="all">Todos los estados</option><option value="ok">OK</option><option value="low">Stock bajo</option><option value="out">Sin stock</option></select></section>
    {loading ? <StateBox title="Cargando stock…" /> : !branches.length ? <StateBox title="No hay sucursales disponibles" text="Cuando exista una sucursal, el stock se podrá consultar por presentación." /> : !filtered.length ? <StateBox title="No encontramos stock" text={rows.length ? "Probá con otra búsqueda o filtro." : "Cuando cargues productos con presentaciones, van a aparecer acá."} /> : <div className="table-wrap"><table><thead><tr><th>Producto</th><th>Presentación</th><th>SKU</th><th>Sucursal</th><th>Stock actual</th><th>Stock mínimo</th><th>Estado</th><th /></tr></thead><tbody>{filtered.map((row) => <tr key={`${row.branchId}:${row.variantId}`}><td><strong>{row.productName}</strong></td><td>{row.variantName}</td><td>{row.sku || "—"}</td><td>{row.branchName}</td><td><strong>{formatQuantity(row.quantity)}</strong></td><td>{row.minimumQuantity === null ? "Sin definir" : formatQuantity(row.minimumQuantity)}</td><td><span className={`stock-status ${stockStatus(row)}`}>{statusText(row)}</span></td><td><div className="actions">{canEdit && <><button className="link-button" onClick={() => startMovement(row)} type="button">Movimiento</button><button className="link-button" onClick={() => startMinimum(row)} type="button">Mínimo</button></>}<button className="link-button" onClick={() => void openHistory(row)} type="button">Historial</button></div></td></tr>)}</tbody></table></div>}
    {movementTarget && <div className="modal-backdrop" role="presentation"><section aria-modal="true" className="modal" role="dialog"><header className="section-header"><div><h2>Registrar movimiento</h2><p>{movementTarget.productName} · {movementTarget.variantName} · {movementTarget.branchName}</p></div><button className="secondary compact" disabled={movementSaving} onClick={() => setMovementTarget(null)} type="button">Cerrar</button></header><form className="grid" onSubmit={(event) => void saveMovement(event)}><label>Tipo<select onChange={(event) => setMovementType(event.target.value as InventoryMovementType)} value={movementType}><option value="inbound">Entrada</option><option value="outbound">Salida</option><option value="adjustment">Ajuste</option></select></label><label>{movementType === "adjustment" ? "Cantidad física real" : "Cantidad"}<input autoFocus inputMode="decimal" onChange={(event) => setMovementInput(event.target.value)} placeholder="Ej. 2 o 1,250" required value={movementInput} /></label><label className="wide">Motivo o nota (opcional)<textarea maxLength={2000} onChange={(event) => setMovementNote(event.target.value)} value={movementNote} /></label>{movementPreview && <p className={`stock-preview wide ${movementPreview.next < 0n ? "invalid" : ""}`}>Stock actual: <strong>{formatQuantity(movementPreview.current)}</strong> · Movimiento: <strong>{movementPreview.delta > 0n ? "+" : ""}{formatQuantity(movementPreview.delta)}</strong> · Nuevo stock: <strong>{formatQuantity(movementPreview.next)}</strong>{movementPreview.next < 0n && " — Stock insuficiente"}</p>}<p className="muted wide">El ajuste registra la cantidad física final y calcula automáticamente su diferencia.</p><div className="form-actions wide"><button disabled={movementSaving || !movementPreview || movementPreview.next < 0n || movementPreview.delta === 0n} type="submit">{movementSaving ? "Guardando…" : "Confirmar movimiento"}</button><button className="secondary" disabled={movementSaving} onClick={() => setMovementTarget(null)} type="button">Cancelar</button></div></form></section></div>}
    {minimumTarget && <div className="modal-backdrop" role="presentation"><section aria-modal="true" className="modal" role="dialog"><header className="section-header"><div><h2>Stock mínimo</h2><p>{minimumTarget.productName} · {minimumTarget.variantName} · {minimumTarget.branchName}</p></div><button className="secondary compact" disabled={minimumSaving} onClick={() => setMinimumTarget(null)} type="button">Cerrar</button></header><form className="grid" onSubmit={(event) => void saveMinimum(event)}><label>Stock mínimo opcional<input autoFocus inputMode="decimal" onChange={(event) => setMinimumInput(event.target.value)} placeholder="Ej. 3 o 1,500" value={minimumInput} /></label><p className="muted wide">Dejá el campo vacío para no marcar esta presentación como stock bajo.</p><div className="form-actions wide"><button disabled={minimumSaving} type="submit">{minimumSaving ? "Guardando…" : "Guardar mínimo"}</button><button className="secondary" disabled={minimumSaving} onClick={() => setMinimumTarget(null)} type="button">Cancelar</button></div></form></section></div>}
    {historyTarget && <div className="modal-backdrop" role="presentation"><section aria-modal="true" className="modal history-modal" role="dialog"><header className="section-header"><div><h2>Historial de movimientos</h2><p>{historyTarget.productName} · {historyTarget.variantName} · {historyTarget.branchName}</p></div><button className="secondary compact" onClick={() => setHistoryTarget(null)} type="button">Cerrar</button></header>{historyLoading ? <p className="muted">Cargando historial…</p> : !history.length ? <p className="muted">Todavía no hay movimientos registrados.</p> : <div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Cantidad</th><th>Stock resultante</th><th>Usuario</th><th>Nota</th></tr></thead><tbody>{history.map((item) => <tr key={item.id}><td>{new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(new Date(item.created_at))}</td><td>{movementLabel(item.type)}</td><td>{item.quantity_delta > 0 ? "+" : ""}{formatQuantity(item.quantity_delta)}</td><td>{formatQuantity(item.resulting_quantity)}</td><td>{item.created_by_name || "Usuario registrado"}</td><td>{item.note || "—"}</td></tr>)}</tbody></table></div>}</section></div>}
  </>;
}

type PricingRow = {
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  price: number | null;
  cost: number | null;
  effectivePrice: number | null;
  currentOffer: Offer | null;
};
type HistoryItem = {
  id: string;
  type: "Precio" | "Costo";
  amount_cents: number | null;
  changed_at: string;
  changed_by: string | null;
};

function Pricing({
  businessId,
  canEdit,
  products,
  role,
}: {
  businessId: string;
  canEdit: boolean;
  products: Product[];
  role: Role;
}) {
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [costs, setCosts] = useState<Record<string, number>>({});
  const [effectivePrices, setEffectivePrices] = useState<Record<string, number>>({});
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<PricingRow | null>(null);
  const [priceInput, setPriceInput] = useState("");
  const [costInput, setCostInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [percentInput, setPercentInput] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [historyTarget, setHistoryTarget] = useState<PricingRow | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [offerTarget, setOfferTarget] = useState<{ row: PricingRow; offer: Offer | null } | null>(null);
  const [offerPriceInput, setOfferPriceInput] = useState("");
  const [offerStartsAt, setOfferStartsAt] = useState("");
  const [offerEndsAt, setOfferEndsAt] = useState("");
  const [offerActive, setOfferActive] = useState(true);
  const [offerSaving, setOfferSaving] = useState(false);

  const loadPricing = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setLoading(true);
    setError(null);
    const [priceResult, offerResult, effectiveResult] = await Promise.all([
      supabase.from("variant_prices").select("variant_id,amount_cents").eq("business_id", businessId),
      supabase.from("variant_offers").select("id,variant_id,promotional_price_cents,starts_at,ends_at,active").eq("business_id", businessId).order("starts_at", { ascending: false }),
      supabase.from("variant_effective_prices").select("variant_id,effective_price_cents").eq("business_id", businessId),
    ]);
    if (priceResult.error ?? offerResult.error ?? effectiveResult.error) {
      setError(humanError(priceResult.error ?? offerResult.error ?? effectiveResult.error));
      setLoading(false);
      return;
    }
    let costResult: { data: { variant_id: string; amount_cents: number }[] | null; error: PostgrestError | null } = {
      data: [],
      error: null,
    };
    if (canEdit)
      costResult = await supabase
        .from("variant_costs")
        .select("variant_id,amount_cents")
        .eq("business_id", businessId);
    if (costResult.error) {
      setError(humanError(costResult.error));
      setLoading(false);
      return;
    }
    setPrices(Object.fromEntries((priceResult.data ?? []).map((item) => [item.variant_id, item.amount_cents])));
    setOffers(offerResult.data ?? []);
    setEffectivePrices(Object.fromEntries((effectiveResult.data ?? []).flatMap((item) => item.variant_id && item.effective_price_cents !== null ? [[item.variant_id, item.effective_price_cents]] : [])));
    setCosts(Object.fromEntries((costResult.data ?? []).map((item) => [item.variant_id, item.amount_cents])));
    setLoading(false);
  }, [businessId, canEdit]);
  useEffect(() => {
    void loadPricing();
  }, [loadPricing]);

  const rows = useMemo<PricingRow[]>(
    () =>
      products.flatMap((product) =>
        product.variants
          .filter((variant): variant is Variant & { id: string } => Boolean(variant.id))
          .map((variant) => {
            const currentOffer = offers.find((offer) => offer.variant_id === variant.id && offerStatus(offer) === "Vigente") ?? null;
            const price = prices[variant.id] ?? null;
            return {
              variantId: variant.id,
              productName: product.name,
              variantName: variant.name,
              sku: variant.sku,
              price,
              cost: canEdit ? (costs[variant.id] ?? null) : null,
              currentOffer,
              effectivePrice: effectivePrices[variant.id] ?? price,
            };
          }),
      ),
    [canEdit, costs, effectivePrices, offers, prices, products],
  );
  const selectedRows = rows.filter((row) => selected.includes(row.variantId));
  const adjustment = parsePercent(percentInput);
  const preview = adjustment === null
    ? []
    : selectedRows.map((row) => ({ ...row, nextPrice: Math.round(row.price! * (1 + adjustment / 100)) }));

  function startEdit(row: PricingRow) {
    setEditing(row);
    setPriceInput(pesosInput(row.price));
    setCostInput(pesosInput(row.cost));
    setError(null);
    setNotice(null);
  }
  function amountFromInput(input: string) {
    return input.trim() ? parsePesos(input) : null;
  }
  async function saveIndividual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || !canEdit) return;
    const parsedPrice = amountFromInput(priceInput);
    const parsedCost = amountFromInput(costInput);
    if ((priceInput.trim() && parsedPrice === null) || (costInput.trim() && parsedCost === null)) {
      setError("Ingresá importes válidos, sin valores negativos y con hasta dos decimales.");
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setSaving(true);
    setError(null);
    const writes = [
      parsedPrice === null
        ? supabase.from("variant_prices").delete().eq("variant_id", editing.variantId).eq("business_id", businessId)
        : supabase.from("variant_prices").upsert({ variant_id: editing.variantId, business_id: businessId, amount_cents: parsedPrice }, { onConflict: "variant_id" }),
      parsedCost === null
        ? supabase.from("variant_costs").delete().eq("variant_id", editing.variantId).eq("business_id", businessId)
        : supabase.from("variant_costs").upsert({ variant_id: editing.variantId, business_id: businessId, amount_cents: parsedCost }, { onConflict: "variant_id" }),
    ];
    const results = await Promise.all(writes);
    const failed = results.find((result) => result.error);
    setSaving(false);
    if (failed?.error) return setError(humanError(failed.error));
    setEditing(null);
    setNotice("Los importes se guardaron correctamente.");
    await loadPricing();
  }
  function openOffer(row: PricingRow, offer: Offer | null = null) {
    setOfferTarget({ row, offer });
    setOfferPriceInput(pesosInput(offer?.promotional_price_cents));
    setOfferStartsAt(localDateTimeInput(offer?.starts_at ?? new Date().toISOString()));
    setOfferEndsAt(localDateTimeInput(offer?.ends_at));
    setOfferActive(offer?.active ?? true);
    setError(null);
    setNotice(null);
  }
  async function saveOffer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!offerTarget || !canEdit) return;
    const promotionalPrice = parsePesos(offerPriceInput);
    const startsAt = new Date(offerStartsAt);
    const endsAt = offerEndsAt ? new Date(offerEndsAt) : null;
    if (promotionalPrice === null || Number.isNaN(startsAt.valueOf()) || (endsAt && (Number.isNaN(endsAt.valueOf()) || endsAt <= startsAt))) {
      setError("Indicá un precio promocional válido y una vigencia con fin posterior al inicio.");
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setOfferSaving(true);
    setError(null);
    const payload = {
      business_id: businessId,
      variant_id: offerTarget.row.variantId,
      promotional_price_cents: promotionalPrice,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt?.toISOString() ?? null,
      active: offerActive,
    };
    const result = offerTarget.offer
      ? await supabase.from("variant_offers").update(payload).eq("id", offerTarget.offer.id).eq("business_id", businessId)
      : await supabase.from("variant_offers").insert(payload);
    setOfferSaving(false);
    if (result.error) return setError(humanError(result.error));
    setOfferTarget(null);
    setNotice("La oferta se guardó correctamente. El precio base no se modificó.");
    await loadPricing();
  }
  async function openHistory(row: PricingRow) {
    if (!canEdit) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setHistoryTarget(row);
    setHistory([]);
    setHistoryLoading(true);
    setError(null);
    const [priceResult, costResult] = await Promise.all([
      supabase.from("variant_price_history").select("id,amount_cents,changed_at,changed_by").eq("business_id", businessId).eq("variant_id", row.variantId).order("changed_at", { ascending: false }),
      supabase.from("variant_cost_history").select("id,amount_cents,changed_at,changed_by").eq("business_id", businessId).eq("variant_id", row.variantId).order("changed_at", { ascending: false }),
    ]);
    setHistoryLoading(false);
    const failure = priceResult.error ?? costResult.error;
    if (failure) return setError(humanError(failure));
    setHistory([
      ...(priceResult.data ?? []).map((item) => ({ ...item, type: "Precio" as const })),
      ...(costResult.data ?? []).map((item) => ({ ...item, type: "Costo" as const })),
    ].sort((left, right) => right.changed_at.localeCompare(left.changed_at)));
  }
  async function applyBulk() {
    if (!selectedRows.length) return setError("Seleccioná al menos una variante con precio definido.");
    if (adjustment === null) return setError("Ingresá un porcentaje válido (puede ser negativo hasta -100).");
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setBulkSaving(true);
    setError(null);
    const { error: bulkError } = await supabase.rpc("adjust_variant_prices", {
      target_business_id: businessId,
      target_variant_ids: selectedRows.map((row) => row.variantId),
      adjustment_percent: adjustment,
    });
    setBulkSaving(false);
    if (bulkError) return setError(humanError(bulkError));
    setSelected([]);
    setPercentInput("");
    setNotice("La actualización masiva se aplicó correctamente.");
    await loadPricing();
  }
  const toggleSelected = (variantId: string) =>
    setSelected((current) => current.includes(variantId) ? current.filter((id) => id !== variantId) : [...current, variantId]);

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Catálogo</p>
          <h1>Precios</h1>
          <p className="subtle">Administrá el precio base y sus ofertas por presentación. {role === "staff" ? "Tu rol muestra únicamente precios de venta y promociones vigentes." : "Los costos y márgenes son privados para administración."}</p>
        </div>
      </header>
      {notice && <p className="notice" role="status">{notice}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {canEdit && (
        <section className="bulk-panel">
          <div>
            <h2>Actualizar precios seleccionados</h2>
            <p className="muted">Aplicá un porcentaje sobre los precios de venta. Los costos no cambian.</p>
          </div>
          <label>
            Ajuste porcentual
            <input aria-label="Ajuste porcentual" inputMode="decimal" onChange={(event) => setPercentInput(event.target.value)} placeholder="Ej. 8 o -5" value={percentInput} />
          </label>
          <button disabled={bulkSaving || !selectedRows.length || adjustment === null} onClick={() => void applyBulk()} type="button">
            {bulkSaving ? "Aplicando…" : "Confirmar actualización"}
          </button>
        </section>
      )}
      {canEdit && selectedRows.length > 0 && adjustment !== null && (
        <section className="preview-panel">
          <h2>Vista previa</h2>
          <table>
            <thead><tr><th>Producto</th><th>Actual</th><th>Nuevo</th></tr></thead>
            <tbody>{preview.map((row) => <tr key={row.variantId}><td>{row.productName} · {row.variantName}</td><td>{formatPesos(row.price)}</td><td>{formatPesos(row.nextPrice)}</td></tr>)}</tbody>
          </table>
        </section>
      )}
      {loading ? <StateBox title="Cargando precios…" /> : !rows.length ? <StateBox title="Todavía no hay presentaciones" text="Cuando cargues productos con presentaciones, vas a poder definir sus precios acá." /> : (
        <div className="table-wrap">
          <table>
            <thead><tr>{canEdit && <th aria-label="Seleccionar" />}<th>Producto</th><th>Presentación</th><th>SKU</th><th>Precio normal</th><th>Oferta vigente</th><th>Precio efectivo</th>{canEdit && <><th>Costo</th><th>Ganancia bruta</th><th>Margen bruto</th><th /></>}</tr></thead>
            <tbody>{rows.map((row) => {
              const hasMargin = row.price !== null && row.cost !== null;
              const grossProfit = hasMargin ? row.price! - row.cost! : null;
              const margin = hasMargin && row.price! > 0 ? (grossProfit! / row.price!) * 100 : null;
              return <tr key={row.variantId}>
                {canEdit && <td><input aria-label={`Seleccionar ${row.productName} ${row.variantName}`} checked={selected.includes(row.variantId)} disabled={row.price === null} onChange={() => toggleSelected(row.variantId)} type="checkbox" /></td>}
                <td><strong>{row.productName}</strong></td><td>{row.variantName}</td><td>{row.sku || "—"}</td><td>{formatPesos(row.price)}</td><td>{row.currentOffer ? <span><strong>{formatPesos(row.currentOffer.promotional_price_cents)}</strong><br /><small>{formatDateRange(row.currentOffer.starts_at, row.currentOffer.ends_at)}</small></span> : "—"}</td><td><strong>{formatPesos(row.effectivePrice)}</strong></td>
                {canEdit && <><td>{formatPesos(row.cost)}</td><td>{grossProfit === null ? "Sin datos" : formatPesos(grossProfit)}</td><td>{margin === null ? "Sin datos" : `${margin.toLocaleString("es-AR", { maximumFractionDigits: 1 })} %`}</td><td><div className="actions"><button className="link-button" onClick={() => startEdit(row)} type="button">Importes</button><button className="link-button" onClick={() => openOffer(row)} type="button">Nueva oferta</button><button className="link-button" onClick={() => void openHistory(row)} type="button">Historial</button></div></td></>}
              </tr>;
            })}</tbody>
          </table>
        </div>
      )}
      {!loading && offers.length > 0 && <section className="offer-list"><header className="section-header"><div><h2>Ofertas programadas</h2><p>Una oferta desactivada, futura o vencida nunca reemplaza el precio base.</p></div></header><div className="table-wrap"><table><thead><tr><th>Presentación</th><th>Precio promocional</th><th>Vigencia</th><th>Estado</th>{canEdit && <th />}</tr></thead><tbody>{offers.map((offer) => { const row = rows.find((item) => item.variantId === offer.variant_id); return <tr key={offer.id}><td>{row ? <><strong>{row.productName}</strong><br /><span className="muted">{row.variantName}</span></> : "Presentación no disponible"}</td><td>{formatPesos(offer.promotional_price_cents)}</td><td>{formatDateRange(offer.starts_at, offer.ends_at)}</td><td><span className={`offer-status ${offerStatusClass(offer)}`}>{offerStatus(offer)}</span></td>{canEdit && <td>{row && <button className="link-button" onClick={() => openOffer(row, offer)} type="button">Editar</button>}</td>}</tr>; })}</tbody></table></div></section>}
      {editing && <div className="modal-backdrop" role="presentation"><section aria-modal="true" className="modal" role="dialog"><header className="section-header"><div><h2>Editar importes</h2><p>{editing.productName} · {editing.variantName}</p></div><button className="secondary compact" disabled={saving} onClick={() => setEditing(null)} type="button">Cerrar</button></header><form className="grid" onSubmit={(event) => void saveIndividual(event)}><label>Precio de venta<input autoFocus inputMode="decimal" onChange={(event) => setPriceInput(event.target.value)} placeholder="Ej. 12500,50" value={priceInput} /></label><label>Costo<input inputMode="decimal" onChange={(event) => setCostInput(event.target.value)} placeholder="Ej. 8000" value={costInput} /></label><p className="muted wide">Dejá un campo vacío para quitar su importe actual.</p><div className="form-actions wide"><button disabled={saving} type="submit">{saving ? "Guardando…" : "Guardar importes"}</button><button className="secondary" disabled={saving} onClick={() => setEditing(null)} type="button">Cancelar</button></div></form></section></div>}
      {offerTarget && <div className="modal-backdrop" role="presentation"><section aria-modal="true" className="modal" role="dialog"><header className="section-header"><div><h2>{offerTarget.offer ? "Editar oferta" : "Nueva oferta"}</h2><p>{offerTarget.row.productName} · {offerTarget.row.variantName}</p></div><button className="secondary compact" disabled={offerSaving} onClick={() => setOfferTarget(null)} type="button">Cerrar</button></header><form className="grid" onSubmit={(event) => void saveOffer(event)}><p className="notice wide">Precio normal: <strong>{formatPesos(offerTarget.row.price)}</strong>. La oferta no modifica este importe.</p><label>Precio promocional<input autoFocus inputMode="decimal" onChange={(event) => setOfferPriceInput(event.target.value)} placeholder="Ej. 12500,50" required value={offerPriceInput} /></label><label>Inicio<input onChange={(event) => setOfferStartsAt(event.target.value)} required type="datetime-local" value={offerStartsAt} /></label><label>Fin (opcional)<input min={offerStartsAt || undefined} onChange={(event) => setOfferEndsAt(event.target.value)} type="datetime-local" value={offerEndsAt} /></label><label className="check"> <input checked={offerActive} onChange={(event) => setOfferActive(event.target.checked)} type="checkbox" /> Activa</label><p className="muted wide">No podés guardar dos ofertas activas que se superpongan para la misma presentación.</p><div className="form-actions wide"><button disabled={offerSaving} type="submit">{offerSaving ? "Guardando…" : "Guardar oferta"}</button><button className="secondary" disabled={offerSaving} onClick={() => setOfferTarget(null)} type="button">Cancelar</button></div></form></section></div>}
      {historyTarget && <div className="modal-backdrop" role="presentation"><section aria-modal="true" className="modal history-modal" role="dialog"><header className="section-header"><div><h2>Historial de importes</h2><p>{historyTarget.productName} · {historyTarget.variantName}</p></div><button className="secondary compact" onClick={() => setHistoryTarget(null)} type="button">Cerrar</button></header>{historyLoading ? <p className="muted">Cargando historial…</p> : !history.length ? <p className="muted">Todavía no hay cambios registrados.</p> : <div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Valor</th><th>Usuario</th></tr></thead><tbody>{history.map((item) => <tr key={`${item.type}-${item.id}`}><td>{new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(new Date(item.changed_at))}</td><td>{item.type}</td><td>{item.amount_cents === null ? "Importe quitado" : formatPesos(item.amount_cents)}</td><td>{item.changed_by ? "Usuario registrado" : "No disponible"}</td></tr>)}</tbody></table></div>}</section></div>}
    </>
  );
}

type LabelFormat = "small" | "shelf" | "offer";
type LabelItem = {
  variantId: string;
  productName: string;
  variantName: string;
  brandName: string | null;
  barcode: string | null;
  basePrice: number | null;
  effectivePrice: number | null;
  promotionalPrice: number | null;
};

function PrintedLabel({ item, format }: { item: LabelItem; format: LabelFormat }) {
  const hasOffer = item.promotionalPrice !== null;
  if (format === "offer") return <article className="print-card offer-poster"><div className="poster-brand">La Estancia</div><div className="poster-offer">OFERTA</div>{item.brandName && <p className="poster-brand-name">{item.brandName}</p>}<h2>{item.productName}</h2><p className="poster-variant">{item.variantName}</p>{hasOffer ? <><p className="poster-normal">Antes {formatPesos(item.basePrice)}</p><strong className="poster-price">{formatPesos(item.promotionalPrice)}</strong></> : <><p className="poster-normal">No hay oferta vigente</p><strong className="poster-price">{formatPesos(item.basePrice)}</strong></>}{item.barcode && <p className="print-barcode">{item.barcode}</p>}</article>;
  return <article className={`print-card label-${format}`}>
    {format === "shelf" && item.brandName && <p className="label-brand">{item.brandName}</p>}
    <h2>{item.productName}</h2><p className="label-variant">{item.variantName}</p>
    {hasOffer && <p className="label-normal">Normal: {formatPesos(item.basePrice)}</p>}
    <strong className="label-price">{formatPesos(item.effectivePrice)}</strong>
    {item.barcode ? <p className="print-barcode">{item.barcode}</p> : <p className="no-barcode">Sin código de barras</p>}
  </article>;
}

function Labels({ businessId, products }: { businessId: string; products: Product[] }) {
  const [items, setItems] = useState<LabelItem[]>([]);
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [format, setFormat] = useState<LabelFormat>("small");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setLoading(true);
    setError(null);
    const [brandResult, priceResult] = await Promise.all([
      supabase.from("brands").select("id,name").eq("business_id", businessId),
      supabase.from("variant_effective_prices").select("variant_id,base_price_cents,effective_price_cents,promotional_price_cents").eq("business_id", businessId),
    ]);
    const failure = brandResult.error ?? priceResult.error;
    if (failure) {
      setError(humanError(failure));
      setLoading(false);
      return;
    }
    const brands = new Map((brandResult.data ?? []).map((brand) => [brand.id, brand.name]));
    const prices = new Map((priceResult.data ?? []).map((price) => [price.variant_id, price]));
    setItems(products.flatMap((product) => product.variants.filter((variant): variant is Variant & { id: string } => Boolean(variant.id)).map((variant) => {
      const price = prices.get(variant.id);
      return {
        variantId: variant.id,
        productName: product.name,
        variantName: variant.name,
        brandName: product.brand_id ? brands.get(product.brand_id) ?? null : null,
        barcode: variant.barcodes.find((barcode) => barcode.is_primary)?.code ?? null,
        basePrice: price?.base_price_cents ?? null,
        effectivePrice: price?.effective_price_cents ?? null,
        promotionalPrice: price?.promotional_price_cents ?? null,
      };
    })));
    setLoading(false);
  }, [businessId, products]);
  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase("es-AR");
    return !normalized ? items : items.filter((item) => [item.productName, item.variantName, item.brandName ?? "", item.barcode ?? ""].some((value) => value.toLocaleLowerCase("es-AR").includes(normalized)));
  }, [items, search]);
  const selectedItems = items.filter((item) => (selected[item.variantId] ?? 0) > 0);
  const copies = selectedItems.flatMap((item) => Array.from({ length: selected[item.variantId] }, (_, copy) => ({ item, copy })));
  function setQuantity(variantId: string, quantity: number) {
    setSelected((current) => ({ ...current, [variantId]: Math.max(0, Math.min(99, quantity || 0)) }));
  }
  function selectVisible() {
    setSelected((current) => ({ ...current, ...Object.fromEntries(filtered.map((item) => [item.variantId, current[item.variantId] || 1])) }));
  }

  return <>
    <header className="page-header no-print"><div><p className="eyebrow">Catálogo</p><h1>Etiquetas</h1><p className="subtle">Elegí presentaciones y cantidades; la vista previa muestra exactamente lo que se imprimirá.</p></div><button disabled={!copies.length} onClick={() => window.print()} type="button">Imprimir</button></header>
    {error && <p className="form-error no-print" role="alert">{error}</p>}
    <section className="label-controls no-print"><div className="format-picker"><h2>Formato</h2><label><input checked={format === "small"} name="label-format" onChange={() => setFormat("small")} type="radio" /> Etiqueta chica</label><label><input checked={format === "shelf"} name="label-format" onChange={() => setFormat("shelf")} type="radio" /> Etiqueta de góndola</label><label><input checked={format === "offer"} name="label-format" onChange={() => setFormat("offer")} type="radio" /> Cartel de oferta</label></div><div><label>Buscar producto, presentación, marca o código<input onChange={(event) => setSearch(event.target.value)} placeholder="Ej. Royal Canin o 779…" value={search} /></label><button className="secondary compact" onClick={selectVisible} type="button">Seleccionar visibles</button></div></section>
    <section className="label-selection no-print"><header className="section-header"><div><h2>Presentaciones</h2><p>{selectedItems.length ? `${selectedItems.length} seleccionadas · ${copies.length} copias` : "Seleccioná al menos una presentación."}</p></div></header>{loading ? <p className="muted">Cargando precios efectivos…</p> : !filtered.length ? <p className="muted">No encontramos presentaciones con esa búsqueda.</p> : <div className="table-wrap"><table><thead><tr><th>Imprimir</th><th>Producto</th><th>Presentación</th><th>Marca</th><th>Precio normal</th><th>Promoción vigente</th><th>Barcode principal</th><th>Copias</th></tr></thead><tbody>{filtered.map((item) => { const quantity = selected[item.variantId] ?? 0; return <tr key={item.variantId}><td><input aria-label={`Imprimir ${item.productName} ${item.variantName}`} checked={quantity > 0} onChange={(event) => setQuantity(item.variantId, event.target.checked ? Math.max(1, quantity) : 0)} type="checkbox" /></td><td><strong>{item.productName}</strong></td><td>{item.variantName}</td><td>{item.brandName ?? "—"}</td><td>{formatPesos(item.basePrice)}</td><td>{item.promotionalPrice === null ? "—" : formatPesos(item.promotionalPrice)}</td><td>{item.barcode ?? <span className="muted">Sin barcode</span>}</td><td><input aria-label={`Copias de ${item.productName} ${item.variantName}`} disabled={!quantity} min="1" onChange={(event) => setQuantity(item.variantId, Number(event.target.value))} type="number" value={quantity || ""} /></td></tr>; })}</tbody></table></div>}</section>
    <section className={`print-preview format-${format}`}><header className="section-header no-print"><div><p className="eyebrow">Vista previa</p><h2>{format === "small" ? "Etiqueta chica" : format === "shelf" ? "Etiqueta de góndola" : "Cartel de oferta"}</h2></div><span className="muted">{copies.length ? `${copies.length} unidad${copies.length === 1 ? "" : "es"} a imprimir` : "Sin selecciones"}</span></header>{copies.length ? <div className="print-sheet">{copies.map(({ item, copy }) => <PrintedLabel item={item} format={format} key={`${item.variantId}-${copy}`} />)}</div> : <p className="empty-preview no-print">La vista previa aparecerá cuando selecciones una presentación.</p>}</section>
  </>;
}

function StateBox({
  title,
  text,
  action,
}: {
  title: string;
  text?: string;
  action?: () => void;
}) {
  return (
    <section className="state-box">
      <h2>{title}</h2>
      {text && <p>{text}</p>}
      {action && (
        <button onClick={action} type="button">
          {title.startsWith("No encontramos") ? "Crear producto" : "Reintentar"}
        </button>
      )}
    </section>
  );
}

function References({
  title,
  table,
  items,
  businessId,
  canEdit,
  reload,
}: {
  title: string;
  table: "brands" | "categories";
  items: Brand[];
  businessId: string;
  canEdit: boolean;
  reload: () => Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const singular = title.slice(0, -1).toLowerCase();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = value.trim();
    if (!clean) return;
    if (
      items.some(
        (item) =>
          item.id !== editing &&
          item.name.localeCompare(clean, undefined, {
            sensitivity: "accent",
          }) === 0,
      )
    )
      return setError(`Ya existe una ${singular} con ese nombre.`);
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setSaving(true);
    setError(null);
    const result = editing
      ? await supabase
          .from(table)
          .update({ name: clean })
          .eq("id", editing)
          .eq("business_id", businessId)
      : await supabase
          .from(table)
          .insert({ name: clean, business_id: businessId });
    setSaving(false);
    if (result.error) return setError(humanError(result.error));
    setValue("");
    setEditing(null);
    await reload();
  }
  async function toggle(item: Brand) {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setSaving(true);
    const { error: updateError } = await supabase
      .from(table)
      .update({ is_active: !item.is_active })
      .eq("id", item.id)
      .eq("business_id", businessId);
    setSaving(false);
    if (updateError) return setError(humanError(updateError));
    await reload();
  }
  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Catálogo</p>
          <h1>{title}</h1>
          <p className="subtle">
            Mantené tus {title.toLowerCase()} disponibles y ordenadas.
          </p>
        </div>
      </header>
      {canEdit ? (
        <form
          className="reference-form"
          onSubmit={(event) => void submit(event)}
        >
          <label>
            {editing ? `Editar ${singular}` : `Nueva ${singular}`}
            <input
              onChange={(event) => setValue(event.target.value)}
              placeholder={`Nombre de la ${singular}`}
              required
              value={value}
            />
          </label>
          <button disabled={saving} type="submit">
            {saving
              ? "Guardando…"
              : editing
                ? "Guardar cambios"
                : `Agregar ${singular}`}
          </button>
          {editing && (
            <button
              className="secondary"
              onClick={() => {
                setValue("");
                setEditing(null);
                setError(null);
              }}
              type="button"
            >
              Cancelar
            </button>
          )}
        </form>
      ) : (
        <p className="notice">
          Tu rol permite consultar, pero no modificar este catálogo.
        </p>
      )}
      {error && <p className="form-error">{error}</p>}
      {!items.length ? (
        <StateBox
          title={`Todavía no hay ${title.toLowerCase()}`}
          text={
            canEdit
              ? `Agregá la primera ${singular} desde el formulario.`
              : "No hay elementos para mostrar."
          }
        />
      ) : (
        <section className="reference-list">
          {items.map((item) => (
            <article className="reference-row" key={item.id}>
              <div>
                <strong>{item.name}</strong>
                <Badge active={item.is_active} />
              </div>
              {canEdit && (
                <div className="actions">
                  <button
                    className="link-button"
                    onClick={() => {
                      setEditing(item.id);
                      setValue(item.name);
                      setError(null);
                    }}
                    type="button"
                  >
                    Editar
                  </button>
                  <button
                    className="secondary compact"
                    disabled={saving}
                    onClick={() => void toggle(item)}
                    type="button"
                  >
                    {item.is_active ? "Desactivar" : "Activar"}
                  </button>
                </div>
              )}
            </article>
          ))}
        </section>
      )}
    </>
  );
}

function Editor({
  businessId,
  brands,
  categories,
  canEdit,
  product,
  reload,
}: {
  businessId: string;
  brands: Brand[];
  categories: Category[];
  canEdit: boolean;
  product?: Product;
  reload: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<ProductDraft>(() => productDraft(product));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setDraft(productDraft(product));
    setError(null);
  }, [product]);
  const changeVariant = (index: number, patch: Partial<Variant>) =>
    setDraft((value) => ({
      ...value,
      variants: value.variants.map((variant, current) =>
        current === index ? { ...variant, ...patch } : variant,
      ),
    }));
  const barcode = (variant: number, index: number, patch: Partial<Barcode>) =>
    changeVariant(variant, {
      barcodes: draft.variants[variant].barcodes.map((item, current) =>
        current === index ? { ...item, ...patch } : item,
      ),
    });
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit) return;
    const clean = {
      ...draft,
      name: draft.name.trim(),
      description: draft.description.trim(),
      variants: draft.variants.map((variant) => ({
        ...variant,
        name: variant.name.trim(),
        sku: variant.sku.trim(),
        barcodes: variant.barcodes
          .map((item) => ({ ...item, code: item.code.trim() }))
          .filter((item) => item.code),
      })),
    };
    if (!clean.name || clean.variants.some((item) => !item.name))
      return setError(
        "Completá el nombre del producto y de cada presentación.",
      );
    const skus = clean.variants
      .filter((item) => item.sku)
      .map((item) => item.sku.toLowerCase());
    const codes = clean.variants.flatMap((item) =>
      item.barcodes.map((code) => code.code.toLowerCase()),
    );
    if (new Set(skus).size !== skus.length)
      return setError("No repitas un SKU dentro del mismo producto.");
    if (new Set(codes).size !== codes.length)
      return setError(
        "No repitas un código de barras dentro del mismo producto.",
      );
    if (
      clean.variants.some(
        (item) => item.barcodes.filter((code) => code.is_primary).length > 1,
      )
    )
      return setError(
        "Cada presentación puede tener un solo código principal.",
      );
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setSaving(true);
    setError(null);
    let productId = product?.id;
    const payload = {
      business_id: businessId,
      name: clean.name,
      description: clean.description || null,
      is_active: clean.is_active,
      brand_id: clean.brand_id,
      category_id: clean.category_id,
    };
    const result = productId
      ? await supabase
          .from("products")
          .update(payload)
          .eq("id", productId)
          .eq("business_id", businessId)
          .select("id")
          .single()
      : await supabase.from("products").insert(payload).select("id").single();
    if (result.error || !result.data) {
      setSaving(false);
      return setError(humanError(result.error));
    }
    productId = result.data.id;
    const previous = product?.variants ?? [];
    const requested = new Set(
      clean.variants.flatMap((item) => (item.id ? [item.id] : [])),
    );
    for (const old of previous.filter(
      (item) => item.id && !requested.has(item.id),
    )) {
      const removeCodes = await supabase
        .from("product_barcodes")
        .delete()
        .eq("variant_id", old.id!)
        .eq("business_id", businessId);
      const removeVariant = removeCodes.error
        ? removeCodes
        : await supabase
            .from("product_variants")
            .delete()
            .eq("id", old.id!)
            .eq("business_id", businessId);
      if (removeVariant.error) {
        setSaving(false);
        return setError(humanError(removeVariant.error));
      }
    }
    for (const item of clean.variants) {
      const variantPayload = {
        business_id: businessId,
        product_id: productId,
        name: item.name,
        sku: item.sku || null,
        is_active: item.is_active,
      };
      const variantResult = item.id
        ? await supabase
            .from("product_variants")
            .update(variantPayload)
            .eq("id", item.id)
            .eq("business_id", businessId)
            .select("id")
            .single()
        : await supabase
            .from("product_variants")
            .insert(variantPayload)
            .select("id")
            .single();
      if (variantResult.error || !variantResult.data) {
        setSaving(false);
        return setError(humanError(variantResult.error));
      }
      const variantId = variantResult.data.id;
      const original = previous.find((value) => value.id === item.id);
      const saved = new Set(
        item.barcodes.flatMap((value) => (value.id ? [value.id] : [])),
      );
      for (const oldCode of original?.barcodes.filter(
        (value) => value.id && !saved.has(value.id),
      ) ?? []) {
        const remove = await supabase
          .from("product_barcodes")
          .delete()
          .eq("id", oldCode.id!)
          .eq("business_id", businessId);
        if (remove.error) {
          setSaving(false);
          return setError(humanError(remove.error));
        }
      }
      if (item.id) {
        const reset = await supabase
          .from("product_barcodes")
          .update({ is_primary: false })
          .eq("variant_id", variantId)
          .eq("business_id", businessId);
        if (reset.error) {
          setSaving(false);
          return setError(humanError(reset.error));
        }
      }
      for (const code of item.barcodes) {
        const codePayload = {
          business_id: businessId,
          variant_id: variantId,
          code: code.code,
          is_primary: code.is_primary,
        };
        const codeResult = code.id
          ? await supabase
              .from("product_barcodes")
              .update(codePayload)
              .eq("id", code.id)
              .eq("business_id", businessId)
          : await supabase.from("product_barcodes").insert(codePayload);
        if (codeResult.error) {
          setSaving(false);
          return setError(humanError(codeResult.error));
        }
      }
    }
    setSaving(false);
    await reload();
    navigate("/");
  }
  if (!canEdit)
    return (
      <StateBox
        title="Solo consulta"
        text="No tenés permisos para editar productos."
        action={() => navigate("/")}
      />
    );
  if (!product && window.location.pathname !== "/products/new")
    return (
      <StateBox
        title="Producto no encontrado"
        text="Puede que haya sido eliminado o todavía esté cargando."
        action={() => navigate("/")}
      />
    );
  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Catálogo</p>
          <h1>{product ? "Editar producto" : "Nuevo producto"}</h1>
          <p className="subtle">
            Los datos se guardan en el catálogo de tu negocio.
          </p>
        </div>
        <button
          className="secondary"
          onClick={() => navigate("/")}
          type="button"
        >
          Cancelar
        </button>
      </header>
      <form className="product-form" onSubmit={(event) => void save(event)}>
        <section className="form-section">
          <h2>Datos principales</h2>
          <div className="grid">
            <label className="wide">
              Nombre del producto
              <input
                autoFocus
                onChange={(event) =>
                  setDraft({ ...draft, name: event.target.value })
                }
                required
                value={draft.name}
              />
            </label>
            <label>
              Marca
              <select
                onChange={(event) =>
                  setDraft({ ...draft, brand_id: event.target.value || null })
                }
                value={draft.brand_id ?? ""}
              >
                <option value="">Sin marca</option>
                {brands.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                    {item.is_active ? "" : " (inactiva)"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Categoría
              <select
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    category_id: event.target.value || null,
                  })
                }
                value={draft.category_id ?? ""}
              >
                <option value="">Sin categoría</option>
                {categories.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                    {item.is_active ? "" : " (inactiva)"}
                  </option>
                ))}
              </select>
            </label>
            <label className="wide">
              Descripción (opcional)
              <textarea
                onChange={(event) =>
                  setDraft({ ...draft, description: event.target.value })
                }
                rows={3}
                value={draft.description}
              />
            </label>
            <label className="check">
              <input
                checked={draft.is_active}
                onChange={(event) =>
                  setDraft({ ...draft, is_active: event.target.checked })
                }
                type="checkbox"
              />{" "}
              Producto activo
            </label>
          </div>
        </section>
        <section className="form-section">
          <div className="section-header">
            <div>
              <h2>Presentaciones</h2>
              <p>
                Usá una sola para productos simples; agregá más cuando cambie el
                tamaño o formato.
              </p>
            </div>
            <button
              className="secondary"
              onClick={() =>
                setDraft({
                  ...draft,
                  variants: [
                    ...draft.variants,
                    { ...blankVariant(), name: "" },
                  ],
                })
              }
              type="button"
            >
              Agregar presentación
            </button>
          </div>
          {draft.variants.map((variant, vi) => (
            <article className="variant" key={variant.id ?? `new-${vi}`}>
              <div className="section-header">
                <h3>Presentación {vi + 1}</h3>
                {draft.variants.length > 1 && (
                  <button
                    className="link-button danger"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        variants: draft.variants.filter(
                          (_, index) => index !== vi,
                        ),
                      })
                    }
                    type="button"
                  >
                    Eliminar presentación
                  </button>
                )}
              </div>
              <div className="grid">
                <label>
                  Nombre de presentación
                  <input
                    onChange={(event) =>
                      changeVariant(vi, { name: event.target.value })
                    }
                    required
                    value={variant.name}
                  />
                </label>
                <label>
                  SKU (opcional)
                  <input
                    onChange={(event) =>
                      changeVariant(vi, { sku: event.target.value })
                    }
                    value={variant.sku}
                  />
                </label>
                <label className="check">
                  <input
                    checked={variant.is_active}
                    onChange={(event) =>
                      changeVariant(vi, { is_active: event.target.checked })
                    }
                    type="checkbox"
                  />{" "}
                  Presentación activa
                </label>
              </div>
              <div className="barcode-area">
                <div className="section-header">
                  <div>
                    <h4>Códigos de barras</h4>
                    <p>Podés cargar más de uno y elegir el principal.</p>
                  </div>
                  <button
                    className="secondary compact"
                    onClick={() =>
                      changeVariant(vi, {
                        barcodes: [
                          ...variant.barcodes,
                          { code: "", is_primary: !variant.barcodes.length },
                        ],
                      })
                    }
                    type="button"
                  >
                    Agregar código
                  </button>
                </div>
                {!variant.barcodes.length ? (
                  <p className="muted">Todavía no hay códigos cargados.</p>
                ) : (
                  variant.barcodes.map((item, bi) => (
                    <div className="barcode-row" key={item.id ?? `new-${bi}`}>
                      <input
                        aria-label={`Código de barras ${bi + 1}`}
                        onChange={(event) =>
                          barcode(vi, bi, { code: event.target.value })
                        }
                        placeholder="Código de barras"
                        required
                        value={item.code}
                      />
                      <label className="radio">
                        <input
                          checked={item.is_primary}
                          name={`primary-${vi}`}
                          onChange={() =>
                            changeVariant(vi, {
                              barcodes: variant.barcodes.map((code, index) => ({
                                ...code,
                                is_primary: index === bi,
                              })),
                            })
                          }
                          type="radio"
                        />{" "}
                        Principal
                      </label>
                      <button
                        className="link-button danger"
                        onClick={() => {
                          const rest = variant.barcodes.filter(
                            (_, index) => index !== bi,
                          );
                          changeVariant(vi, {
                            barcodes: rest.map((code, index) => ({
                              ...code,
                              is_primary: code.is_primary || index === 0,
                            })),
                          });
                        }}
                        type="button"
                      >
                        Quitar
                      </button>
                    </div>
                  ))
                )}
              </div>
            </article>
          ))}
        </section>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button disabled={saving} type="submit">
            {saving ? "Guardando…" : "Guardar producto"}
          </button>
          <button
            className="secondary"
            disabled={saving}
            onClick={() => navigate("/")}
            type="button"
          >
            Cancelar
          </button>
        </div>
      </form>
    </>
  );
}

export function App() {
  const configError = getSupabaseConfigurationError();
  const [access, setAccess] = useState<Access>(
    configError
      ? { status: "configuration-error", message: configError }
      : { status: "resolving-session" },
  );
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;
    let alive = true;
    void client.auth.getSession().then(({ data, error }) => {
      if (!alive) return;
      if (error) setAccess({ status: "error", message: error.message });
      else setUserId(data.session?.user.id ?? null);
    });
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      if (alive) setUserId(session?.user.id ?? null);
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client || userId === undefined) return;
    if (!userId) {
      setAccess({ status: "signed-out" });
      return;
    }
    let alive = true;
    setAccess({ status: "resolving-access" });
    void (async () => {
      const { data: memberships, error } = await client
        .from("business_memberships")
        .select("business_id,role")
        .eq("is_active", true)
        .order("created_at")
        .limit(1);
      if (!alive) return;
      if (error) {
        setAccess({ status: "error", message: error.message });
        return;
      }
      const membership = memberships?.[0];
      if (!membership) {
        setAccess({ status: "no-access" });
        return;
      }
      const { data: business, error: businessError } = await client
        .from("businesses")
        .select("name")
        .eq("id", membership.business_id)
        .maybeSingle();
      if (!alive) return;
      if (businessError) {
        setAccess({ status: "error", message: businessError.message });
        return;
      }
      if (!business) {
        setAccess({ status: "no-access" });
        return;
      }
      setAccess({
        status: "authorized",
        businessId: membership.business_id,
        businessName: business.name,
        role: membership.role,
      });
    })();
    return () => {
      alive = false;
    };
  }, [userId]);
  useEffect(() => {
    if (
      access.status === "signed-out" &&
      window.location.pathname !== loginPath
    )
      navigate(loginPath);
    if (
      access.status === "authorized" &&
      window.location.pathname === loginPath
    )
      navigate("/");
  }, [access.status]);
  async function logout() {
    const client = getSupabaseClient();
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) setAccess({ status: "error", message: error.message });
  }
  if (access.status === "configuration-error")
    return <Loading message={access.message} />;
  if (access.status === "resolving-session")
    return <Loading message="Restaurando tu sesión…" />;
  if (access.status === "signed-out") return <Login />;
  if (access.status === "resolving-access")
    return <Loading message="Verificando tu acceso…" />;
  if (access.status === "no-access") return <NoAccess onLogout={logout} />;
  if (access.status === "authorized")
    return <Catalog {...access} onLogout={logout} />;
  if (access.status === "error")
    return (
      <Loading message={`No se pudo resolver el acceso: ${access.message}`} />
    );
  return <Loading message="No se pudo resolver el acceso." />;
}
