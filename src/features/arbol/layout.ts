import type { ElkNode } from "elkjs/lib/elk.bundled.js";
import type { Conexion, Puesto, Unidad, ValorCatalogo } from "../../db/tipos";
import { descendientes, indiceHijos, porOrden } from "./jerarquia";
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
    // El puesto de jefatura encabeza la pila (las líneas bajan por los puestos en este orden); los demás, por `orden`.
    const propios = porUnidad.get(x.id) ?? [];
    const jefe = propios.find((p) => p.id === x.jefe_puesto_id);
    for (const p of jefe ? [jefe, ...propios.filter((q) => q !== jefe)] : propios) {
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

/**
 * Fila de cada unidad al alinear por tipo (0 = la primera). Cada tipo de las unidades que se dibujan tiene su fila, en
 * el orden del catálogo (desactivado o no); un tipo sin unidades a la vista no ocupa fila. Una unidad cuyo tipo la dejaría en la fila de su superior o más arriba baja
 * a la fila siguiente a la de él, para que las líneas siempre bajen. Si eso pasa con un tipo igual o anterior al de su
 * superior (una Gerencia dentro de una Gerencia), los tipos que siguen empiezan más abajo; si su superior es de un tipo
 * posterior (una Gerencia bajo un Área), solo baja esa rama. `nodos` en orden de recorrido (superior antes que hijos),
 * como los entrega subgrafoVisible.
 */
export function filasPorTipo(nodos: Unidad[], tipos: ValorCatalogo[]): Map<string, number> {
  const usados = new Set(nodos.map((u) => u.tipo_id));
  const rango = new Map(
    tipos
      .filter((t) => usados.has(t.id))
      .sort(porOrden)
      .map((t, i) => [t.id, i]),
  );
  const rangoDe = (u: Unidad) => rango.get(u.tipo_id) ?? 0;
  const porId = new Map(nodos.map((u) => [u.id, u]));
  // Primero, el inicio de cada tipo: tras las filas que ocupan los tipos anteriores, sin contar las ramas invertidas.
  const inicio: number[] = [];
  const propia = new Map<string, number>();
  let ultima = -1;
  for (let k = 0; k < rango.size; k++) {
    inicio[k] = Math.max((inicio[k - 1] ?? -1) + 1, ultima + 1);
    for (const u of nodos) {
      if (rangoDe(u) !== k) continue;
      const padre = porId.get(u.parent_id ?? "");
      const fila =
        padre && rangoDe(padre) <= k ? Math.max(inicio[k]!, (propia.get(padre.id) ?? 0) + 1) : inicio[k]!;
      propia.set(u.id, fila);
      ultima = Math.max(ultima, fila);
    }
  }
  const filas = new Map<string, number>();
  for (const u of nodos) {
    const padre = filas.get(u.parent_id ?? "");
    filas.set(u.id, Math.max(inicio[rangoDe(u)] ?? 0, padre === undefined ? 0 : padre + 1));
  }
  return filas;
}

// Superior invisible de todas las raíces: mrtree pide un solo árbol, y así las raíces quedan lado a lado en una fila.
const RAIZ_VIRTUAL = "raiz-virtual"; // los ids de las unidades son UUID: no choca

type Tam = { ancho: number; alto: number };
type Vista = Pick<ConfigVista, "direccion" | "densidad" | "alinearPorTipo">;
/** Posición que elk dio a cada nodo (la app la pide a un worker: solo viajan id, x e y). */
export type NodoUbicado = { id: string; x?: number; y?: number };

/**
 * Medidas del layout. Cada unidad es un bloque: su tarjeta y, tras ella en el eje de los niveles, sus puestos apilados en
 * su orden. Así los puestos no son hermanos de las unidades hijas (mrtree los mezclaba en la fila de ellas) y las líneas a
 * las hijas salen del final del bloque. `largo`: en el eje de los niveles; `cruce`: en el de los hermanos.
 */
function medidas(subgrafo: Subgrafo, tam: Tam, tamDelPuesto: Tam, vista: Vista) {
  const horizontal = vista.direccion === "horizontal";
  const sep = separaciones(vista);
  const largo = (t: Tam) => (horizontal ? t.ancho : t.alto);
  const cruceDe = (t: Tam) => (horizontal ? t.alto : t.ancho);
  const cuantos = new Map<string, number>();
  for (const p of subgrafo.puestos) cuantos.set(p.unidad_id, (cuantos.get(p.unidad_id) ?? 0) + 1);
  return {
    horizontal,
    sep,
    largo,
    cruceDe,
    cruce: Math.max(cruceDe(tam), cruceDe(tamDelPuesto)),
    // mrtree separa los niveles como a los hermanos: cada bloque reserva el resto detrás de sí, en el eje de los niveles.
    extra: sep.niveles - sep.hermanos,
    bloque: (id: string) => largo(tam) + (cuantos.get(id) ?? 0) * (sep.puestos + largo(tamDelPuesto)),
  };
}

/**
 * El grafo que se le pasa a elk (objetos planos: puede ir a un worker). Solo las unidades y sus aristas jerárquicas entran:
 * los puestos van dentro del bloque de su unidad (ver `medidas`) y las laterales no deforman el árbol. Los tamaños deben
 * ser los de las tarjetas dibujadas (tamUnidad/tamPuesto); `tipos`, el catálogo completo (solo se usa al alinear por tipo).
 */
export function grafoElk(
  subgrafo: Subgrafo,
  tam: Tam = tamUnidad(VISTA_POR_DEFECTO, false),
  tamDelPuesto: Tam = tamPuesto(VISTA_POR_DEFECTO),
  vista: Vista = VISTA_POR_DEFECTO,
  tipos: ValorCatalogo[] = [],
): ElkNode {
  const m = medidas(subgrafo, tam, tamDelPuesto, vista);
  const caja = (largo: number) =>
    m.horizontal ? { width: largo + m.extra, height: m.cruce } : { width: m.cruce, height: largo + m.extra };
  const unidades = new Set(subgrafo.nodos.map((n) => n.id));
  const jerarquicas = subgrafo.jerarquicas.filter(([, b]) => unidades.has(b));
  const hijos = new Set(jerarquicas.map(([, b]) => b));
  const raices = subgrafo.nodos
    .filter((n) => !hijos.has(n.id))
    .map((n): [string, string] => [RAIZ_VIRTUAL, n.id]);
  const medida = new Map(subgrafo.nodos.map((n) => [n.id, caja(m.bloque(n.id))] as const));
  // mrtree pone cada profundidad en una fila. Al alinear por tipo, una unidad que debe bajar más de una fila cuelga de
  // huecos invisibles del tamaño de una tarjeta: así su superior sigue centrado y las filas siguen alineadas. mrtree ordena
  // a los hermanos según el orden de los nodos: el de las aristas, que ya viene por `orden`.
  const filas = vista.alinearPorTipo ? filasPorTipo(subgrafo.nodos, tipos) : null;
  const aristas: [string, string][] = [];
  for (const [a, b] of [...raices, ...jerarquicas]) {
    const salto = filas?.has(b) ? (filas.get(b) ?? 0) - (a === RAIZ_VIRTUAL ? -1 : (filas.get(a) ?? 0)) : 1;
    let desde = a;
    for (let i = 1; i < salto; i++) {
      const hueco = `${b}:hueco${i}`;
      medida.set(hueco, caja(m.largo(tam)));
      aristas.push([desde, hueco]);
      desde = hueco;
    }
    aristas.push([desde, b]);
  }
  return {
    id: "lienzo",
    layoutOptions: opcionesElk(vista),
    children: [
      { id: RAIZ_VIRTUAL, width: 0, height: 0 },
      ...aristas.map(([, b]) => ({ id: b, ...medida.get(b)! })),
    ],
    edges: aristas.map(([a, b]) => ({ id: `${a}>${b}`, sources: [a], targets: [b] })),
  };
}

/**
 * Esquina superior izquierda de cada unidad y puesto dibujados (sin la raíz virtual ni los huecos), a partir de lo que elk
 * dio a cada bloque. Mismos tamaños y vista que en grafoElk.
 */
export function posiciones(
  subgrafo: Subgrafo,
  ubicados: NodoUbicado[],
  tam: Tam = tamUnidad(VISTA_POR_DEFECTO, false),
  tamDelPuesto: Tam = tamPuesto(VISTA_POR_DEFECTO),
  vista: Vista = VISTA_POR_DEFECTO,
): Map<string, { x: number; y: number }> {
  const m = medidas(subgrafo, tam, tamDelPuesto, vista);
  const porId = new Map(ubicados.map((n) => [n.id, n]));
  const nivelDe = (n: NodoUbicado) => (m.horizontal ? n.x : n.y) ?? 0;
  const cruceDe = (n: NodoUbicado) => (m.horizontal ? n.y : n.x) ?? 0;
  const punto = (nivel: number, cruce: number) =>
    m.horizontal ? { x: nivel, y: cruce } : { x: cruce, y: nivel };
  // mrtree centra en su fila los bloques de distinto largo: se alinean al inicio de la fila, para que las tarjetas de una
  // fila empiecen juntas y las líneas de un superior a sus hijas bajen a una sola altura. La fila: el centro del bloque.
  const fila = (id: string, n: NodoUbicado) => Math.round(nivelDe(n) + (m.bloque(id) + m.extra) / 2);
  const mayor = new Map<number, number>();
  for (const u of subgrafo.nodos) {
    const n = porId.get(u.id);
    if (n) mayor.set(fila(u.id, n), Math.max(mayor.get(fila(u.id, n)) ?? 0, m.bloque(u.id)));
  }
  const res = new Map<string, { x: number; y: number }>();
  const siguiente = new Map<string, number>(); // dónde empieza el próximo puesto de cada unidad
  for (const u of subgrafo.nodos) {
    const n = porId.get(u.id);
    if (!n) continue;
    const c = fila(u.id, n);
    const inicio = c - (mayor.get(c)! + m.extra) / 2;
    res.set(u.id, punto(inicio, cruceDe(n) + (m.cruce - m.cruceDe(tam)) / 2));
    siguiente.set(u.id, inicio + m.largo(tam) + m.sep.puestos);
  }
  for (const p of subgrafo.puestos) {
    const desde = siguiente.get(p.unidad_id);
    if (desde === undefined) continue;
    const cruce = cruceDe(porId.get(p.unidad_id)!) + (m.cruce - m.cruceDe(tamDelPuesto)) / 2;
    res.set(p.id, punto(desde, cruce));
    siguiente.set(p.unidad_id, desde + m.largo(tamDelPuesto) + m.sep.puestos);
  }
  return res;
}

/**
 * Lleva cada tarjeta dibujada a su lugar del layout sin rehacer los nodos (camino rápido cuando la forma no cambió): así
 * «Reordenar» devuelve también las que se hayan movido. `guardadas` (lo dibujado) queda con las posiciones nuevas.
 */
export function reubicar(
  pos: Map<string, { x: number; y: number }>,
  guardadas: Map<string, { x: number; y: number }>,
  nodo: (id: string) => { position: { x: number; y: number } } | undefined,
): void {
  for (const [id, p] of pos) {
    guardadas.set(id, p); // si los nodos se rehacen por otra razón, ya usan la posición nueva
    const n = nodo(id);
    if (n) n.position = p;
  }
}

/**
 * Las líneas jerárquicas como se dibujan: la unidad baja por sus puestos apilados (unidad → 1.º → 2.º…) y las líneas a sus
 * hijas salen del último, bajo el bloque. Pide `jerarquicas` en el orden de subgrafoVisible (los puestos de una unidad
 * antes que sus hijas).
 */
export function aristasDibujadas(g: Subgrafo): [string, string][] {
  const puestos = new Set(g.puestos.map((p) => p.id));
  const ultimo = new Map<string, string>();
  return g.jerarquicas.map(([a, b]) => {
    const desde = ultimo.get(a) ?? a;
    if (puestos.has(b)) ultimo.set(a, b);
    return [desde, b];
  });
}

/**
 * grafoElk → elk → posiciones, en este hilo: para los tests. La app lo hace en un worker (layout.worker.ts); por eso elk
 * se importa aquí solo al llamarla y no entra al paquete principal.
 */
export async function calcularLayout(...args: Parameters<typeof grafoElk>) {
  const { default: ELK } = await import("elkjs/lib/elk.bundled.js");
  const resultado = await new ELK().layout(grafoElk(...args));
  return posiciones(args[0], resultado.children ?? [], args[1], args[2], args[3]);
}
