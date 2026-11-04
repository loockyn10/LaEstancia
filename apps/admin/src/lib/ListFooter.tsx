import { Button } from "@pet-shop/ui";

/** Pie de tabla para listas con renderizado progresivo (ver usePagedList). */
export function ListFooter({ shown, total, hasMore, onShowMore }: { shown: number; total: number; hasMore: boolean; onShowMore: () => void }) {
  if (!hasMore) return null;
  return (
    <div className="list-footer">
      <span>Mostrando {shown} de {total}</span>
      <Button compact onClick={onShowMore} variant="secondary">Mostrar más</Button>
    </div>
  );
}
