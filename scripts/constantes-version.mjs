import { readFileSync } from "node:fs";
import { obtenerVersion } from "./version.mjs";

/** Constantes globales que Vite y Vitest inyectan en el código (ver src/env.d.ts). */
export function constantesVersion() {
  const v = obtenerVersion();
  // novedades.json lo genera el release (scripts/novedades.mjs); en desarrollo y en los builds de prueba no hay
  const novedades = process.env.BOLDO_NOVEDADES
    ? JSON.parse(readFileSync(process.env.BOLDO_NOVEDADES, "utf8"))
    : { versiones: [] };
  return {
    __APP_VERSION__: JSON.stringify(v.completa),
    __APP_VERSION_CORTA__: JSON.stringify(v.base),
    __APP_FECHA__: JSON.stringify(v.fecha),
    __APP_COMMIT__: JSON.stringify(v.commit),
    __APP_NOVEDADES__: JSON.stringify(novedades),
  };
}
