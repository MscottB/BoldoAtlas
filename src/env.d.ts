/** Versión completa SemVer, p. ej. `1.2.0+28102026` (scripts/version.mjs). */
declare const __APP_VERSION__: string;
/** Versión base sin metadatos, p. ej. `1.2.0` o `1.3.0-beta.1`. */
declare const __APP_VERSION_CORTA__: string;
/** Fecha de compilación DDMMAAAA (America/Santiago). */
declare const __APP_FECHA__: string;
/** SHA corto del commit, o "" sin git. */
declare const __APP_COMMIT__: string;
/** novedades.json del release (scripts/novedades.mjs): notas de cada versión, de la más nueva a la más antigua. */
declare const __APP_NOVEDADES__: { versiones: { version: string; fecha: string; notas: string }[] };
