import { defineStore } from "pinia";
import { computed, ref, shallowRef } from "vue";
import { leerMeta, lote, consultar, type AvanceEliminar, type Sentencia } from "@/db/cliente";
import { traducirError } from "@/db/errores";
import {
  TABLAS_CATALOGO,
  TIPO_AREA,
  TIPO_GERENCIA,
  type Asignacion,
  type Conexion,
  type Puesto,
  type SubarbolGuardado,
  type Vista,
  type Etiqueta,
  type Zona,
  type Leyenda,
  type TablaCatalogo,
  type Trabajador,
  type Unidad,
  type ValorCatalogo,
} from "@/db/tipos";
import * as U from "@/db/repos/unidades";
import * as T from "@/db/repos/trabajadores";
import * as C from "@/db/repos/catalogos";
import type { TablaOrdenable } from "@/db/repos/catalogos";
import * as E from "@/db/repos/etiquetas";
import * as Z from "@/db/repos/zonas";
import * as X from "@/db/repos/conexiones";
import * as S from "@/db/repos/subarboles";
import * as V from "@/db/repos/vistas";
import * as P from "@/db/repos/puestos";
import * as A from "@/db/repos/asignaciones";
import * as L from "@/db/repos/leyendas";
import { SQL_HISTORICO } from "@/db/repos/historico";
import { guardarMeta } from "@/db/repos/meta";
import { TIPOS_SEMILLA, vaciarOrganizacion } from "@/db/repos/reemplazo";
import {
  creaCiclo,
  hijos,
  instantaneaEn,
  vigentesPorPuesto,
  type Historico,
} from "@/features/arbol/jerarquia";
import { cambiosPorDia, type Cambio } from "@/features/arbol/cambios";
import { duplicarRama as copiarRama } from "@/features/arbol/duplicar";
import { planEliminar, soloCimas } from "@/features/arbol/multiple";
import { excluidasParaConexion } from "@/features/unidades/panel";
import { normalizarTexto } from "@/lib/texto";
import { tiposARenombrar } from "@/features/configuracion/semillas";
import { i18n, type Idioma } from "@/i18n";
import { alSoltarDatos, BaseCambiada } from "@/lib/baseActiva";
import { EJEMPLO } from "./ejemplo";

/** `codigo`, `detalle` y `avance`: los de Rust, si el fallo viene de allí y quien llama necesita distinguirlo. */
export type Resultado =
  | { ok: true; id?: string }
  | { ok: false; mensaje: string; codigo?: string; detalle?: string; avance?: AvanceEliminar };
export type ResultadoValor = { ok: true; id: string } | { ok: false; mensaje: string; existente?: string };

export type ResultadoEliminar =
  { ok: true; eliminadas: number; omitidas: number } | { ok: false; mensaje: string };

type Contenido = { hijos: string[]; puestos: string[] };

export interface Borrado {
  tipo: "unidad" | "unidades" | "trabajador" | "puesto" | "vista" | "zona" | "conexion";
  id: string;
  /** `conexion`: entre quiénes era: al restaurarla no debe duplicar otra creada mientras tanto. */
  extremos?: [string, string];
  contenido?: Contenido;
  /** `unidades`: lo que contenía cada una de las eliminadas en el mismo lote. */
  lote?: { id: string; contenido: Contenido }[];
  /** Epoch en ms hasta el que se puede deshacer. */
  vence: number;
}

const VIGENCIA_DESHACER_MS = 8000;
const t = i18n.global.t; // el store vive fuera de los componentes: sin useI18n
// El cargo es del puesto y el tipo, de la unidad; los demás valores, de la persona.
const COLUMNA_CATALOGO: Record<Exclude<TablaCatalogo, "cargos" | "tipos_unidad">, keyof Trabajador> = {
  tipos_contrato: "tipo_contrato_id",
  sedes: "sede_id",
  jornadas: "jornada_id",
};

const catalogosVacios = () =>
  Object.fromEntries(TABLAS_CATALOGO.map((t) => [t, [] as ValorCatalogo[]])) as Record<
    TablaCatalogo,
    ValorCatalogo[]
  >;

export const useOrganizacion = defineStore("organizacion", () => {
  const unidades = ref<Unidad[]>([]);
  const trabajadores = ref<Trabajador[]>([]);
  const puestos = ref<Puesto[]>([]);
  const asignaciones = ref<Asignacion[]>([]);
  const etiquetas = ref<Etiqueta[]>([]);
  const unidadEtiquetas = ref<{ unidad_id: string; etiqueta_id: string }[]>([]);
  const zonas = ref<Zona[]>([]);
  const zonaUnidades = ref<{ zona_id: string; unidad_id: string }[]>([]);
  const conexiones = ref<Conexion[]>([]);
  const subarboles = ref<SubarbolGuardado[]>([]);
  const vistas = ref<Vista[]>([]);
  const leyendas = ref<Leyenda[]>([]);
  /** Estilo copiado (id de leyenda; null = «sin estilo»). Solo en memoria; undefined = nada copiado. */
  const estiloCopiado = ref<string | null | undefined>(undefined);
  const catalogos = ref(catalogosVacios());
  const org = ref<{ nombre: string; logo: string | null }>({ nombre: "", logo: null });
  const cargado = ref(false);
  const pendientes = ref(0);
  const guardando = computed(() => pendientes.value > 0);
  const error = ref<string | null>(null);
  const ultimoBorrado = ref<Borrado | null>(null);
  /** Día (AAAA-MM-DD) al que se ve el organigrama; null = hoy. No persiste. */
  const fechaVista = ref<string | null>(null);
  /** Filas con lo eliminado, cargadas solo mientras se ve una fecha: nunca se mezclan con los arreglos vivos. */
  const historico = shallowRef<Historico | null>(null);
  /** Cambios de cada día para el calendario: se calculan al pedirlos (`leerCambios`) y se descartan en cada carga. */
  const cambios = shallowRef<Map<string, Cambio[]> | null>(null);

  const porId = computed(() => new Map(unidades.value.map((u) => [u.id, u])));
  const raices = computed(() => unidades.value.filter((u) => u.parent_id === null));
  const vacia = computed(() => unidades.value.length === 0);

  /** Lo que muestran el lienzo y sus paneles: lo vivo de hoy o, con `fechaVista`, el organigrama de ese día. */
  const enFecha = computed(() => {
    const f = fechaVista.value;
    const foto = f && historico.value ? instantaneaEn(historico.value, f) : null;
    const us: Unidad[] = foto?.unidades ?? unidades.value;
    const asignacionesDelDia: Asignacion[] = foto?.asignaciones ?? asignaciones.value;
    return {
      unidades: us,
      puestos: (foto?.puestos ?? puestos.value) as Puesto[],
      asignaciones: asignacionesDelDia,
      trabajadores: (foto?.trabajadores ?? trabajadores.value) as Trabajador[],
      porId: foto ? new Map(us.map((u) => [u.id, u])) : porId.value,
      vigentes: vigentesPorPuesto(asignacionesDelDia, foto && f ? f : undefined),
    };
  });

  const activos = (tabla: TablaCatalogo) =>
    catalogos.value[tabla]
      .filter((v) => !v.deleted_at)
      .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es"));
  const leyendasActivas = computed(() => leyendas.value.filter((l) => !l.deleted_at));
  const puedePegarEstilo = computed(
    () =>
      estiloCopiado.value !== undefined &&
      (estiloCopiado.value === null || leyendasActivas.value.some((l) => l.id === estiloCopiado.value)),
  );
  /** Cuántas filas vivas usan el valor: cargos y leyendas, puestos; tipos de unidad, unidades; el resto, personas. */
  const usos = (tabla: TablaOrdenable, id: string) =>
    tabla === "cargos"
      ? puestos.value.filter((p) => p.cargo_id === id).length
      : tabla === "leyendas"
        ? puestos.value.filter((p) => p.leyenda_id === id).length
        : tabla === "tipos_unidad"
          ? unidades.value.filter((u) => u.tipo_id === id).length
          : trabajadores.value.filter((t) => t[COLUMNA_CATALOGO[tabla]] === id).length;

  function fallo(e: unknown): { ok: false; mensaje: string } {
    if (e instanceof BaseCambiada) return { ok: false, mensaje: "" }; // de la base anterior: no hay nada que mostrar
    const mensaje = traducirError(e);
    error.value = mensaje;
    return { ok: false, mensaje };
  }

  async function leerHistorico(): Promise<Historico> {
    const [unidades, puestos, asignaciones, trabajadores] = await Promise.all([
      consultar<Historico["unidades"][number]>(SQL_HISTORICO.unidades),
      consultar<Historico["puestos"][number]>(SQL_HISTORICO.puestos),
      consultar<Historico["asignaciones"][number]>(SQL_HISTORICO.asignaciones),
      consultar<Trabajador>(SQL_HISTORICO.trabajadores),
    ]);
    return { unidades, puestos, asignaciones, trabajadores };
  }

  /** `fecha` null = volver a hoy (descarta lo histórico). */
  async function verAFecha(fecha: string | null): Promise<Resultado> {
    if (fecha && !historico.value) {
      try {
        historico.value = await leerHistorico();
      } catch (e) {
        return fallo(e);
      }
    }
    if (!fecha) historico.value = null;
    fechaVista.value = fecha;
    return { ok: true };
  }

  /** Calcula `cambios` si no están: con lo histórico ya cargado (viendo una fecha) o leyéndolo una vez. */
  async function leerCambios(): Promise<Resultado> {
    if (cambios.value) return { ok: true };
    const carga = ultimaCarga; // si mientras se lee llega una carga, lo leído ya es viejo
    try {
      const h = historico.value ?? (await leerHistorico());
      if (carga === ultimaCarga) cambios.value = cambiosPorDia(h, catalogos.value.cargos);
      return { ok: true };
    } catch (e) {
      return fallo(e);
    }
  }

  let ultimaCarga = 0; // solo la carga más reciente aplica su resultado

  async function cargar(): Promise<Resultado> {
    const esta = ++ultimaCarga;
    try {
      const [u, t, pu, as, et, ue, zo, zu, co, sa, le, vi, meta, hist, ...cats] = await Promise.all([
        consultar<Unidad>(U.SQL_UNIDADES),
        consultar<Trabajador>(T.SQL_TRABAJADORES),
        consultar<Puesto>(P.SQL_PUESTOS),
        consultar<Asignacion>(A.SQL_ASIGNACIONES),
        consultar<Etiqueta>(E.SQL_ETIQUETAS),
        consultar<{ unidad_id: string; etiqueta_id: string }>(E.SQL_UNIDAD_ETIQUETAS),
        consultar<Zona>(Z.SQL_ZONAS),
        consultar<{ zona_id: string; unidad_id: string }>(Z.SQL_ZONA_UNIDADES),
        consultar<Conexion>(X.SQL_CONEXIONES),
        consultar<SubarbolGuardado>(S.SQL_SUBARBOLES),
        consultar<Leyenda>(L.SQL_LEYENDAS),
        consultar<Vista>(V.SQL_VISTAS),
        leerMeta(),
        fechaVista.value ? leerHistorico() : null, // lo histórico se mantiene al día si se escribe mientras se ve una fecha
        ...TABLAS_CATALOGO.map((tabla) => consultar<ValorCatalogo>(C.sqlValores(tabla))),
      ]);
      if (esta !== ultimaCarga) return { ok: true };
      unidades.value = u;
      trabajadores.value = t;
      puestos.value = pu;
      asignaciones.value = as;
      etiquetas.value = et;
      unidadEtiquetas.value = ue;
      zonas.value = zo;
      zonaUnidades.value = zu;
      conexiones.value = co;
      subarboles.value = sa;
      leyendas.value = le;
      vistas.value = vi;
      catalogos.value = Object.fromEntries(TABLAS_CATALOGO.map((tabla, i) => [tabla, cats[i]])) as Record<
        TablaCatalogo,
        ValorCatalogo[]
      >;
      if (hist && fechaVista.value) historico.value = hist;
      cambios.value = null;
      org.value = { nombre: meta.org_nombre ?? "", logo: meta.logo_png || null };
      cargado.value = true;
      error.value = null;
      return { ok: true };
    } catch (e) {
      return esta === ultimaCarga ? fallo(e) : { ok: true };
    }
  }

  /** Se pasó a otra base: nada de la anterior queda a la vista, tampoco una foto (`urlFoto` lleva la base y no es reactiva). */
  function soltar(): void {
    ultimaCarga++;
    unidades.value = [];
    trabajadores.value = [];
    puestos.value = [];
    asignaciones.value = [];
    etiquetas.value = [];
    unidadEtiquetas.value = [];
    zonas.value = [];
    zonaUnidades.value = [];
    conexiones.value = [];
    subarboles.value = [];
    vistas.value = [];
    leyendas.value = [];
    catalogos.value = catalogosVacios();
    org.value = { nombre: "", logo: null };
    cargado.value = false;
    error.value = null;
    ultimoBorrado.value = null;
    fechaVista.value = null;
    historico.value = null;
    estiloCopiado.value = undefined;
    cambios.value = null;
  }
  alSoltarDatos(soltar);

  // shortcut: recarga todo tras cada escritura; si una org de 2.000 unidades se siente lenta, aplicar el cambio en memoria.
  /** Un lote (una transacción) y recarga. Si falla, recarga igual para no mostrar datos viejos. */
  async function aplicar(
    hacer: () => Sentencia[] | { id: string; sentencias: Sentencia[] },
    alExito?: () => void,
  ): Promise<Resultado> {
    pendientes.value++;
    try {
      const plan = hacer();
      const sentencias = Array.isArray(plan) ? plan : plan.sentencias;
      await lote(sentencias);
      alExito?.();
      const r = await cargar();
      // sin mensaje: la recarga llegó con otra base, y el lote ya se guardó
      return r.ok || !r.mensaje ? { ok: true, id: Array.isArray(plan) ? undefined : plan.id } : r;
    } catch (e) {
      const r = fallo(e);
      // recargar aquí le quitaría su turno a la carga del cambio, que es la que dice cuándo están los datos
      if (e instanceof BaseCambiada) {
        console.warn("Escritura rechazada: se está cambiando de organización", e);
        return r;
      }
      await cargar();
      error.value = r.mensaje;
      return r;
    } finally {
      pendientes.value--;
    }
  }

  const rechazar = (mensaje: string): { ok: false; mensaje: string } => {
    error.value = mensaje;
    return { ok: false, mensaje };
  };

  /** Única vía de escritura. Sin los datos cargados no: lo escrito se calcularía sobre lo que no se leyó. */
  const escribir = async (...args: Parameters<typeof aplicar>): Promise<Resultado> =>
    cargado.value ? aplicar(...args) : rechazar(t("store.sinCargar"));

  const crearUnidad = (datos: Parameters<typeof U.crearUnidad>[0]) => escribir(() => U.crearUnidad(datos));
  const crearArbol = (nombre: string, tipo_id: string) => crearUnidad({ tipo_id, nombre });
  const editarUnidad = (id: string, cambios: Parameters<typeof U.editarUnidad>[1]) =>
    escribir(() => U.editarUnidad(id, cambios));
  const asignarJefe = (id: string, puestoId: string | null) => escribir(() => U.asignarJefe(id, puestoId));

  async function moverUnidad(id: string, nuevoPadre: string | null): Promise<Resultado> {
    if (creaCiclo(unidades.value, id, nuevoPadre)) return rechazar(t("store.cicloRama"));
    return escribir(() => U.moverUnidad(id, nuevoPadre));
  }

  /** Mueve las seleccionadas bajo `nuevoPadre` en un lote. Solo se mueven las cimas: su rama las acompaña. */
  async function moverUnidades(ids: string[], nuevoPadre: string | null): Promise<Resultado> {
    if (fechaVista.value) return rechazar(t("store.soloLectura"));
    const cimas = soloCimas(unidades.value, ids);
    if (cimas.some((id) => creaCiclo(unidades.value, id, nuevoPadre))) return rechazar(t("store.cicloRama"));
    const mover = cimas.filter((id) => porId.value.get(id)?.parent_id !== nuevoPadre);
    return mover.length ? escribir(() => mover.flatMap((id) => U.moverUnidad(id, nuevoPadre))) : { ok: true };
  }

  /** Elimina varias en un lote (un solo Deshacer). Las raíces con contenido se omiten: ver `planEliminar`. */
  async function eliminarUnidades(ids: string[]): Promise<ResultadoEliminar> {
    if (fechaVista.value) return rechazar(t("store.soloLectura"));
    const { bajas, omitidas } = planEliminar(unidades.value, puestos.value, ids);
    if (!bajas.length) return rechazar(t("store.raizConContenido"));
    const r = await escribir(
      () => bajas.flatMap((b) => U.eliminarUnidad(porId.value.get(b.id)!, b.contenido, b.destino)),
      () =>
        (ultimoBorrado.value = {
          tipo: "unidades",
          id: bajas[0].id,
          lote: bajas.map(({ id, contenido }) => ({ id, contenido })),
          vence: Date.now() + VIGENCIA_DESHACER_MS,
        }),
    );
    return r.ok ? { ok: true, eliminadas: bajas.length, omitidas: omitidas.length } : r;
  }

  async function eliminarUnidad(id: string): Promise<Resultado> {
    const u = porId.value.get(id);
    if (!u) return rechazar(t("store.unidadInexistente"));
    const contenido = {
      hijos: hijos(unidades.value, id).map((h) => h.id),
      puestos: puestos.value.filter((p) => p.unidad_id === id).map((p) => p.id),
    };
    // Una raíz no tiene superior al que pasar su contenido (quedaría unidad_id NULL).
    if (u.parent_id === null && (contenido.hijos.length || contenido.puestos.length))
      return rechazar(t("store.raizConContenido"));
    return escribir(
      () => U.eliminarUnidad(u, contenido),
      () =>
        (ultimoBorrado.value = { tipo: "unidad", id, contenido, vence: Date.now() + VIGENCIA_DESHACER_MS }),
    );
  }

  const crearTrabajador = (datos: Parameters<typeof T.crearTrabajador>[0]) =>
    escribir(() => T.crearTrabajador(datos));
  const editarTrabajador = (id: string, cambios: Parameters<typeof T.editarTrabajador>[1]) =>
    escribir(() => T.editarTrabajador(id, cambios));
  const eliminarTrabajador = (id: string) =>
    escribir(
      () => T.eliminarTrabajador(id),
      () => (ultimoBorrado.value = { tipo: "trabajador", id, vence: Date.now() + VIGENCIA_DESHACER_MS }),
    );

  /** `comoJefatura`: el puesto nuevo queda de una vez como jefatura de su unidad (mismo lote: o se hace todo o nada). */
  const crearPuesto = (datos: Parameters<typeof P.crearPuesto>[0], comoJefatura = false) =>
    escribir(() => {
      const p = P.crearPuesto(datos);
      return {
        id: p.id,
        sentencias: comoJefatura ? [...p.sentencias, ...U.asignarJefe(datos.unidad_id, p.id)] : p.sentencias,
      };
    });
  const editarPuesto = (id: string, cambios: Parameters<typeof P.editarPuesto>[1]) =>
    escribir(() => P.editarPuesto(id, cambios));
  const eliminarPuesto = (id: string) =>
    escribir(
      () => P.eliminarPuesto(id),
      () => (ultimoBorrado.value = { tipo: "puesto", id, vence: Date.now() + VIGENCIA_DESHACER_MS }),
    );
  const asignarLeyenda = (puestoId: string, leyendaId: string | null) =>
    escribir(() => P.editarPuesto(puestoId, { leyenda_id: leyendaId }));
  const asignarTitular = (puestoId: string, trabajadorId: string, desde: string) =>
    escribir(() => A.asignarTitular(puestoId, trabajadorId, desde));
  const registrarReemplazo = (puestoId: string, trabajadorId: string, desde: string, hasta?: string | null) =>
    escribir(() => A.registrarReemplazo(puestoId, trabajadorId, desde, hasta));
  const terminarAsignacion = (id: string, hasta: string, motivo?: string | null) =>
    escribir(() => A.terminarAsignacion(id, hasta, motivo));
  /** "Crear persona «X»" desde un puesto: la persona y su asignación entran en el mismo lote. */
  const asignarNuevaPersona = (
    puestoId: string,
    tipo: Asignacion["tipo"],
    nombre: string,
    desde: string,
  ): Promise<Resultado> =>
    nombre.trim()
      ? escribir(() => {
          const p = T.crearTrabajador({ nombre: nombre.trim() });
          const a =
            tipo === "titular"
              ? A.asignarTitular(puestoId, p.id, desde)
              : A.registrarReemplazo(puestoId, p.id, desde); // vigente hasta "Terminar asignación"
          return { id: p.id, sentencias: [...p.sentencias, ...a.sentencias] };
        })
      : Promise.resolve(rechazar(t("store.nombreVacio")));

  const RESTAURAR = {
    unidad: (b: Borrado) => U.restaurarUnidad(b.id, b.contenido!),
    unidades: (b: Borrado) => b.lote!.flatMap((x) => U.restaurarUnidad(x.id, x.contenido)),
    trabajador: (b: Borrado) => T.restaurarTrabajador(b.id),
    puesto: (b: Borrado) => P.restaurarPuesto(b.id),
    vista: (b: Borrado) => V.restaurarVista(b.id),
    zona: (b: Borrado) => Z.restaurarZona(b.id),
    conexion: (b: Borrado) => X.restaurarConexion(b.id),
  };

  /** `id`: la baja a la que se refiere el aviso; si después hubo otra, ese aviso ya no restaura nada. */
  async function deshacer(id?: string): Promise<Resultado> {
    const b = ultimoBorrado.value;
    if (b && id && b.id !== id) return { ok: false, mensaje: t("store.noSePuedeDeshacer") };
    if (!b || Date.now() >= b.vence) {
      ultimoBorrado.value = null;
      return { ok: false, mensaje: t("store.noSePuedeDeshacer") };
    }
    // Personas y vistas no dependen de la fecha que se ve: también se eliminan viéndola, y su Deshacer debe valer.
    if (fechaVista.value && b.tipo !== "trabajador" && b.tipo !== "vista")
      return rechazar(t("store.soloLectura"));
    const motivo = b.extremos && conexionRechazada(b.extremos[0], b.extremos[1], conexiones.value);
    if (motivo) return rechazar(motivo);
    return escribir(
      () => RESTAURAR[b.tipo](b),
      () => (ultimoBorrado.value = null),
    );
  }

  const etiquetar = (unidadId: string, etiquetaId: string) =>
    escribir(() => E.etiquetarUnidad(unidadId, etiquetaId));
  const quitarEtiqueta = (unidadId: string, etiquetaId: string) =>
    escribir(() => E.quitarEtiqueta(unidadId, etiquetaId));
  /** Agrega la etiqueta a todas en un lote; las que ya la tienen se saltan (el índice no admite repetirla). */
  async function etiquetarUnidades(ids: string[], etiquetaId: string): Promise<Resultado> {
    if (fechaVista.value) return rechazar(t("store.soloLectura"));
    const tienen = new Set(
      unidadEtiquetas.value.filter((x) => x.etiqueta_id === etiquetaId).map((x) => x.unidad_id),
    );
    const faltan = ids.filter((id) => !tienen.has(id));
    return faltan.length
      ? escribir(() => faltan.flatMap((id) => E.etiquetarUnidad(id, etiquetaId)))
      : { ok: true };
  }
  /** Crea la etiqueta y, si se indican unidades, se la asigna en el mismo lote. Un nombre repetido sugiere la existente. */
  async function crearEtiqueta(
    nombre: string,
    color: string,
    paraUnidad?: string | string[],
  ): Promise<ResultadoValor> {
    if (fechaVista.value) return rechazar(t("store.soloLectura"));
    if (!nombre.trim()) return rechazar(t("store.nombreVacio"));
    const c = L.normalizarColor(color);
    if (!c) return rechazar(t("errores.colorInvalido"));
    const clave = normalizarTexto(nombre);
    const igual = etiquetas.value.find((e) => normalizarTexto(e.nombre) === clave);
    if (igual) {
      const mensaje = t("store.valorExiste", { nombre: igual.nombre });
      error.value = mensaje;
      return { ok: false, mensaje, existente: igual.id };
    }
    const r = await escribir(() => {
      const nueva = E.crearEtiqueta(nombre, c);
      const asignar = [paraUnidad ?? []].flat().flatMap((u) => E.etiquetarUnidad(u, nueva.id));
      return { id: nueva.id, sentencias: [...nueva.sentencias, ...asignar] };
    });
    return r.ok ? { ok: true, id: r.id! } : r;
  }
  /** Crea la zona con esas unidades, en un lote. Como con las etiquetas, un nombre repetido sugiere la existente. */
  async function crearZona(nombre: string, color: string, unidades: string[] = []): Promise<ResultadoValor> {
    if (fechaVista.value) return rechazar(t("store.soloLectura"));
    if (!nombre.trim()) return rechazar(t("store.nombreVacio"));
    const c = L.normalizarColor(color);
    if (!c) return rechazar(t("errores.colorInvalido"));
    const clave = normalizarTexto(nombre);
    const igual = zonas.value.find((z) => normalizarTexto(z.nombre) === clave);
    if (igual) {
      const mensaje = t("store.valorExiste", { nombre: igual.nombre });
      error.value = mensaje;
      return { ok: false, mensaje, existente: igual.id };
    }
    const r = await escribir(() => {
      const nueva = Z.crearZona(nombre, c);
      return {
        id: nueva.id,
        sentencias: [...nueva.sentencias, ...unidades.flatMap((u) => Z.agregarAZona(nueva.id, u))],
      };
    });
    return r.ok ? { ok: true, id: r.id! } : r;
  }
  async function editarZona(id: string, cambios: { nombre?: string; color?: string }): Promise<Resultado> {
    if (fechaVista.value) return rechazar(t("store.soloLectura"));
    const color = cambios.color === undefined ? undefined : L.normalizarColor(cambios.color);
    if (color === null) return rechazar(t("errores.colorInvalido"));
    if (cambios.nombre !== undefined) {
      if (!cambios.nombre.trim()) return rechazar(t("store.nombreVacio"));
      const clave = normalizarTexto(cambios.nombre);
      const igual = zonas.value.find((z) => z.id !== id && normalizarTexto(z.nombre) === clave);
      if (igual) return rechazar(t("store.valorExiste", { nombre: igual.nombre }));
    }
    return escribir(() => Z.editarZona(id, { nombre: cambios.nombre, color }));
  }
  /** Agrega a todas en un lote; las que ya están se saltan (el índice no admite repetirlas). */
  async function agregarAZona(ids: string[], zonaId: string): Promise<Resultado> {
    if (fechaVista.value) return rechazar(t("store.soloLectura"));
    const estan = new Set(zonaUnidades.value.filter((x) => x.zona_id === zonaId).map((x) => x.unidad_id));
    const faltan = ids.filter((id) => !estan.has(id));
    return faltan.length ? escribir(() => faltan.flatMap((id) => Z.agregarAZona(zonaId, id))) : { ok: true };
  }
  async function quitarDeZona(ids: string[], zonaId: string): Promise<Resultado> {
    if (fechaVista.value) return rechazar(t("store.soloLectura"));
    return escribir(() => ids.flatMap((id) => Z.quitarDeZona(zonaId, id)));
  }
  async function eliminarZona(id: string): Promise<Resultado> {
    if (fechaVista.value) return rechazar(t("store.soloLectura"));
    return escribir(
      () => Z.eliminarZona(id),
      () => (ultimoBorrado.value = { tipo: "zona", id, vence: Date.now() + VIGENCIA_DESHACER_MS }),
    );
  }

  /** Lo que la base no impide o no explica: consigo misma, una unidad eliminada y dos conexiones entre las mismas unidades. */
  function conexionRechazada(origen: string, destino: string, entre: Conexion[]) {
    if (origen === destino) return t("errores.conexionConsigoMisma");
    if (!porId.value.has(origen) || !porId.value.has(destino)) return t("store.unidadInexistente");
    if (!excluidasParaConexion(entre, origen).has(destino)) return null;
    const nombre = (id: string) => porId.value.get(id)?.nombre;
    return t("store.conexionDuplicada", { origen: nombre(origen), destino: nombre(destino) });
  }

  async function crearConexion(
    origen: string,
    destino: string,
    etiqueta: string | null = null,
  ): Promise<Resultado> {
    if (fechaVista.value) return rechazar(t("store.soloLectura"));
    const motivo = conexionRechazada(origen, destino, conexiones.value);
    return motivo ? rechazar(motivo) : escribir(() => X.crearConexion(origen, destino, etiqueta));
  }

  /** Sin cambios reales no escribe: un `updated_at` nuevo haría pasar la conexión por editada al comparar un `.boldo`. */
  async function actualizarConexion(
    id: string,
    cambios: { origen_id?: string; destino_id?: string; etiqueta?: string | null },
  ): Promise<Resultado> {
    if (fechaVista.value) return rechazar(t("store.soloLectura"));
    const c = conexiones.value.find((x) => x.id === id);
    if (!c) return rechazar(t("store.conexionInexistente"));
    const { origen_id = c.origen_id, destino_id = c.destino_id } = cambios;
    const etiqueta = cambios.etiqueta === undefined ? c.etiqueta : cambios.etiqueta?.trim() || null;
    const mismosExtremos = origen_id === c.origen_id && destino_id === c.destino_id;
    if (mismosExtremos && etiqueta === c.etiqueta) return { ok: true };
    // Solo al cambiar de extremos: un duplicado que trajo un .boldo sigue admitiendo que se edite su descripción.
    const motivo = mismosExtremos
      ? null
      : conexionRechazada(
          origen_id,
          destino_id,
          conexiones.value.filter((x) => x.id !== id),
        );
    if (motivo) return rechazar(motivo);
    // Solo lo que cambió: dos cambios solapados no se pisan con lo que cada uno leyó antes.
    return escribir(() =>
      X.actualizarConexion(id, {
        origen_id: origen_id === c.origen_id ? undefined : origen_id,
        destino_id: destino_id === c.destino_id ? undefined : destino_id,
        etiqueta: etiqueta === c.etiqueta ? undefined : etiqueta,
      }),
    );
  }

  /** Con Deshacer, como las demás bajas. */
  async function eliminarConexion(id: string): Promise<Resultado> {
    if (fechaVista.value) return rechazar(t("store.soloLectura"));
    const c = conexiones.value.find((x) => x.id === id);
    if (!c) return rechazar(t("store.conexionInexistente"));
    return escribir(
      () => X.eliminarConexion(id),
      () =>
        (ultimoBorrado.value = {
          tipo: "conexion",
          id,
          extremos: [c.origen_id, c.destino_id],
          vence: Date.now() + VIGENCIA_DESHACER_MS,
        }),
    );
  }

  /** Copia la unidad con su rama (ver `duplicarRama`) y devuelve el id de la copia. */
  async function duplicarRama(id: string): Promise<Resultado> {
    if (fechaVista.value) return rechazar(t("store.soloLectura"));
    const u = porId.value.get(id);
    if (!u) return rechazar(t("store.unidadInexistente"));
    const estado = {
      unidades: unidades.value,
      puestos: puestos.value,
      unidadEtiquetas: unidadEtiquetas.value,
      conexiones: conexiones.value,
      zonaUnidades: zonaUnidades.value,
    };
    return escribir(() => copiarRama(estado, id, t("unidad.copiaDe", { nombre: u.nombre })));
  }

  const guardarSubarbol = (unidadId: string) => escribir(() => S.guardarSubarbol(unidadId));
  const renombrarSubarbol = (id: string, nombre: string | null) =>
    escribir(() => S.renombrarSubarbol(id, nombre));
  const moverSubarbol = (id: string, orden: number) => escribir(() => S.moverSubarbol(id, orden));
  const quitarSubarbol = (id: string) => escribir(() => S.quitarSubarbol(id));

  /** `arbolId` null = árbol completo. El nombre no se repite dentro del mismo árbol (lo exige el índice). */
  const guardarVista = (arbolId: string | null, nombre: string, config: unknown): Promise<Resultado> =>
    nombre.trim()
      ? escribir(() => V.guardarVista(arbolId, nombre, config))
      : Promise.resolve(rechazar(t("store.nombreVacio")));
  const renombrarVista = (id: string, nombre: string): Promise<Resultado> =>
    nombre.trim()
      ? escribir(() => V.renombrarVista(id, nombre))
      : Promise.resolve(rechazar(t("store.nombreVacio")));
  const eliminarVista = (id: string) =>
    escribir(
      () => V.eliminarVista(id),
      () => (ultimoBorrado.value = { tipo: "vista", id, vence: Date.now() + VIGENCIA_DESHACER_MS }),
    );

  const guardarOrg = (nombre: string, logo: string | null) =>
    escribir(() => [...guardarMeta("org_nombre", nombre), ...guardarMeta("logo_png", logo ?? "")]);

  async function crearValor(tabla: TablaCatalogo, nombre: string): Promise<ResultadoValor> {
    if (!nombre.trim()) return rechazar(t("store.nombreVacio"));
    const clave = normalizarTexto(nombre);
    const igual = catalogos.value[tabla].find((v) => !v.deleted_at && normalizarTexto(v.nombre) === clave);
    if (igual) {
      const mensaje = t("store.valorExiste", { nombre: igual.nombre });
      error.value = mensaje;
      return { ok: false, mensaje, existente: igual.id };
    }
    const r = await escribir(() => C.crearValor(tabla, nombre));
    return r.ok ? { ok: true, id: r.id! } : r;
  }
  const renombrarValor = (tabla: TablaCatalogo, id: string, nombre: string): Promise<Resultado> =>
    nombre.trim()
      ? escribir(() => C.renombrarValor(tabla, id, nombre))
      : Promise.resolve(rechazar(t("store.nombreVacio")));
  const moverValor = (tabla: TablaCatalogo, id: string, orden: number) =>
    escribir(() => C.moverValor(tabla, id, orden));
  /** Sin tipos de unidad activos no se podría crear ninguna unidad: el último no se desactiva. */
  const desactivarValor = async (tabla: TablaCatalogo, id: string): Promise<Resultado> => {
    const quedan = activos("tipos_unidad");
    if (tabla === "tipos_unidad" && quedan.length === 1 && quedan[0].id === id)
      return rechazar(t("store.ultimoTipoUnidad"));
    return escribir(() => C.desactivarValor(tabla, id));
  };
  const reactivarValor = (tabla: TablaCatalogo, id: string) => escribir(() => C.reactivarValor(tabla, id));

  /** Deja las filas en el orden de `ids` (10, 20, 30…) en un solo lote; solo escribe las que cambian. */
  function ordenar(tabla: TablaOrdenable, ids: string[]): Promise<Resultado> {
    const filas: { id: string; orden: number }[] =
      tabla === "leyendas" ? leyendas.value : catalogos.value[tabla];
    const cambios = ids.flatMap((id, i) =>
      filas.find((f) => f.id === id)?.orden === (i + 1) * 10 ? [] : C.moverValor(tabla, id, (i + 1) * 10),
    );
    return cambios.length ? escribir(() => cambios) : Promise.resolve({ ok: true });
  }

  /** Crea la entrada y, si se indica un puesto, se la asigna en el mismo lote. */
  async function crearLeyenda(
    datos: { nombre: string; color: string; descripcion?: string | null },
    paraPuesto?: string,
  ): Promise<ResultadoValor> {
    if (!datos.nombre.trim()) return rechazar(t("store.nombreVacio"));
    const color = L.normalizarColor(datos.color);
    if (!color) return rechazar(t("errores.colorInvalido"));
    const clave = normalizarTexto(datos.nombre);
    const igual = leyendasActivas.value.find((l) => normalizarTexto(l.nombre) === clave);
    if (igual) {
      const mensaje = t("store.valorExiste", { nombre: igual.nombre });
      error.value = mensaje;
      return { ok: false, mensaje, existente: igual.id };
    }
    const r = await escribir(() => {
      const nueva = L.crearLeyenda({ ...datos, color });
      const asignar = paraPuesto ? P.editarPuesto(paraPuesto, { leyenda_id: nueva.id }) : [];
      return { id: nueva.id, sentencias: [...nueva.sentencias, ...asignar] };
    });
    return r.ok ? { ok: true, id: r.id! } : r;
  }
  async function editarLeyenda(id: string, cambios: { color?: string; descripcion?: string | null }) {
    const color = cambios.color === undefined ? undefined : L.normalizarColor(cambios.color);
    if (color === null) return rechazar(t("errores.colorInvalido"));
    return escribir(() => L.editarLeyenda(id, { ...cambios, color }));
  }
  const renombrarLeyenda = (id: string, nombre: string): Promise<Resultado> =>
    nombre.trim()
      ? escribir(() => C.renombrarValor("leyendas", id, nombre))
      : Promise.resolve(rechazar(t("store.nombreVacio")));
  const moverLeyenda = (id: string, orden: number) => escribir(() => C.moverValor("leyendas", id, orden));
  const desactivarLeyenda = (id: string) => escribir(() => C.desactivarValor("leyendas", id));
  const reactivarLeyenda = (id: string) => escribir(() => C.reactivarValor("leyendas", id));

  function copiarEstilo(puestoId: string): Resultado {
    const p = puestos.value.find((x) => x.id === puestoId);
    if (!p) return rechazar(t("store.puestoInexistente"));
    estiloCopiado.value = p.leyenda_id;
    return { ok: true };
  }
  async function pegarEstilo(puestoId: string): Promise<Resultado> {
    if (!puedePegarEstilo.value) return rechazar(t("store.nadaQuePegar"));
    return asignarLeyenda(puestoId, estiloCopiado.value ?? null);
  }

  /** Con la interfaz en inglés, los tipos sembrados sin uso pasan a sus nombres en inglés. */
  const renombresSemilla = (
    tipos: readonly ValorCatalogo[] = catalogos.value.tipos_unidad,
    uso = (id: string) => usos("tipos_unidad", id),
  ): Sentencia[] =>
    tiposARenombrar(tipos, uso, i18n.global.locale.value as Idioma).flatMap((r) =>
      C.renombrarValor("tipos_unidad", r.id, r.nombre),
    );

  /** Nombre de la organización y su unidad raíz, de `tipo`. */
  function sentenciasRaiz(nombre: string, nombreRaiz: string, tipo: string, renombres: Sentencia[]) {
    const raiz = U.crearUnidad({ tipo_id: tipo, nombre: nombreRaiz.trim() });
    return {
      id: raiz.id,
      sentencias: [...guardarMeta("org_nombre", nombre.trim()), ...renombres, ...raiz.sentencias],
    };
  }

  /** Primer uso: el nombre de la organización y su unidad raíz (del primer tipo activo), en un solo lote. */
  async function crearOrganizacion(nombre: string, nombreRaiz: string): Promise<Resultado> {
    // sin cargar, «vacía» no quiere decir sin datos: los mezclaría con los que hay, sin respaldo
    if (!cargado.value || !vacia.value) return rechazar(t("store.hayDatos"));
    if (!nombre.trim() || !nombreRaiz.trim()) return rechazar(t("store.nombreVacio"));
    const tipo = activos("tipos_unidad")[0];
    if (!tipo) return rechazar(t("arbol.sinTiposActivos"));
    return escribir(() => sentenciasRaiz(nombre, nombreRaiz, tipo.id, renombresSemilla()));
  }

  /** Organización ficticia para probar la app (en el idioma de la interfaz). */
  function sentenciasEjemplo(renombres: Sentencia[]): Sentencia[] {
    const x = EJEMPLO[i18n.global.locale.value as Idioma];
    const s: Sentencia[] = [...guardarMeta("org_nombre", x.organizacion), ...renombres];
    const nuevo = <P extends { id: string; sentencias: Sentencia[] }>(p: P): string => {
      s.push(...p.sentencias);
      return p.id;
    };

    const valores: Record<TablaCatalogo, string[]> = {
      cargos: x.cargos,
      tipos_contrato: x.tiposContrato,
      sedes: x.sedes,
      jornadas: x.jornadas,
      tipos_unidad: [x.tipoUnidad], // los demás tipos vienen sembrados
    };
    const cat = Object.fromEntries(
      TABLAS_CATALOGO.map((t) => [t, valores[t].map((n) => nuevo(C.crearValor(t, n)))]),
    ) as Record<TablaCatalogo, string[]>;
    const sup = cat.tipos_unidad[0];
    s.push(...C.moverValor("tipos_unidad", sup, 15)); // entre Gerencia (10) y Área (20)

    // clave (su nombre está en el texto de demostración), tipo, clave del superior
    const estructura: [keyof typeof x.unidades, string, string | null][] = [
      ["gg", TIPO_GERENCIA, null],
      ["op", TIPO_GERENCIA, "gg"],
      ["ma", sup, "op"],
      ["me", TIPO_AREA, "ma"],
      ["el", TIPO_AREA, "ma"],
      ["pr", TIPO_AREA, "op"],
      ["fi", TIPO_GERENCIA, "gg"],
      ["co", TIPO_AREA, "fi"],
      ["cm", TIPO_AREA, "fi"],
      ["pe", TIPO_GERENCIA, "gg"],
      ["se", TIPO_AREA, "pe"],
      ["re", TIPO_AREA, "pe"],
      ["ca", TIPO_AREA, "pe"],
    ];
    const uid: Record<string, string> = {};
    estructura.forEach(([clave, tipo_id, padre], orden) => {
      const nombre = x.unidades[clave];
      uid[clave] = nuevo(U.crearUnidad({ tipo_id, nombre, parent_id: padre && uid[padre], orden }));
    });
    // Marcas de las gerencias y la superintendencia, para ver «Colorear por» en la demostración.
    const marcas: [string, string, string][] = [
      ["gg", "#1e2a38", "GG"],
      ["op", "#0f766e", "OP"],
      ["ma", "#be123c", "MAN"],
      ["fi", "#b45309", "FIN"],
      ["pe", "#7c3aed", "PER"],
    ];
    for (const [clave, marca_color, marca_codigo] of marcas)
      s.push(...U.editarUnidad(uid[clave], { marca_color, marca_codigo }));

    // Leyendas de puestos: clave y color (nombre y descripción, en el texto de demostración).
    const leyenda: Record<string, string> = {};
    for (const [clave, color] of [
      ["critico", "#be123c"],
      ["sucesion", "#b45309"],
      ["potencial", "#0f766e"],
    ] as const)
      leyenda[clave] = nuevo(L.crearLeyenda({ ...x.leyendas[clave], color }));
    const leyendaDe: Record<string, string> = {
      "Camila Rojas": "critico",
      "Paula Araya": "critico",
      "Daniela Herrera": "critico",
      "Patricio Muñoz": "sucesion",
      "Tomás Bravo": "sucesion",
      "Elena Silva": "potencial",
      "Felipe Ibáñez": "potencial",
    };

    // unidad, nombre, cargo (índice en cat.cargos), ¿jefe?, titular desde
    const personas: [string, string, number, boolean, string][] = [
      ["gg", "Camila Rojas", 0, true, "2015-03-02"],
      ["op", "Andrés Soto", 0, true, "2023-07-01"],
      ["ma", "Patricio Muñoz", 1, true, "2023-07-01"],
      ["me", "Luis Fuentes", 3, true, "2017-05-02"],
      ["me", "Marta Díaz", 3, false, "2021-01-04"],
      ["el", "Rosa Vera", 3, true, "2019-08-01"],
      ["pr", "Jorge Pizarro", 1, true, "2016-10-03"],
      ["pr", "Elena Silva", 2, false, "2022-04-01"],
      ["fi", "Paula Araya", 0, true, "2018-01-02"],
      ["co", "Tomás Bravo", 1, true, "2020-06-01"],
      ["co", "Inés Lagos", 2, false, "2024-02-01"],
      ["cm", "Sofía Contreras", 1, true, "2019-11-04"],
      ["pe", "Daniela Herrera", 0, true, "2017-09-01"],
      ["se", "Matías Núñez", 2, true, "2021-03-01"],
      ["re", "Carolina Parra", 2, true, "2018-07-02"],
      ["ca", "Felipe Ibáñez", 2, true, "2022-08-01"],
    ];
    // Historial: Andrés Soto fue jefe de Mantención hasta que Patricio Muñoz tomó el puesto.
    const anterior: Record<string, [string, string]> = { ma: ["Andrés Soto", "2018-04-02"] };
    const pid: Record<string, string> = {};
    personas.forEach(([u, nombre, cargo, jefe, desde], i) => {
      pid[nombre] = nuevo(
        T.crearTrabajador({
          nombre,
          correo: `${normalizarTexto(nombre).replace(/ /g, ".")}@ejemplo.test`,
          tipo_contrato_id: cat.tipos_contrato[i % 3],
          sede_id: cat.sedes[i % 2],
          jornada_id: cat.jornadas[u === "me" || u === "el" ? 1 : 0],
        }),
      );
      const puesto = nuevo(
        P.crearPuesto({
          unidad_id: uid[u],
          cargo_id: cat.cargos[cargo],
          leyenda_id: leyenda[leyendaDe[nombre]],
          orden: i,
        }),
      );
      if (anterior[u]) nuevo(A.asignarTitular(puesto, pid[anterior[u][0]], anterior[u][1]));
      nuevo(A.asignarTitular(puesto, pid[nombre], desde));
      if (jefe) s.push(...U.asignarJefe(uid[u], puesto));
    });
    // Vacantes: puestos sin titular; la de Compras la cubre Inés Lagos como reemplazo.
    nuevo(P.crearPuesto({ unidad_id: uid.me, cargo_id: cat.cargos[3], orden: 90 }));
    const compras = nuevo(P.crearPuesto({ unidad_id: uid.cm, cargo_id: cat.cargos[2], orden: 91 }));
    nuevo(A.registrarReemplazo(compras, pid["Inés Lagos"], "2026-09-01"));

    const etiqueta: Record<string, string> = {};
    for (const [clave, color] of [
      ["critica", "#c2410c"],
      ["turnos", "#2563eb"],
      ["estrategica", "#7c3aed"],
    ] as const)
      etiqueta[clave] = nuevo(E.crearEtiqueta(x.etiquetas[clave], color));
    for (const [u, e] of [
      ["ma", "critica"],
      ["ma", "turnos"],
      ["pr", "turnos"],
      ["gg", "estrategica"],
      ["fi", "estrategica"],
    ])
      s.push(...E.etiquetarUnidad(uid[u], etiqueta[e]));

    nuevo(X.crearConexion(uid.ma, uid.cm, x.conexion));
    return s;
  }

  /** Lo que escribe una organización vacía o el ejemplo sobre una base recién hecha: sus tipos son los sembrados y sin uso. */
  function sentenciasNueva(
    tipo: "vacia" | "ejemplo",
    datos?: { nombre: string; nombreRaiz: string },
  ): Sentencia[] {
    const renombres = renombresSemilla(
      TIPOS_SEMILLA.map((s) => ({ ...s, deleted_at: null })),
      () => 0,
    );
    return tipo === "ejemplo"
      ? sentenciasEjemplo(renombres)
      : sentenciasRaiz(datos!.nombre, datos!.nombreRaiz, TIPO_GERENCIA, renombres).sentencias;
  }

  /** Solo con la base sin unidades: reemplazar datos existentes es `reemplazarCon`. Todo en un solo lote. */
  function cargarEjemplo(): Promise<Resultado> {
    if (!cargado.value || !vacia.value) return Promise.resolve(rechazar(t("store.hayDatos")));
    return escribir(() => sentenciasEjemplo(renombresSemilla()));
  }

  /**
   * Borra todos los datos de la organización y escribe en su lugar una organización vacía o el ejemplo, en un solo lote
   * (si algo falla no cambia nada). Quien llama debe haber hecho antes un respaldo y pedido confirmación.
   */
  function reemplazarCon(
    tipo: "vacia" | "ejemplo",
    datos?: { nombre: string; nombreRaiz: string },
  ): Promise<Resultado> {
    if (tipo === "vacia" && (!datos?.nombre.trim() || !datos.nombreRaiz.trim()))
      return Promise.resolve(rechazar(t("store.nombreVacio")));
    // sin mirar `cargado`: lo que hubiera se reemplaza sin leerlo
    return aplicar(
      // Tras vaciar, los tipos de unidad son los sembrados y sin uso.
      () => [...vaciarOrganizacion(), ...sentenciasNueva(tipo, datos)],
      () => {
        // Nada de lo anterior existe ya: ni deshacer, ni la fecha vista, ni el estilo copiado.
        ultimoBorrado.value = null;
        fechaVista.value = null;
        historico.value = null;
        estiloCopiado.value = undefined;
      },
    );
  }

  return {
    unidades,
    trabajadores,
    puestos,
    asignaciones,
    etiquetas,
    unidadEtiquetas,
    zonas,
    zonaUnidades,
    conexiones,
    subarboles,
    vistas,
    leyendas,
    leyendasActivas,
    estiloCopiado,
    puedePegarEstilo,
    catalogos,
    org,
    cargado,
    guardando,
    error,
    ultimoBorrado,
    fechaVista,
    enFecha,
    verAFecha,
    cambios,
    leerCambios,
    porId,
    raices,
    vacia,
    activos,
    usos,
    cargar,
    soltar,
    crearUnidad,
    crearArbol,
    editarUnidad,
    moverUnidad,
    asignarJefe,
    eliminarUnidad,
    moverUnidades,
    eliminarUnidades,
    duplicarRama,
    crearTrabajador,
    editarTrabajador,
    eliminarTrabajador,
    crearPuesto,
    editarPuesto,
    eliminarPuesto,
    asignarLeyenda,
    asignarTitular,
    registrarReemplazo,
    terminarAsignacion,
    asignarNuevaPersona,
    etiquetar,
    etiquetarUnidades,
    quitarEtiqueta,
    crearEtiqueta,
    crearZona,
    editarZona,
    agregarAZona,
    quitarDeZona,
    eliminarZona,
    crearConexion,
    actualizarConexion,
    eliminarConexion,
    guardarSubarbol,
    renombrarSubarbol,
    moverSubarbol,
    quitarSubarbol,
    guardarVista,
    renombrarVista,
    eliminarVista,
    guardarOrg,
    deshacer,
    cargarEjemplo,
    crearOrganizacion,
    sentenciasNueva,
    reemplazarCon,
    crearValor,
    renombrarValor,
    moverValor,
    desactivarValor,
    reactivarValor,
    ordenar,
    crearLeyenda,
    editarLeyenda,
    renombrarLeyenda,
    moverLeyenda,
    desactivarLeyenda,
    reactivarLeyenda,
    copiarEstilo,
    pegarEstilo,
  };
});
