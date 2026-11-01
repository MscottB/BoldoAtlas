// Solo para tests: SQLite en memoria con el esquema real; imita db_lote de Rust (una transacción, data_revision +1).
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readFileSync } from "node:fs";
import type { Sentencia } from "@/db/cliente";

const ESQUEMA = readFileSync(new URL("../../../src-tauri/migrations/0001_inicial.sql", import.meta.url), "utf8");

export interface BasePrueba {
  db: DatabaseSync;
  /** Todo o nada; relanza el error de SQLite. */
  aplicar(sentencias: Sentencia[]): void;
  consultar<T>(sql: string, params?: unknown[]): T[];
}

/** Como `solo_permitidas` de src-tauri/src/db.rs: un repositorio con otra sentencia falla aquí y no solo en la app. */
function soloPermitidas(sql: string, permitidas: string[]): void {
  const primera = sql.trimStart().split(/[^A-Za-z]/)[0]!;
  if (!permitidas.includes(primera.toUpperCase())) throw new Error(`Sentencia no permitida: ${primera}`);
}

export function abrirBasePrueba(): BasePrueba {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(ESQUEMA);
  db.exec("INSERT INTO meta (clave, valor) VALUES ('data_revision', '0')");
  return {
    db,
    aplicar(sentencias) {
      db.exec("BEGIN");
      try {
        for (const s of sentencias) {
          soloPermitidas(s.sql, ["INSERT", "UPDATE", "DELETE", "REPLACE", "WITH"]);
          db.prepare(s.sql).run(...((s.params ?? []) as SQLInputValue[]));
        }
        db.exec("UPDATE meta SET valor = CAST(valor AS INTEGER) + 1 WHERE clave = 'data_revision'");
        db.exec("COMMIT"); // las claves foráneas diferidas fallan aquí
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    consultar<T>(sql: string, params: unknown[] = []) {
      soloPermitidas(sql, ["SELECT", "WITH"]);
      return db.prepare(sql).all(...(params as SQLInputValue[])) as T[];
    },
  };
}
