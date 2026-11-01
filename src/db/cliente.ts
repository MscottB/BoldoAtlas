// Único punto de acceso a SQLite desde el frontend (puente Rust en src-tauri/src/comandos.rs).
import { invoke } from "@tauri-apps/api/core";
import { i18n } from "@/i18n";
import { conTrabajo } from "@/lib/trabajos";

export interface InfoApp {
  dirDatos: string;
  rutaBd: string;
  portable: boolean;
  versionEsquema: number;
  error: string | null;
}

export interface Sentencia {
  sql: string;
  params?: unknown[];
}

export function infoApp(): Promise<InfoApp> {
  return invoke<InfoApp>("info_app");
}

export function consultar<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return invoke<T[]>("db_consultar", { sql, params });
}

/** Ejecuta todo en una transacción: o se aplican todas las sentencias o ninguna. */
export function lote(sentencias: Sentencia[]): Promise<void> {
  return invoke("db_lote", {
    sentencias: sentencias.map((s) => ({ sql: s.sql, params: s.params ?? [] })),
    versionApp: __APP_VERSION__,
  });
}

export async function leerMeta(): Promise<Record<string, string>> {
  const filas = await consultar<{ clave: string; valor: string | null }>("SELECT clave, valor FROM meta");
  return Object.fromEntries(filas.map((f) => [f.clave, f.valor ?? ""]));
}

// Respaldos: Rust conoce la carpeta; la interfaz solo maneja nombres de la lista.
export interface Respaldo {
  nombre: string;
  fecha: string;
  bytes: number;
  revision: number | null;
  legible: boolean;
  seguridad: boolean;
  /** Seguridad hecha antes de reemplazar los datos (si no, antes de restaurar). */
  reemplazo: boolean;
}

/** Error de los comandos de respaldos: `codigo` se traduce con `respaldos.error.<codigo>`. */
export interface FalloRespaldo {
  codigo: string;
  detalle: string;
}

export function listarRespaldos(): Promise<Respaldo[]> {
  return invoke<Respaldo[]>("listar_respaldos");
}

export function respaldarAhora(): Promise<string> {
  return conTrabajo(i18n.global.t("trabajos.respaldar"), () => invoke<string>("respaldar_ahora"));
}

/** Respaldo previo a reemplazar los datos: no entra en la poda de los últimos 10. */
export function respaldarAntesDeReemplazar(): Promise<string> {
  return invoke<string>("respaldar_antes_de_reemplazar");
}

/** Si sale bien, la app se reinicia y la promesa no se resuelve. */
export function restaurarRespaldo(nombre: string): Promise<void> {
  return conTrabajo(i18n.global.t("trabajos.restaurar"), () => invoke("restaurar_respaldo", { nombre }));
}

export function abrirCarpetaRespaldos(): Promise<void> {
  return invoke("abrir_carpeta_respaldos");
}

// Datos del proyecto abierto: Rust conoce la ruta; la interfaz solo la muestra.
export interface InfoProyecto {
  portable: boolean;
  dirDatos: string;
  rutaBd: string;
  bytes: number;
  /** Milisegundos desde 1970; null si el sistema no lo informa. */
  modificado: number | null;
}

export function infoProyecto(): Promise<InfoProyecto> {
  return invoke<InfoProyecto>("info_proyecto");
}

export function abrirCarpetaDatos(): Promise<void> {
  return invoke("abrir_carpeta_datos");
}
