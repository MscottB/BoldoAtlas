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

/** Vistas que se cierran con su botón Cerrar, con Esc o con un segundo clic en su entrada del menú (nombres de ruta). */
const VISTAS_CERRABLES = ["configuracion", "ayuda", "acerca"];
export const esVistaCerrable = (nombre: unknown): boolean =>
  typeof nombre === "string" && VISTAS_CERRABLES.includes(nombre);

/** `anterior` es `history.state.back` de vue-router: la ruta anterior dentro de la app, o null si se abrió directo. */
export const destinoAlCerrar = (anterior: unknown): "atras" | "/" =>
  typeof anterior === "string" && anterior ? "atras" : "/";

/** Título de la ventana: el programa y la organización abierta. */
export const tituloVentana = (organizacion: string): string =>
  organizacion.trim() ? `BoldoAtlas — ${organizacion.trim()}` : "BoldoAtlas";
