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

## Propuesto / futuro

- Supabase Storage cuando exista una necesidad concreta de archivos.

La configuración de navegador usa únicamente `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`, cargadas desde el `.env.local` raíz mediante Vite. Nunca se usa `service_role` en el frontend. No se contempla offline-first inicialmente; tampoco Tauri, SQLite ni Docker.
