import type { InfoApp } from "@/db/cliente";
import { i18n } from "@/i18n";

/** "Versión 1.2.0 · 28102026" */
export function versionVisible(): string {
  return i18n.global.t("acerca.version", { version: __APP_VERSION_CORTA__, fecha: __APP_FECHA__ });
}

/** Texto para reportar errores: versión, base de datos y modo. */
export function infoParaCopiar(info: InfoApp, meta: Record<string, string>): string {
  const { t } = i18n.global;
  return [
    `BoldoAtlas ${__APP_VERSION__}`,
    t("acerca.copia.commit", { commit: __APP_COMMIT__ || t("acerca.copia.desconocido") }),
    t("acerca.copia.esquema", { esquema: info.versionEsquema }),
    t("acerca.copia.base", {
      id: meta.db_id ?? "?",
      revision: meta.data_revision ?? "?",
      creada: meta.db_creada ?? "?",
    }),
    t(info.portable ? "acerca.copia.modoPortable" : "acerca.copia.modoInstalado"),
  ].join("\n");
}
