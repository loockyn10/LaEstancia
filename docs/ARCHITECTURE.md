# Arquitectura

## Implementado / verificado

- Monorepo con pnpm workspaces.
- Aplicación administrativa mínima en React, Vite y TypeScript.
- Paquetes base `domain`, `database` y `ui` sin modelos comerciales prematuros.
- Documentación de contexto, decisiones y flujo multi-agente.

Los comandos efectivamente verificados se registran en `CURRENT_STATE.md`.

## Propuesto / futuro

- Supabase como backend.
- PostgreSQL como base de datos.
- Supabase Auth para identidad.
- Supabase RLS para autorización y ownership.
- Supabase Storage cuando exista una necesidad concreta de archivos.

Nada de lo anterior está implementado por esta fundación. No se contempla offline-first inicialmente; tampoco Tauri, SQLite ni Docker.
