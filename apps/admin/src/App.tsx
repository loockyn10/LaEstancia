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
  if (
    message.includes("row-level security") ||
    message.includes("permission denied")
  )
    return "No tenés permiso para realizar esta acción.";
  return "No se pudo guardar. Verificá los datos e intentá nuevamente.";
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
      className={`nav-item ${path === href || (href === "/" && path.startsWith("/products")) ? "selected" : ""}`}
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
          {item("/brands", "Marcas")}
          {item("/categories", "Categorías")}
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
    ]);
    const error =
      brandResult.error ??
      categoryResult.error ??
      productResult.error ??
      variantResult.error ??
      barcodeResult.error;
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
