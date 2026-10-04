# Estado actual

## Versionado en el repositorio

- Workspace pnpm.
- Integración cliente con Supabase mediante variables públicas de entorno y `.env.example`.
- Login email/contraseña, restauración de sesión, logout y rutas de backoffice protegidas en el cliente.
- Pantalla "Sin acceso asignado" para usuarios autenticados sin membresía activa.
- Configuración de Supabase CLI en `supabase/config.toml` y migration `supabase/migrations/20261001000000_foundation_auth_business_rls.sql`.
- Migration versionada con `profiles`, `businesses`, `business_memberships`, `branches`, roles y RLS de lectura.
- Migration `supabase/migrations/20261003000000_catalog_foundation.sql` versionada para la fundación del catálogo: `brands`, `categories`, `products`, `product_variants` y `product_barcodes`, sus constraints de ownership y unicidad, y RLS de lectura/escritura según rol.
- Tipos TypeScript generados desde el esquema remoto en `packages/database/src/generated.ts`; `@pet-shop/database` los reexporta.
- Documentación multi-agente.
- Tooling de build, chequeo de tipos y lint configurado.
- UX administrativa de catálogo: productos, marcas y categorías; altas y edición de productos, presentaciones y códigos de barras; filtros y búsqueda local del catálogo cargado del business.
- El backoffice refleja roles: `owner` y `admin` pueden modificar el catálogo; `staff` cuenta sólo con vistas de consulta. La autoridad efectiva sigue siendo RLS.
- Migration `supabase/migrations/20261003010000_variant_pricing.sql` aplicada para precios, costos, sus historiales por trigger, RLS y actualización masiva atómica de precios. La sección Precios del backoffice permite gestionar importes por presentación y oculta costos/márgenes a staff.
- Migration `supabase/migrations/20261004000000_variant_offers.sql` aplicada para ofertas simples por presentación, RLS y el view de precio efectivo. Precios suma la gestión de ofertas y Etiquetas ofrece selección múltiple, cantidades, preview y print CSS.
- `packages/database/src/generated.ts` fue regenerado oficialmente desde el esquema remoto después de aplicar Sprint 5.
- Migration `supabase/migrations/20261004010000_inventory.sql` aplicada para balances por presentación/sucursal, movimientos append-only, RPC atómica, stock mínimo y RLS. La sección Stock permite filtrar por nombre/SKU/barcode, sucursal y estado; registrar entrada, salida o ajuste con preview; configurar mínimo; y consultar historial.
- `packages/database/src/generated.ts` fue regenerado oficialmente desde el esquema remoto después de aplicar Sprint 6.
- Migrations `supabase/migrations/20261004020000_catalog_import.sql` a `20261004020400_pricing_history_variant_delete.sql` aplicadas para importar catálogo de forma atómica, con índices normalizados de marcas/categorías, una RPC cliente segura, upserts de precio/costo corregidos y limpieza segura de variantes con historial.
- La sección Importar soporta `.xlsx` y `.csv`, elección de hoja, mapeo libre, validación, preview, confirmación y resultado. Incluye fixtures CSV aislados para caso válido, identificadores inválidos y columnas reordenadas.
- `packages/database/src/generated.ts` fue regenerado oficialmente desde el esquema remoto después de aplicar Sprint 7.
- Las migrations `20261004029900_inventory_purchase_movement.sql`, `20261004030000_suppliers_purchases.sql` y la correctiva `20261004030100_confirm_purchase_column_resolution.sql` fueron aplicadas para Sprint 8. El backoffice incorpora Proveedores y Compras; `packages/database/src/generated.ts` fue regenerado oficialmente.

## Aplicado remotamente

- Repositorio enlazado al proyecto Supabase `caegoufmwmuckuskkzjs` (`laestancia Project`, región `sa-east-1`).
- Aplicada mediante `supabase db push --linked` la migration `20261001000000_foundation_auth_business_rls.sql`.
- Aplicada mediante `supabase db push --linked` la migration `20261003000000_catalog_foundation.sql`; el dry-run previo mostró únicamente esa migration, sin seeds, roles ni cambios adicionales.
- Aplicada mediante `supabase db push --linked` la migration `20261003010000_variant_pricing.sql`; el dry-run previo mostró únicamente esa migration, sin seeds, roles ni cambios adicionales.
- Aplicada mediante `supabase db push --linked` la migration `20261004000000_variant_offers.sql`; el dry-run previo mostró únicamente esa migration, sin seeds, roles ni cambios adicionales.
- Aplicada mediante `supabase db push --linked` la migration `20261004010000_inventory.sql`; el dry-run previo mostró únicamente esa migration, sin seeds, roles ni cambios adicionales.
- Aplicadas mediante `supabase db push --linked` las migrations de Sprint 7; cada dry-run mostró sólo su migration esperada, sin seeds, roles ni cambios adicionales.
- Aplicadas mediante `supabase db push --linked` las migrations de Sprint 8. El dry-run inicial mostró únicamente `20261004029900` y `20261004030000`; el de la corrección posterior mostró exclusivamente `20261004030100`, sin seeds, roles ni cambios adicionales.

## Verificado remotamente

- Existen `profiles`, `businesses`, `business_memberships` y `branches`, junto con el enum `business_role` y la función `has_active_business_membership`.
- RLS está habilitado en las cuatro tablas. Cada una tiene exclusivamente su policy `SELECT` prevista y el rol `authenticated` no tiene permisos de `INSERT`, `UPDATE` ni `DELETE`.
- Con `authenticated` y claims JWT simulados para una identidad con membresía activa, se observó únicamente su propio perfil, membership, negocio y sucursal. Una identidad sin membership vio solamente su propio perfil y ninguna fila de negocio, membership ni sucursal.
- Se crearon dos usuarios Auth y filas de prueba aisladas, identificadas con `sprint1-rls-test`, para esta verificación. Permanecen en el proyecto para no borrar datos.
- Un usuario real, creado y confirmado mediante Supabase Auth Dashboard, tiene profile y membership `owner` activa en el negocio de prueba. Con su UUID, RLS resolvió su profile, membership, negocio y sucursal.
- El usuario confirmó manualmente el flujo end-to-end contra el proyecto remoto: login email/contraseña, acceso al backoffice, restauración de sesión tras refrescar y logout sin reingreso posterior.
- Existen las cinco tablas de catálogo y sus policies `SELECT`, `INSERT`, `UPDATE` y `DELETE`; cada tabla tiene una policy por operación. También existen los índices de SKU único por business, barcode único por business y barcode primario único por variante.
- Con claims JWT simulados, un owner de Business A vio únicamente A; el owner y el admin pudieron escribir en A, y staff recibió una violación de RLS al intentar hacerlo.
- SKU y barcode duplicados dentro de A fueron rechazados por sus índices únicos. Las referencias entre Product→Brand, ProductVariant→Product y ProductBarcode→ProductVariant de businesses distintos fueron rechazadas por las foreign keys compuestas.
- Se crearon dos businesses y cuatro usuarios de prueba aislados, identificados como `sprint2-rls-test`, y se eliminaron completamente después de la verificación.
- Los tipos oficiales se regeneraron desde el esquema remoto aplicado en `packages/database/src/generated.ts`.
- Se verificaron remotamente precios, costos, RLS e historial con cuatro usuarios y dos businesses aislados dentro de una transacción revertida: owner/admin pudieron leer y modificar, staff sólo leyó precio y no pudo modificar ni acceder a costos; el aislamiento entre businesses se mantuvo.
- La RPC `adjust_variant_prices` funcionó para owner/admin, rechazó staff, rechazó selecciones de otro business o sin precio, y esos fallos no modificaron ningún precio. Los triggers preservaron los eventos iniciales y posteriores de precio/costo.
- Los tipos oficiales se regeneraron desde el esquema remoto con las tablas y RPC de pricing en `packages/database/src/generated.ts`.
- Se verificaron remotamente `variant_offers`, RLS, la constraint de solapamientos y `variant_effective_prices` con dos businesses y tres usuarios aislados dentro de una transacción revertida: owner/admin crearon y editaron; staff leyó sin poder modificar; no hubo acceso cruzado; las ofertas futuras, vencidas o desactivadas devolvieron el precio base, y una vigente devolvió el promocional. No quedó ningún dato de prueba.
- Los tipos oficiales se regeneraron desde el esquema remoto con Sprint 5 en `packages/database/src/generated.ts`.
- Con datos aislados `sprint6-*`, owner registró un saldo inicial de 10; admin registró una salida de 2; un ajuste físico a 5 dejó delta -3 y saldo resultante 5; el mínimo 5 quedó persistido. Cada saldo resultante coincidió con el movimiento registrado.
- Se verificaron remotamente el rechazo de salida que dejaría stock negativo; lectura para staff; rechazo de movimiento y mínimo para staff; aislamiento de Business B; rechazo de variant de otro business; y ausencia de permisos de cliente para editar o borrar movimientos. Los datos de prueba se eliminaron y se confirmó que no quedaron businesses `sprint6-*`.
- La RPC usa creación idempotente de balance seguida de `SELECT ... FOR UPDATE`, por lo que las operaciones concurrentes se serializan sobre el mismo balance. La carrera remota de dos conexiones queda pendiente de una sesión SQL adicional: el lanzador aislado no pudo abrir una segunda conexión y `dblink` exige credenciales no disponibles. No se afirma como verificación remota completada.
- Se verificó remotamente que existen los índices normalizados de marca/categoría; ambas RPC de importación son `SECURITY DEFINER`; y sólo `import_catalog_rows_v2` conserva `EXECUTE` para `authenticated`.
- La matriz E2E autenticada de Sprint 7 creó cuatro identidades Auth reales (owner/admin/staff de A y owner de B), dos businesses y sucursales aisladas. Verificó los 15 casos de importación, atomicidad, historial oficial de precio/costo, preservación de celdas vacías/no mapeadas, no repetición del stock inicial y autorización/ownership en PostgreSQL. Todos los datos `sprint7` se limpiaron; una consulta final confirmó cero usuarios, businesses y movimientos de prueba.
- La matriz E2E autenticada de Sprint 8 verificó que el draft no modifica saldos ni costos; owner y admin confirman; cada confirmación crea un movimiento `purchase` vinculado, actualiza el costo al último costo de compra y genera historial. También verificó doble confirmación rechazada, rollback completo inducido en el segundo ítem, escritura/confirmación denegada a staff, inmutabilidad de confirmed y rechazo de supplier, branch y variant de otro business. La limpieza dejó cero businesses `sprint8`.

## Verificado localmente

- `pnpm typecheck`: correcto en los cuatro workspaces con scripts de tipos.
- `pnpm lint`: correcto.
- `pnpm build`: correcto; el bundle de producción de `apps/admin` se generó.
- `pnpm check`: correcto; repite typecheck, lint y build.
- `git diff --check`: sin errores de whitespace.

En la revalidación posterior al Sprint 2, `pnpm check` y `git diff --check` volvieron a pasar. Se reconstruyó `node_modules` desde el lockfile usando pnpm 11.19.0, sin modificar archivos versionados ni el lockfile.

Supabase CLI se ejecuta temporalmente mediante `pnpm dlx supabase`. No se usó Docker.

Después de Sprint 7, `pnpm check` y `git diff --check` pasaron localmente. La auditoría de producción no introdujo alertas por las dependencias nuevas de lectura; persisten alertas preexistentes de Vite/Supabase en sus versiones actuales del proyecto.

Después de Sprint 8, `pnpm check` y `git diff --check` volvieron a pasar con los tipos regenerados desde el esquema remoto aplicado.

## Pendiente

Definir el flujo administrativo para altas y gestión de usuarios reales y memberships en un sprint posterior. La migration no incluye policies de escritura de cliente.

POS, ventas, clientes y ecommerce permanecen fuera de este alcance. Para compras queda pendiente el flujo de reversión de una compra confirmada.

El versionado y la aplicación remota se registran por separado en las secciones anteriores.
