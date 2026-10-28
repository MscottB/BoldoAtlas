import type { InfoApp } from "@/db/cliente";
import type { Resultado } from "@/stores/organizacion";

export const ANCHO_COLAPSO = 1100;
export const RUTA_BIENVENIDA = "/bienvenida";

/** Al abrir: con la base ya cargada y sin unidades se va a la bienvenida. `vacia` es true antes de cargar, de ahí `cargado`. */
export const destinoInicial = (cargado: boolean, vacia: boolean): string | null =>
  cargado && vacia ? RUTA_BIENVENIDA : null;

/** La barra lateral se colapsa bajo 1100 px; una elección manual (no nula) manda sobre el ancho. */
export const barraColapsada = (ancho: number, manual: boolean | null): boolean =>
  manual ?? ancho < ANCHO_COLAPSO;

/** Si la carga inicial falló, los datos para la pantalla de error (misma forma que la de `infoApp` con error); si no, null. */
export const infoSiFalloCarga = (r: Resultado): InfoApp | null =>
  r.ok ? null : { dirDatos: "", rutaBd: "", portable: false, versionEsquema: 0, error: r.mensaje };
