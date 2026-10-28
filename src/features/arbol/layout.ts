import ELK from "elkjs/lib/elk.bundled.js";
import type { Conexion, Unidad } from "../../db/tipos";
import { hijos } from "./jerarquia";

// Las lecturas de repos no traen deleted_at; se acepta por si el llamador pasa filas crudas.
type U = Unidad & { deleted_at?: string | null };

export interface Subgrafo {
  nodos: Unidad[];
  jerarquicas: [string, string][];
  laterales: Conexion[];
}

const raices = (unidades: U[]) =>
  unidades
    .filter((x) => x.parent_id === null && !x.deleted_at)
    .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es"));

// Se ven las raíces y su primer nivel: todo lo de profundidad >= 1 con hijos queda colapsado.
export function colapsadosIniciales(unidades: U[]): Set<string> {
  const colapsados = new Set<string>();
  const vistos = new Set<string>();
  const visitar = (x: Unidad, profundidad: number) => {
    if (vistos.has(x.id)) return;
    vistos.add(x.id);
    const hs = hijos(unidades, x.id);
    if (profundidad >= 1 && hs.length) colapsados.add(x.id);
    hs.forEach((h) => visitar(h, profundidad + 1));
  };
  raices(unidades).forEach((r) => visitar(r, 0));
  return colapsados;
}

export function subgrafoVisible(unidades: U[], conexiones: Conexion[], colapsados: Set<string>): Subgrafo {
  const nodos: Unidad[] = [];
  const jerarquicas: [string, string][] = [];
  const vistos = new Set<string>();
  const visitar = (x: Unidad) => {
    if (vistos.has(x.id)) return;
    vistos.add(x.id);
    nodos.push(x);
    if (colapsados.has(x.id)) return;
    for (const h of hijos(unidades, x.id)) {
      jerarquicas.push([x.id, h.id]);
      visitar(h);
    }
  };
  raices(unidades).forEach(visitar);
  const laterales = conexiones.filter((c) => vistos.has(c.origen_id) && vistos.has(c.destino_id));
  return { nodos, jerarquicas, laterales };
}

const elk = new ELK();

// Devuelve la esquina superior izquierda de cada nodo, tal como la entrega elk. Solo las aristas jerárquicas entran.
export async function calcularLayout(
  subgrafo: Subgrafo,
  tam = { ancho: 220, alto: 112 },
): Promise<Map<string, { x: number; y: number }>> {
  const resultado = await elk.layout({
    id: "raiz",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.spacing.nodeNode": "28",
      "elk.layered.spacing.nodeNodeBetweenLayers": "64",
    },
    children: subgrafo.nodos.map((n) => ({ id: n.id, width: tam.ancho, height: tam.alto })),
    edges: subgrafo.jerarquicas.map(([a, b]) => ({ id: `${a}>${b}`, sources: [a], targets: [b] })),
  });
  return new Map((resultado.children ?? []).map((n) => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }]));
}
