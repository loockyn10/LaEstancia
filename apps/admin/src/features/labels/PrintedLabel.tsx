import { formatPesos } from "@pet-shop/domain";

export type LabelFormat = "small" | "shelf" | "offer";

export type LabelItem = {
  variantId: string;
  productName: string;
  variantName: string;
  brandName: string | null;
  barcode: string | null;
  basePrice: number | null;
  effectivePrice: number | null;
  promotionalPrice: number | null;
};

/** Tarjeta imprimible. Sólo usa el barcode principal existente: nunca inventa códigos. */
export function PrintedLabel({ item, format }: { item: LabelItem; format: LabelFormat }) {
  const hasOffer = item.promotionalPrice !== null;

  if (format === "offer") {
    return (
      <article className="print-card offer-poster">
        <div className="poster-brand">La Estancia</div>
        <div className="poster-offer">OFERTA</div>
        {item.brandName && <p className="poster-brand-name">{item.brandName}</p>}
        <h2>{item.productName}</h2>
        <p className="poster-variant">{item.variantName}</p>
        {hasOffer ? (
          <>
            <p className="poster-normal">Antes {formatPesos(item.basePrice)}</p>
            <strong className="poster-price">{formatPesos(item.promotionalPrice)}</strong>
          </>
        ) : (
          <>
            <p className="poster-normal">No hay oferta vigente</p>
            <strong className="poster-price">{formatPesos(item.basePrice)}</strong>
          </>
        )}
        {item.barcode && <p className="print-barcode">{item.barcode}</p>}
      </article>
    );
  }

  return (
    <article className={`print-card label-${format}`}>
      {format === "shelf" && item.brandName && <p className="label-brand">{item.brandName}</p>}
      <h2>{item.productName}</h2>
      <p className="label-variant">{item.variantName}</p>
      {hasOffer && <p className="label-normal">Normal: {formatPesos(item.basePrice)}</p>}
      <strong className="label-price">{formatPesos(item.effectivePrice)}</strong>
      {item.barcode ? <p className="print-barcode">{item.barcode}</p> : <p className="no-barcode">Sin código de barras</p>}
    </article>
  );
}
