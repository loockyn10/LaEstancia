# Contexto del proyecto

Plataforma de gestión para pet shops orientada inicialmente a la operación interna de una tienda. Sus usuarios principales serán personas operando el negocio, sin asumir formación técnica.

Resolverá progresivamente la administración de un catálogo comercial, y luego operaciones asociadas. La visión es que el mismo catálogo central alimente POS, ecommerce y canales digitales, sin catálogos independientes.

Módulos previstos: catálogo, variantes, marcas/categorías, barcodes, precios, etiquetas, stock, importación, proveedores, compras, POS, ventas, clientes, ecommerce, pedidos, pagos y canales digitales.

Stack decidido: pnpm, monorepo TypeScript, React + Vite para el backoffice y Supabase/PostgreSQL como backend previsto. Principios: una fuente de verdad del negocio, seguridad en backend, UX simple y cambios incrementales documentados.
