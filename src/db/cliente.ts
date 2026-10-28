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
