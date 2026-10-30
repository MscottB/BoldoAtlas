import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { leerMeta, lote, consultar, type Sentencia } from "@/db/cliente";
import { traducirError } from "@/db/errores";
import {
  TABLAS_CATALOGO,
  TIPO_AREA,
  TIPO_GERENCIA,
  type Asignacion,
  type Conexion,
  type Puesto,
  type SubarbolGuardado,
  type Etiqueta,
  type TablaCatalogo,
  type Trabajador,
  type Unidad,
  type ValorCatalogo,
} from "@/db/tipos";
import * as U from "@/db/repos/unidades";
import * as T from "@/db/repos/trabajadores";
import * as C from "@/db/repos/catalogos";
import * as E from "@/db/repos/etiquetas";
import * as X from "@/db/repos/conexiones";
import * as S from "@/db/repos/subarboles";
import * as P from "@/db/repos/puestos";
import * as A from "@/db/repos/asignaciones";
import { guardarMeta } from "@/db/repos/meta";
import { creaCiclo, hijos } from "@/features/arbol/jerarquia";
import { normalizarTexto } from "@/lib/texto";
import { i18n } from "@/i18n";

export type Resultado = { ok: true; id?: string } | { ok: false; mensaje: string };
export type ResultadoValor = { ok: true; id: string } | { ok: false; mensaje: string; existente?: string };

export interface Borrado {
  tipo: "unidad" | "trabajador" | "puesto";
  id: string;
  contenido?: { hijos: string[]; puestos: string[] };
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
  const conexiones = ref<Conexion[]>([]);
  const subarboles = ref<SubarbolGuardado[]>([]);
  const catalogos = ref(catalogosVacios());
  const org = ref<{ nombre: string; logo: string | null }>({ nombre: "", logo: null });
  const cargado = ref(false);
  const pendientes = ref(0);
  const guardando = computed(() => pendientes.value > 0);
  const error = ref<string | null>(null);
  const ultimoBorrado = ref<Borrado | null>(null);

  const porId = computed(() => new Map(unidades.value.map((u) => [u.id, u])));
  const raices = computed(() => unidades.value.filter((u) => u.parent_id === null));
  const vacia = computed(() => unidades.value.length === 0);

  const activos = (tabla: TablaCatalogo) =>
    catalogos.value[tabla]
      .filter((v) => !v.deleted_at)
      .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es"));
  const usos = (tabla: TablaCatalogo, id: string) =>
    tabla === "cargos"
      ? puestos.value.filter((p) => p.cargo_id === id).length
      : tabla === "tipos_unidad"
        ? unidades.value.filter((u) => u.tipo_id === id).length
        : trabajadores.value.filter((t) => t[COLUMNA_CATALOGO[tabla]] === id).length;

  function fallo(e: unknown): { ok: false; mensaje: string } {
    const mensaje = traducirError(e);
    error.value = mensaje;
    return { ok: false, mensaje };
  }

  let ultimaCarga = 0; // solo la carga más reciente aplica su resultado

  async function cargar(): Promise<Resultado> {
    const esta = ++ultimaCarga;
    try {
      const [u, t, pu, as, et, ue, co, sa, meta, ...cats] = await Promise.all([
        consultar<Unidad>(U.SQL_UNIDADES),
        consultar<Trabajador>(T.SQL_TRABAJADORES),
        consultar<Puesto>(P.SQL_PUESTOS),
        consultar<Asignacion>(A.SQL_ASIGNACIONES),
        consultar<Etiqueta>(E.SQL_ETIQUETAS),
        consultar<{ unidad_id: string; etiqueta_id: string }>(E.SQL_UNIDAD_ETIQUETAS),
        consultar<Conexion>(X.SQL_CONEXIONES),
        consultar<SubarbolGuardado>(S.SQL_SUBARBOLES),
        leerMeta(),
        ...TABLAS_CATALOGO.map((tabla) => consultar<ValorCatalogo>(C.sqlValores(tabla))),
      ]);
      if (esta !== ultimaCarga) return { ok: true };
      unidades.value = u;
      trabajadores.value = t;
      puestos.value = pu;
      asignaciones.value = as;
      etiquetas.value = et;
      unidadEtiquetas.value = ue;
      conexiones.value = co;
      subarboles.value = sa;
      catalogos.value = Object.fromEntries(TABLAS_CATALOGO.map((tabla, i) => [tabla, cats[i]])) as Record<
        TablaCatalogo,
        ValorCatalogo[]
      >;
      org.value = { nombre: meta.org_nombre ?? "", logo: meta.logo_png || null };
      cargado.value = true;
      error.value = null;
      return { ok: true };
    } catch (e) {
      return esta === ultimaCarga ? fallo(e) : { ok: true };
    }
  }

  // shortcut: recarga todo tras cada escritura; si una org de 2.000 unidades se siente lenta, aplicar el cambio en memoria.
  /** Única vía de escritura: un lote (una transacción) y recarga. Si falla, recarga igual para no mostrar datos viejos. */
  async function escribir(
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
      return r.ok ? { ok: true, id: Array.isArray(plan) ? undefined : plan.id } : r;
    } catch (e) {
      const r = fallo(e);
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

  const crearUnidad = (datos: Parameters<typeof U.crearUnidad>[0]) => escribir(() => U.crearUnidad(datos));
  const crearArbol = (nombre: string, tipo_id: string) => crearUnidad({ tipo_id, nombre });
  const editarUnidad = (id: string, cambios: Parameters<typeof U.editarUnidad>[1]) =>
    escribir(() => U.editarUnidad(id, cambios));
  const asignarJefe = (id: string, puestoId: string | null) => escribir(() => U.asignarJefe(id, puestoId));

  async function moverUnidad(id: string, nuevoPadre: string | null): Promise<Resultado> {
    if (creaCiclo(unidades.value, id, nuevoPadre)) return rechazar(t("store.cicloRama"));
    return escribir(() => U.moverUnidad(id, nuevoPadre));
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

  const crearPuesto = (datos: Parameters<typeof P.crearPuesto>[0]) => escribir(() => P.crearPuesto(datos));
  const editarPuesto = (id: string, cambios: Parameters<typeof P.editarPuesto>[1]) =>
    escribir(() => P.editarPuesto(id, cambios));
  const eliminarPuesto = (id: string) =>
    escribir(
      () => P.eliminarPuesto(id),
      () => (ultimoBorrado.value = { tipo: "puesto", id, vence: Date.now() + VIGENCIA_DESHACER_MS }),
    );
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
    trabajador: (b: Borrado) => T.restaurarTrabajador(b.id),
    puesto: (b: Borrado) => P.restaurarPuesto(b.id),
  };

  async function deshacer(): Promise<Resultado> {
    const b = ultimoBorrado.value;
    if (!b || Date.now() >= b.vence) {
      ultimoBorrado.value = null;
      return { ok: false, mensaje: t("store.noSePuedeDeshacer") };
    }
    return escribir(
      () => RESTAURAR[b.tipo](b),
      () => (ultimoBorrado.value = null),
    );
  }

  const etiquetar = (unidadId: string, etiquetaId: string) =>
    escribir(() => E.etiquetarUnidad(unidadId, etiquetaId));
  const quitarEtiqueta = (unidadId: string, etiquetaId: string) =>
    escribir(() => E.quitarEtiqueta(unidadId, etiquetaId));
  const crearEtiqueta = (nombre: string, color: string) => escribir(() => E.crearEtiqueta(nombre, color));
  const crearConexion = (origen: string, destino: string, etiqueta: string | null = null) =>
    escribir(() => X.crearConexion(origen, destino, etiqueta));
  const eliminarConexion = (id: string) => escribir(() => X.eliminarConexion(id));

  const guardarSubarbol = (unidadId: string) => escribir(() => S.guardarSubarbol(unidadId));
  const renombrarSubarbol = (id: string, nombre: string | null) =>
    escribir(() => S.renombrarSubarbol(id, nombre));
  const moverSubarbol = (id: string, orden: number) => escribir(() => S.moverSubarbol(id, orden));
  const quitarSubarbol = (id: string) => escribir(() => S.quitarSubarbol(id));

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
  const desactivarValor = (tabla: TablaCatalogo, id: string) => escribir(() => C.desactivarValor(tabla, id));
  const reactivarValor = (tabla: TablaCatalogo, id: string) => escribir(() => C.reactivarValor(tabla, id));

  /** Organización ficticia para probar la app; todo en un solo lote. */
  function cargarEjemplo(): Promise<Resultado> {
    return escribir(() => {
      const s: Sentencia[] = [...guardarMeta("org_nombre", "Compañía Demo")];
      const nuevo = <P extends { id: string; sentencias: Sentencia[] }>(p: P): string => {
        s.push(...p.sentencias);
        return p.id;
      };

      const valores: Record<TablaCatalogo, string[]> = {
        cargos: ["Gerente", "Jefe de área", "Analista", "Técnico"],
        tipos_contrato: ["Indefinido", "Plazo fijo", "Honorarios"],
        sedes: ["Casa matriz", "Planta Norte"],
        jornadas: ["Completa", "Turnos 4x3"],
        tipos_unidad: ["Superintendencia"], // los demás tipos vienen sembrados
      };
      const cat = Object.fromEntries(
        TABLAS_CATALOGO.map((t) => [t, valores[t].map((n) => nuevo(C.crearValor(t, n)))]),
      ) as Record<TablaCatalogo, string[]>;
      const sup = cat.tipos_unidad[0];
      s.push(...C.moverValor("tipos_unidad", sup, 15)); // entre Gerencia (10) y Área (20)

      // clave, nombre, tipo, clave del superior
      const estructura: [string, string, string, string | null][] = [
        ["gg", "Gerencia General", TIPO_GERENCIA, null],
        ["op", "Operaciones", TIPO_GERENCIA, "gg"],
        ["ma", "Mantención", sup, "op"],
        ["me", "Mecánica", TIPO_AREA, "ma"],
        ["el", "Eléctrica", TIPO_AREA, "ma"],
        ["pr", "Producción", TIPO_AREA, "op"],
        ["fi", "Finanzas", TIPO_GERENCIA, "gg"],
        ["co", "Contabilidad", TIPO_AREA, "fi"],
        ["cm", "Compras", TIPO_AREA, "fi"],
        ["pe", "Personas", TIPO_GERENCIA, "gg"],
        ["se", "Selección", TIPO_AREA, "pe"],
        ["re", "Remuneraciones", TIPO_AREA, "pe"],
        ["ca", "Capacitación", TIPO_AREA, "pe"],
      ];
      const uid: Record<string, string> = {};
      estructura.forEach(([clave, nombre, tipo_id, padre], orden) => {
        uid[clave] = nuevo(U.crearUnidad({ tipo_id, nombre, parent_id: padre && uid[padre], orden }));
      });

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
        const puesto = nuevo(P.crearPuesto({ unidad_id: uid[u], cargo_id: cat.cargos[cargo], orden: i }));
        if (anterior[u]) nuevo(A.asignarTitular(puesto, pid[anterior[u][0]], anterior[u][1]));
        nuevo(A.asignarTitular(puesto, pid[nombre], desde));
        if (jefe) s.push(...U.asignarJefe(uid[u], puesto));
      });
      // Vacantes: puestos sin titular; la de Compras la cubre Inés Lagos como reemplazo.
      nuevo(P.crearPuesto({ unidad_id: uid.me, cargo_id: cat.cargos[3], orden: 90 }));
      const compras = nuevo(P.crearPuesto({ unidad_id: uid.cm, cargo_id: cat.cargos[2], orden: 91 }));
      nuevo(A.registrarReemplazo(compras, pid["Inés Lagos"], "2026-09-01"));

      const etiqueta: Record<string, string> = {};
      for (const [nombre, color] of [
        ["Crítica", "#c2410c"],
        ["Turno 24×7", "#2563eb"],
        ["Estratégica", "#7c3aed"],
      ])
        etiqueta[nombre] = nuevo(E.crearEtiqueta(nombre, color));
      for (const [u, e] of [
        ["ma", "Crítica"],
        ["ma", "Turno 24×7"],
        ["pr", "Turno 24×7"],
        ["gg", "Estratégica"],
        ["fi", "Estratégica"],
      ])
        s.push(...E.etiquetarUnidad(uid[u], etiqueta[e]));

      nuevo(X.crearConexion(uid.ma, uid.cm, "Abastecimiento de repuestos"));
      return s;
    });
  }

  return {
    unidades,
    trabajadores,
    puestos,
    asignaciones,
    etiquetas,
    unidadEtiquetas,
    conexiones,
    subarboles,
    catalogos,
    org,
    cargado,
    guardando,
    error,
    ultimoBorrado,
    porId,
    raices,
    vacia,
    activos,
    usos,
    cargar,
    crearUnidad,
    crearArbol,
    editarUnidad,
    moverUnidad,
    asignarJefe,
    eliminarUnidad,
    crearTrabajador,
    editarTrabajador,
    eliminarTrabajador,
    crearPuesto,
    editarPuesto,
    eliminarPuesto,
    asignarTitular,
    registrarReemplazo,
    terminarAsignacion,
    asignarNuevaPersona,
    etiquetar,
    quitarEtiqueta,
    crearEtiqueta,
    crearConexion,
    eliminarConexion,
    guardarSubarbol,
    renombrarSubarbol,
    moverSubarbol,
    quitarSubarbol,
    guardarOrg,
    deshacer,
    cargarEjemplo,
    crearValor,
    renombrarValor,
    moverValor,
    desactivarValor,
    reactivarValor,
  };
});
