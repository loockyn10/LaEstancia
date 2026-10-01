# Tareas, riesgos y verificaciones

## Pendientes reales

- Definir el primer sprint del dominio de catálogo antes de crear modelos o tablas.
- Configurar Supabase, Auth, RLS y migrations solo cuando una tarea lo requiera.
- Decidir la política de naming y branding comercial.

## Riesgos

- Diseñar prematuramente el modelo de producto, variantes o inventario puede cerrar decisiones de negocio aún abiertas.
- El frontend no debe ser tratado como autoridad de seguridad cuando se incorpore el backend.

## Verificaciones futuras

- Antes de introducir Supabase, distinguir claramente configuración local, versionada y aplicada remotamente.
- Cada migration nueva debe ser revisada y validada según el entorno objetivo.
