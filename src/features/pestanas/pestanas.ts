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
  /** El id de la base de la organización a la que pertenece. */
  org: string;
  /** Ruta completa (path + query + hash): identifica la vista. */
  ruta: string;
  estado?: EstadoVista;
  /** En Configuración, Ayuda o Acerca de: la ruta de esta pestaña a la que vuelve «Cerrar». */
  volver?: string;
}
/** Cómo se reparte la ventana con dos pestañas a la vista: `horizontal` es lado a lado; `proporcion`, lo que ocupa la principal. */
export interface Division {
  orientacion: "horizontal" | "vertical";
  proporcion: number;
}
export const DIVISION_INICIAL: Division = { orientacion: "horizontal", proporcion: 0.5 };
export const PROPORCION_MIN = 0.2;
export const PROPORCION_MAX = 0.8;
export type Panel = "principal" | "lado";

export interface Pestanas {
  lista: Pestana[];
  /** La del panel principal. */
  activa: string;
  /** La que se ve al lado, junto a la activa; null sin vista dividida. Nunca es la activa. */
  lado: string | null;
  division: Division;
}

const indice = (m: Pestanas, id: string) => m.lista.findIndex((p) => p.id === id);

export const unaPestana = (id: string, org: string, ruta = RUTA_INICIO): Pestanas => ({
  lista: [{ id, org, ruta }],
  activa: id,
  lado: null,
  division: DIVISION_INICIAL,
});

/** Abre `ruta` en una pestaña nueva, a la derecha de la activa, y la deja activa; null si ya hay el máximo. */
export function abrir(m: Pestanas, id: string, ruta: string, org: string): Pestanas | null {
  if (m.lista.length >= MAX_PESTANAS) return null;
  const lista = [...m.lista];
  lista.splice(indice(m, m.activa) + 1, 0, { id, org, ruta });
  return { ...m, lista, activa: id };
}

/**
 * Cierra la pestaña; si era la activa, se activa la más cercana de su organización (primero a la derecha) y, si no hay,
 * la de su derecha (o la de su izquierda), nunca la de al lado: esa sigue donde estaba. Cerrar la de al lado quita la
 * división, y si la de al lado es la única que queda pasa a ser la activa. La última no se cierra.
 */
export function cerrar(m: Pestanas, id: string): Pestanas {
  const i = indice(m, id);
  if (i < 0 || m.lista.length <= 1) return m;
  const lista = m.lista.filter((p) => p.id !== id);
  const lado = m.lado === id ? null : m.lado;
  if (m.activa !== id) return { ...m, lista, lado };
  // Entre las candidatas no va la de al lado; `j` es el lugar que ocupaba la cerrada entre ellas.
  const candidatas = lista.filter((p) => p.id !== lado);
  if (!candidatas.length) return { ...m, lista, activa: lado!, lado: null };
  const j = m.lista.slice(0, i).filter((p) => p.id !== lado).length;
  const deSuOrg = (p: Pestana) => p.org === m.lista[i]!.org;
  const nueva =
    candidatas.slice(j).find(deSuOrg) ??
    candidatas.slice(0, j).reverse().find(deSuOrg) ??
    candidatas[j] ??
    candidatas[j - 1]!;
  return { ...m, lista, activa: nueva.id, lado };
}

/**
 * Pone `id` al lado. Si es la activa, intercambia con la de al lado; sin pestaña al lado, la activa pasa a la que
 * activaría `cerrar`. Con una sola pestaña no hay otra que activar y nada cambia.
 */
export function alLado(m: Pestanas, id: string): Pestanas {
  if (indice(m, id) < 0 || m.lado === id) return m;
  if (id !== m.activa) return { ...m, lado: id };
  if (m.lista.length <= 1) return m;
  return { ...m, activa: m.lado ?? cerrar(m, id).activa, lado: id };
}

/**
 * La entrada del menú de la pestaña `id`: «Quitar de al lado» en la de al lado; «Abrir al lado» si puede ir (`vaAlLado`)
 * y, si es la activa, si la que el principal mostraría en su lugar puede ir a él (`vaAlPrincipal`; si no, abrir fallaría);
 * si no, ninguna.
 */
export function entradaMenu(
  m: Pestanas,
  id: string,
  vaAlLado: (id: string) => boolean,
  vaAlPrincipal = vaAlLado,
): "abrirAlLado" | "quitarDeAlLado" | null {
  if (id === m.lado) return "quitarDeAlLado";
  if (!vaAlLado(id)) return null;
  if (id !== m.activa) return "abrirAlLado";
  const otra = alLado(m, id).activa;
  return otra !== id && vaAlPrincipal(otra) ? "abrirAlLado" : null;
}

/** Quita la vista dividida. */
export const sinLado = (m: Pestanas): Pestanas => ({ ...m, lado: null });

/** Muestra `id` en `panel`; si ya estaba en el otro, los dos paneles intercambian sus pestañas. */
export function enPanel(m: Pestanas, panel: Panel, id: string): Pestanas {
  if (indice(m, id) < 0) return m;
  if (panel === "lado") return alLado(m, id);
  if (id === m.activa) return m;
  return { ...m, activa: id, lado: id === m.lado ? m.activa : m.lado };
}

/** Cambia lo que ocupa el panel principal, acotado para que ninguno de los dos desaparezca. */
export const conProporcion = (m: Pestanas, p: number): Pestanas =>
  Number.isNaN(p)
    ? m
    : {
        ...m,
        division: { ...m.division, proporcion: Math.min(Math.max(p, PROPORCION_MIN), PROPORCION_MAX) },
      };

/**
 * Sin las pestañas de `org`, que ya no existe. La activa debe ser de la abierta: si era de `org`, pasa a una suya y, sin
 * ninguna, a una nueva en el inicio. Aquí no rige «la última no se cierra», y como se quitó la activa hay lugar para ella.
 */
export function sinOrganizacion(
  m: Pestanas,
  org: string,
  nuevoId: () => string,
  orgAbierta: string,
): Pestanas {
  const lista = m.lista.filter((p) => p.org !== org);
  // La de al lado se queda solo si sigue en la lista y no pasa a ser la activa.
  const con = (l: Pestana[], activa: string): Pestanas => ({
    ...m,
    lista: l,
    activa,
    lado: l.some((p) => p.id === m.lado) && m.lado !== activa ? m.lado : null,
  });
  if (lista.some((p) => p.id === m.activa)) return con(lista, m.activa);
  const suya = lista.find((p) => p.org === orgAbierta);
  if (suya) return con(lista, suya.id);
  const id = nuevoId();
  return con([...lista, { id, org: orgAbierta, ruta: RUTA_INICIO }], id);
}

/**
 * Al volver a la organización desde Inicio se empieza en el Árbol: si la activa no es del Árbol, pasa a serlo su primera
 * pestaña del Árbol y, si no tiene, se abre una a la derecha de la activa. Las demás pestañas no cambian. Con el máximo lleno queda como estaba.
 */
export function alArbol(
  m: Pestanas,
  org: string,
  esArbol: (ruta: string) => boolean,
  nuevoId: () => string,
): Pestanas {
  const suya = [m.lista.find((p) => p.id === m.activa), ...m.lista].find(
    (p) => p?.org === org && esArbol(p.ruta),
  );
  if (suya) return enPanel(m, "principal", suya.id);
  return abrir(m, nuevoId(), RUTA_INICIO, org) ?? m;
}

/** Con más de una organización, cada pestaña lleva su nombre y su color. */
export const hayVariasOrganizaciones = (m: Pick<Pestanas, "lista" | "activa">): boolean =>
  new Set(m.lista.map((p) => p.org)).size > 1;

/** Si el motivo por el que no abrió se arregla buscando el archivo: `red` y `journal` piden hacerlo en su texto; `no_esta` es
 * un archivo que se movió. */
export const sePuedeBuscar = ({ codigo, detalle }: { codigo: string; detalle: string }): boolean =>
  codigo === "no_encontrado" ||
  codigo === "otro_id" ||
  (codigo === "contenido_invalido" && (detalle === "red" || detalle === "journal" || detalle === "no_esta"));

/**
 * Lo que puede pasarse solo: la carga, otra copia de la app, un archivo que otro programa retiene, o uno que no abrió sin que el
 * sistema diga por qué. Nunca uno dañado, sin permiso o que ya no está.
 */
export const sePuedeReintentar = ({ codigo, detalle }: { codigo: string; detalle: string }): boolean =>
  codigo === "fallo" ||
  codigo === "abierta_en_otra_copia" ||
  (codigo === "contenido_invalido" && (detalle === "retenido" || detalle === "sin_causa"));

/** Con datos que no cargaron y una sola pestaña, cerrar deja otra igual con el mismo motivo: parece no hacer nada. */
export const sePuedeCerrar = (codigo: string, pestanas: number): boolean =>
  codigo !== "fallo" || pestanas > 1;

/** El detalle de un motivo solo se muestra si aporta: un código o un id sueltos no dicen nada, y el mensaje ya se ve. */
export const detalleUtil = ({ detalle, mensaje }: { detalle: string; mensaje: string }): boolean =>
  !!detalle && detalle !== mensaje && !/^[\w-]+$/.test(detalle);

/** La pestaña a `paso` de la que muestra `panel`, dando la vuelta (Ctrl+Tab / Ctrl+Mayús+Tab) y saltando la del otro panel. */
export function vecina(m: Pestanas, paso: 1 | -1, panel: Panel = "principal"): string {
  const n = m.lista.length;
  const otro = panel === "principal" ? m.lado : m.activa;
  let i = Math.max(0, indice(m, panel === "principal" ? m.activa : (m.lado ?? m.activa)));
  for (let k = 0; k < n; k++) {
    i = (i + paso + n) % n;
    if (m.lista[i]!.id !== otro) break;
  }
  return m.lista[i]!.id;
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
 * Una pestaña sin `org` (guardada antes de que hubiera varias organizaciones) queda de `orgActual`. Admite una más que
 * el máximo: la que se abre para la organización abierta cuando las otras ya lo llenan.
 */
export function leerPestanas(
  crudo: unknown,
  valida: (ruta: string, org: string) => boolean,
  nuevoId: () => string,
  orgActual: string,
): Pestanas {
  const c = (typeof crudo === "object" && crudo !== null ? crudo : {}) as Record<string, unknown>;
  const vistos = new Set<string>();
  const lista: Pestana[] = [];
  for (const x of Array.isArray(c.lista) ? c.lista : []) {
    if (lista.length > MAX_PESTANAS) break;
    const p = (typeof x === "object" && x !== null ? x : {}) as Record<string, unknown>;
    const org = typeof p.org === "string" && p.org ? p.org : orgActual;
    if (
      typeof p.id !== "string" ||
      !p.id ||
      vistos.has(p.id) ||
      typeof p.ruta !== "string" ||
      !valida(p.ruta, org)
    )
      continue;
    vistos.add(p.id);
    const e = p.estado as Record<string, unknown> | undefined;
    const pestana: Pestana = { id: p.id, org, ruta: p.ruta };
    if (typeof e === "object" && e !== null && typeof e.ruta === "string")
      pestana.estado = { ruta: e.ruta, datos: e.datos };
    if (typeof p.volver === "string" && valida(p.volver, org)) pestana.volver = p.volver;
    lista.push(pestana);
  }
  if (!lista.length) return unaPestana(nuevoId(), orgActual);
  const activa = lista.some((p) => p.id === c.activa) ? (c.activa as string) : lista[0]!.id;
  const lado =
    typeof c.lado === "string" && c.lado !== activa && lista.some((p) => p.id === c.lado) ? c.lado : null;
  const d = (typeof c.division === "object" && c.division !== null ? c.division : {}) as Record<
    string,
    unknown
  >;
  const division: Division =
    (d.orientacion === "horizontal" || d.orientacion === "vertical") &&
    typeof d.proporcion === "number" &&
    d.proporcion >= PROPORCION_MIN &&
    d.proporcion <= PROPORCION_MAX
      ? { orientacion: d.orientacion, proporcion: d.proporcion }
      : DIVISION_INICIAL;
  return { lista, activa, lado, division };
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
