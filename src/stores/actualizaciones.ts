import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { Channel, invoke } from "@tauri-apps/api/core";
import { i18n } from "@/i18n";
import { guardarPreferencia, leerPreferencia } from "@/lib/preferencias";
import { conTrabajo } from "@/lib/trabajos";
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
export const ULTIMA = "actualizaciones.ultima";
export const VERSION_USADA = "actualizaciones.version";
// Bastante menor que el plazo más corto (una hora): si coincidieran, la demora de la respuesta saltaría una revisión.
const REVISION = 300_000;

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

/**
 * Error de los comandos de Rust (`{ codigo, detalle }`, ver `Fallo` en actualizar.rs) en el idioma de la interfaz:
 * `actualizar.error.<codigo>`; un código desconocido muestra el detalle técnico.
 */
export function mensajeError(e: unknown): string {
  const { t, te } = i18n.global;
  const f = (typeof e === "object" && e !== null ? e : { detalle: String(e) }) as {
    codigo?: string;
    detalle?: string;
  };
  const clave = `actualizar.error.${f.codigo}`;
  return t(te(clave) ? clave : "actualizar.error.desconocido", { detalle: f.detalle ?? "" });
}

export const useActualizaciones = defineStore("actualizaciones", () => {
  const disponible = ref<Disponible | null>(null);
  const buscando = ref(false);
  const instalando = ref(false);
  const progreso = ref<Progreso | null>(null);
  /** Ventana de actualización y diálogo «Novedades». */
  const ventanaAbierta = ref(false);
  const novedadesAbiertas = ref(false);
  const novedades = ref<Novedad[]>([]);
  /** Si «Novedades» se abrió solo, al primer arranque de una versión nueva (si no, se pidió en Acerca de). */
  const novedadesTrasActualizar = ref(false);

  /** Las notas de todas las versiones entre la instalada y la nueva. */
  const notasDisponible = computed(() =>
    disponible.value
      ? notasEntre(leerNovedades(disponible.value.novedades), VERSION_ACTUAL, disponible.value.version)
      : [],
  );

  // Una sola consulta a la vez: la manual que llega durante la automática espera esa misma y muestra su resultado.
  let enCurso: Promise<ResultadoActualizar> | null = null;
  async function consultar(): Promise<ResultadoActualizar> {
    buscando.value = true;
    try {
      disponible.value = await invoke<Disponible | null>("buscar_actualizacion", {
        versionActual: VERSION_ACTUAL,
      });
      guardarPreferencia(ULTIMA, Date.now());
      return { ok: true };
    } catch (e) {
      return { ok: false, mensaje: mensajeError(e) };
    } finally {
      buscando.value = false;
    }
  }

  /** `manual`: lo pidió el usuario (Acerca de, menú, paleta, bandeja); si hay versión nueva abre la ventana y si
   * no, lo dice. La automática no abre nada: solo el aviso de la barra superior. */
  async function buscar(manual: boolean): Promise<ResultadoActualizar> {
    enCurso ??= consultar().finally(() => (enCurso = null));
    const r = await enCurso;
    if (!r.ok || !manual) return r;
    if (disponible.value) {
      ventanaAbierta.value = true;
      return { ok: true };
    }
    return { ok: true, mensaje: i18n.global.t("actualizar.alDia") };
  }

  /** Descarga, verifica e instala; si sale bien la app se reinicia y la promesa no vuelve. */
  async function instalar(): Promise<ResultadoActualizar> {
    if (instalando.value) return { ok: true };
    instalando.value = true;
    progreso.value = { descargado: 0, total: null };
    const canal = new Channel<Progreso>();
    canal.onmessage = (p) => (progreso.value = p);
    try {
      await conTrabajo(i18n.global.t("trabajos.actualizar"), () =>
        invoke("instalar_actualizacion", { progreso: canal }),
      );
      return { ok: true };
    } catch (e) {
      return { ok: false, mensaje: mensajeError(e) };
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

  function abrirNovedades(lista: Novedad[] = NOVEDADES_APP, trasActualizar = false) {
    novedades.value = lista;
    novedadesTrasActualizar.value = trasActualizar;
    novedadesAbiertas.value = true;
  }

  let temporizador: ReturnType<typeof setInterval> | null = null;
  /**
   * Al arrancar (una vez): «Novedades» si esta versión es más nueva que la última usada en este PC, y la consulta
   * periódica (al abrir y luego según la preferencia). Sigue consultando aunque ya haya una versión
   * nueva, por si sale otra más nueva; no con la ventana de actualización abierta (no se le cambia ni se queda en
   * blanco) ni durante una instalación. La consulta automática falla en silencio.
   */
  function iniciar() {
    if (temporizador) return;
    const pendientes = novedadesPendientes(
      NOVEDADES_APP,
      leerPreferencia<string | null>(VERSION_USADA, null),
      VERSION_ACTUAL,
    );
    guardarPreferencia(VERSION_USADA, VERSION_ACTUAL);
    if (pendientes.length) abrirNovedades(pendientes, true);
    const revisar = (alAbrir: boolean) => {
      const frecuencia = leerPreferencia<string>(PREFERENCIA, FRECUENCIA_POR_DEFECTO);
      const ultima = leerPreferencia<number | null>(ULTIMA, null);
      if (!instalando.value && !ventanaAbierta.value && tocaBuscar(frecuencia, ultima, Date.now(), alAbrir))
        void buscar(false);
    };
    revisar(true);
    temporizador = setInterval(() => revisar(false), REVISION);
  }

  return {
    disponible,
    buscando,
    instalando,
    progreso,
    ventanaAbierta,
    novedadesAbiertas,
    novedades,
    novedadesTrasActualizar,
    notasDisponible,
    buscar,
    instalar,
    cancelar,
    abrirNovedades,
    iniciar,
  };
});
