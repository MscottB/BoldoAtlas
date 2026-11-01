import type { Puesto, Unidad, ValorCatalogo } from "@/db/tipos";
import { indiceHijos, jefeVisible, type Vigentes } from "@/features/arbol/jerarquia";
import { normalizarTexto } from "@/lib/texto";
import { collator, type FilaPersonaUnidad } from "./personas";

/** Puesto sin titular ni reemplazo vigentes. */
export interface VacanteArbol {
  clave: string;
  cargo: string;
}

export interface NodoArbol {
  unidad: Unidad;
  /** Quien encabeza la unidad (va en la fila de la unidad, no bajo ella). */
  jefe: FilaPersonaUnidad | null;
  personas: FilaPersonaUnidad[];
  vacantes: VacanteArbol[];
  hijos: NodoArbol[];
  /** Filas de persona de toda la rama, jefes incluidos: cuenta como la lista (una persona con dos puestos, dos). */
  total: number;
}

export const claveUnidad = (id: string) => `u:${id}`;

/**
 * El árbol de `raiz` en O(unidades + puestos + filas). `filas` son las de `personasDelAlcance`, ya en el orden pedido;
 * ese orden se conserva dentro de cada unidad. `unidades` son las que pueden colgar de la raíz: sin ellas (`[]`) queda
 * solo la raíz, como «Incluir subunidades» apagado.
 */
export function arbolDePersonas(
  raiz: Unidad,
  unidades: Unidad[],
  puestos: Puesto[],
  filas: FilaPersonaUnidad[],
  vigentes: Vigentes,
  cargos: ValorCatalogo[],
): NodoArbol {
  const indice = indiceHijos(unidades);
  const nombreCargo = new Map(cargos.map((c) => [c.id, c.nombre]));
  const agrupar = <T>(grupos: Map<string, T[]>, id: string, x: T) => {
    const lista = grupos.get(id);
    if (lista) lista.push(x);
    else grupos.set(id, [x]);
  };
  const gente = new Map<string, FilaPersonaUnidad[]>();
  for (const f of filas) agrupar(gente, f.unidadId, f);
  const vacios = new Map<string, VacanteArbol[]>();
  for (const p of puestos) {
    const v = vigentes.get(p.id);
    if (!v?.titular && !v?.reemplazo)
      agrupar(vacios, p.unidad_id, { clave: `v:${p.id}`, cargo: nombreCargo.get(p.cargo_id) ?? "" });
  }

  const vistos = new Set<string>(); // corta si los datos ya traen un ciclo
  const armar = (unidad: Unidad): NodoArbol => {
    vistos.add(unidad.id);
    const propias = gente.get(unidad.id) ?? [];
    const asignacion = jefeVisible(unidad, vigentes);
    const jefe = (asignacion && propias.find((f) => f.clave === asignacion.id)) ?? null;
    const hijos = (indice.get(unidad.id) ?? []).filter((h) => !vistos.has(h.id)).map(armar);
    return {
      unidad,
      jefe,
      personas: jefe ? propias.filter((f) => f !== jefe) : propias,
      vacantes: (vacios.get(unidad.id) ?? []).sort((a, b) => collator.compare(a.cargo, b.cargo)),
      hijos,
      total: hijos.reduce((suma, h) => suma + h.total, propias.length),
    };
  };
  return armar(raiz);
}

/**
 * Lo que se ve con una búsqueda: lo que coincide y sus ancestros. `coinciden` son las claves de las filas que dejó el
 * filtro de la lista (nombre, cargo, unidad o correo), así ambas vistas muestran a las mismas personas; `buscado` ya
 * viene normalizado. Las subunidades de una unidad que coincide no entran si no coinciden ellas.
 */
export function visiblesDeBusqueda(raiz: NodoArbol, coinciden: Set<string>, buscado: string): Set<string> {
  const visibles = new Set<string>();
  const incluye = (s: string) => normalizarTexto(s).includes(buscado);
  const ver = (n: NodoArbol): boolean => {
    const porNombre = incluye(n.unidad.nombre);
    let algo = porNombre || (!!n.jefe && coinciden.has(n.jefe.clave));
    for (const f of n.personas) {
      if (!coinciden.has(f.clave)) continue;
      visibles.add(f.clave);
      algo = true;
    }
    for (const v of n.vacantes) {
      if (!porNombre && !incluye(v.cargo)) continue;
      visibles.add(v.clave);
      algo = true;
    }
    for (const h of n.hijos) if (ver(h)) algo = true;
    if (algo) visibles.add(claveUnidad(n.unidad.id));
    return algo;
  };
  ver(raiz);
  return visibles;
}

interface FilaBase {
  clave: string;
  /** Empieza en 1, como `aria-level`. */
  nivel: number;
  posicion: number;
  hermanos: number;
}
export type FilaArbol = FilaBase &
  (
    | { clase: "unidad"; nodo: NodoArbol; /** `undefined`: no tiene nada que desplegar. */ abierta?: boolean }
    | { clase: "persona"; fila: FilaPersonaUnidad }
    | { clase: "vacante"; vacante: VacanteArbol }
  );

/** Las filas a la vista, en orden: bajo cada unidad abierta, sus personas, sus vacantes y luego sus subunidades. */
export function aplanarArbol(
  raiz: NodoArbol,
  abierta: (id: string) => boolean,
  visibles: Set<string> | null,
): FilaArbol[] {
  const filas: FilaArbol[] = [];
  const ve = <T>(lista: T[], clave: (x: T) => string) =>
    visibles ? lista.filter((x) => visibles.has(clave(x))) : lista;
  const agregar = (nodo: NodoArbol, nivel: number, posicion: number, hermanos: number) => {
    const personas = ve(nodo.personas, (f) => f.clave);
    const vacantes = ve(nodo.vacantes, (v) => v.clave);
    const hijos = ve(nodo.hijos, (h) => claveUnidad(h.unidad.id));
    const debajo = personas.length + vacantes.length + hijos.length;
    const abre = debajo > 0 && abierta(nodo.unidad.id);
    const clave = claveUnidad(nodo.unidad.id);
    filas.push({
      clase: "unidad",
      clave,
      nivel,
      posicion,
      hermanos,
      nodo,
      abierta: debajo > 0 ? abre : undefined,
    });
    if (!abre) return;
    const base = { nivel: nivel + 1, hermanos: debajo };
    let i = 1;
    for (const fila of personas)
      filas.push({ ...base, clase: "persona", clave: fila.clave, posicion: i++, fila });
    for (const vacante of vacantes)
      filas.push({ ...base, clase: "vacante", clave: vacante.clave, posicion: i++, vacante });
    for (const h of hijos) agregar(h, nivel + 1, i++, debajo);
  };
  if (!visibles || visibles.has(claveUnidad(raiz.unidad.id))) agregar(raiz, 1, 1, 1);
  return filas;
}

/** Ids de las unidades del árbol. */
export function idsDelArbol(raiz: NodoArbol): string[] {
  const ids: string[] = [];
  const pendientes = [raiz];
  while (pendientes.length) {
    const n = pendientes.pop()!;
    ids.push(n.unidad.id);
    pendientes.push(...n.hijos);
  }
  return ids;
}

export type AccionTecla =
  { tipo: "ir"; indice: number } | { tipo: "plegar"; id: string; abrir: boolean } | { tipo: "nada" };

/** Patrón «tree» de WAI-ARIA sobre las filas aplanadas: flechas, Inicio y Fin. `null`: la tecla no es del árbol. */
export function accionTecla(filas: FilaArbol[], i: number, tecla: string): AccionTecla | null {
  const f = filas[i];
  const ir = (indice: number): AccionTecla =>
    indice >= 0 && indice < filas.length ? { tipo: "ir", indice } : { tipo: "nada" };
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
      if (f.clase !== "unidad" || f.abierta === undefined) return { tipo: "nada" };
      return f.abierta ? ir(i + 1) : { tipo: "plegar", id: f.nodo.unidad.id, abrir: true };
    case "ArrowLeft": {
      if (f.clase === "unidad" && f.abierta) return { tipo: "plegar", id: f.nodo.unidad.id, abrir: false };
      let padre = i - 1;
      while (padre >= 0 && filas[padre].nivel >= f.nivel) padre--;
      return ir(padre);
    }
    default:
      return null;
  }
}
