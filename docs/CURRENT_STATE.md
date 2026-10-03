# Estado actual

## Versionado en el repositorio

- Workspace pnpm.
- Integración cliente con Supabase mediante variables públicas de entorno y `.env.example`.
- Login email/contraseña, restauración de sesión, logout y rutas de backoffice protegidas en el cliente.
- Pantalla "Sin acceso asignado" para usuarios autenticados sin membresía activa.
- Configuración de Supabase CLI en `supabase/config.toml` y migration `supabase/migrations/20261001000000_foundation_auth_business_rls.sql`.
- Migration versionada con `profiles`, `businesses`, `business_memberships`, `branches`, roles y RLS de lectura.
- Tipos TypeScript generados desde el esquema remoto en `packages/database/src/generated.ts`; `@pet-shop/database` los reexporta.
- Documentación multi-agente.
- Tooling de build, chequeo de tipos y lint configurado.

## Aplicado remotamente

- Repositorio enlazado al proyecto Supabase `caegoufmwmuckuskkzjs` (`laestancia Project`, región `sa-east-1`).
- Aplicada mediante `supabase db push --linked` la migration `20261001000000_foundation_auth_business_rls.sql`.
- No se aplicaron migrations de dominio comercial.

## Verificado remotamente

- Existen `profiles`, `businesses`, `business_memberships` y `branches`, junto con el enum `business_role` y la función `has_active_business_membership`.
- RLS está habilitado en las cuatro tablas. Cada una tiene exclusivamente su policy `SELECT` prevista y el rol `authenticated` no tiene permisos de `INSERT`, `UPDATE` ni `DELETE`.
- Con `authenticated` y claims JWT simulados para una identidad con membresía activa, se observó únicamente su propio perfil, membership, negocio y sucursal. Una identidad sin membership vio solamente su propio perfil y ninguna fila de negocio, membership ni sucursal.
- Se crearon dos usuarios Auth y filas de prueba aisladas, identificadas con `sprint1-rls-test`, para esta verificación. Permanecen en el proyecto para no borrar datos.
- Un usuario real, creado y confirmado mediante Supabase Auth Dashboard, tiene profile y membership `owner` activa en el negocio de prueba. Con su UUID, RLS resolvió su profile, membership, negocio y sucursal.
- El usuario confirmó manualmente el flujo end-to-end contra el proyecto remoto: login email/contraseña, acceso al backoffice, restauración de sesión tras refrescar y logout sin reingreso posterior.

## Verificado localmente

- `pnpm typecheck`: correcto en los cuatro workspaces con scripts de tipos.
- `pnpm lint`: correcto.
- `pnpm build`: correcto; el bundle de producción de `apps/admin` se generó.
- `pnpm check`: correcto; repite typecheck, lint y build.
- `git diff --check`: sin errores de whitespace.

Supabase CLI se ejecuta temporalmente mediante `pnpm dlx supabase`. No se usó Docker.

## Pendiente

Definir el flujo administrativo para altas y gestión de usuarios reales y memberships en un sprint posterior. La migration no incluye policies de escritura de cliente.

Todo el dominio comercial continúa pendiente: catálogo, variantes, stock, precios, etiquetas, proveedores, compras, POS, ventas, clientes y ecommerce.

El versionado y la aplicación remota se registran por separado en las secciones anteriores.
