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
- Precio, costo, stock, unidades y lógica de alimento fraccionado no forman parte de esta fundación.

## Decisiones pendientes

- Fraccionamiento.
- Estructura final de inventario.
- Alcance y diseño del POS.
- Alcance y framework del ecommerce público.
- Modelo de proveedores.
