import { describeBackendError } from "@pet-shop/domain";
import { config } from "../config/env";

/** Mensaje humano para la pantalla; en desarrollo suma el detalle técnico y lo registra en consola. */
export function describeError(error: unknown, fallback?: string): string {
  if (config.isDev) console.error("POS operation failed", error);
  return describeBackendError(error, { fallback, diagnostics: config.isDev });
}
