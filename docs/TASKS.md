# Tareas, riesgos y verificaciones

## Pendientes reales

- Definir la política de naming y branding comercial, incluida la provisión del logo limpio definitivo.
- Diseñar devolución/reversión auditable de ventas completed.
- Definir pagos divididos cuando el flujo de caja lo requiera.
- Aplicar y verificar remotamente la migration de Listas de proveedores (`20261008000000_supplier_price_lists.sql`), regenerar tipos y ejecutar una matriz aislada. El dry-run remoto quedó bloqueado por permisos de la cuenta de Supabase (403), por lo que no se aplicó ningún cambio remoto.
- Antes de habilitar importación visual en producción, desplegar `interpret-supplier-price-list` y configurar `SUPPLIER_LISTS_AI_URL` y `SUPPLIER_LISTS_AI_API_KEY` con un proveedor que implemente el contrato `supplier_price_list_candidates_v1`. La extracción determinística de imágenes ancladas en XLSX continúa pendiente: `read-excel-file` lee celdas/hojas pero no expone drawings/media anclados.

## Resuelto — Sprint 1

- Se enlazó el repositorio al proyecto Supabase autorizado y se aplicó `supabase/migrations/20261001000000_foundation_auth_business_rls.sql` mediante Supabase CLI.
- `.env.local` quedó configurado localmente con la URL y clave pública del proyecto.
- Se generaron tipos TypeScript desde el esquema remoto y se reemplazaron los tipos provisionales de `@pet-shop/database`.
- Se verificaron Auth y RLS contra PostgreSQL remoto, incluida una prueba manual end-to-end con un usuario real confirmado.

## Resuelto — Sprint 2

- Se aplicó `supabase/migrations/20261003000000_catalog_foundation.sql` al proyecto Supabase enlazado y se regeneraron los tipos oficiales.
- Se verificaron remotamente el aislamiento por business, permisos de owner/admin/staff, constraints de SKU y barcode, y las foreign keys compuestas de ownership. Los datos de prueba aislados se eliminaron al finalizar.

## Resuelto — Sprint 4

- Se aplicó `supabase/migrations/20261003010000_variant_pricing.sql`, se regeneraron los tipos oficiales y se verificaron remotamente RLS, historial, aislamiento por business y la RPC atómica de actualización masiva de precios.

## Resuelto — Sprint 7

- Se aplicaron las migrations de importación y sus correcciones `20261004020000` a `20261004020400`; los tipos oficiales se regeneraron después de los cambios remotos.
- La matriz `supabase/tests/20261004_sprint7_import_e2e.sql` verificó remotamente los 15 casos solicitados con identidades Auth, roles owner/admin/staff y dos businesses aislados. También comprobó atomicidad, historial oficial, preservación de campos no mapeados y ausencia de duplicación de stock inicial. Sus datos de prueba fueron eliminados y se confirmó que no quedaron residuos.

## Resuelto — Sprint 8

- Se aplicaron las migrations de proveedores y compras, incluida una corrección versionada de `confirm_purchase` para calificar una columna que colisionaba con el nombre de retorno de la RPC. Los dry-runs no mostraron cambios adicionales, seeds ni roles.
- Se regeneró `packages/database/src/generated.ts` desde el proyecto remoto y la matriz `supabase/tests/20261004_sprint8_purchases_e2e.sql` verificó proveedores, permisos, draft/confirmed, atomicidad, inventario, costos, historial, inmutabilidad y aislamiento entre businesses. Sus datos aislados se eliminaron al finalizar.

## Resuelto — Sprint 9

- Se aplicaron las migrations de ventas físicas, el movimiento `sale` y las tres correcciones versionadas de `confirm_sale`/movimientos; sus dry-runs no incluyeron cambios adicionales, seeds ni roles.
- Se regeneró `packages/database/src/generated.ts` y la matriz `supabase/tests/20261004_sprint9_sales_e2e.sql` verificó roles, pricing, ofertas, stock, auditoría, snapshots, atomicidad, aislamiento, cantidades decimales, inmutabilidad e idempotencia. La transacción eliminó todos los datos aislados al finalizar.

## Resuelto — Sprint 10

- El dry-run mostró exclusivamente `20261007000000_cash_sessions.sql`; se aplicó la migration, se regeneró `packages/database/src/generated.ts` desde el esquema remoto y se verificó la matriz `supabase/tests/20261007_sprint10_cash_e2e.sql`.
- La matriz cubrió apertura/cierre, efectivo esperado, ventas por medio de pago, movimientos manuales, permisos, aislamiento, asociación automática, inmutabilidad y append-only. Finalizó con rollback y una consulta posterior confirmó que no quedaron datos `sprint10`.

## Resuelto — Sprint 11

- Se aplicaron las migrations de Dashboard y su corrección focalizada de medios de pago; ambos dry-runs mostraron sólo los cambios esperados. Los tipos oficiales se regeneraron desde el esquema final.
- La matriz `supabase/tests/20261007_sprint11_dashboard_e2e.sql` verificó agregados, filtros, stock, compras, caja, permisos, aislamiento y margen histórico con cantidades decimales. Finalizó mediante rollback y se confirmó que no quedaron fixtures `sprint11`.

## Riesgos

- Diseñar prematuramente el modelo de producto, variantes o inventario puede cerrar decisiones de negocio aún abiertas.
- El frontend no debe ser tratado como autoridad de seguridad cuando se incorpore el backend.

## Verificaciones futuras

- Cada migration nueva debe ser revisada y validada según el entorno objetivo.
