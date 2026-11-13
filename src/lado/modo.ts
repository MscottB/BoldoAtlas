// La app dentro del iframe del panel de al lado (`?lado=<db_id>`): otra organización, en solo lectura. Solo la forma
// canónica del id, como en Rust; con otra, o sin `location` (pruebas en node), es la app de siempre.
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const pedido = typeof location === "undefined" ? null : new URLSearchParams(location.search).get("lado");
const id = pedido && ID.test(pedido) ? pedido : "";

export const MODO_LADO: boolean = id !== "";
/** El id de la organización de al lado; vacío fuera del modo lado. */
export const idLado = (): string => id;

/** Las vistas que se ven al lado (nombres de ruta). Aquí y no en el arranque: el padre la usa sin cargarlo. */
export const VISTAS_LADO = ["arbol", "arboles", "directorio", "revision"];
