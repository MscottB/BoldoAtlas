// Solo para tests: SQLite en memoria con el esquema real; imita db_lote de Rust (una transacción, data_revision +1, la
// acción del historial) y el deshacer y rehacer de historial.rs.
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import type { Sentencia } from "@/db/cliente";

const CARPETA = new URL("../../../src-tauri/migrations/", import.meta.url);
/** Todas las migraciones en orden, como MIGRACIONES de src-tauri/src/db.rs. */
export const ESQUEMA = readdirSync(CARPETA)
  .sort()
  .map((f) => readFileSync(new URL(f, CARPETA), "utf8"))
  .join("\n");

export interface BasePrueba {
  db: DatabaseSync;
  /** Todo o nada; relanza el error de SQLite. Anota la acción del historial y la devuelve, o null si no cambió nada. */
  aplicar(sentencias: Sentencia[]): string | null;
  /** Deshace o rehace esas acciones, como `historial::deshacer` y `rehacer` (sin buscar conflictos). Todo o nada. */
  mover(ids: string[], sentido: "deshacer" | "rehacer"): void;
  consultar<T>(sql: string, params?: unknown[]): T[];
}

/** Como `solo_permitidas` de src-tauri/src/db.rs: un repositorio con otra sentencia falla aquí y no solo en la app. */
function soloPermitidas(sql: string, permitidas: string[]): void {
  const primera = sql.trimStart().split(/[^A-Za-z]/)[0]!;
  if (!permitidas.includes(primera.toUpperCase())) throw new Error(`Sentencia no permitida: ${primera}`);
}

function enTransaccion<T>(db: DatabaseSync, hacer: () => T): T {
  db.exec("BEGIN");
  try {
    const r = hacer();
    db.exec("COMMIT"); // las claves foráneas diferidas fallan aquí
    return r;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

type FilaHistorial = {
  tabla: string;
  fila_id: string;
  op: string;
  antes: string | null;
  despues: string | null;
};

/** Deja la fila como dice `valores` (null: que no exista), igual que `historial.rs`. Sin `update`, la fila no estaba. */
function dejar(db: DatabaseSync, f: FilaHistorial, valores: string | null): void {
  const clave = f.tabla === "meta" ? "clave" : "id";
  const v = JSON.parse(valores ?? "{}") as Record<string, SQLInputValue>;
  const cols = Object.keys(v);
  if (valores === null) db.prepare(`DELETE FROM ${f.tabla} WHERE ${clave} = ?`).run(f.fila_id);
  else if (f.op !== "update")
    db.prepare(`INSERT INTO ${f.tabla} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`).run(
      ...cols.map((c) => v[c]!),
    );
  else
    db.prepare(`UPDATE ${f.tabla} SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE ${clave} = ?`).run(
      ...cols.map((c) => v[c]!),
      f.fila_id,
    );
}

export function abrirBasePrueba(): BasePrueba {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA recursive_triggers = ON"); // como db::abrir
  db.exec(ESQUEMA);
  db.exec("INSERT INTO meta (clave, valor) VALUES ('data_revision', '0')");
  let acciones = 0;
  return {
    db,
    aplicar(sentencias) {
      // crecen como el UUID v7 de Rust
      const id = `accion-${String(++acciones).padStart(6, "0")}`;
      return enTransaccion(db, () => {
        db.prepare("INSERT INTO historial_acciones (id, fecha, origen) VALUES (?, ?, 'app')").run(
          id,
          new Date().toISOString(),
        );
        db.prepare("UPDATE historial_en_curso SET accion_id = ?").run(id);
        for (const s of sentencias) {
          soloPermitidas(s.sql, ["INSERT", "UPDATE", "DELETE", "REPLACE", "WITH"]);
          db.prepare(s.sql).run(...((s.params ?? []) as SQLInputValue[]));
        }
        db.exec("UPDATE historial_en_curso SET accion_id = NULL");
        const anoto = !!db.prepare("SELECT 1 FROM historial_filas WHERE accion_id = ?").get(id);
        if (anoto) db.prepare("UPDATE historial_acciones SET rehacible = NULL WHERE id <> ?").run(id);
        else db.prepare("DELETE FROM historial_acciones WHERE id = ?").run(id);
        db.exec("UPDATE meta SET valor = CAST(valor AS INTEGER) + 1 WHERE clave = 'data_revision'");
        return anoto ? id : null;
      });
    },
    mover(ids, sentido) {
      const deshacer = sentido === "deshacer";
      const orden = [...ids].sort();
      if (deshacer) orden.reverse();
      enTransaccion(db, () => {
        for (const id of orden) {
          const filas = db
            .prepare(
              `SELECT tabla, fila_id, op, antes, despues FROM historial_filas WHERE accion_id = ? ORDER BY orden`,
            )
            .all(id) as FilaHistorial[];
          if (deshacer) filas.reverse();
          for (const f of filas) dejar(db, f, deshacer ? f.antes : f.despues);
          db.prepare(
            deshacer
              ? "UPDATE historial_acciones SET estado = 'deshecha', rehacible = (SELECT coalesce(max(rehacible), 0) + 1 FROM historial_acciones) WHERE id = ?"
              : "UPDATE historial_acciones SET estado = 'hecha', rehacible = NULL WHERE id = ?",
          ).run(id);
        }
        db.exec("UPDATE meta SET valor = CAST(valor AS INTEGER) + 1 WHERE clave = 'data_revision'");
      });
    },
    consultar<T>(sql: string, params: unknown[] = []) {
      soloPermitidas(sql, ["SELECT", "WITH"]);
      return db.prepare(sql).all(...(params as SQLInputValue[])) as T[];
    },
  };
}
