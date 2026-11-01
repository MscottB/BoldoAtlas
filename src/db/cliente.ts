// Único punto de acceso a SQLite desde el frontend (puente Rust en src-tauri/src/comandos.rs).
import { invoke } from "@tauri-apps/api/core";

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
  return invoke<string>("respaldar_ahora");
}

/** Respaldo previo a reemplazar los datos: no entra en la poda de los últimos 10. */
export function respaldarAntesDeReemplazar(): Promise<string> {
  return invoke<string>("respaldar_antes_de_reemplazar");
}

/** Si sale bien, la app se reinicia y la promesa no se resuelve. */
export function restaurarRespaldo(nombre: string): Promise<void> {
  return invoke("restaurar_respaldo", { nombre });
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

// Exportar e importar .boldo: el cifrado, la lectura del archivo y las rutas quedan en Rust.
export interface ResumenExportacion {
  parcial: boolean;
  filas: { tabla: string; filas: number }[];
  cortes: { conexiones: number; jefaturas: number; roles: number; vistas: number };
}

export interface Detalle {
  tabla: string;
  nombre: string;
  motivo: "existe" | "union" | "correo" | "choque" | "referencia" | "vaciada";
}

export interface RamaImportada {
  id: string;
  nombre: string;
  existe: boolean;
  dentroDe: string | null;
  pideLugar: boolean;
}

export interface InformeImportacion {
  tablas: { tabla: string; trae: number; nuevas: number; existentes: number; unidas: number; omitidas: number }[];
  detalle: Detalle[];
  totalDetalle: number;
  historial: number;
  vaciadas: number;
  ramas: RamaImportada[];
}

export interface ResumenImportacion {
  organizacion: string;
  parcial: boolean;
  informe: InformeImportacion;
}

/** `raices` null: toda la base. */
export function exportarPreparar(raices: string[] | null): Promise<ResumenExportacion> {
  return invoke("exportar_preparar", { raices });
}

/** Abre «Guardar como» y cifra. null si no se eligió un lugar; el código se entrega solo aquí. */
export function exportarGuardar(): Promise<{ nombre: string; codigo: string } | null> {
  return invoke("exportar_guardar");
}

export function importarElegir(): Promise<{ nombre: string; bytes: number } | null> {
  return invoke("importar_elegir");
}

export function importarAbrir(codigo: string): Promise<ResumenImportacion> {
  return invoke("importar_abrir", { codigo });
}

/** `lugares`: id de cada rama → unidad donde colocarla (null: árbol independiente). */
export function importarAgregar(lugares: Record<string, string | null>): Promise<InformeImportacion> {
  return invoke("importar_agregar", { lugares, versionApp: __APP_VERSION__ });
}

/** Si sale bien, la app se reinicia y la promesa no se resuelve. */
export function importarReemplazar(): Promise<void> {
  return invoke("importar_reemplazar");
}

export function intercambioCancelar(): Promise<void> {
  return invoke("intercambio_cancelar");
}
