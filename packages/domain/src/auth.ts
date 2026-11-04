/** Identificadores simples iniciales → email técnico de Supabase Auth. */
const technicalLoginEmails: Record<string, string> = {
  "dueño": "dueno@laestancia.local",
  dueno: "dueno@laestancia.local",
  admin: "admin@laestancia.local",
  empleado: "empleado@laestancia.local",
};

export function loginEmail(identifier: string): string {
  const trimmed = identifier.trim();
  return technicalLoginEmails[trimmed.toLocaleLowerCase("es-AR")] ?? trimmed;
}
