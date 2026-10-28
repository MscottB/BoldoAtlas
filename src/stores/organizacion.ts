import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { leerMeta, lote, consultar, type Sentencia } from "@/db/cliente";
import { traducirError } from "@/db/errores";
import {
  TABLAS_CATALOGO,
  type Conexion,
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
import { guardarMeta } from "@/db/repos/meta";
import { creaCiclo, hijos } from "@/features/arbol/jerarquia";
import { normalizarTexto } from "@/lib/texto";
import { i18n } from "@/i18n";

export type Resultado = { ok: true; id?: string } | { ok: false; mensaje: string };
export type ResultadoValor = { ok: true; id: string } | { ok: false; mensaje: string; existente?: string };

export interface Borrado {
  tipo: "unidad" | "trabajador";
  id: string;
  contenido?: { hijos: string[]; personas: string[] };
  /** Epoch en ms hasta el que se puede deshacer. */
  vence: number;
}

const VIGENCIA_DESHACER_MS = 8000;
const t = i18n.global.t; // el store vive fuera de los componentes: sin useI18n
const COLUMNA_CATALOGO: Record<TablaCatalogo, keyof Trabajador> = {
  cargos: "cargo_id",
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
  const etiquetas = ref<Etiqueta[]>([]);
  const unidadEtiquetas = ref<{ unidad_id: string; etiqueta_id: string }[]>([]);
  const conexiones = ref<Conexion[]>([]);
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
    trabajadores.value.filter((t) => t[COLUMNA_CATALOGO[tabla]] === id).length;

  function fallo(e: unknown): { ok: false; mensaje: string } {
    const mensaje = traducirError(e);
    error.value = mensaje;
    return { ok: false, mensaje };
  }

  let ultimaCarga = 0; // solo la carga más reciente aplica su resultado

  async function cargar(): Promise<Resultado> {
    const esta = ++ultimaCarga;
    try {
      const [u, t, et, ue, co, meta, ...cats] = await Promise.all([
        consultar<Unidad>(U.SQL_UNIDADES),
        consultar<Trabajador>(T.SQL_TRABAJADORES),
        consultar<Etiqueta>(E.SQL_ETIQUETAS),
        consultar<{ unidad_id: string; etiqueta_id: string }>(E.SQL_UNIDAD_ETIQUETAS),
        consultar<Conexion>(X.SQL_CONEXIONES),
        leerMeta(),
        ...TABLAS_CATALOGO.map((tabla) => consultar<ValorCatalogo>(C.sqlValores(tabla))),
      ]);
      if (esta !== ultimaCarga) return { ok: true };
      unidades.value = u;
      trabajadores.value = t;
      etiquetas.value = et;
      unidadEtiquetas.value = ue;
      conexiones.value = co;
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
  const editarUnidad = (id: string, cambios: Parameters<typeof U.editarUnidad>[1]) =>
    escribir(() => U.editarUnidad(id, cambios));
  const asignarJefe = (id: string, jefeId: string | null) => escribir(() => U.asignarJefe(id, jefeId));

  async function moverUnidad(id: string, nuevoPadre: string | null): Promise<Resultado> {
    if (creaCiclo(unidades.value, id, nuevoPadre)) return rechazar(t("store.cicloRama"));
    return escribir(() => U.moverUnidad(id, nuevoPadre));
  }

  async function eliminarUnidad(id: string): Promise<Resultado> {
    const u = porId.value.get(id);
    if (!u) return rechazar(t("store.unidadInexistente"));
    const contenido = {
      hijos: hijos(unidades.value, id).map((h) => h.id),
      personas: trabajadores.value.filter((t) => t.unidad_id === id).map((t) => t.id),
    };
    // Una raíz no tiene superior al que pasar su contenido (quedaría unidad_id NULL).
    if (u.parent_id === null && (contenido.hijos.length || contenido.personas.length))
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

  async function deshacer(): Promise<Resultado> {
    const b = ultimoBorrado.value;
    if (!b || Date.now() >= b.vence) {
      ultimoBorrado.value = null;
      return { ok: false, mensaje: t("store.noSePuedeDeshacer") };
    }
    return escribir(
      () => (b.tipo === "unidad" ? U.restaurarUnidad(b.id, b.contenido!) : T.restaurarTrabajador(b.id)),
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
      };
      const cat = Object.fromEntries(
        TABLAS_CATALOGO.map((t) => [t, valores[t].map((n) => nuevo(C.crearValor(t, n)))]),
      ) as Record<TablaCatalogo, string[]>;

      // clave, nombre, tipo, clave del superior
      const estructura: [string, string, Unidad["tipo"], string | null][] = [
        ["gg", "Gerencia General", "gerencia", null],
        ["op", "Operaciones", "gerencia", "gg"],
        ["ma", "Mantención", "area", "op"],
        ["me", "Mecánica", "subarea", "ma"],
        ["el", "Eléctrica", "subarea", "ma"],
        ["pr", "Producción", "area", "op"],
        ["fi", "Finanzas", "gerencia", "gg"],
        ["co", "Contabilidad", "area", "fi"],
        ["cm", "Compras", "area", "fi"],
        ["pe", "Personas", "gerencia", "gg"],
        ["se", "Selección", "area", "pe"],
        ["re", "Remuneraciones", "area", "pe"],
        ["ca", "Capacitación", "area", "pe"],
      ];
      const uid: Record<string, string> = {};
      estructura.forEach(([clave, nombre, tipo, padre], orden) => {
        uid[clave] = nuevo(U.crearUnidad({ tipo, nombre, parent_id: padre && uid[padre], orden }));
      });

      // unidad, nombre, cargo (índice en cat.cargos), ¿jefe?
      const personas: [string, string, number, boolean][] = [
        ["gg", "Camila Rojas", 0, true],
        ["op", "Andrés Soto", 0, true],
        ["ma", "Patricio Muñoz", 1, true],
        ["me", "Luis Fuentes", 3, true],
        ["me", "Marta Díaz", 3, false],
        ["el", "Rosa Vera", 3, true],
        ["pr", "Jorge Pizarro", 1, true],
        ["pr", "Elena Silva", 2, false],
        ["fi", "Paula Araya", 0, true],
        ["co", "Tomás Bravo", 1, true],
        ["co", "Inés Lagos", 2, false],
        ["cm", "Sofía Contreras", 1, true],
        ["pe", "Daniela Herrera", 0, true],
        ["se", "Matías Núñez", 2, true],
        ["re", "Carolina Parra", 2, true],
        ["ca", "Felipe Ibáñez", 2, true],
      ];
      personas.forEach(([u, nombre, cargo, jefe], i) => {
        const id = nuevo(
          T.crearTrabajador({
            unidad_id: uid[u],
            nombre,
            correo: `${normalizarTexto(nombre).replace(/ /g, ".")}@ejemplo.test`,
            cargo_id: cat.cargos[cargo],
            tipo_contrato_id: cat.tipos_contrato[i % 3],
            sede_id: cat.sedes[i % 2],
            jornada_id: cat.jornadas[u === "me" || u === "el" ? 1 : 0],
          }),
        );
        if (jefe) s.push(...U.asignarJefe(uid[u], id));
      });
      for (const [u, cargo] of [
        ["me", 3],
        ["cm", 2],
      ] as const)
        nuevo(T.crearTrabajador({ estado: "vacante", unidad_id: uid[u], cargo_id: cat.cargos[cargo] }));

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
    etiquetas,
    unidadEtiquetas,
    conexiones,
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
    editarUnidad,
    moverUnidad,
    asignarJefe,
    eliminarUnidad,
    crearTrabajador,
    editarTrabajador,
    eliminarTrabajador,
    etiquetar,
    quitarEtiqueta,
    crearEtiqueta,
    crearConexion,
    eliminarConexion,
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
