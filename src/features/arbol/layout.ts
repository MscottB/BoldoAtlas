import ELK from "elkjs/lib/elk.bundled.js";
import type { Conexion, Puesto, Unidad } from "../../db/tipos";
import { descendientes, indiceHijos } from "./jerarquia";
import { VISTA_POR_DEFECTO, opcionesElk, tamPuesto, tamUnidad } from "./vista";

// Las lecturas de repos no traen deleted_at; se acepta por si el llamador pasa filas crudas.
type U = Unidad & { deleted_at?: string | null };

export interface Subgrafo {
  nodos: Unidad[];
  /** Puestos de las unidades visibles; cuelgan de su unidad en `jerarquicas`. */
  puestos: Puesto[];
  jerarquicas: [string, string][];
  laterales: Conexion[];
}

// Se ven las raíces y su primer nivel: todo lo de profundidad >= 1 con hijos queda colapsado.
export function colapsadosIniciales(unidades: U[]): Set<string> {
  const indice = indiceHijos(unidades);
  const colapsados = new Set<string>();
  const vistos = new Set<string>();
  const visitar = (x: Unidad, profundidad: number) => {
    if (vistos.has(x.id)) return;
    vistos.add(x.id);
    const hs = indice.get(x.id) ?? [];
    if (profundidad >= 1 && hs.length) colapsados.add(x.id);
    hs.forEach((h) => visitar(h, profundidad + 1));
  };
  (indice.get(null) ?? []).forEach((r) => visitar(r, 0));
  return colapsados;
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

// Devuelve la esquina superior izquierda de cada nodo, tal como la entrega elk. Solo las aristas jerárquicas entran.
// Los tamaños deben ser los de las tarjetas dibujadas (tamUnidad/tamPuesto); `opciones`, las de opcionesElk.
export async function calcularLayout(
  subgrafo: Subgrafo,
  tam = tamUnidad(VISTA_POR_DEFECTO, false),
  tamDelPuesto = tamPuesto(VISTA_POR_DEFECTO),
  opciones = opcionesElk(VISTA_POR_DEFECTO),
): Promise<Map<string, { x: number; y: number }>> {
  const resultado = await elk.layout({
    id: "raiz",
    layoutOptions: opciones,
    children: [
      ...subgrafo.nodos.map((n) => ({ id: n.id, width: tam.ancho, height: tam.alto })),
      ...subgrafo.puestos.map((p) => ({ id: p.id, width: tamDelPuesto.ancho, height: tamDelPuesto.alto })),
    ],
    edges: subgrafo.jerarquicas.map(([a, b]) => ({ id: `${a}>${b}`, sources: [a], targets: [b] })),
  });
  return new Map((resultado.children ?? []).map((n) => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }]));
}
