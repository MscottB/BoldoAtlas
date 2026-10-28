import { obtenerVersion } from "./version.mjs";

/** Constantes globales que Vite y Vitest inyectan en el código (ver src/env.d.ts). */
export function constantesVersion() {
  const v = obtenerVersion();
  return {
    __APP_VERSION__: JSON.stringify(v.completa),
    __APP_VERSION_CORTA__: JSON.stringify(v.base),
    __APP_FECHA__: JSON.stringify(v.fecha),
    __APP_COMMIT__: JSON.stringify(v.commit),
  };
}
