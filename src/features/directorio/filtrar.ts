import type { Asignacion, Puesto, TablaCatalogo, Trabajador, Unidad, ValorCatalogo } from "@/db/tipos";
import { descendientes, rutasPorTipo, tiposEnUso, vigentesPorPuesto } from "@/features/arbol/jerarquia";
import { normalizarTexto } from "@/lib/texto";

type ConBorrado<T> = T & { deleted_at?: string | null };

/** Lo que el directorio lee del store. */
export interface EstadoDirectorio {
  unidades: ConBorrado<Unidad>[];
  trabajadores: Trabajador[];
  puestos: ConBorrado<Puesto>[];
  asignaciones: ConBorrado<Asignacion>[];
  unidadEtiquetas: { unidad_id: string; etiqueta_id: string }[];
  catalogos: Record<TablaCatalogo, ValorCatalogo[]>;
}

export interface Filtros {
  texto: string;
  /** Una unidad y toda su rama. */
  unidad: string | null;
  cargo_id: string | null;
  tipo_contrato_id: string | null;
  sede_id: string | null;
  jornada_id: string | null;
  /** Etiqueta de la unidad de la fila. */
  etiqueta: string | null;
  estado: "ocupado" | "vacante" | "sinPuesto" | null;
}

export interface Orden {
  campo: "persona" | "cargo" | "unidad";
  asc: boolean;
}

/** Un puesto (con su titular o vacante) o una persona sin puesto vigente. Los nombres de catálogo incluyen los desactivados. */
export interface FilaDirectorio {
  clave: string;
  puestoId: string | null;
  /** Titular del puesto, o la persona de una fila «sin puesto». */
  personaId: string | null;
  /** null = vacante. */
  persona: string | null;
  /** Reemplazo vigente del puesto. */
  reemplazo: string | null;
  cargo: string | null;
  unidadId: string | null;
  /** La unidad más cercana de cada tipo en uso (incluida la del puesto), en el orden del catálogo. */
  ruta: { tipoId: string; nombre: string }[];
  correo: string | null;
  tipoContrato: string | null;
  sede: string | null;
  jornada: string | null;
  estado: "ocupado" | "vacante" | "sinPuesto";
}

// Para filtrar: la fila con los ids que su texto no trae.
interface Candidata {
  fila: FilaDirectorio;
  cargoId: string | null;
  /** La persona cuyos datos muestra la fila (titular, o la persona sin puesto): contra ella se filtran contrato, sede y jornada. */
  titular: Trabajador | undefined;
  rutaTexto: string;
}

const collator = new Intl.Collator("es");

/** Las filas ya armadas, listas para filtrar y ordenar muchas veces: se recalculan solo cuando cambia el estado. */
export interface Candidatas {
  filas: Candidata[];
  unidades: EstadoDirectorio["unidades"];
  unidadEtiquetas: EstadoDirectorio["unidadEtiquetas"];
}

export function candidatasDirectorio(e: EstadoDirectorio): Candidatas {
  return { filas: armar(e), unidades: e.unidades, unidadEtiquetas: e.unidadEtiquetas };
}

function armar(e: EstadoDirectorio): Candidata[] {
  const nombres = (tabla: TablaCatalogo) => new Map(e.catalogos[tabla].map((v) => [v.id, v.nombre]));
  const [cargos, contratos, sedes, jornadas] = (
    ["cargos", "tipos_contrato", "sedes", "jornadas"] as const
  ).map(nombres);
  const nombre = (m: Map<string, string>, id: string | null) => (id && m.get(id)) || null;
  const personas = new Map(e.trabajadores.map((t) => [t.id, t]));
  const vivas = new Set(e.unidades.filter((u) => !u.deleted_at).map((u) => u.id));
  const rutas = rutasPorTipo(
    e.unidades,
    e.catalogos.tipos_unidad,
    new Set(tiposEnUso(e.unidades, e.catalogos.tipos_unidad).map((t) => t.id)),
  );
  const vigentes = vigentesPorPuesto(e.asignaciones);

  const crear = (
    clave: string,
    puesto: Puesto | null,
    titular: Trabajador | undefined,
    reemplazo: Trabajador | undefined,
  ): Candidata => {
    const ruta = (puesto && rutas.get(puesto.unidad_id)) || [];
    return {
      cargoId: puesto?.cargo_id ?? null,
      titular,
      rutaTexto: ruta.map((u) => u.nombre).join(" › "),
      fila: {
        clave,
        puestoId: puesto?.id ?? null,
        personaId: titular?.id ?? null,
        persona: titular?.nombre ?? null,
        reemplazo: reemplazo?.nombre ?? null,
        cargo: nombre(cargos, puesto?.cargo_id ?? null),
        unidadId: puesto?.unidad_id ?? null,
        ruta: ruta.map((u) => ({ tipoId: u.tipo_id, nombre: u.nombre })),
        correo: titular?.correo ?? null,
        tipoContrato: nombre(contratos, titular?.tipo_contrato_id ?? null),
        sede: nombre(sedes, titular?.sede_id ?? null),
        jornada: nombre(jornadas, titular?.jornada_id ?? null),
        estado: !puesto ? "sinPuesto" : titular ? "ocupado" : "vacante",
      },
    };
  };

  const filas: Candidata[] = [];
  const conPuesto = new Set<string>();
  for (const pu of e.puestos) {
    if (pu.deleted_at || !vivas.has(pu.unidad_id)) continue;
    const v = vigentes.get(pu.id);
    const titular = personas.get(v?.titular?.trabajador_id ?? "");
    const reemplazo = personas.get(v?.reemplazo?.trabajador_id ?? "");
    for (const t of [titular, reemplazo]) if (t) conPuesto.add(t.id);
    filas.push(crear(`puesto:${pu.id}`, pu, titular, reemplazo));
  }
  for (const t of e.trabajadores) {
    if (conPuesto.has(t.id)) continue;
    filas.push(crear(`persona:${t.id}`, null, t, undefined));
  }
  return filas;
}

// Los vacíos van al final en ambos sentidos.
const comparar = (a: string | null, b: string | null, asc: boolean) =>
  !a || !b ? Number(!a) - Number(!b) : (asc ? 1 : -1) * collator.compare(a, b);

/** Aplica filtros y orden a las candidatas ya armadas. */
export function filtrarYOrdenar(c: Candidatas, f: Filtros, orden: Orden): FilaDirectorio[] {
  const buscado = normalizarTexto(f.texto);
  const rama = f.unidad ? descendientes(c.unidades, f.unidad).add(f.unidad) : null;
  const conEtiqueta = f.etiqueta
    ? new Set(c.unidadEtiquetas.filter((x) => x.etiqueta_id === f.etiqueta).map((x) => x.unidad_id))
    : null;

  // Contrato, sede, jornada y correo son los del titular (lo que muestran las columnas); una vacante no los cumple.
  const pasa = ({ fila, cargoId, titular }: Candidata) =>
    (!f.estado || fila.estado === f.estado) &&
    (!rama || (!!fila.unidadId && rama.has(fila.unidadId))) &&
    (!conEtiqueta || (!!fila.unidadId && conEtiqueta.has(fila.unidadId))) &&
    (!f.cargo_id || cargoId === f.cargo_id) &&
    (!f.tipo_contrato_id || titular?.tipo_contrato_id === f.tipo_contrato_id) &&
    (!f.sede_id || titular?.sede_id === f.sede_id) &&
    (!f.jornada_id || titular?.jornada_id === f.jornada_id) &&
    (!buscado ||
      [fila.persona, fila.reemplazo, fila.cargo, fila.correo].some(
        (campo) => !!campo && normalizarTexto(campo).includes(buscado),
      ));

  const clave = (c: Candidata) =>
    orden.campo === "unidad" ? c.rutaTexto : orden.campo === "cargo" ? c.fila.cargo : c.fila.persona;
  return c.filas
    .filter(pasa)
    .sort(
      (a, b) =>
        comparar(clave(a), clave(b), orden.asc) ||
        comparar(a.fila.persona, b.fila.persona, true) ||
        comparar(a.fila.cargo, b.fila.cargo, true),
    )
    .map((c) => c.fila);
}

export const filtrarDirectorio = (e: EstadoDirectorio, f: Filtros, orden: Orden) =>
  filtrarYOrdenar(candidatasDirectorio(e), f, orden);
