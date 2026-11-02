// Único punto de acceso a SQLite desde el frontend (puente Rust en src-tauri/src/comandos.rs).
import { invoke } from "@tauri-apps/api/core";
import { BaseCambiada, baseActual, enCambio } from "@/lib/baseActiva";

export interface InfoApp {
  baseId: string;
  dirDatos: string;
  rutaBd: string;
  portable: boolean;
  versionEsquema: number;
  error: string | null;
  /** La organización que no abrió al arrancar, y por qué: se abrió `boldo.db` en su lugar. */
  avisoInicio?: { codigo: string; nombre: string } | null;
}

export interface Organizacion {
  id: string;
  nombre: string;
  color: string;
  abierta: string;
  externa: boolean;
  ruta: string;
  existe: boolean;
  activa: boolean;
  logo: string | null;
  bytesBase: number;
  bytesRespaldos: number;
  ejemplo: boolean;
}

export interface Sentencia {
  sql: string;
  params?: unknown[];
}

const alReemplazar = new Set<() => void>();
/** Lo que la app guarda atado a los datos de ahora (p. ej. «Abierto recientemente») se suelta aquí cuando la base se reemplaza. */
export const alReemplazarBase = (f: () => void): void => void alReemplazar.add(f);
const vaciarRecientes = () => alReemplazar.forEach((f) => f());

const alOtra = new Set<() => void>();
/** Rust rechazó una llamada por venir con otra base, sin que hubiera un cambio: es un error de la app. */
export const alOtraBase = (f: () => void): void => void alOtra.add(f);

const esOtraBase = (e: unknown) =>
  e === "otra_base" || (typeof e === "object" && e !== null && (e as FalloRespaldo).codigo === "otra_base");

/** Una respuesta, o un error, de una base que ya no es la activa no llega a quien la pidió. `otra_base` no se reintenta. */
function vigilar<T>(base: string, hecho: Promise<T>): Promise<T> {
  return hecho.then(
    (r) => {
      if (baseActual() !== base) throw new BaseCambiada();
      return r;
    },
    (e: unknown) => {
      if (baseActual() !== base || (esOtraBase(e) && enCambio())) throw new BaseCambiada();
      if (esOtraBase(e)) alOtra.forEach((f) => f());
      throw e;
    },
  );
}

/** El único que agrega `baseId`. La base es la de ahora, aunque el comando salga después de `antes`. */
function conBase<T>(comando: string, args: Record<string, unknown> = {}, antes?: Promise<unknown>): Promise<T> {
  const base = baseActual();
  const salir = () => invoke<T>(comando, { ...args, baseId: base });
  return vigilar(base, antes ? antes.then(salir) : salir());
}

export function infoApp(): Promise<InfoApp> {
  return invoke<InfoApp>("info_app");
}

export function listarOrganizaciones(): Promise<Organizacion[]> {
  return invoke<Organizacion[]>("listar_organizaciones");
}

export function consultar<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return conBase<T[]>("db_consultar", { sql, params });
}

// Rust atiende los comandos fuera del hilo principal y en paralelo: las escrituras van en cola, de a una y en orden. No
// esperan a las cargas, para no perderse al salir; una lectura mezclada se acepta: `escribir` recarga y `ultimaCarga` evita lo viejo.
let colaLotes: Promise<unknown> = Promise.resolve();

/** Ejecuta todo en una transacción: o se aplican todas las sentencias o ninguna. */
export function lote(sentencias: Sentencia[]): Promise<void> {
  const hecho = conBase<void>(
    "db_lote",
    {
      sentencias: sentencias.map((s) => ({ sql: s.sql, params: s.params ?? [] })),
      versionApp: __APP_VERSION__,
    },
    colaLotes,
  );
  // un lote que falla no detiene a los siguientes; quien lo pidió ya recibe su error en `hecho`
  colaLotes = hecho.catch(() => undefined);
  return hecho;
}

/** Espera a que salgan todos los lotes, también los que entren mientras tanto. Nunca falla. */
export async function colaVacia(): Promise<void> {
  let vista;
  do {
    vista = colaLotes;
    await vista;
  } while (vista !== colaLotes);
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
  /** Hecho antes de agregar o fusionar un archivo importado. */
  importacion: boolean;
  /** Hecho antes de optimizar las fotos. */
  optimizacion: boolean;
}

/** Error de los comandos de respaldos: `codigo` se traduce con `respaldos.error.<codigo>`. */
export interface FalloRespaldo {
  codigo: string;
  detalle: string;
}

export function listarRespaldos(): Promise<Respaldo[]> {
  return conBase<Respaldo[]>("listar_respaldos");
}

export function respaldarAhora(): Promise<string> {
  return conBase<string>("respaldar_ahora");
}

/** Respaldo previo a reemplazar los datos: no entra en la poda de los últimos 10. */
export function respaldarAntesDeReemplazar(): Promise<string> {
  return conBase<string>("respaldar_antes_de_reemplazar");
}

/** Respaldo previo a optimizar las fotos: quedan los últimos 3. */
export function respaldarAntesDeOptimizar(): Promise<string> {
  return conBase<string>("respaldar_antes_de_optimizar");
}

/** Si sale bien, la app se reinicia y la promesa no se resuelve. */
export function restaurarRespaldo(nombre: string): Promise<void> {
  vaciarRecientes();
  return conBase("restaurar_respaldo", { nombre });
}

export function abrirCarpetaRespaldos(): Promise<void> {
  return conBase("abrir_carpeta_respaldos");
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
  return conBase<InfoProyecto>("info_proyecto");
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
  /** Cada rama frente a esta base, también si la revisión falló. null si no se pudo saber. */
  ramas: RamaImportada[] | null;
}

/** `raices` null: toda la base. */
export function exportarPreparar(trabajo: string, raices: string[] | null): Promise<ResumenExportacion> {
  return conBase("exportar_preparar", { trabajo, raices });
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
  return conBase("importar_abrir", { trabajo, codigo });
}

/** `lugares`: id de cada rama → unidad donde colocarla (null: árbol independiente). */
export function importarAgregar(
  trabajo: string,
  lugares: Record<string, string | null>,
): Promise<InformeImportacion> {
  return conBase("importar_agregar", { trabajo, lugares, versionApp: __APP_VERSION__ });
}

/** Si sale bien, la app se reinicia y la promesa no se resuelve. */
export function importarReemplazar(trabajo: string): Promise<void> {
  vaciarRecientes();
  return conBase("importar_reemplazar", { trabajo });
}

export type TipoCaso =
  | "nuevo"
  | "diferente"
  | "borrado_vs_editado"
  | "borrado_sin_conflicto"
  | "duplicado_persona"
  | "union";

export type Lado = "mio" | "archivo" | "igual";

/** Una decisión, tal como la guarda Rust junto al trabajo. */
export type Eleccion =
  | { que: "nada" | "agregar" | "omitir" | "borrar" | "mantener" | "pendiente" | "unir_mio" | "unir_archivo" }
  | { que: "campos"; archivo: string[] }
  | { que: "editar_correo"; correo: string }
  | { que: "conservar_mio" | "conservar_archivo" }
  | { que: "reasignar"; columna: string; a: string }
  | { que: "vaciar" | "descartar"; columna: string }
  | { que: "quitar"; columna: string | null };

export type AccionMasiva =
  | "recientes"
  | "todo_mio"
  | "todo_archivo"
  | "agregar_todo"
  | "omitir_todo"
  | "mantener_todo"
  | "borrar_todo"
  | "restaurar_todo"
  | "unir_todo_mio"
  | "resolver_rotas"
  | "no_resolver_rotas";

export interface ResumenRevision {
  version: number;
  /** Lo que dice `bloqueos` vale para las decisiones de ahora. */
  verificada: boolean;
  grupos: { tipo: TipoCaso; total: number; borradosAqui: number; tablas: { tabla: string; total: number }[] }[];
  iguales: number;
  dudosas: number;
  /** Lo decidido a mano: se pierde si se sale. */
  decisiones: number;
  aplicara: {
    agregar: number;
    cambiar: number;
    borrar: number;
    revivir: number;
    omitir: number;
    unir: number;
    vaciar: number;
    /** De las que se borran, las que solo están en esta base. */
    borrarLocales: number;
  };
  bloqueos: {
    duplicado: number;
    unica: number;
    regla: number;
    referencia: number;
    ciclo: number;
    cadena: number;
    total: number;
  };
  resolverRotas: boolean;
  /** Se eliminaría mucho de una vez: «Aplicar» pide confirmar. */
  borradoMasivo: boolean;
  restablecidas: number;
}

export interface FiltroRevision {
  tipo: TipoCaso | null;
  tabla: string | null;
  soloDudosas: boolean;
  desde: number;
  cuantos: number;
}

export interface FilaCaso {
  tabla: string;
  id: string;
  nombre: string;
  tipo: TipoCaso;
  columnas: string[];
  eleccion: Eleccion;
  preseleccionada: Eleccion;
  dudosa: boolean;
  masReciente: Lado;
  borradoAqui: boolean;
}

export interface ValorCampo {
  texto: string | null;
  /** De lo que no se muestra (una foto): cuántos bytes tiene. */
  oculto: number | null;
  cortado: boolean;
}

export interface DetalleCaso {
  campos: { columna: string; mio: ValorCampo; archivo: ValorCampo; distinto: boolean; delArchivo: boolean }[];
  actualizadaMia: string | null;
  actualizadaArchivo: string | null;
  borradaMia: string | null;
  borradaArchivo: string | null;
  rival: string | null;
}

export interface FilaBloqueo {
  tipo: "unica" | "regla" | "referencia" | "ciclo" | "cadena";
  tabla: string;
  id: string;
  nombre: string;
  columna: string | null;
  destino: string | null;
  otro: string | null;
  vaciable: boolean;
  /** Lo ya decidido; null si sigue por resolver. */
  eleccion: Eleccion | null;
  /** Lo decidido no alcanzó: sigue deteniendo «Aplicar». */
  fallido: boolean;
  reasignadoA: string | null;
}

export interface InformeRevision {
  tablas: {
    tabla: string;
    agregadas: number;
    cambiadas: number;
    borradas: number;
    revividas: number;
    unidas: number;
    omitidas: number;
    vaciadas: number;
    localesBorradas: number;
  }[];
  nombreHeredado: string | null;
}

/** «Revisar y decidir»: compara sin escribir nada y deja las decisiones en Rust, junto al trabajo. */
export function importarComparar(
  trabajo: string,
  lugares: Record<string, string | null>,
): Promise<ResumenRevision> {
  return conBase("importar_comparar", { trabajo, lugares });
}

export function importarVolver(trabajo: string): Promise<void> {
  return invoke("importar_volver", { trabajo });
}

export function revisionResumen(trabajo: string): Promise<ResumenRevision> {
  return invoke("revision_resumen", { trabajo });
}

export function revisionPagina(
  trabajo: string,
  filtro: FiltroRevision,
): Promise<{ filas: FilaCaso[]; total: number }> {
  return conBase("revision_pagina", { trabajo, filtro });
}

export function revisionDetalle(trabajo: string, tabla: string, id: string): Promise<DetalleCaso> {
  return conBase("revision_detalle", { trabajo, tabla, id });
}

export function revisionDecidir(
  trabajo: string,
  tabla: string,
  id: string,
  eleccion: Eleccion,
): Promise<ResumenRevision> {
  return invoke("revision_decidir", { trabajo, tabla, id, eleccion });
}

export function revisionMasivo(
  trabajo: string,
  accion: AccionMasiva,
  tipo: TipoCaso | null = null,
): Promise<ResumenRevision> {
  return invoke("revision_masivo", { trabajo, accion: { accion, tipo } });
}

/** La misma pasada que al aplicar, deshecha al final. */
export function revisionVerificar(trabajo: string): Promise<ResumenRevision> {
  return conBase("revision_verificar", { trabajo });
}

export function revisionBloqueos(
  trabajo: string,
  desde: number,
  cuantos: number,
): Promise<{ filas: FilaBloqueo[]; total: number }> {
  return conBase("revision_bloqueos", { trabajo, desde, cuantos });
}

export function revisionOpciones(
  trabajo: string,
  destino: string,
  texto: string,
): Promise<{ id: string; nombre: string }[]> {
  return conBase("revision_opciones", { trabajo, destino, texto });
}

/**
 * `version`: la de las decisiones que se vieron. Si hubo otra después, o la base cambió, no escribe nada.
 * `confirmado`: se confirmó una eliminación masiva; Rust lo exige si corresponde.
 */
export function revisionAplicar(
  trabajo: string,
  version: number,
  confirmado: boolean,
): Promise<InformeRevision> {
  return conBase("revision_aplicar", { trabajo, version, confirmado, versionApp: __APP_VERSION__ });
}

export function intercambioCancelar(trabajo: string): Promise<void> {
  return invoke("intercambio_cancelar", { trabajo });
}

// Fotos, en binario: no pasan por JSON.
export function fotoBytes(id: string): Promise<ArrayBuffer> {
  return conBase<ArrayBuffer>("foto_bytes", { id });
}

/** El comando recibe solo bytes: `armar` escribe en el cuerpo la base con que se pidió. */
export function fotosGuardar(armar: (baseId: string) => Promise<Uint8Array>): Promise<number> {
  const base = baseActual();
  return vigilar(
    base,
    armar(base).then((cuerpo) => invoke<number>("fotos_guardar", cuerpo)),
  );
}

export function fotosCompactar(): Promise<void> {
  return conBase("fotos_compactar");
}
