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

## Propuesto / futuro

- Supabase Storage cuando exista una necesidad concreta de archivos.

La configuración de navegador usa únicamente `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`, cargadas desde el `.env.local` raíz mediante Vite. Nunca se usa `service_role` en el frontend. No se contempla offline-first inicialmente; tampoco Tauri, SQLite ni Docker.
