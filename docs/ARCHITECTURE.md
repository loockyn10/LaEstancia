# Arquitectura

## Implementado / verificado

- Monorepo con pnpm workspaces.
- Aplicación administrativa en React, Vite y TypeScript con login email/contraseña, restauración de sesión y logout mediante Supabase Auth.
- Protección de backoffice basada en sesión y membresía activa de negocio. La UI no es autoridad: PostgreSQL RLS determina las filas accesibles.
- Migration versionada para `profiles`, `businesses`, `business_memberships` y `branches`, con roles `owner`, `admin` y `staff`.
- Paquete `database` con tipos manuales que reflejan la migration; no son tipos generados ni representan un proyecto remoto.
- Documentación de contexto, decisiones y flujo multi-agente.

Los comandos efectivamente verificados se registran en `CURRENT_STATE.md`.

## Propuesto / futuro

- Aplicar la migration y enlazar un proyecto Supabase remoto.
- Generar tipos oficiales desde ese proyecto una vez aplicado el esquema.
- Supabase Storage cuando exista una necesidad concreta de archivos.

La configuración de navegador usa únicamente `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`, cargadas desde el `.env.local` raíz mediante Vite. Nunca se usa `service_role` en el frontend. No se contempla offline-first inicialmente; tampoco Tauri, SQLite ni Docker.
