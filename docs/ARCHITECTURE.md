# Arquitectura

## Implementado / verificado

- Monorepo con pnpm workspaces.
- Aplicación administrativa en React, Vite y TypeScript con login email/contraseña, restauración de sesión y logout mediante Supabase Auth.
- Protección de backoffice basada en sesión y membresía activa de negocio. La UI no es autoridad: PostgreSQL RLS determina las filas accesibles.
- Migrations versionadas para `profiles`, `businesses`, `business_memberships` y `branches`, con roles `owner`, `admin` y `staff`.
- Paquete `database` con tipos TypeScript generados desde el proyecto Supabase enlazado.
- Documentación de contexto, decisiones y flujo multi-agente.

Los comandos efectivamente verificados se registran en `CURRENT_STATE.md`.

## Catálogo aplicado y verificado remotamente

- La migration `20261003000000_catalog_foundation.sql` creó `brands`, `categories`, `products`, `product_variants` y `product_barcodes` en el proyecto Supabase enlazado.
- Brands, categories y products almacenan `business_id`. Variants y barcodes también lo almacenan para imponer foreign keys compuestas que preservan el ownership del padre, aplicar RLS por business y asegurar la unicidad de SKU y barcode dentro del business.
- Las cinco tablas habilitan RLS: una membresía activa permite lectura; sólo `owner` y `admin` activos pueden insertar, actualizar o eliminar. La función `has_active_business_role` usa `SECURITY DEFINER` para no introducir recursión sobre `business_memberships`.
- `packages/database/src/generated.ts` se regeneró desde ese esquema remoto.

## Pricing aplicado y verificado remotamente

- La migration `20261003010000_variant_pricing.sql` creó `variant_prices` y `variant_costs` separados, ambos con una fila actual opcional por variante y montos `bigint` en centavos. Sus tablas de historial se alimentan mediante triggers append-only que registran alta, cambios y limpieza del importe.
- RLS permite leer precio de venta a una membresía activa; costos e historiales sólo pueden leerlos owner/admin. Sólo owner/admin puede modificar precios o costos.
- La RPC `adjust_variant_prices` valida ownership y rol en PostgreSQL y actualiza toda la selección en una sola sentencia; rechaza variantes de otro business o sin precio antes de escribir.
- Los tipos de `packages/database/src/generated.ts` fueron regenerados oficialmente desde el esquema remoto aplicado.

## Ofertas y etiquetas aplicadas y verificadas remotamente

- La migration `20261004000000_variant_offers.sql` incorpora `variant_offers`, con precio promocional entero en centavos, vigencia, estado, auditoría de creador y timestamps. Una exclusion constraint de PostgreSQL impide solapamientos entre ofertas activas de una misma presentación.
- El view `variant_effective_prices` centraliza el precio efectivo: toma una oferta activa y vigente, o el precio base si no existe. El view usa `security_invoker`, de modo que las RLS de precios y ofertas se siguen aplicando al usuario que consulta.
- `variant_offers` permite lectura a cualquier membresía activa y escritura sólo a owner/admin; las políticas y el constraint son la autoridad, no la UI. La migration fue aplicada al proyecto remoto enlazado y sus políticas, la view y las vigencias se verificaron con datos transaccionales revertidos.

## Inventario aplicado y verificado remotamente

- La migration `20261004010000_inventory.sql` creó `inventory_balances` por `product_variant` y `branch`, e `inventory_movements` append-only. Las cantidades son `numeric(18,3)`; `products` no tienen una columna de stock y no son fuente de verdad.
- `record_inventory_movement` es una RPC `SECURITY DEFINER`: valida miembro, rol owner/admin, business, branch y variant; crea el balance en cero si falta, bloquea la fila con `FOR UPDATE`, calcula el nuevo saldo, rechaza negativos, actualiza el balance e inserta el movimiento en una única transacción.
- Las tablas sólo otorgan `SELECT` al cliente bajo RLS por business. Los movimientos no tienen permisos de `INSERT`, `UPDATE` ni `DELETE` para `authenticated`; las escrituras ocurren únicamente por RPC. `set_inventory_minimum` protege el mínimo con la misma validación y `list_inventory_movements` entrega el nombre del autor sin abrir las filas de `profiles`.

## Importación de catálogo aplicada y verificada remotamente

- Las migrations `20261004020000_catalog_import.sql` a `20261004020400_pricing_history_variant_delete.sql` agregan índices únicos normalizados para marcas/categorías, la RPC pública `import_catalog_rows_v2`, corrigen la resolución PL/pgSQL de sus upserts y preservan la integridad del historial cuando se elimina una variante en cascada.
- `import_catalog_rows_v2` es `SECURITY DEFINER`, delega la aplicación atómica a una RPC interna sin permiso de cliente y exige el rol owner/admin. La operación interna crea o actualiza catálogo, barcodes y SKU bajo el mismo `business_id`; un conflicto hace fallar toda la importación.
- Precio y costo se escriben en `variant_prices`/`variant_costs`, por lo que sus triggers conservan el historial. El stock nunca actualiza balances directamente: invoca `record_inventory_movement` con `initial`, y el mínimo usa `set_inventory_minimum`.
- La aplicación React sólo lee el archivo, propone el mapeo y construye el preview. El backend vuelve a validar autorización, ownership, identificadores duplicados y la sucursal antes de escribir.

## Proveedores y compras aplicados y verificados remotamente

- Las migrations `20261004029900_inventory_purchase_movement.sql` y `20261004030000_suppliers_purchases.sql` agregan `suppliers`, `purchases` y `purchase_items`, con ownership explícito de business y foreign keys compuestas para sucursal, proveedor y presentación. `20261004030100_confirm_purchase_column_resolution.sql` corrige, sin cambiar el contrato, una resolución ambigua de columna dentro de la RPC.
- `confirm_purchase` bloquea el borrador, valida rol y ownership, registra cada entrada mediante la RPC oficial `record_inventory_movement`, asocia el movimiento a la compra y hace upsert de `variant_costs`. Todo ocurre en una transacción; el trigger existente genera el historial de costos.
- Se agrega el movimiento `purchase` como entrada auditable. El cliente no tiene escritura directa sobre balances o movimientos; tampoco puede confirmar una compra por updates independientes.
- RLS habilita lectura de proveedores y encabezados de compras para staff, sin exponer los ítems ni costos. Owner/admin crean y modifican únicamente borradores; compras confirmadas o canceladas no pueden volver a editarse mediante las políticas ni desde el frontend.

## Listas de proveedores aplicadas y verificadas remotamente

- La migration `20261008000000_supplier_price_lists.sql` versiona listas privadas, vínculos persistentes por código de proveedor, ítems detectados y opciones de compra. El costo efectivo es una columna generada y las RPCs de staging/aplicación validan rol y ownership dentro de una transacción.
- La aplicación no actualiza stock. Al confirmar una lista, el costo seleccionado se escribe mediante `variant_costs`; si un ítem trae PVP, una presentación nueva recibe un precio inicial con origen `supplier_pvp`, y una existente se actualiza únicamente cuando ya sigue a ese mismo proveedor. `variant_prices` conserva `price_source` y `supplier_id`; la escritura manual pasa a `manual`. Ambos cambios usan los triggers oficiales de historial.
- Los originales usan el bucket privado `supplier-price-lists`, con prefijo de `business_id` y policies de Storage por membresía. PDF/JPG/PNG quedan detrás de una Edge Function que sólo devuelve DTOs validados y requiere secretos server-side; no tiene autoridad para escribir la base.
- Para PDF, el navegador extrae texto seleccionable por página con `pdfjs-dist` antes de pedir interpretación visual. Conserva los candidatos que puede estructurar localmente y solicita visión sólo para las páginas insuficientes; los candidatos se deduplican al unificarse. La Edge Function descarga el original privado con su credencial server-side y lo entrega a Responses API como `input_file.file_data` base64 (máximo 20 MB), sin depender de una URL firmada que OpenAI deba descargar. JPG/PNG mantienen la interpretación visual mediante bytes autenticados. La Edge Function devuelve sólo candidatos con schema validado y, ante un fallo de OpenAI, agrega status, type, code, message y request id seguros cuando están disponibles.
- La Edge Function exige una membresía owner/admin activa y el secreto `OPENAI_API_KEY`; usa `SUPPLIER_LISTS_AI_MODEL` cuando está configurado o `gpt-5.6-luna` por defecto. OpenAI Responses API recibe el archivo temporal y devuelve Structured Outputs estrictos bajo `supplier_price_list_candidates_v1`; la función rechaza respuestas incompletas, refusals o inválidas y no escribe en tablas de negocio.

## Ventas / POS aplicados y verificados remotamente

- Las migrations `20261004040000_inventory_sale_movement.sql` y `20261004040100_sales_pos.sql` incorporan el movimiento `sale`, `sales`, `sale_items`, los enums de estado y medio de pago, y enlaces auditables entre movimiento y venta. Las correctivas `20261004040200_confirm_sale_column_resolution.sql` y `20261004040300_confirm_sale_idempotency_resolution.sql` califican el valor retornado y preservan correctamente el total inicial de una venta nueva; `20261004040400_record_inventory_movement_reject_sale.sql` reserva el movimiento `sale` para `confirm_sale`.
- `confirm_sale` es una RPC `SECURITY DEFINER` que admite owner/admin/staff, valida ownership, precio efectivo, cantidades e idempotency key; bloquea balances por variante en orden determinista, rechaza stock negativo y crea venta, ítems y movimientos en la misma transacción.
- `sales` y `sale_items` sólo otorgan lectura bajo RLS por membresía activa; no hay escrituras directas de cliente. `list_sales` y `list_sale_items` entregan historial con autor y nombres comerciales sin abrir acceso general a perfiles.

## Caja operativa aplicada y verificada remotamente

- La migration `20261007000000_cash_sessions.sql` incorpora `cash_sessions` por business/sucursal y `cash_movements` append-only. Un índice parcial impide más de una caja abierta por sucursal y las foreign keys compuestas preservan ownership.
- `open_cash_session`, `record_cash_movement` y `close_cash_session` son RPCs `SECURITY DEFINER` para owner/admin/staff. Validan membresía, business, branch, estado e importes; bloqueos advisory por sucursal serializan apertura/cierre con ventas y movimientos concurrentes.
- `sales.cash_session_id` es nullable para no modificar ventas históricas. `confirm_sale` conserva su contrato e idempotencia y vincula ventas nuevas a la caja abierta de la misma sucursal cuando existe.
- Los importes vivos se derivan de ventas y movimientos. El cierre guarda un snapshot por medio de pago, ingresos, egresos, efectivo esperado, contado y diferencia; triggers impiden mutar sesiones cerradas o editar/borrar movimientos.
- RLS permite lectura a una membresía activa del business y no concede escrituras directas sobre caja. `list_cash_sessions` entrega el resumen operativo y los nombres de apertura/cierre sin ampliar el acceso a perfiles.
- El dry-run remoto mostró exclusivamente `20261007000000_cash_sessions.sql`, que se aplicó al proyecto enlazado. La matriz `20261007_sprint10_cash_e2e.sql` verificó los flujos de caja, roles, aislamiento, inmutabilidad y limpieza mediante rollback; los tipos se regeneraron oficialmente desde ese esquema final.

## Propuesto / futuro

- Supabase Storage cuando exista una necesidad concreta de archivos.
- Reversión explícita de compras confirmadas; no se implementa cancelación con efectos inversos en el MVP.

## Dashboard operativo aplicado y verificado remotamente

- La migration `20261007010000_operational_dashboard.sql` define funciones `SECURITY DEFINER` pequeñas para resumen, medios de pago, ranking de productos y caja. Todas validan membresía, business y branch antes de agregar datos.
- Las funciones agregan en PostgreSQL; el navegador sólo consume resultados acotados. Owner/admin reciben compras y margen; staff recibe `NULL` para esas métricas, además de conservar las políticas que bloquean las tablas de costos.
- El margen usa `sale_items.line_total_cents` y el último `variant_cost_history` con `changed_at <= sales.created_at`. Por eso se etiqueta como histórico estimado: no hay un snapshot de costo por línea ni asignación FIFO/promedio.
- La corrección versionada `20261007010100_dashboard_payment_methods_fix.sql` califica el agregado `totals.total_cents` dentro de la RPC, sin cambiar su contrato ni otras funciones.

La configuración de navegador usa `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (obligatorias) y `VITE_ADMIN_URL` / `VITE_POS_URL` (enlaces entre superficies; obligatorias en producción), cargadas desde el `.env.local` raíz mediante Vite y leídas sólo en `config/env.ts` de cada app. Nunca se usa `service_role` en el frontend. No se contemplan Tauri, SQLite ni Docker.

## Admin y POS separados

- `apps/admin` permanece como superficie administrativa online-first. Sólo `owner` y `admin` pueden entrar; `staff` es redirigido al POS.
- `apps/pos` es una única aplicación React/Vite instalable (PWA). Sus permisos cambian según la membresía: los tres roles pueden vender; sólo owner/admin reciben el enlace a Administración.
- El POS reutiliza `confirm_sale`, precios efectivos, balances, barcodes y RPCs de caja. No duplica lógica comercial ni implementa todavía persistencia de ventas offline.
- La separación visual no es autoridad: la migration `20261011000000_pos_staff_access.sql` limita RLS/RPCs de staff a catálogo/precio/stock operativo, sus ventas y caja abierta actual.

## POS local-first para lectura operacional

- Supabase continúa siendo la fuente de verdad central. Con conexión, una sincronización completa y encapsulada descarga el catálogo operativo permitido por RLS y reemplaza atómicamente el snapshot del business en IndexedDB mediante Dexie.
- IndexedDB es la única fuente inmediata para sucursales, productos activos, presentaciones activas, barcodes, precio base/efectivo, oferta vigente y último stock conocido por sucursal. Los componentes React no consultan IndexedDB directamente: pasan por `apps/pos/src/local-db` y `apps/pos/src/sync`.
- Cada fila local incluye `businessId`; stock agrega `branchId`, y el contexto cacheado usa la clave compuesta usuario/business. Todas las lecturas reciben el business y la sucursal explícitos para impedir mezcla entre contextos.
- No se persisten costos, márgenes, proveedores, compras ni datos administrativos. Categorías y marcas tampoco se guardan porque el POS actual no las usa para navegación ni búsqueda.
- El service worker de Vite PWA precachea solamente el app shell y assets locales. No existe runtime cache para respuestas de Supabase; los datos operativos viven en IndexedDB.
- Una sesión Supabase persistida y no vencida, junto con un contexto y snapshot locales previos, permite abrir, buscar, escanear y armar el carrito sin red. Un inicio de sesión nuevo, confirmar ventas, operar caja e historial reciente siguen requiriendo conexión.
- La arquitectura deja el límite `sync` separado para incorporar después ventas locales/outbox y reconciliación, pero este sprint no crea esas tablas ni confirma ventas offline.

## Estructura del código

Capas, sin ceremonia: **UI → hook / lógica pura → acceso a datos → Supabase o IndexedDB**. Reglas que todo cambio debe respetar:

1. Ningún componente llama a `supabase.from(...)`, `.rpc(...)` ni a IndexedDB. Admin accede a datos sólo desde `features/*/*-api.ts` y POS sólo desde `*-api.ts`, `sync/` y `local-db/`.
2. Las funciones `*-api.ts` lanzan el error crudo de Supabase; la UI lo traduce con `describeError` (envoltorio de `describeBackendError` de `@pet-shop/domain`). En producción el mensaje es siempre humano; en desarrollo agrega código/detalle técnico y registra en consola.
3. Toda lectura "completa" de una tabla pasa por `fetchAllRows` (`@pet-shop/database`): PostgREST corta cada respuesta en `max_rows = 1000` y un catálogo mayor quedaba truncado en silencio (Admin y sincronización del POS).
4. La lógica comercial sigue en PostgreSQL (RPCs `SECURITY DEFINER`, RLS, triggers). El frontend sólo previsualiza con la misma fórmula (por ejemplo, subtotal de línea redondeado al centavo) y nunca envía precios.
5. `import.meta.env` se lee únicamente en `config/env.ts` de cada app. Sin `VITE_POS_URL` / `VITE_ADMIN_URL` en producción el enlace se oculta; ya no apunta a `localhost`.

### Paquetes compartidos

- `packages/domain` — funciones puras sin dependencias: dinero en centavos (`formatPesos`, `parsePesos`, `lineTotalCents`), cantidades de tres decimales, fechas calendario, medios de pago, roles (`isManager`), identificadores de login simples y `describeBackendError`. Tests propios.
- `packages/database` — tipos generados (`generated.ts`, no se edita a mano) y `fetchAllRows`. Tests propios.
- `packages/ui` — design system compartido por Admin y POS (ver abajo). Estilos en `@pet-shop/ui/styles.css`; cada app sólo agrega CSS de sus pantallas.

### Admin (`apps/admin/src`)

- `App.tsx` es sólo la puerta de entrada (sesión → acceso → login / sin acceso / POS para staff / Administración). `app/` contiene `AppShell`, `Sidebar` y `routes.tsx`, la **tabla única de rutas y navegación** (el menú se deriva de ella). Las pantallas pesadas se cargan con `React.lazy`.
- `auth/`: `useAccess` (Auth + membresía + negocio), `accessForMembership` (`staff` nunca queda `authorized`; se redirige al POS) y pantallas de login/estado.
- `config/env.ts`, `lib/` (`supabase.ts` con `db()`, `errors.ts`, `router.ts` basado en History API, `useQuery`, `usePagedList`).
- `features/<dominio>/`: `catalog`, `pricing`, `stock`, `labels`, `dashboard`, `sales`, `cash`, `purchasing`, `supplier-lists`, `imports`. Cada una separa `*-api.ts` (datos), `*-model.ts` (lógica pura con tests) y las páginas/diálogos. `catalog` además expone `CatalogProvider`/`useCatalog`: **una sola carga paginada** del catálogo (productos, presentaciones, barcodes, marcas, categorías, sucursales) compartida por todas las pantallas.
- Administración es una superficie sólo para owner/admin (D020); por eso las pantallas ya no tienen ramas "modo staff". RLS/RPC siguen siendo la autoridad.

### POS (`apps/pos/src`)

Flujo intacto: Supabase → `sync/` → IndexedDB (`local-db/`) → UI.

- `config/`, `lib/` (cliente, errores), `connectivity/` (`useOnlineStatus`), `auth/` (`usePosAccess`, pantallas).
- `local-db/`: esquema Dexie `v1` sin cambios, `repository.ts` (lecturas locales con `businessId` explícito) y `search.ts` (búsqueda y barcode puros, sin tildes).
- `sync/catalog-sync.ts`: descarga **paginada** del snapshot operativo y `synchronizeStock` (refresco sólo del stock tras cobrar; no cambia la marca de última sincronización).
- `catalog/usePosCatalog`: sincronización, sucursal y opciones vendibles leídas de IndexedDB una vez por cambio de sucursal/sincronización; la búsqueda por tecla es en memoria.
- `cart/` (modelo puro del carrito, tests), `sales/`, `cash/` (RPCs; requieren conexión) y `app/` (`PosScreen`, `PosHeader`).
- Si la consulta de membresía falla por la red, el POS continúa con el último contexto conocido en lugar de mostrar "sin acceso"; una membresía revocada sigue perdiendo el acceso cuando el servidor responde.

### Design system (`packages/ui`)

Un único conjunto de componentes sin dependencias externas: `Button`, `Select` (combobox/listbox accesible, con búsqueda desde 9 opciones), `DateField`/`DateTimeField`/`TimeField` (calendario propio), `Dialog` y `useConfirm` (reemplazo de `window.confirm`), `ActionMenu`, `Popover` (portal con posición fija, se invierte si no hay espacio), `Badge`, `Notice`, `Field`, `Card`, `PageHeader`, `LoadingState`/`EmptyState`/`ErrorState`, `Spinner` y `ErrorBoundary`. Ya no se usan `<select>` ni `<input type="date|datetime-local">` nativos ni `window.prompt/confirm`. Tokens (colores navy/petróleo + dorado, radios, sombras, altura de control) en `styles.css`.

### Seguridad: hallazgo corregido

`list_inventory_movements` era `SECURITY DEFINER` y sólo exigía membresía activa, por lo que saltaba la policy owner/admin de `inventory_movements` y permitía a staff leer el historial completo (incluidos movimientos de compra, notas y autores). La migration `20261104000000_restrict_inventory_history_to_managers.sql` la restringe a owner/admin sin cambiar firma ni grants. Está versionada y **pendiente de aplicación remota** (ver `TASKS.md`).
