import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { Channel, invoke } from "@tauri-apps/api/core";
import { i18n } from "@/i18n";
import { guardarPreferencia, leerPreferencia } from "@/lib/preferencias";
import { FRECUENCIA_POR_DEFECTO, tocaBuscar } from "@/features/actualizaciones/programa";
import {
  leerNovedades,
  notasEntre,
  novedadesPendientes,
  type Novedad,
} from "@/features/actualizaciones/novedades";

// Actualizador (spec §12). Rust hace la única consulta de red de la app (src-tauri/src/actualizar.rs); aquí
// están la consulta periódica, la ventana de actualización y el diálogo «Novedades».

/** Preferencias por PC: frecuencia, última consulta que respondió (ms) y última versión usada en este PC. */
export const PREFERENCIA = "actualizaciones";
const ULTIMA = "actualizaciones.ultima";
const VERSION_USADA = "actualizaciones.version";
const CADA_HORA = 3_600_000;

export const VERSION_ACTUAL = __APP_VERSION_CORTA__;
/** Las novedades que viajan dentro de la app (generadas en el release). */
export const NOVEDADES_APP = leerNovedades(__APP_NOVEDADES__);

export type Modo = "instalador" | "portable" | "paquete";
export interface Disponible {
  version: string;
  modo: Modo;
  /** Página del release en GitHub. */
  pagina: string;
  /** novedades.json del release nuevo (null si no se pudo leer). */
  novedades: unknown;
}
export interface Progreso {
  descargado: number;
  total: number | null;
}
export type ResultadoActualizar = { ok: true; mensaje?: string } | { ok: false; mensaje: string };

const detalle = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const useActualizaciones = defineStore("actualizaciones", () => {
  const disponible = ref<Disponible | null>(null);
  const buscando = ref(false);
  const instalando = ref(false);
  const progreso = ref<Progreso | null>(null);
  /** Ventana de actualización y diálogo «Novedades». */
  const ventanaAbierta = ref(false);
  const novedadesAbiertas = ref(false);
  const novedades = ref<Novedad[]>([]);

  /** Las notas de todas las versiones entre la instalada y la nueva. */
  const notasDisponible = computed(() =>
    disponible.value
      ? notasEntre(leerNovedades(disponible.value.novedades), VERSION_ACTUAL, disponible.value.version)
      : [],
  );

  /** `manual`: lo pidió el usuario (Acerca de, menú, paleta); si no hay nada nuevo, se le dice. */
  async function buscar(manual: boolean): Promise<ResultadoActualizar> {
    const { t } = i18n.global;
    if (buscando.value) return { ok: true };
    buscando.value = true;
    try {
      disponible.value = await invoke<Disponible | null>("buscar_actualizacion", {
        versionActual: VERSION_ACTUAL,
      });
      guardarPreferencia(ULTIMA, Date.now());
      if (disponible.value && manual) ventanaAbierta.value = true;
      return { ok: true, mensaje: disponible.value ? undefined : t("actualizar.alDia") };
    } catch (e) {
      return { ok: false, mensaje: t("actualizar.error.consulta", { detalle: detalle(e) }) };
    } finally {
      buscando.value = false;
    }
  }

  /** Descarga, verifica e instala; si sale bien la app se reinicia y la promesa no vuelve. */
  async function instalar(): Promise<ResultadoActualizar> {
    const { t } = i18n.global;
    if (instalando.value) return { ok: true };
    instalando.value = true;
    progreso.value = { descargado: 0, total: null };
    const canal = new Channel<Progreso>();
    canal.onmessage = (p) => (progreso.value = p);
    try {
      await invoke("instalar_actualizacion", { progreso: canal });
      return { ok: true };
    } catch (e) {
      return { ok: false, mensaje: t("actualizar.error.instalar", { detalle: detalle(e) }) };
    } finally {
      instalando.value = false;
      progreso.value = null;
    }
  }

  async function cancelar(): Promise<void> {
    try {
      await invoke("cancelar_actualizacion");
    } catch {
      // ya terminó: no hay nada que cancelar
    }
  }

  function abrirNovedades(lista: Novedad[] = NOVEDADES_APP) {
    novedades.value = lista;
    novedadesAbiertas.value = true;
  }

  /**
   * Al arrancar: «Novedades» si esta versión es más nueva que la última usada en este PC, y la consulta periódica
   * (al abrir y luego cada hora, según la preferencia). La consulta automática falla en silencio.
   */
  function iniciar() {
    const pendientes = novedadesPendientes(
      NOVEDADES_APP,
      leerPreferencia<string | null>(VERSION_USADA, null),
      VERSION_ACTUAL,
    );
    guardarPreferencia(VERSION_USADA, VERSION_ACTUAL);
    if (pendientes.length) abrirNovedades(pendientes);
    const revisar = (alAbrir: boolean) => {
      const frecuencia = leerPreferencia<string>(PREFERENCIA, FRECUENCIA_POR_DEFECTO);
      if (
        !disponible.value &&
        tocaBuscar(frecuencia, leerPreferencia<number | null>(ULTIMA, null), Date.now(), alAbrir)
      )
        void buscar(false);
    };
    revisar(true);
    setInterval(() => revisar(false), CADA_HORA);
  }

  return {
    disponible,
    buscando,
    instalando,
    progreso,
    ventanaAbierta,
    novedadesAbiertas,
    novedades,
    notasDisponible,
    buscar,
    instalar,
    cancelar,
    abrirNovedades,
    iniciar,
  };
});
