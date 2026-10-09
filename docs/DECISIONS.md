# Decisiones

## D001 — Monorepo con pnpm

**Decisión:** usar pnpm workspaces.

**Motivo:** separar aplicaciones y código compartido sin agregar una capa de tooling prematura.

**Consecuencias:** los scripts de raíz coordinan paquetes del workspace.

## D002 — Backoffice inicial React + Vite + TypeScript

**Decisión:** usar React, Vite y TypeScript para la aplicación administrativa.

**Motivo:** base ligera y adecuada para un backoffice web.

**Consecuencias:** el ecommerce público futuro podrá decidir su framework por separado.

## D003 — Supabase/PostgreSQL como backend previsto

**Decisión:** adoptar Supabase con PostgreSQL como dirección de backend.

**Motivo:** cubrir persistencia, autenticación, RLS y storage de forma progresiva.

**Consecuencias:** no implica que esos servicios ya estén configurados o desplegados.

## D004 — Catálogo central compartido entre canales futuros

**Decisión:** el catálogo pertenece al negocio, no a un canal.

**Motivo:** evitar duplicación e inconsistencias entre operación, POS, ecommerce y redes.

**Consecuencias:** los canales futuros consumirán una fuente de verdad compartida.

## D005 — Sin offline-first inicial

**Decisión:** no implementar offline-first en esta etapa.

**Motivo:** mantener el alcance inicial acotado.

**Consecuencias:** la arquitectura no debe anticipar complejidad de sincronización sin una necesidad validada.

## D006 — Business como límite de ownership

**Decisión:** los datos de negocio pertenecen a `businesses`; las sucursales pertenecen siempre a un negocio.

**Motivo:** preparar el aislamiento de datos sin convertir la UX inicial en una plataforma multiempresa.

**Consecuencias:** las capacidades comerciales futuras deberán referenciar su `business_id` y, cuando corresponda, `branch_id`.

## D007 — Membresía activa como autoridad de acceso

**Decisión:** `business_memberships` relaciona usuario de Auth, negocio, rol y estado activo; no se usan perfiles como autoridad de permisos.

**Motivo:** una membresía puede otorgar o revocar acceso sin alterar la identidad del usuario.

**Consecuencias:** RLS valida la membresía activa y los roles iniciales son `owner`, `admin` y `staff`. La administración de escrituras no forma parte de esta fundación.

## D008 — Product y ProductVariant tienen responsabilidades distintas

**Decisión:** `products` modela la identidad comercial y `product_variants` las presentaciones vendibles. Todo producto se operará mediante al menos una variante cuando exista UX operativa.

**Motivo:** una misma identidad comercial puede venderse en presentaciones distintas sin modelar SKU, barcode ni futuras operaciones de venta en el nivel equivocado.

**Consecuencias:** SKU y barcode pertenecen a `product_variants`; precios y stock se incorporarán en sprints posteriores sobre la variante vendible.

## D009 — Ownership explícito en variantes y barcodes

**Decisión:** `product_variants` y `product_barcodes` conservan `business_id` además de su referencia al padre.

**Motivo:** permite foreign keys compuestas que impiden cruzar businesses, RLS directa y constraints de SKU y barcode únicos por business.

**Consecuencias:** las foreign keys compuestas fuerzan que el business duplicado coincida con el product o variant padre; no puede desincronizarse por inserciones o actualizaciones válidas.

## D010 — Precio y costo actuales separados y en centavos

**Decisión:** guardar precio de venta y costo en tablas actuales separadas por variante, con montos enteros en centavos y tablas de historial independientes alimentadas por triggers.

**Motivo:** el costo no debe exponerse a staff, y el historial debe ser una garantía de base de datos, no una responsabilidad del frontend.

**Consecuencias:** una ausencia de fila expresa importe no definido; una limpieza registra un valor nulo en el historial. Los ajustes masivos actúan sólo sobre precios existentes mediante una RPC transaccional que valida business y rol.

## D011 — Oferta simple independiente y precio efectivo centralizado

**Decisión:** una oferta guarda un precio promocional por presentación y no altera `variant_prices`. `variant_effective_prices` resuelve la oferta activa y vigente antes de devolver el precio base.

**Motivo:** conservar el precio normal como fuente de verdad, evitar ambigüedad entre ofertas activas y reutilizar exactamente la misma semántica en Precios y Etiquetas.

**Consecuencias:** PostgreSQL rechaza intervalos activos superpuestos para una variante; para promociones más complejas se requerirá otro modelo, no extender arbitrariamente esta entidad.

## D012 — Inventario por presentación y sucursal con movimientos atómicos

**Decisión:** el saldo vive en `inventory_balances` por `product_variant` y `branch`, con cantidades `numeric(18,3)`. `inventory_movements` conserva un historial append-only; entrada e inicial suman, salida resta y ajuste recibe la cantidad física final para que PostgreSQL derive el delta.

**Motivo:** una presentación puede tener saldos distintos por sucursal y el frontend no puede ser autoridad para calcularlos ni para evitar carreras.

**Consecuencias:** owner/admin operan exclusivamente mediante RPCs con bloqueo de fila y transacción; staff conserva sólo lectura. El saldo no puede ser negativo, y un mínimo opcional se administra separadamente sin exponer una actualización arbitraria del saldo.

## D013 — Importación con preview y matching conservador

**Decisión:** el navegador prepara el mapeo y preview, mientras una RPC transaccional aplica el catálogo. Barcode y SKU son los únicos identificadores automáticos; no se fusiona por nombre. Las marcas y categorías se identifican por nombre normalizado dentro del business.

**Motivo:** migrar datos sin convertir el frontend en autoridad ni crear duplicados o movimientos de stock no auditables.

**Consecuencias:** reimportar requiere un barcode/SKU para actualizar con seguridad; sin identificador, una coincidencia exacta de producto/presentación se bloquea. La actualización de existentes es opt-in y el stock inicial sólo se registra para variantes nuevas.

## D014 — Confirmación de compra como única transición con efectos

**Decisión:** una compra sólo impacta stock y costo al pasar de `draft` a `confirmed` mediante `confirm_purchase`; el costo MVP de la presentación queda igual al último costo unitario comprado.

**Motivo:** la recepción, el inventario y el costo deben tener una única transacción y una traza auditable, sin que React coordine escrituras independientes.

**Consecuencias:** cada ítem confirmado crea un movimiento `purchase` vinculado a la compra y actualiza `variant_costs`, cuyo trigger preserva el historial. Las compras confirmadas son inmutables; no existe todavía reversión, costo promedio, FIFO ni LIFO.

## D015 — Venta completed atómica con precio snapshot e idempotencia

**Decisión:** la venta física nace `completed` únicamente mediante `confirm_sale`. La RPC resuelve el precio efectivo vigente, guarda su snapshot por línea, descuenta stock y registra el movimiento `sale` en una sola transacción. El cliente aporta un UUID de intento para que un reintento devuelva la venta existente y no duplique efectos.

**Motivo:** ni el precio ni el inventario pueden depender de escrituras coordinadas por React; una interrupción o reintento de red no debe cobrar o descontar dos veces.

**Consecuencias:** owner/admin/staff pueden vender pero no escribir `sales`, `sale_items` ni balances directamente. Las cantidades admiten tres decimales; cada subtotal se redondea al centavo más cercano antes de almacenarse. No existen todavía cancelaciones de completed, devoluciones ni pagos divididos.

## D016 — Caja derivada de eventos con snapshot de cierre

**Decisión:** una caja abierta no mantiene totales editables. Su resumen se deriva de ventas vinculadas y movimientos manuales append-only; al cerrar, PostgreSQL calcula y guarda un snapshot inmutable. Las ventas se vinculan automáticamente sólo si hay una sesión abierta en su sucursal.

**Motivo:** evitar divergencias entre POS, efectivo físico y acumuladores modificables, y hacer que apertura, venta, movimiento y cierre sean auditables y seguros ante concurrencia.

**Consecuencias:** `sales.cash_session_id` es nullable para preservar ventas históricas y permitir ventas sin caja abierta. Sólo ventas `cash` integran el efectivo esperado; débito, crédito, transferencia y otros quedan en el resumen no físico. Los tres roles actuales operan las sucursales de su business porque todavía no existe asignación de membresía por branch.

## D017 — Dashboard con agregados protegidos e histórico de costos como estimación

**Decisión:** calcular el dashboard mediante funciones PostgreSQL por business, período y sucursal; usar el último evento de `variant_cost_history` anterior a cada venta para el margen bruto estimado y no el costo actual.

**Motivo:** evitar descargar historial al navegador, respetar el aislamiento RLS y impedir que un cambio posterior de costo reescriba conceptualmente una venta anterior.

**Consecuencias:** ventas usan sus snapshots de línea; compras sólo incluyen `confirmed`; el margen se publica sólo cuando todas las líneas tienen un costo histórico aplicable y se etiqueta como estimado. Owner/admin lo reciben desde backend; staff no recibe costos, compras agregadas ni margen. No se implementan costo promedio, FIFO, LIFO ni contabilidad.

## D018 — Listas de proveedor separadas del catálogo y con revisión obligatoria

**Decisión:** almacenar cada archivo de proveedor y sus ofertas como datos auditables separados; aplicar costos únicamente después de revisión humana y una RPC transaccional.

**Motivo:** un precio listado, un barcode o una inferencia visual no son autoridad para cambiar catálogo, ventas o stock. Las opciones de compra pueden compartir EAN y diferir en código, contenido o bonificación.

**Consecuencias:** `supplier_code` es el vínculo persistente prioritario; barcode sólo propone matching. El costo efectivo se calcula con pagadas, bonificadas y contenido, el PVP queda informativo y el precio de venta no se actualiza. La interpretación visual exige una frontera server-side configurada y nunca escribe directamente.
