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

// Rust atiende los comandos fuera del hilo principal y en paralelo: las escrituras van en cola, de a una y en orden. No
// esperan a las cargas, para no perderse al salir; una lectura mezclada se acepta: `escribir` recarga y `ultimaCarga` evita lo viejo.
let colaLotes: Promise<unknown> = Promise.resolve();

/** Ejecuta todo en una transacción: o se aplican todas las sentencias o ninguna. */
export function lote(sentencias: Sentencia[]): Promise<void> {
  const hecho = colaLotes.then(() =>
    invoke<void>("db_lote", {
      sentencias: sentencias.map((s) => ({ sql: s.sql, params: s.params ?? [] })),
      versionApp: __APP_VERSION__,
    }),
  );
  // un lote que falla no detiene a los siguientes; quien lo pidió ya recibe su error en `hecho`
  colaLotes = hecho.catch(() => undefined);
  return hecho;
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
// Cada paso lleva el identificador del trabajo: Rust rechaza guardar o aplicar lo que no sea lo que se revisó.
export interface ResumenExportacion {
  parcial: boolean;
  filas: { tabla: string; filas: number }[];
  cortes: { conexiones: number; jefaturas: number; roles: number; vistas: number; historial: number };
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
  vaciadas: number;
  ramas: RamaImportada[];
  /** El nombre que toma una base que no tenía. */
  nombreHeredado: string | null;
}

export interface ResumenImportacion {
  organizacion: string;
  parcial: boolean;
  /** null si la revisión falló: «Agregar» no se ofrece. */
  informe: InformeImportacion | null;
  /** Código de por qué falló. */
  motivoRevision: string | null;
}

/** `raices` null: toda la base. */
export function exportarPreparar(trabajo: string, raices: string[] | null): Promise<ResumenExportacion> {
  return invoke("exportar_preparar", { trabajo, raices });
}

/** Abre «Guardar como». false si no se eligió un lugar. */
export function exportarElegirDestino(trabajo: string): Promise<boolean> {
  return invoke("exportar_elegir_destino", { trabajo });
}

/** Cifra al destino elegido. El código se entrega solo aquí. */
export function exportarGuardar(trabajo: string): Promise<{ nombre: string; codigo: string }> {
  return invoke("exportar_guardar", { trabajo });
}

export function importarElegir(trabajo: string): Promise<{ nombre: string; bytes: number } | null> {
  return invoke("importar_elegir", { trabajo });
}

export function importarAbrir(trabajo: string, codigo: string): Promise<ResumenImportacion> {
  return invoke("importar_abrir", { trabajo, codigo });
}

/** `lugares`: id de cada rama → unidad donde colocarla (null: árbol independiente). */
export function importarAgregar(
  trabajo: string,
  lugares: Record<string, string | null>,
): Promise<InformeImportacion> {
  return invoke("importar_agregar", { trabajo, lugares, versionApp: __APP_VERSION__ });
}

/** Si sale bien, la app se reinicia y la promesa no se resuelve. */
export function importarReemplazar(trabajo: string): Promise<void> {
  return invoke("importar_reemplazar", { trabajo });
}

export function intercambioCancelar(trabajo: string): Promise<void> {
  return invoke("intercambio_cancelar", { trabajo });
}
