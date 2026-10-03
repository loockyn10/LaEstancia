# Tareas, riesgos y verificaciones

## Pendientes reales

- Definir el primer sprint del dominio de catálogo antes de crear modelos o tablas.
- Decidir la política de naming y branding comercial.

## Resuelto — Sprint 1

- Se enlazó el repositorio al proyecto Supabase autorizado y se aplicó `supabase/migrations/20261001000000_foundation_auth_business_rls.sql` mediante Supabase CLI.
- `.env.local` quedó configurado localmente con la URL y clave pública del proyecto.
- Se generaron tipos TypeScript desde el esquema remoto y se reemplazaron los tipos provisionales de `@pet-shop/database`.
- Se verificaron Auth y RLS contra PostgreSQL remoto, incluida una prueba manual end-to-end con un usuario real confirmado.

## Riesgos

- Diseñar prematuramente el modelo de producto, variantes o inventario puede cerrar decisiones de negocio aún abiertas.
- El frontend no debe ser tratado como autoridad de seguridad cuando se incorpore el backend.

## Verificaciones futuras

- Cada migration nueva debe ser revisada y validada según el entorno objetivo.
