import type { Conexion, Leyenda, Puesto, Trabajador, Unidad, ValorCatalogo } from "@/db/tipos";
import { normalizarColor } from "@/db/repos/leyendas";
import { descendientes, hijos, ruta, rutaTexto, type Vigentes } from "@/features/arbol/jerarquia";
import { normalizarTexto } from "@/lib/texto";

type ConBorrado<T> = T & { deleted_at?: string | null };

export interface Miga {
  id: string;
  nombre: string;
  tipo: string;
}

/** Ruta completa desde la raíz; cada tramo con el nombre de su tipo (también si el tipo está desactivado). */
export const migas = (unidades: Unidad[], tipos: ValorCatalogo[], id: string): Miga[] =>
  ruta(unidades, id).map((u) => ({
    id: u.id,
    nombre: u.nombre,
    tipo: tipos.find((t) => t.id === u.tipo_id)?.nombre ?? "",
  }));

/** Quien no puede ser superior de `id`: ella misma y su rama (lo mismo que rechaza `creaCiclo`). */
export const excluidasComoSuperior = (unidades: Unidad[], id: string): Set<string> =>
  descendientes(unidades, id).add(id);

/** Con quién no se ofrece conectar: la propia unidad y las que ya tienen una conexión con ella, en cualquier sentido. */
export const excluidasParaConexion = (conexiones: Conexion[], id: string): Set<string> =>
  new Set([
    id,
    ...conexiones.flatMap((c) =>
      c.origen_id === id ? [c.destino_id] : c.destino_id === id ? [c.origen_id] : [],
    ),
  ]);

export interface OpcionUnidad {
  unidad: Unidad;
  /** Superiores de la unidad (texto); vacío en una raíz. */
  ruta: string;
}

/** Unidades vivas cuyo nombre contiene `texto` (sin tildes ni mayúsculas), menos las excluidas; las primeras `limite` por nombre. */
export function buscarUnidades(
  unidades: ConBorrado<Unidad>[],
  excluidas: Set<string>,
  texto: string,
  limite = 50,
): OpcionUnidad[] {
  const buscado = normalizarTexto(texto);
  return unidades
    .filter((u) => !u.deleted_at && !excluidas.has(u.id) && normalizarTexto(u.nombre).includes(buscado))
    .sort((x, y) => x.nombre.localeCompare(y.nombre, "es"))
    .slice(0, limite)
    .map((unidad) => ({ unidad, ruta: unidad.parent_id ? rutaTexto(unidades, unidad.parent_id) : "" }));
}

export interface DecisionEliminar {
  /** directo = sin contenido; mover = su contenido pasa al superior (se confirma); bloqueada = raíz con contenido. */
  accion: "directo" | "mover" | "bloqueada";
  hijos: number;
  puestos: number;
  superior: Unidad | null;
}

/** Lo mismo que cuenta `eliminarUnidad` del store como contenido. */
export function decisionEliminar(
  unidades: ConBorrado<Unidad>[],
  puestos: ConBorrado<Puesto>[],
  id: string,
): DecisionEliminar {
  const n = {
    hijos: hijos(unidades, id).length,
    puestos: puestos.filter((p) => p.unidad_id === id && !p.deleted_at).length,
  };
  const padre = unidades.find((u) => u.id === id)?.parent_id;
  const superior = (padre && unidades.find((u) => u.id === padre)) || null;
  const accion = !n.hijos && !n.puestos ? "directo" : superior ? "mover" : "bloqueada";
  return { accion, ...n, superior };
}

export type ResultadoMarca =
  { ok: true; color: string | null; codigo: string | null } | { ok: false; error: "color" | "codigo" };

/** Color `#rrggbb` en minúsculas (null = sin color) y código de hasta 4 caracteres (en blanco = sin código). */
export function validarMarca(color: string | null, codigo: string): ResultadoMarca {
  const c = color === null ? null : normalizarColor(color);
  if (color !== null && c === null) return { ok: false, error: "color" };
  const k = codigo.trim();
  if ([...k].length > 4) return { ok: false, error: "codigo" };
  return { ok: true, color: c, codigo: k || null };
}

export interface FilaPuesto {
  id: string;
  cargo: string;
  titular: string | null;
  reemplazo: string | null;
  leyenda: { nombre: string; color: string } | null;
  jefatura: boolean;
}

/** Los puestos directos de la unidad con lo que muestra cada fila del panel. */
export function filasDePuestos(
  unidad: Unidad,
  puestos: Puesto[],
  vigentes: Vigentes,
  trabajadores: Trabajador[],
  cargos: ValorCatalogo[],
  leyendas: Leyenda[],
): FilaPuesto[] {
  const nombre = (a?: { trabajador_id: string }) =>
    trabajadores.find((w) => w.id === a?.trabajador_id)?.nombre ?? null;
  return puestos
    .filter((p) => p.unidad_id === unidad.id)
    .map((p) => {
      const l = leyendas.find((x) => x.id === p.leyenda_id);
      return {
        id: p.id,
        cargo: cargos.find((c) => c.id === p.cargo_id)?.nombre ?? "",
        titular: nombre(vigentes.get(p.id)?.titular),
        reemplazo: nombre(vigentes.get(p.id)?.reemplazo),
        leyenda: l ? { nombre: l.nombre, color: l.color } : null,
        jefatura: unidad.jefe_puesto_id === p.id,
      };
    });
}
