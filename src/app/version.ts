import type { InfoApp } from "@/db/cliente";

/** "Versión 1.2.0 · 28102026" */
export function versionVisible(): string {
  return `Versión ${__APP_VERSION_CORTA__} · ${__APP_FECHA__}`;
}

/** Texto para reportar errores: versión, base de datos y modo. */
export function infoParaCopiar(info: InfoApp, meta: Record<string, string>): string {
  return [
    `BoldoAtlas ${__APP_VERSION__}`,
    `Commit ${__APP_COMMIT__ || "desconocido"}`,
    `Esquema ${info.versionEsquema}`,
    `Base ${meta.db_id ?? "?"} · revisión ${meta.data_revision ?? "?"} · creada ${meta.db_creada ?? "?"}`,
    `Modo ${info.portable ? "portable" : "instalado"}`,
  ].join("\n");
}
