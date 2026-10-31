// Modelo de las pestañas de trabajo (spec §7): funciones puras; el store (usePestanas) las aplica y navega.

export const MAX_PESTANAS = 12;
/** La vista por defecto del proyecto: la de Ctrl+T y la de la primera pestaña. */
export const RUTA_INICIO = "/";

/** Estado que la vista dejó al desmontarse, para la ruta (completa, con query) que mostraba. */
export interface EstadoVista {
  ruta: string;
  datos: unknown;
}
export interface Pestana {
  id: string;
  /** Ruta completa (path + query + hash): identifica la vista. */
  ruta: string;
  estado?: EstadoVista;
  /** En Configuración, Ayuda o Acerca de: la ruta de esta pestaña a la que vuelve «Cerrar». */
  volver?: string;
}
export interface Pestanas {
  lista: Pestana[];
  activa: string;
}

const indice = (m: Pestanas, id: string) => m.lista.findIndex((p) => p.id === id);

export const unaPestana = (id: string, ruta = RUTA_INICIO): Pestanas => ({
  lista: [{ id, ruta }],
  activa: id,
});

/** Abre `ruta` en una pestaña nueva, a la derecha de la activa, y la deja activa; null si ya hay el máximo. */
export function abrir(m: Pestanas, id: string, ruta: string): Pestanas | null {
  if (m.lista.length >= MAX_PESTANAS) return null;
  const lista = [...m.lista];
  lista.splice(indice(m, m.activa) + 1, 0, { id, ruta });
  return { lista, activa: id };
}

/** Cierra la pestaña; si era la activa, se activa la de su derecha (o la de su izquierda). La última no se cierra. */
export function cerrar(m: Pestanas, id: string): Pestanas {
  const i = indice(m, id);
  if (i < 0 || m.lista.length <= 1) return m;
  const lista = m.lista.filter((p) => p.id !== id);
  return { lista, activa: m.activa === id ? (lista[i] ?? lista[i - 1]!).id : m.activa };
}

/** La pestaña a `paso` de la activa, dando la vuelta (Ctrl+Tab / Ctrl+Mayús+Tab). */
export function vecina(m: Pestanas, paso: 1 | -1): string {
  const n = m.lista.length;
  const i = Math.max(0, indice(m, m.activa));
  return m.lista[(i + paso + n) % n]!.id;
}

/** Lleva la pestaña a la posición `destino` (acotada a la lista). */
export function mover(m: Pestanas, id: string, destino: number): Pestanas {
  const i = indice(m, id);
  const j = Math.min(Math.max(destino, 0), m.lista.length - 1);
  if (i < 0 || i === j) return m;
  const lista = [...m.lista];
  lista.splice(j, 0, ...lista.splice(i, 1));
  return { ...m, lista };
}

/** Cambia algo de una pestaña (su ruta, su estado); sin esa pestaña, nada cambia. */
export function cambiar(m: Pestanas, id: string, cambios: Partial<Omit<Pestana, "id">>): Pestanas {
  const i = indice(m, id);
  if (i < 0) return m;
  const lista = [...m.lista];
  lista[i] = { ...lista[i]!, ...cambios };
  return { ...m, lista };
}

/** Lo que la vista guardó en la pestaña, solo si era para esta misma ruta. */
export const estadoDe = (m: Pestanas, id: string, ruta: string): unknown =>
  m.lista.find((p) => p.id === id && p.estado?.ruta === ruta)?.estado?.datos;

/**
 * Lee las pestañas guardadas (JSON ya parseado, de cualquier forma): descarta lo mal formado, los ids repetidos y las
 * rutas que `valida` rechaza (una vista que ya no existe, una unidad o persona eliminada). Siempre deja al menos una.
 */
export function leerPestanas(
  crudo: unknown,
  valida: (ruta: string) => boolean,
  nuevoId: () => string,
): Pestanas {
  const c = (typeof crudo === "object" && crudo !== null ? crudo : {}) as Record<string, unknown>;
  const vistos = new Set<string>();
  const lista: Pestana[] = [];
  for (const x of Array.isArray(c.lista) ? c.lista : []) {
    if (lista.length >= MAX_PESTANAS) break;
    const p = (typeof x === "object" && x !== null ? x : {}) as Record<string, unknown>;
    if (
      typeof p.id !== "string" ||
      !p.id ||
      vistos.has(p.id) ||
      typeof p.ruta !== "string" ||
      !valida(p.ruta)
    )
      continue;
    vistos.add(p.id);
    const e = p.estado as Record<string, unknown> | undefined;
    const pestana: Pestana = { id: p.id, ruta: p.ruta };
    if (typeof e === "object" && e !== null && typeof e.ruta === "string")
      pestana.estado = { ruta: e.ruta, datos: e.datos };
    if (typeof p.volver === "string" && valida(p.volver)) pestana.volver = p.volver;
    lista.push(pestana);
  }
  if (!lista.length) return unaPestana(nuevoId());
  return { lista, activa: lista.some((p) => p.id === c.activa) ? (c.activa as string) : lista[0]!.id };
}

/** Lo que identifica la vista de una ruta (de `router.resolve`). */
export interface DestinoRuta {
  nombre: unknown;
  query: Record<string, unknown>;
}
// La Bienvenida no es una vista del proyecto: no va en pestañas.
const VISTAS = [
  "arbol",
  "arboles",
  "directorio",
  "revision",
  "configuracion",
  "mantenedores",
  "ayuda",
  "acerca",
];
const DE_UNIDAD = ["raiz", "ver", "unidad"];

/** Si la ruta sigue llevando a algo que existe: una vista del proyecto y, si nombra una unidad o persona, que exista. */
export function rutaValida(
  d: DestinoRuta,
  existe: { unidad: (id: string) => boolean; persona: (id: string) => boolean },
): boolean {
  if (typeof d.nombre !== "string" || !VISTAS.includes(d.nombre)) return false;
  const ok = (clave: string, prueba: (id: string) => boolean) =>
    d.query[clave] === undefined || (typeof d.query[clave] === "string" && prueba(d.query[clave]));
  return DE_UNIDAD.every((k) => ok(k, existe.unidad)) && ok("persona", existe.persona);
}

/** Estado del lienzo que guarda cada pestaña del árbol. */
export interface EstadoArbol {
  colapsados: Set<string>;
  seleccion: string | null;
  encuadre: { x: number; y: number; zoom: number } | null;
  /** Sin validar: lo valida `leerVista` (es parte de la configuración de la vista). */
  resaltar: unknown;
}

/** Lee el estado del lienzo guardado en la pestaña; null si no hay o no tiene la forma esperada. */
export function leerEstadoArbol(crudo: unknown): EstadoArbol | null {
  if (typeof crudo !== "object" || crudo === null) return null;
  const c = crudo as Record<string, unknown>;
  if (!Array.isArray(c.colapsados)) return null;
  const v = (typeof c.encuadre === "object" && c.encuadre !== null ? c.encuadre : {}) as Record<
    string,
    unknown
  >;
  const finito = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
  return {
    colapsados: new Set(c.colapsados.filter((x): x is string => typeof x === "string")),
    seleccion: typeof c.seleccion === "string" ? c.seleccion : null,
    encuadre:
      finito(v.x) && finito(v.y) && finito(v.zoom) && v.zoom > 0 ? { x: v.x, y: v.y, zoom: v.zoom } : null,
    resaltar: c.resaltar,
  };
}
