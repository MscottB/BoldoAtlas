import type { Unidad } from "@/db/tipos";
import { normalizarTexto } from "@/lib/texto";
import type { DatosVisor, PersonaPanel } from "../datos";

// Lógica del visor sin DOM: así se prueba en node. interfaz.ts solo la conecta con la página.

export const plegar = (p: ReadonlySet<string>, id: string): Set<string> => new Set(p).add(id);

export function desplegar(p: ReadonlySet<string>, id: string): Set<string> {
  const r = new Set(p);
  r.delete(id);
  return r;
}

/** Quita las plegadas que hay entre la raíz y `id` (sin `id`), para que se vea. Las demás siguen como estaban. */
export function abrirHasta(p: ReadonlySet<string>, unidades: readonly Unidad[], id: string): Set<string> {
  const porId = new Map(unidades.map((u) => [u.id, u]));
  const r = new Set(p);
  // El límite evita un ciclo si los datos vinieran mal.
  for (let u = porId.get(id), n = 0; u?.parent_id && n <= unidades.length; u = porId.get(u.parent_id), n++)
    r.delete(u.parent_id);
  return r;
}

/** Las unidades en orden de árbol (cada una antes que sus hijas, por `orden`), con su nivel desde 1. */
function enArbol(unidades: readonly Unidad[]): { u: Unidad; nivel: number }[] {
  const ids = new Set(unidades.map((u) => u.id));
  const hijas = new Map<string | null, Unidad[]>();
  for (const u of [...unidades].sort((a, b) => a.orden - b.orden)) {
    // La raíz de una rama exportada tiene un superior que no va en el archivo.
    const k = u.parent_id && ids.has(u.parent_id) ? u.parent_id : null;
    hijas.set(k, [...(hijas.get(k) ?? []), u]);
  }
  const r: { u: Unidad; nivel: number }[] = [];
  const bajar = (k: string | null, nivel: number) => {
    for (const u of hijas.get(k) ?? []) {
      r.push({ u, nivel });
      bajar(u.id, nivel + 1);
    }
  };
  bajar(null, 1);
  return r;
}

const SEP = " › ";
const leyenda = (p: PersonaPanel) => [p.nombre, p.cargo].filter(Boolean).join(" · ");

/** Unidades por nombre y, si el panel las lleva, personas y cargos; sin tildes ni mayúsculas. A lo más 50, en orden de árbol. */
export function buscar(d: DatosVisor, texto: string): { id: string; titulo: string; detalle: string }[] {
  const q = normalizarTexto(texto);
  if (!q) return [];
  const r: { id: string; titulo: string; detalle: string }[] = [];
  for (const { u } of enArbol(d.unidades)) {
    if (r.length >= 50) break;
    const panel = d.panel[u.id];
    if (normalizarTexto(u.nombre).includes(q)) {
      r.push({ id: u.id, titulo: u.nombre, detalle: (panel?.ruta ?? [u.nombre]).slice(0, -1).join(SEP) });
      continue;
    }
    const persona = [...(panel?.jefatura ? [panel.jefatura] : []), ...(panel?.personas ?? [])].find((p) =>
      normalizarTexto(`${p.nombre ?? ""} ${p.cargo}`).includes(q),
    );
    if (persona) r.push({ id: u.id, titulo: u.nombre, detalle: leyenda(persona) });
  }
  return r;
}

export interface FilaLista {
  id: string;
  nivel: number;
  conRamas: boolean;
  abierta: boolean;
}

/** Las filas que se ven en la lista: no entran las que están bajo una rama plegada. */
export function filasDeLista(d: DatosVisor, plegadas: ReadonlySet<string>): FilaLista[] {
  const conRamas = new Set(d.unidades.flatMap((u) => (u.parent_id ? [u.parent_id] : [])));
  const r: FilaLista[] = [];
  // Mientras haya una plegada abierta en el recorrido, se salta todo lo más hondo que ella.
  let corte = Infinity;
  for (const { u, nivel } of enArbol(d.unidades)) {
    if (nivel > corte) continue;
    corte = Infinity;
    const ramas = conRamas.has(u.id);
    r.push({ id: u.id, nivel, conRamas: ramas, abierta: ramas && !plegadas.has(u.id) });
    if (ramas && plegadas.has(u.id)) corte = nivel;
  }
  return r;
}

export type TeclaLista = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight" | "Home" | "End";

/** A dónde va el foco de la lista con una tecla, y qué rama abre o cierra. */
export function moverEnLista(
  filas: readonly FilaLista[],
  actual: string,
  tecla: TeclaLista,
): { foco: string; abrir?: string; cerrar?: string } {
  const i = filas.findIndex((f) => f.id === actual);
  if (i < 0) return { foco: filas[0]?.id ?? actual };
  const f = filas[i];
  const ir = (j: number) => ({ foco: filas[Math.max(0, Math.min(filas.length - 1, j))].id });
  switch (tecla) {
    case "ArrowDown":
      return ir(i + 1);
    case "ArrowUp":
      return ir(i - 1);
    case "Home":
      return ir(0);
    case "End":
      return ir(filas.length - 1);
    case "ArrowRight":
      if (f.conRamas && !f.abierta) return { foco: f.id, abrir: f.id };
      // En una abierta, su primera hija es la fila que sigue.
      return f.conRamas && filas[i + 1]?.nivel > f.nivel ? ir(i + 1) : { foco: f.id };
    case "ArrowLeft": {
      if (f.conRamas && f.abierta) return { foco: f.id, cerrar: f.id };
      // Su superior es la fila de arriba más cercana con un nivel menos.
      const sup = filas
        .slice(0, i)
        .reverse()
        .find((x) => x.nivel < f.nivel);
      return { foco: sup?.id ?? f.id };
    }
  }
}
