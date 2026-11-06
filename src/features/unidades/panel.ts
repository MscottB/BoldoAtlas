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

/** Los superiores desde la raíz, sin la propia unidad; cada uno con el nombre de su tipo (también si el tipo está desactivado). */
export const migas = (unidades: Unidad[], tipos: ValorCatalogo[], id: string): Miga[] =>
  ruta(unidades, id)
    .slice(0, -1)
    .map((u) => ({
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

export interface FilaConexion {
  id: string;
  otro: Unidad;
  /** Vista desde la unidad: «hacia» la otra si ella es el origen, «desde» la otra si es el destino. */
  sentido: "hacia" | "desde";
  etiqueta: string | null;
}

/** Las conexiones de la unidad `id`, por nombre de la otra, para ver si falta alguna. Se omite la que apunta a una unidad que ya no está. */
export const filasDeConexiones = (
  conexiones: Conexion[],
  porId: ReadonlyMap<string, Unidad>,
  id: string,
): FilaConexion[] =>
  conexiones
    .flatMap((c) => {
      const hacia = c.origen_id === id;
      const otro = hacia || c.destino_id === id ? porId.get(hacia ? c.destino_id : c.origen_id) : undefined;
      return otro
        ? [{ id: c.id, otro, sentido: hacia ? "hacia" : "desde", etiqueta: c.etiqueta } as const]
        : [];
    })
    .sort((a, b) => a.otro.nombre.localeCompare(b.otro.nombre, "es"));

/**
 * Por qué una unidad no se dibuja: un superior plegado o, si no está en `mostradas` (lo que el lienzo dibuja), fuera de la
 * vista: otra rama enfocada u otra fecha. null: se dibuja, aunque esté más allá de lo que entra en la pantalla.
 */
export function porQueNoSeVe(
  mostradas: Unidad[],
  colapsados: ReadonlySet<string>,
  id: string,
): "plegada" | "fuera" | null {
  const camino = ruta(mostradas, id);
  if (!camino.length) return "fuera";
  return camino.slice(0, -1).some((a) => colapsados.has(a.id)) ? "plegada" : null;
}

/** Por qué no se ve una conexión, entre sus dos unidades. «fuera» manda: si una está fuera, abrir la rama de la otra no la mostraría. */
export function conexionOculta(mostradas: Unidad[], colapsados: ReadonlySet<string>, ids: string[]) {
  const motivos = ids.flatMap((id) => {
    const motivo = porQueNoSeVe(mostradas, colapsados, id);
    return motivo ? [{ id, motivo }] : [];
  });
  return motivos.find((m) => m.motivo === "fuera") ?? motivos[0] ?? null;
}

/** Recuerda el último valor enviado a guardar: el mismo cambio puede avisarse dos veces antes de que termine de guardarse. */
export function ultimoEnviado<T>(inicial: T) {
  let ultimo = inicial;
  let previo = inicial;
  return {
    /** Si `valor` hay que enviarlo; si sí, queda como el último. */
    cambia(valor: T) {
      if (valor === ultimo) return false;
      previo = ultimo;
      ultimo = valor;
      return true;
    },
    /** El último envío no se guardó: ese valor se puede volver a enviar. */
    fallo() {
      ultimo = previo;
    },
  };
}

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

/**
 * Qué agrega el panel bajo la lista de jefatura, que ya dice cargo y titular: quién la ejerce si es un reemplazo, o un aviso si el puesto
 * elegido está vacante o si no hay puestos. Sin elegir, la lista ya lo dice.
 */
export function notaJefatura(visible: { tipo: string } | null, hayPuestos: boolean, elegida: boolean) {
  if (visible) return visible.tipo === "reemplazo" ? "reemplazo" : null;
  if (!hayPuestos) return "sinPuestos";
  return elegida ? "vacante" : null;
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
