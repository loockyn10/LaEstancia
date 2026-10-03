# Tareas, riesgos y verificaciones

## Pendientes reales

- Definir la política de naming y branding comercial, incluida la provisión del logo limpio definitivo.
- Evaluar una constraint de unicidad normalizada para nombres de marcas y categorías antes de depender de esa regla en integraciones o escrituras concurrentes.

## Resuelto — Sprint 1

- Se enlazó el repositorio al proyecto Supabase autorizado y se aplicó `supabase/migrations/20261001000000_foundation_auth_business_rls.sql` mediante Supabase CLI.
- `.env.local` quedó configurado localmente con la URL y clave pública del proyecto.
- Se generaron tipos TypeScript desde el esquema remoto y se reemplazaron los tipos provisionales de `@pet-shop/database`.
- Se verificaron Auth y RLS contra PostgreSQL remoto, incluida una prueba manual end-to-end con un usuario real confirmado.

## Resuelto — Sprint 2

- Se aplicó `supabase/migrations/20261003000000_catalog_foundation.sql` al proyecto Supabase enlazado y se regeneraron los tipos oficiales.
- Se verificaron remotamente el aislamiento por business, permisos de owner/admin/staff, constraints de SKU y barcode, y las foreign keys compuestas de ownership. Los datos de prueba aislados se eliminaron al finalizar.

## Riesgos

- Diseñar prematuramente el modelo de producto, variantes o inventario puede cerrar decisiones de negocio aún abiertas.
- El frontend no debe ser tratado como autoridad de seguridad cuando se incorpore el backend.

## Verificaciones futuras

- Cada migration nueva debe ser revisada y validada según el entorno objetivo.
