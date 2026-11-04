import { describeBackendError } from "@pet-shop/domain";
import { config } from "../config/env";

/**
 * Mensaje para mostrar en pantalla. En producción es siempre un texto humano; en desarrollo agrega el
 * detalle técnico (código, mensaje, detalles) y lo registra en consola para poder diagnosticar.
 */
export function describeError(error: unknown, fallback?: string): string {
  if (config.isDev) console.error("Admin operation failed", error);
  return describeBackendError(error, { fallback, diagnostics: config.isDev });
}
