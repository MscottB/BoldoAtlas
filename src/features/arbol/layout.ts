import ELK from "elkjs/lib/elk.bundled.js";
import type { Conexion, Puesto, Unidad } from "../../db/tipos";
import { descendientes, indiceHijos } from "./jerarquia";
import {
  VISTA_POR_DEFECTO,
  opcionesElk,
  separaciones,
  tamPuesto,
  tamUnidad,
  type ConfigVista,
} from "./vista";

// Las lecturas de repos no traen deleted_at; se acepta por si el llamador pasa filas crudas.
type U = Unidad & { deleted_at?: string | null };

export interface Subgrafo {
  nodos: Unidad[];
  /** Puestos de las unidades visibles; cuelgan de su unidad en `jerarquicas`. */
  puestos: Puesto[];
  jerarquicas: [string, string][];
  laterales: Conexion[];
}

// Se ven los primeros `nivel` niveles (1 = solo las raíces): todo lo de profundidad >= nivel - 1 con hijos queda colapsado.
// Por defecto, las raíces y su primer nivel.
export function colapsadosIniciales(unidades: U[], nivel = 2): Set<string> {
  const indice = indiceHijos(unidades);
  const colapsados = new Set<string>();
  const vistos = new Set<string>();
  const visitar = (x: Unidad, profundidad: number) => {
    if (vistos.has(x.id)) return;
    vistos.add(x.id);
    const hs = indice.get(x.id) ?? [];
    if (profundidad >= nivel - 1 && hs.length) colapsados.add(x.id);
    hs.forEach((h) => visitar(h, profundidad + 1));
  };
  (indice.get(null) ?? []).forEach((r) => visitar(r, 0));
  return colapsados;
}

/** Abre la unidad y toda su rama; las demás ramas quedan como estaban. */
export function expandirRama(colapsados: Set<string>, unidades: U[], id: string): Set<string> {
  const rama = descendientes(unidades, id);
  return new Set([...colapsados].filter((x) => x !== id && !rama.has(x)));
}

/** Pliega la unidad y cada subrama con hijos: al volver a abrirla se ve un solo nivel. */
export function contraerRama(colapsados: Set<string>, unidades: U[], id: string): Set<string> {
  const indice = indiceHijos(unidades);
  const conHijos = [id, ...descendientes(unidades, id)].filter((x) => indice.get(x)?.length);
  return new Set([...colapsados, ...conHijos]);
}

// Vista enfocada: la raíz pedida (sin superior, para que sea la única raíz) y sus descendientes vivos.
export function unidadesDeRama(unidades: U[], raiz: string): Unidad[] {
  const rama = descendientes(unidades, raiz);
  return unidades.flatMap((x) =>
    x.id === raiz && !x.deleted_at ? [{ ...x, parent_id: null }] : rama.has(x.id) ? [x] : [],
  );
}

// Con `puestos` (vacío = no se dibujan) cada unidad visible, plegada o no, suma los suyos como hijos.
export function subgrafoVisible(
  unidades: U[],
  conexiones: Conexion[],
  colapsados: Set<string>,
  puestos: (Puesto & { deleted_at?: string | null })[] = [],
): Subgrafo {
  const indice = indiceHijos(unidades);
  const porUnidad = new Map<string, Puesto[]>();
  for (const p of puestos.filter((x) => !x.deleted_at).sort((a, b) => a.orden - b.orden)) {
    const lista = porUnidad.get(p.unidad_id);
    if (lista) lista.push(p);
    else porUnidad.set(p.unidad_id, [p]);
  }
  const nodos: Unidad[] = [];
  const delGrafo: Puesto[] = [];
  const jerarquicas: [string, string][] = [];
  const vistos = new Set<string>();
  const visitar = (x: Unidad) => {
    if (vistos.has(x.id)) return;
    vistos.add(x.id);
    nodos.push(x);
    for (const p of porUnidad.get(x.id) ?? []) {
      delGrafo.push(p);
      jerarquicas.push([x.id, p.id]);
    }
    if (colapsados.has(x.id)) return;
    for (const h of indice.get(x.id) ?? []) {
      jerarquicas.push([x.id, h.id]);
      visitar(h);
    }
  };
  (indice.get(null) ?? []).forEach(visitar);
  const laterales = conexiones.filter((c) => vistos.has(c.origen_id) && vistos.has(c.destino_id));
  return { nodos, puestos: delGrafo, jerarquicas, laterales };
}

const elk = new ELK();
// Superior invisible de todas las raíces: mrtree pide un solo árbol, y así las raíces quedan lado a lado en una fila.
const RAIZ_VIRTUAL = "raiz-virtual"; // los ids de las unidades son UUID: no choca

// Devuelve la esquina superior izquierda de cada nodo. Solo las aristas jerárquicas entran: las laterales no deforman
// el árbol. Los tamaños deben ser los de las tarjetas dibujadas (tamUnidad/tamPuesto).
export async function calcularLayout(
  subgrafo: Subgrafo,
  tam = tamUnidad(VISTA_POR_DEFECTO, false),
  tamDelPuesto = tamPuesto(VISTA_POR_DEFECTO),
  vista: Pick<ConfigVista, "direccion" | "densidad" | "nivelesEstrictos"> = VISTA_POR_DEFECTO,
): Promise<Map<string, { x: number; y: number }>> {
  const horizontal = vista.direccion === "horizontal";
  const sep = separaciones(vista);
  // mrtree separa los niveles como a los hermanos: cada tarjeta reserva el resto detrás de sí, en el eje de los niveles.
  const extra = sep.niveles - sep.hermanos;
  const caja = (t: { ancho: number; alto: number }) =>
    horizontal ? { width: t.ancho + extra, height: t.alto } : { width: t.ancho, height: t.alto + extra };
  const hijos = new Set(subgrafo.jerarquicas.map(([, b]) => b));
  const raices = subgrafo.nodos
    .filter((n) => !hijos.has(n.id))
    .map((n): [string, string] => [RAIZ_VIRTUAL, n.id]);
  const aristas = [...raices, ...subgrafo.jerarquicas];
  // mrtree ordena a los hermanos según el orden de los nodos: el de las aristas, que ya viene por `orden`.
  const medida = new Map([
    ...subgrafo.nodos.map((n) => [n.id, caja(tam)] as const),
    ...subgrafo.puestos.map((p) => [p.id, caja(tamDelPuesto)] as const),
  ]);
  const resultado = await elk.layout({
    id: "lienzo",
    layoutOptions: opcionesElk(vista),
    children: [
      { id: RAIZ_VIRTUAL, width: 0, height: 0 },
      ...aristas.map(([, b]) => ({ id: b, ...medida.get(b)! })),
    ],
    edges: aristas.map(([a, b]) => ({ id: `${a}>${b}`, sources: [a], targets: [b] })),
  });
  const pos = new Map(
    (resultado.children ?? [])
      .filter((n) => n.id !== RAIZ_VIRTUAL)
      .map((n) => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }]),
  );
  if (vista.nivelesEstrictos) alinearNiveles(pos, aristas, horizontal);
  return pos;
}

// mrtree centra cada tarjeta en la fila de su profundidad: con la opción, todas empiezan donde empieza la fila.
function alinearNiveles(
  pos: Map<string, { x: number; y: number }>,
  aristas: [string, string][],
  horizontal: boolean,
) {
  const eje = horizontal ? "x" : "y";
  const profundidad = new Map([[RAIZ_VIRTUAL, 0]]);
  for (const [a, b] of aristas) profundidad.set(b, profundidad.get(a)! + 1); // cada superior llega antes que sus hijos
  const inicio = new Map<number, number>();
  for (const [id, p] of pos) {
    const d = profundidad.get(id)!;
    inicio.set(d, Math.min(inicio.get(d) ?? Infinity, p[eje]));
  }
  for (const [id, p] of pos) p[eje] = inicio.get(profundidad.get(id)!)!;
}
