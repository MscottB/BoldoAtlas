// La exportación completa (spec §11): las hojas de la organización, de hoy o del día que muestra «Organigrama a una
// fecha», en el alcance elegido (toda la organización o una rama: una unidad y lo que depende de ella). Los datos llegan
// del store (`enFecha` y las listas vivas), así que lo eliminado no está; las personas de una fecha traen las eliminadas
// después, y se dejan las que existían ese día.
import type {
  Asignacion,
  Conexion,
  Etiqueta,
  Leyenda,
  Puesto,
  TablaCatalogo,
  Trabajador,
  Unidad,
  ValorCatalogo,
  Zona,
} from "@/db/tipos";
import {
  dotacionPorUnidad,
  existiaEn,
  indiceHijos,
  jefeVisible,
  porOrden,
  rutaTexto,
  vigentesPorPuesto,
  type Vigentes,
} from "@/features/arbol/jerarquia";
import { hoyISO } from "@/features/puestos/puestos";
import { puestosVacantes } from "@/features/revision/revision";
import { collator } from "@/features/unidades/personas";
import { fechaExcel, type Celda, type Hoja, type Traducir } from "./libro";
import { claveColumna, columnasElegidas, ID_HOJAS, type IdHoja, type Seleccion } from "./seleccion";

export interface DatosCompleta {
  unidades: Unidad[];
  puestos: Puesto[];
  /** El historial de las asignaciones de esos puestos. */
  asignaciones: Asignacion[];
  trabajadores: (Trabajador & { created_at?: string; deleted_at?: string | null })[];
  catalogos: Record<TablaCatalogo, ValorCatalogo[]>;
  leyendas: Leyenda[];
  etiquetas: Etiqueta[];
  unidadEtiquetas: { unidad_id: string; etiqueta_id: string }[];
  zonas: Zona[];
  zonaUnidades: { zona_id: string; unidad_id: string }[];
  conexiones: Conexion[];
  /** Las notas de cada persona: solo si se marcó su columna (no vienen en la lista del store). */
  notas?: Map<string, string>;
  /** AAAA-MM-DD de «Organigrama a una fecha»; null = hoy. */
  fechaVista: string | null;
  hoy: Date;
}

const SEP = " · ";

/**
 * Las asignaciones como se veían el día `fecha`: sin las que empezaron después, y las que terminaron después siguen
 * abiertas (como en la vista previa de la persona). Así lo de hoy (`hasta` vacío) sirve igual para una fecha.
 */
const alDia = (asignaciones: Asignacion[], fecha: string): Asignacion[] =>
  asignaciones
    .filter((x) => x.desde <= fecha)
    .map((x) => (x.hasta !== null && x.hasta > fecha ? { ...x, hasta: null, motivo: null } : x));

/** Las unidades del alcance, de la raíz a las hojas en el orden del árbol, con su ruta completa. */
function unidadesDelAlcance(unidades: Unidad[], alcance: string | null): { unidad: Unidad; ruta: string }[] {
  const indice = indiceHijos(unidades);
  const raiz = alcance === null ? null : unidades.find((x) => x.id === alcance);
  if (alcance !== null && !raiz) return [];
  const arriba = raiz?.parent_id ? rutaTexto(unidades, raiz.parent_id) : "";
  const res: { unidad: Unidad; ruta: string }[] = [];
  const vistas = new Set<string>(); // corta si los datos ya traen un ciclo
  const pila = (raiz ? [raiz] : [...(indice.get(null) ?? [])].reverse()).map((unidad) => ({
    unidad,
    arriba,
  }));
  while (pila.length) {
    const { unidad, arriba } = pila.pop()!;
    if (vistas.has(unidad.id)) continue;
    vistas.add(unidad.id);
    const ruta = arriba ? `${arriba} › ${unidad.nombre}` : unidad.nombre;
    res.push({ unidad, ruta });
    const hijas = indice.get(unidad.id) ?? [];
    for (let i = hijas.length - 1; i >= 0; i--) pila.push({ unidad: hijas[i]!, arriba: ruta });
  }
  return res;
}

/** Quien encabeza al puesto: el jefe visible de su unidad o, si es él mismo (o no hay), el de la siguiente hacia arriba. */
function jefeDe(
  p: Puesto,
  persona: string,
  porId: Map<string, Unidad>,
  vigentes: Vigentes,
): Asignacion | null {
  const subir = (x: Unidad | undefined) => (x?.parent_id ? porId.get(x.parent_id) : undefined);
  const vistas = new Set<string>();
  for (let x = porId.get(p.unidad_id); x && !vistas.has(x.id); x = subir(x)) {
    vistas.add(x.id);
    const j = x.jefe_puesto_id === p.id ? null : jefeVisible(x, vigentes);
    if (j && j.trabajador_id !== persona) return j;
  }
  return null;
}

/**
 * Las hojas marcadas, en el orden de spec §11, con las columnas marcadas; Información la agrega quien exporta. Una a una:
 * con una organización grande, quien llama puede soltar la ventana entre hoja y hoja.
 */
export function* armarCompleta(
  d: DatosCompleta,
  alcance: string | null,
  sel: Seleccion,
  t: Traducir,
): Generator<Hoja, void, undefined> {
  const fecha = d.fechaVista ?? hoyISO(d.hoy);
  // `puestosVacantes` cuenta los días hasta «hoy»: el día que se ve, a mediodía (la fecha local no cambia).
  const hoy = d.fechaVista ? new Date(`${d.fechaVista}T12:00:00`) : d.hoy;
  const asignaciones = d.fechaVista ? alDia(d.asignaciones, d.fechaVista) : d.asignaciones;
  const vigentes = vigentesPorPuesto(asignaciones);

  const porId = new Map(d.unidades.map((x) => [x.id, x]));
  const enAlcance = unidadesDelAlcance(d.unidades, alcance);
  const rutaDe = new Map(enAlcance.map((x) => [x.unidad.id, x.ruta]));
  const nombre = (lista: { id: string; nombre: string }[]) => new Map(lista.map((x) => [x.id, x.nombre]));
  const cargo = nombre(d.catalogos.cargos);
  const personas = new Map(d.trabajadores.map((x) => [x.id, x]));
  const quien = (x: Asignacion | null | undefined) => (x && personas.get(x.trabajador_id)) || null;

  // Los puestos del alcance, unidad por unidad en el orden del árbol (y en su orden dentro de cada una).
  const puestosDe = new Map<string, Puesto[]>();
  for (const p of [...d.puestos].sort((x, y) => x.orden - y.orden)) {
    if (!rutaDe.has(p.unidad_id)) continue;
    const lista = puestosDe.get(p.unidad_id);
    if (lista) lista.push(p);
    else puestosDe.set(p.unidad_id, [p]);
  }
  const puestos = enAlcance.flatMap((x) => puestosDe.get(x.unidad.id) ?? []);
  const puestoIds = new Set(puestos.map((p) => p.id));

  // Las personas: con un puesto vigente en el alcance o, en toda la organización, todas las que existían ese día.
  const susPuestos = new Map<string, Puesto[]>();
  for (const p of puestos) {
    const v = vigentes.get(p.id);
    for (const x of [v?.titular, v?.reemplazo]) {
      if (!x) continue;
      const lista = susPuestos.get(x.trabajador_id);
      if (lista) lista.push(p);
      else susPuestos.set(x.trabajador_id, [p]);
    }
  }
  // Como las unidades de `instantaneaEn`: quien se cargó después pero ya tenía un puesto ese día o antes, existía.
  const conHistoria = new Set(asignaciones.map((x) => x.trabajador_id));
  const existia = (x: DatosCompleta["trabajadores"][number]) =>
    existiaEn({ deleted_at: x.deleted_at }, fecha) &&
    (existiaEn({ created_at: x.created_at }, fecha) || conHistoria.has(x.id));
  const trabajadores = d.trabajadores.filter((x) => (alcance === null ? existia(x) : susPuestos.has(x.id)));

  const filas: Record<IdHoja, () => Record<string, Celda>[]> = {
    unidades: () => {
      const tipo = nombre(d.catalogos.tipos_unidad);
      const etiqueta = nombre(d.etiquetas);
      const etiquetas = new Map<string, string[]>();
      for (const x of d.unidadEtiquetas) {
        const e = etiqueta.get(x.etiqueta_id);
        if (e) etiquetas.set(x.unidad_id, [...(etiquetas.get(x.unidad_id) ?? []), e]);
      }
      const dotacion = dotacionPorUnidad(d.unidades, d.puestos, asignaciones);
      return enAlcance.map(({ unidad: x, ruta }) => {
        const jefe = quien(jefeVisible(x, vigentes));
        const n = dotacion.get(x.id);
        return {
          id: x.id,
          tipo: tipo.get(x.tipo_id) ?? null,
          nombre: x.nombre,
          descripcion: x.descripcion,
          superior: (x.parent_id && porId.get(x.parent_id)?.nombre) || null,
          ruta,
          jefe: jefe?.nombre ?? null,
          correoJefe: jefe?.correo ?? null,
          etiquetas: etiquetas.get(x.id)?.sort(collator.compare).join(SEP) || null,
          dotacionDirecta: n?.directa ?? 0,
          dotacionTotal: n?.total ?? 0,
          vacantes: n?.vacantes ?? 0,
        };
      });
    },
    puestos: () => {
      const leyenda = nombre(d.leyendas);
      const [si, no] = [t("excel.filtro.si"), t("excel.filtro.no")]; // una vez, no por fila
      const dias = new Map(
        puestosVacantes({ ...d, puestos, asignaciones }, hoy).map((x) => [x.puestoId, x.dias]),
      );
      return puestos.map((p) => {
        const v = vigentes.get(p.id);
        const vacante = !v?.titular;
        return {
          id: p.id,
          unidad: porId.get(p.unidad_id)?.nombre ?? null,
          ruta: rutaDe.get(p.unidad_id) ?? null,
          cargo: cargo.get(p.cargo_id) ?? null,
          descripcion: p.descripcion,
          leyenda: (p.leyenda_id && leyenda.get(p.leyenda_id)) || null,
          titular: quien(v?.titular)?.nombre ?? null,
          reemplazo: quien(v?.reemplazo)?.nombre ?? null,
          vacante: vacante ? si : no,
          diasVacante: vacante ? (dias.get(p.id) ?? null) : null,
        };
      });
    },
    asignaciones: () => {
      const puesto = new Map(puestos.map((p) => [p.id, p]));
      const tipo = { titular: t("puesto.tipo.titular"), reemplazo: t("puesto.tipo.reemplazo") };
      return asignaciones
        .filter((x) => puestoIds.has(x.puesto_id))
        .map((x) => {
          const p = puesto.get(x.puesto_id)!;
          const w = quien(x);
          return {
            id: x.id,
            persona: w?.nombre ?? null,
            correo: w?.correo ?? null,
            cargo: cargo.get(p.cargo_id) ?? null,
            unidad: porId.get(p.unidad_id)?.nombre ?? null,
            tipo: tipo[x.tipo],
            desde: fechaExcel(x.desde),
            hasta: x.hasta ? fechaExcel(x.hasta) : null,
            motivo: x.motivo,
          };
        });
    },
    // Las de hoy entre unidades de ese día, con al menos una punta en el alcance (como las muestra el lienzo).
    conexiones: () =>
      d.conexiones
        .filter(
          (c) =>
            porId.has(c.origen_id) &&
            porId.has(c.destino_id) &&
            (rutaDe.has(c.origen_id) || rutaDe.has(c.destino_id)),
        )
        .map((c) => ({
          id: c.id,
          origen: porId.get(c.origen_id)!.nombre,
          destino: porId.get(c.destino_id)!.nombre,
          etiqueta: c.etiqueta,
        }))
        .sort((x, y) => collator.compare(x.origen, y.origen) || collator.compare(x.destino, y.destino)),
    trabajadores: () => {
      // Los nombres de catálogo incluyen los desactivados, como el Directorio: la persona los conserva.
      const [contrato, sede, jornada] = (["tipos_contrato", "sedes", "jornadas"] as const).map((c) =>
        nombre(d.catalogos[c]),
      );
      const de = (m: Map<string, string>, id: string | null) => (id && m.get(id)) || null;
      const unir = (valores: (string | null | undefined)[]) => valores.filter(Boolean).join(SEP) || null;
      return [...trabajadores]
        .sort((x, y) => collator.compare(x.nombre, y.nombre))
        .map((w) => {
          const ps = susPuestos.get(w.id) ?? [];
          return {
            id: w.id,
            nombre: w.nombre,
            correo: w.correo,
            telefono: w.telefono,
            tipoContrato: de(contrato!, w.tipo_contrato_id),
            sede: de(sede!, w.sede_id),
            jornada: de(jornada!, w.jornada_id),
            cargos: unir(ps.map((p) => cargo.get(p.cargo_id))),
            unidades: unir(ps.map((p) => porId.get(p.unidad_id)?.nombre)),
            rutas: unir(ps.map((p) => rutaDe.get(p.unidad_id))),
            jefes: unir(ps.map((p) => quien(jefeDe(p, w.id, porId, vigentes))?.nombre)),
            notas: d.notas?.get(w.id) || null,
          };
        });
    },
    // Los valores activos de cada catálogo; sus usos, dentro del alcance y del día.
    mantenedores: () => {
      const contar = (ids: (string | null)[]) => {
        const n = new Map<string, number>();
        for (const id of ids) if (id) n.set(id, (n.get(id) ?? 0) + 1);
        return n;
      };
      const usos: Record<TablaCatalogo | "etiquetas", Map<string, number>> = {
        cargos: contar(puestos.map((p) => p.cargo_id)),
        tipos_contrato: contar(trabajadores.map((w) => w.tipo_contrato_id)),
        sedes: contar(trabajadores.map((w) => w.sede_id)),
        jornadas: contar(trabajadores.map((w) => w.jornada_id)),
        tipos_unidad: contar(enAlcance.map((x) => x.unidad.tipo_id)),
        etiquetas: contar(d.unidadEtiquetas.filter((x) => rutaDe.has(x.unidad_id)).map((x) => x.etiqueta_id)),
      };
      const valores = (c: TablaCatalogo) => d.catalogos[c].filter((x) => !x.deleted_at).sort(porOrden);
      return (
        ["cargos", "tipos_contrato", "sedes", "jornadas", "tipos_unidad", "etiquetas"] as const
      ).flatMap((c) =>
        (c === "etiquetas" ? d.etiquetas : valores(c)).map((x) => ({
          id: x.id,
          catalogo: t(`excel.completa.catalogos.${c}`),
          nombre: x.nombre,
          usos: usos[c].get(x.id) ?? 0,
        })),
      );
    },
    // Una fila por zona y unidad, para filtrar por cualquiera de las dos; en toda la organización, también las vacías.
    zonas: () => {
      const miembros = new Set(d.zonaUnidades.map((m) => `${m.zona_id} ${m.unidad_id}`));
      return [...d.zonas]
        .sort((x, y) => collator.compare(x.nombre, y.nombre))
        .flatMap((z): Record<string, Celda>[] => {
          const unidades = enAlcance.filter((x) => miembros.has(`${z.id} ${x.unidad.id}`));
          const base = { id: z.id, zona: z.nombre, color: z.color };
          if (!unidades.length) return alcance === null ? [{ ...base, unidad: null, ruta: null }] : [];
          return unidades.map((x) => ({ ...base, unidad: x.unidad.nombre, ruta: x.ruta }));
        });
    },
  };

  for (const h of ID_HOJAS) {
    const columnas = columnasElegidas(sel, h);
    if (!sel[h].incluida || !columnas.length) continue;
    yield {
      nombre: t(`excel.completa.hojas.${h}`),
      columnas: columnas.map((c) => t(claveColumna(h, c))),
      filas: filas[h]().map((f) => columnas.map((c) => f[c] ?? null)),
    };
  }
}
