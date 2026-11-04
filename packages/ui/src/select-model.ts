/** Lógica pura del Select/Combobox (separada para poder probarla sin DOM). */

export type SelectOption = {
  value: string;
  label: string;
  /** Texto secundario (por ejemplo SKU o precio). También participa de la búsqueda. */
  hint?: string;
  disabled?: boolean;
};

const normalize = (text: string) =>
  text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("es-AR");

export function filterOptions(options: readonly SelectOption[], query: string): SelectOption[] {
  const needle = normalize(query.trim());
  if (!needle) return [...options];
  return options.filter((option) => normalize(`${option.label} ${option.hint ?? ""}`).includes(needle));
}

/** Siguiente índice habilitado desde `from` avanzando `step` (±1) sin dar la vuelta. Devuelve `from` si no hay otro. */
export function nextEnabledIndex(options: readonly SelectOption[], from: number, step: 1 | -1): number {
  for (let index = from + step; index >= 0 && index < options.length; index += step) {
    if (!options[index].disabled) return index;
  }
  return from;
}

export function firstEnabledIndex(options: readonly SelectOption[]): number {
  return options.findIndex((option) => !option.disabled);
}

export function lastEnabledIndex(options: readonly SelectOption[]): number {
  for (let index = options.length - 1; index >= 0; index -= 1) if (!options[index].disabled) return index;
  return -1;
}

/** Índice inicial al abrir: la opción seleccionada o la primera habilitada. */
export function initialActiveIndex(options: readonly SelectOption[], value: string): number {
  const selected = options.findIndex((option) => option.value === value && !option.disabled);
  return selected >= 0 ? selected : firstEnabledIndex(options);
}

/** Type-ahead de un select sin búsqueda: el siguiente ítem cuyo label empieza con `prefix`. */
export function typeAheadIndex(options: readonly SelectOption[], prefix: string, from: number): number {
  const needle = normalize(prefix);
  if (!needle) return -1;
  const count = options.length;
  for (let offset = 1; offset <= count; offset += 1) {
    const index = (from + offset) % count;
    if (!options[index].disabled && normalize(options[index].label).startsWith(needle)) return index;
  }
  return -1;
}
