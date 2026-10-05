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

## Ventas / POS aplicados y verificados remotamente

- Las migrations `20261004040000_inventory_sale_movement.sql` y `20261004040100_sales_pos.sql` incorporan el movimiento `sale`, `sales`, `sale_items`, los enums de estado y medio de pago, y enlaces auditables entre movimiento y venta. Las correctivas `20261004040200_confirm_sale_column_resolution.sql` y `20261004040300_confirm_sale_idempotency_resolution.sql` califican el valor retornado y preservan correctamente el total inicial de una venta nueva; `20261004040400_record_inventory_movement_reject_sale.sql` reserva el movimiento `sale` para `confirm_sale`.
- `confirm_sale` es una RPC `SECURITY DEFINER` que admite owner/admin/staff, valida ownership, precio efectivo, cantidades e idempotency key; bloquea balances por variante en orden determinista, rechaza stock negativo y crea venta, ítems y movimientos en la misma transacción.
- `sales` y `sale_items` sólo otorgan lectura bajo RLS por membresía activa; no hay escrituras directas de cliente. `list_sales` y `list_sale_items` entregan historial con autor y nombres comerciales sin abrir acceso general a perfiles.

## Propuesto / futuro

- Supabase Storage cuando exista una necesidad concreta de archivos.
- Reversión explícita de compras confirmadas; no se implementa cancelación con efectos inversos en el MVP.

La configuración de navegador usa únicamente `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`, cargadas desde el `.env.local` raíz mediante Vite. Nunca se usa `service_role` en el frontend. No se contempla offline-first inicialmente; tampoco Tauri, SQLite ni Docker.
