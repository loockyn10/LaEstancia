# Tareas, riesgos y verificaciones

## Pendientes reales

- Definir la política de naming y branding comercial, incluida la provisión del logo limpio definitivo.

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

## Riesgos

- Diseñar prematuramente el modelo de producto, variantes o inventario puede cerrar decisiones de negocio aún abiertas.
- El frontend no debe ser tratado como autoridad de seguridad cuando se incorpore el backend.

## Verificaciones futuras

- Cada migration nueva debe ser revisada y validada según el entorno objetivo.
