import { useEffect, useState } from "react";

/**
 * Renderizado progresivo para tablas largas: muestra `pageSize` filas y permite ampliar.
 * Vuelve a la primera página cuando cambia la lista (filtros, búsqueda).
 */
export function usePagedList<T>(items: readonly T[], pageSize = 100) {
  const [count, setCount] = useState(pageSize);
  useEffect(() => setCount(pageSize), [items, pageSize]);
  return {
    visible: items.length > count ? items.slice(0, count) : items,
    total: items.length,
    hasMore: items.length > count,
    showMore: () => setCount((current) => current + pageSize),
  };
}
