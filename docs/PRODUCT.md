# Producto

## Conocido hoy

El producto será una plataforma de gestión para pet shops. El catálogo central único pertenece al negocio y se diseñará primero para la operación interna. Más adelante se reutilizará para POS, ecommerce y canales digitales.

La primera UX funciona para un único negocio operativo, pero cada dato comercial futuro pertenecerá a un negocio. El acceso de un usuario se determina por una membresía activa en ese negocio; una sucursal pertenece siempre a un negocio.

Stock y precios serán capacidades centrales. La UX debe priorizar simplicidad para usuarios no técnicos. Se contempla el uso de scanner y códigos de barras, y la importación de un catálogo existente será importante.

## Catálogo comercial actual

- `Product` representa la identidad comercial general, por ejemplo, “Royal Canin Mini Adult”.
- `ProductVariant` representa una presentación vendible de ese producto, por ejemplo, “3 kg” o “7.5 kg”. Incluso los productos de presentación única se operarán mediante una variante.
- Brands, categories y products pertenecen a un business. Brand y category son opcionales en un product; todavía no existe un árbol de categorías.
- El SKU pertenece a la variante y, cuando existe, es único dentro del business. Un barcode es texto, pertenece a una variante y no se repite dentro de su business. Una variante puede tener varios barcodes y, como máximo, uno primario.
- Cada `ProductVariant` puede tener un precio de venta actual y un costo actual independientes. Los importes se almacenan en centavos enteros; una ausencia significa que el importe todavía no fue definido.
- Owner y admin pueden consultar y editar precios y costos. Staff puede consultar únicamente el precio de venta: no recibe costos, ganancias ni márgenes.
- La ganancia bruta es `precio - costo` y el margen bruto es `(precio - costo) / precio × 100`. Ambos se muestran sólo cuando existen precio y costo, y el margen no se calcula para un precio igual a cero.

## UX administrativa del catálogo

- La navegación inicial del backoffice se limita a Productos, Marcas y Categorías.
- La operación usa el término “Presentación” para `ProductVariant`. Un producto simple se crea con una presentación predeterminada.
- La búsqueda de productos cubre nombre del producto, SKU de la presentación y código de barras. Marcas y categorías se administran como listas planas activables.
- `staff` consulta el catálogo; `owner` y `admin` pueden crear y editar. Esta distinción mejora la UX, pero RLS permanece como autoridad de acceso.
- La sección Precios permite editar importes por presentación, revisar el historial de precio y costo para owner/admin, y ajustar en forma masiva sólo precios de venta mediante un porcentaje con vista previa y confirmación.
- Una presentación puede tener ofertas simples de precio promocional, independientes del precio base. Una oferta sólo aplica si está activa y dentro de su vigencia; no se contemplan aún 2x1, combos ni descuentos por cantidad.
- La sección Etiquetas permite seleccionar presentaciones y cantidades de copias para imprimir etiquetas chicas, etiquetas de góndola y carteles de oferta desde la vista previa del navegador. Usa el barcode principal existente cuando está disponible, sin inventar códigos.
- Stock pertenece a cada combinación de presentación y sucursal. Las cantidades admiten hasta tres decimales para productos futuros vendidos por peso, aunque la UX actual no incorpora todavía el flujo completo de fraccionados.
- Owner y admin pueden registrar entradas, salidas y ajustes manuales; staff sólo consulta. Un ajuste siempre expresa la cantidad física final, y el historial conserva el delta y el saldo resultante.
- El mínimo de stock es opcional por presentación/sucursal. Cero es “Sin stock”; un saldo positivo menor o igual al mínimo es “Bajo”; sin mínimo no se genera alerta de bajo stock.

## Decisiones pendientes

- Fraccionamiento.
- Alcance y diseño del POS.
- Alcance y framework del ecommerce público.
- Modelo de proveedores.
