# Decisiones

## D001 — Monorepo con pnpm

**Decisión:** usar pnpm workspaces.

**Motivo:** separar aplicaciones y código compartido sin agregar una capa de tooling prematura.

**Consecuencias:** los scripts de raíz coordinan paquetes del workspace.

## D002 — Backoffice inicial React + Vite + TypeScript

**Decisión:** usar React, Vite y TypeScript para la aplicación administrativa.

**Motivo:** base ligera y adecuada para un backoffice web.

**Consecuencias:** el ecommerce público futuro podrá decidir su framework por separado.

## D003 — Supabase/PostgreSQL como backend previsto

**Decisión:** adoptar Supabase con PostgreSQL como dirección de backend.

**Motivo:** cubrir persistencia, autenticación, RLS y storage de forma progresiva.

**Consecuencias:** no implica que esos servicios ya estén configurados o desplegados.

## D004 — Catálogo central compartido entre canales futuros

**Decisión:** el catálogo pertenece al negocio, no a un canal.

**Motivo:** evitar duplicación e inconsistencias entre operación, POS, ecommerce y redes.

**Consecuencias:** los canales futuros consumirán una fuente de verdad compartida.

## D005 — Sin offline-first inicial

**Decisión:** no implementar offline-first en esta etapa.

**Motivo:** mantener el alcance inicial acotado.

**Consecuencias:** la arquitectura no debe anticipar complejidad de sincronización sin una necesidad validada.
