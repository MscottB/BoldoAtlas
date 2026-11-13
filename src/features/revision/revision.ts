import {
  TABLAS_CATALOGO,
  type Asignacion,
  type Leyenda,
  type Puesto,
  type TablaCatalogo,
  type Trabajador,
  type Unidad,
  type ValorCatalogo,
} from "@/db/tipos";
import { descendientes, jefeVisible, vigentesPorPuesto } from "@/features/arbol/jerarquia";
import { hoyISO } from "@/features/puestos/puestos";
import { normalizarTexto } from "@/lib/texto";
import type { Marca, Marcas } from "./marcas";

type ConBorrado<T> = T & { deleted_at?: string | null };

/** Lo que la revisión lee del store. Solo cuentan las filas vivas (deleted_at vacío). */
export interface EstadoRevision {
  unidades: ConBorrado<Unidad>[];
  trabajadores: ConBorrado<Trabajador>[];
  puestos: ConBorrado<Puesto>[];
  asignaciones: ConBorrado<Asignacion>[];
  leyendas: Leyenda[];
  catalogos: Record<TablaCatalogo, ValorCatalogo[]>;
}

export interface FilaUnidad {
  unidadId: string;
  nombre: string;
  /** Los superiores de la unidad (vacío en una raíz). */
  ruta: string;
}
export interface FilaVacante {
  puestoId: string;
  unidadId: string;
  unidad: string;
  cargo: string;
  /** Días desde que cerró la última titular (o desde que se creó el puesto si nunca tuvo); null si no hay fecha. */
  dias: number | null;
}
export interface FilaReemplazo {
  puestoId: string;
  personaId: string;
  persona: string;
  cargo: string;
  unidad: string;
  unidadId: string;
}
export interface PersonaRef {
  id: string;
  nombre: string;
  correo: string | null;
}
export interface GrupoPersonas {
  /** Lo que tienen en común: el correo, o las palabras del nombre normalizadas. */
  clave: string;
  personas: PersonaRef[];
  /** Unidades de los puestos vivos donde sus personas tienen hoy una asignación vigente, sin repetir. */
  unidades: string[];
}
export interface FilaValor {
  tabla: TablaCatalogo | "leyendas";
  id: string;
  nombre: string;
}

export interface Avisos {
  sinJefatura: FilaUnidad[];
  vacantes: FilaVacante[];
  /** Informativo: no suma al contador. */
  reemplazos: FilaReemplazo[];
  sinPuesto: { personaId: string; nombre: string }[];
  correos: GrupoPersonas[];
  nombres: GrupoPersonas[];
  vacias: FilaUnidad[];
  sinUso: FilaValor[];
}

const vivo = (x: { deleted_at?: string | null }) => !x.deleted_at;
const DIA_MS = 86_400_000;

const utcDe = (iso: string) => {
  const [a, m, d] = iso.split("-").map(Number);
  return Date.UTC(a, m - 1, d);
};

/** Días de calendario (locales) de `desde` a `hoy`. `desde` es AAAA-MM-DD o un instante ISO, que se pasa antes a su día local. */
export function diasDesde(desde: string | undefined, hoy: Date): number | null {
  if (!desde) return null;
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(desde)
    ? desde
    : Number.isNaN(Date.parse(desde))
      ? null
      : hoyISO(new Date(desde));
  // Ambos días como UTC a medianoche: la diferencia es entera y un cambio de horario no la mueve.
  return dia === null ? null : Math.max(0, (utcDe(hoyISO(hoy)) - utcDe(dia)) / DIA_MS);
}

function rutaPadres(porId: Map<string, Unidad>, u: Unidad): string {
  const nombres: string[] = [];
  const vistos = new Set([u.id]); // corta si los datos ya traen un ciclo
  for (
    let x = u.parent_id ? porId.get(u.parent_id) : undefined;
    x && !vistos.has(x.id);
    x = x.parent_id ? porId.get(x.parent_id) : undefined
  ) {
    vistos.add(x.id);
    nombres.unshift(x.nombre);
  }
  return nombres.join(" › ");
}

const filaUnidad =
  (porId: Map<string, Unidad>) =>
  (u: Unidad): FilaUnidad => ({
    unidadId: u.id,
    nombre: u.nombre,
    ruta: rutaPadres(porId, u),
  });

/** Sin puesto de jefatura, con el puesto borrado, o sin titular ni reemplazo vigente en él. */
export function unidadesSinJefatura(e: EstadoRevision): FilaUnidad[] {
  const vigentes = vigentesPorPuesto(e.asignaciones);
  const puestos = new Set(e.puestos.filter(vivo).map((p) => p.id));
  const unidades = e.unidades.filter(vivo);
  const porId = new Map(unidades.map((u) => [u.id, u]));
  return unidades
    .filter((u) => !(u.jefe_puesto_id && puestos.has(u.jefe_puesto_id) && jefeVisible(u, vigentes)))
    .map(filaUnidad(porId));
}

export function puestosVacantes(e: EstadoRevision, hoy: Date): FilaVacante[] {
  const vigentes = vigentesPorPuesto(e.asignaciones);
  const ultimoCierre = new Map<string, string>();
  for (const a of e.asignaciones) {
    if (!vivo(a) || a.tipo !== "titular" || a.hasta === null) continue;
    const previo = ultimoCierre.get(a.puesto_id);
    if (!previo || a.hasta > previo) ultimoCierre.set(a.puesto_id, a.hasta);
  }
  const unidad = new Map(e.unidades.filter(vivo).map((u) => [u.id, u.nombre]));
  const cargo = new Map(e.catalogos.cargos.map((c) => [c.id, c.nombre]));
  return e.puestos
    .filter((p) => vivo(p) && !vigentes.get(p.id)?.titular)
    .map((p) => {
      return {
        puestoId: p.id,
        unidadId: p.unidad_id,
        unidad: unidad.get(p.unidad_id) ?? "",
        cargo: cargo.get(p.cargo_id) ?? "",
        dias: diasDesde(ultimoCierre.get(p.id) ?? p.created_at, hoy),
      };
    })
    .sort((a, b) => (b.dias ?? -1) - (a.dias ?? -1));
}

export function reemplazosVigentes(e: EstadoRevision): FilaReemplazo[] {
  const puestos = new Map(e.puestos.filter(vivo).map((p) => [p.id, p]));
  const personas = new Map(e.trabajadores.filter(vivo).map((t) => [t.id, t.nombre]));
  const unidad = new Map(e.unidades.filter(vivo).map((u) => [u.id, u.nombre]));
  const cargo = new Map(e.catalogos.cargos.map((c) => [c.id, c.nombre]));
  return e.asignaciones.flatMap((a) => {
    const p = puestos.get(a.puesto_id);
    const persona = personas.get(a.trabajador_id);
    if (!vivo(a) || a.tipo !== "reemplazo" || a.hasta !== null || !p || persona === undefined) return [];
    return [
      {
        puestoId: p.id,
        personaId: a.trabajador_id,
        persona,
        cargo: cargo.get(p.cargo_id) ?? "",
        unidad: unidad.get(p.unidad_id) ?? "",
        unidadId: p.unidad_id,
      },
    ];
  });
}

/** Sin titular ni reemplazo vigente en un puesto vivo. */
export function personasSinPuesto(e: EstadoRevision): Avisos["sinPuesto"] {
  const puestos = new Set(e.puestos.filter(vivo).map((p) => p.id));
  const conPuesto = new Set(
    e.asignaciones
      .filter((a) => vivo(a) && a.hasta === null && puestos.has(a.puesto_id))
      .map((a) => a.trabajador_id),
  );
  return e.trabajadores
    .filter((t) => vivo(t) && !conPuesto.has(t.id))
    .map((t) => ({ personaId: t.id, nombre: t.nombre }));
}

/** Grupos de dos o más personas vivas con la misma clave (en el orden en que aparece cada clave). */
function agrupar(e: EstadoRevision, clave: (t: Trabajador) => string): GrupoPersonas[] {
  const unidadDe = new Map(e.puestos.filter(vivo).map((p) => [p.id, p.unidad_id]));
  const unidadesDe = new Map<string, Set<string>>();
  for (const x of e.asignaciones) {
    const u = unidadDe.get(x.puesto_id);
    if (!vivo(x) || x.hasta !== null || u === undefined) continue;
    const set = unidadesDe.get(x.trabajador_id);
    if (set) set.add(u);
    else unidadesDe.set(x.trabajador_id, new Set([u]));
  }
  const grupos = new Map<string, PersonaRef[]>();
  for (const t of e.trabajadores) {
    const k = vivo(t) ? clave(t) : "";
    if (!k) continue;
    const lista = grupos.get(k);
    const ref = { id: t.id, nombre: t.nombre, correo: t.correo };
    if (lista) lista.push(ref);
    else grupos.set(k, [ref]);
  }
  return [...grupos]
    .filter(([, l]) => l.length > 1)
    .map(([k, personas]) => ({
      clave: k,
      personas,
      unidades: [...new Set(personas.flatMap((p) => [...(unidadesDe.get(p.id) ?? [])]))],
    }));
}

export const correosRepetidos = (e: EstadoRevision) =>
  agrupar(e, (t) => t.correo?.trim().toLowerCase() ?? "");

/** Mismo nombre sin tildes ni mayúsculas, o las mismas palabras en otro orden («Pérez Juan» ~ «Juan Perez»). Sin distancia de edición. */
export const nombresParecidos = (e: EstadoRevision) =>
  agrupar(e, (t) =>
    [
      ...new Set(
        normalizarTexto(t.nombre)
          .split(/[^\p{L}\p{N}]+/u)
          .filter(Boolean),
      ),
    ]
      .sort()
      .join(" "),
  );

/** Sin puestos vivos ni subunidades vivas. */
export function unidadesVacias(e: EstadoRevision): FilaUnidad[] {
  const unidades = e.unidades.filter(vivo);
  const porId = new Map(unidades.map((u) => [u.id, u]));
  const ocupadas = new Set(e.puestos.filter(vivo).map((p) => p.unidad_id));
  for (const u of unidades) if (u.parent_id) ocupadas.add(u.parent_id);
  return unidades.filter((u) => !ocupadas.has(u.id)).map(filaUnidad(porId));
}

/** Valores activos de los mantenedores (y leyendas activas) que ninguna fila viva usa. */
export function valoresSinUso(e: EstadoRevision): FilaValor[] {
  const puestos = e.puestos.filter(vivo);
  const personas = e.trabajadores.filter(vivo);
  const usados: Record<FilaValor["tabla"], Set<string | null>> = {
    cargos: new Set(puestos.map((p) => p.cargo_id)),
    tipos_contrato: new Set(personas.map((t) => t.tipo_contrato_id)),
    sedes: new Set(personas.map((t) => t.sede_id)),
    jornadas: new Set(personas.map((t) => t.jornada_id)),
    tipos_unidad: new Set(e.unidades.filter(vivo).map((u) => u.tipo_id)),
    leyendas: new Set(puestos.map((p) => p.leyenda_id)),
  };
  const valores: [FilaValor["tabla"], { id: string; nombre: string; deleted_at: string | null }[]][] = [
    ...TABLAS_CATALOGO.map((t): [TablaCatalogo, ValorCatalogo[]] => [t, e.catalogos[t]]),
    ["leyendas", e.leyendas],
  ];
  return valores.flatMap(([tabla, lista]) =>
    lista
      .filter((v) => !v.deleted_at && !usados[tabla].has(v.id))
      .map((v) => ({ tabla, id: v.id, nombre: v.nombre })),
  );
}

export function avisos(e: EstadoRevision, hoy: Date = new Date()): Avisos {
  return {
    sinJefatura: unidadesSinJefatura(e),
    vacantes: puestosVacantes(e, hoy),
    reemplazos: reemplazosVigentes(e),
    sinPuesto: personasSinPuesto(e),
    correos: correosRepetidos(e),
    nombres: nombresParecidos(e),
    vacias: unidadesVacias(e),
    sinUso: valoresSinUso(e),
  };
}

export type TipoAviso =
  | "sinJefatura"
  | "correos"
  | "vacantesLargas"
  | "sinPuesto"
  | "nombres"
  | "vacantesRecientes"
  | "vacias"
  | "sinUso";
export type Nivel = "importante" | "revisar" | "limpieza";

export const NIVELES: readonly { nivel: Nivel; tipos: readonly TipoAviso[] }[] = [
  { nivel: "importante", tipos: ["sinJefatura", "correos", "vacantesLargas"] },
  { nivel: "revisar", tipos: ["sinPuesto", "nombres", "vacantesRecientes", "vacias"] },
  { nivel: "limpieza", tipos: ["sinUso"] },
];

/** Larga si pasa de 90 días; sin fecha o hasta 90, reciente. */
export const DIAS_VACANTE_LARGA = 90;

/** `unidades` vacío = sin rama: el filtro por rama lo oculta. */
export type Aviso = { clave: string; unidades: string[] } & (
  | { tipo: "sinJefatura" | "vacias"; fila: FilaUnidad }
  | { tipo: "vacantesLargas" | "vacantesRecientes"; fila: FilaVacante }
  | { tipo: "sinPuesto"; fila: { personaId: string; nombre: string } }
  | { tipo: "correos" | "nombres"; fila: GrupoPersonas }
  | { tipo: "sinUso"; fila: FilaValor }
);

const claveGrupo = (g: GrupoPersonas) =>
  g.personas
    .map((p) => p.id)
    .sort()
    .join(",");

/** Todos los avisos, marcados o no, en el orden de NIVELES. */
export function listarAvisos(a: Avisos): Aviso[] {
  const unidad =
    (tipo: "sinJefatura" | "vacias") =>
    (fila: FilaUnidad): Aviso => ({
      tipo,
      clave: `${tipo}:${fila.unidadId}`,
      unidades: [fila.unidadId],
      fila,
    });
  const grupo =
    (tipo: "correos" | "nombres") =>
    (fila: GrupoPersonas): Aviso => ({
      tipo,
      clave: `${tipo}:${claveGrupo(fila)}`,
      unidades: fila.unidades,
      fila,
    });
  const vacante =
    (tipo: "vacantesLargas" | "vacantesRecientes") =>
    (fila: FilaVacante): Aviso => ({
      tipo,
      clave: `vacantes:${fila.puestoId}`,
      unidades: [fila.unidadId],
      fila,
    });
  const larga = (f: FilaVacante) => f.dias !== null && f.dias > DIAS_VACANTE_LARGA;
  return [
    ...a.sinJefatura.map(unidad("sinJefatura")),
    ...a.correos.map(grupo("correos")),
    ...a.vacantes.filter(larga).map(vacante("vacantesLargas")),
    ...a.sinPuesto.map((fila): Aviso => ({
      tipo: "sinPuesto",
      clave: `sinPuesto:${fila.personaId}`,
      unidades: [],
      fila,
    })),
    ...a.nombres.map(grupo("nombres")),
    ...a.vacantes.filter((f) => !larga(f)).map(vacante("vacantesRecientes")),
    ...a.vacias.map(unidad("vacias")),
    ...a.sinUso.map((fila): Aviso => ({
      tipo: "sinUso",
      clave: `sinUso:${fila.tabla}:${fila.id}`,
      unidades: [],
      fila,
    })),
  ];
}

/** La unidad viva y todo lo que cuelga de ella; null = toda la organización. */
export function ramaDe(unidades: ConBorrado<Unidad>[], id: string | null): Set<string> | null {
  const raiz = id === null ? undefined : unidades.find((u) => u.id === id);
  if (!raiz || raiz.deleted_at) return null;
  return new Set([raiz.id, ...descendientes(unidades, raiz.id)]);
}

export interface Revision {
  /** Una por tipo, también las vacías; solo con lo pendiente y dentro de la rama. */
  secciones: { nivel: Nivel; tipo: TipoAviso; avisos: Aviso[] }[];
  marcados: { aviso: Aviso; marca: Marca }[];
  reemplazos: FilaReemplazo[];
  /** Pendientes que el filtro de rama dejó fuera. */
  fueraDeRama: number;
  /** Todos los pendientes sin filtro de rama: el contador del menú. */
  total: number;
}

export function revisar(a: Avisos, marcas: Marcas, rama: Set<string> | null): Revision {
  const porTipo = new Map<TipoAviso, Aviso[]>();
  const marcados: Revision["marcados"] = [];
  let total = 0;
  let fueraDeRama = 0;
  for (const aviso of listarAvisos(a)) {
    // hasOwn: una clave como «constructor» no es una marca.
    if (Object.prototype.hasOwnProperty.call(marcas, aviso.clave)) {
      marcados.push({ aviso, marca: marcas[aviso.clave] });
      continue;
    }
    total++;
    if (rama && !aviso.unidades.some((u) => rama.has(u))) {
      fueraDeRama++;
      continue;
    }
    const lista = porTipo.get(aviso.tipo);
    if (lista) lista.push(aviso);
    else porTipo.set(aviso.tipo, [aviso]);
  }
  return {
    secciones: NIVELES.flatMap(({ nivel, tipos }) =>
      tipos.map((tipo) => ({ nivel, tipo, avisos: porTipo.get(tipo) ?? [] })),
    ),
    marcados,
    reemplazos: rama ? a.reemplazos.filter((r) => rama.has(r.unidadId)) : a.reemplazos,
    fueraDeRama,
    total,
  };
}
