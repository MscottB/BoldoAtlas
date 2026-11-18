// Uso: node scripts/generar-historial.mjs > src-tauri/migrations/NNNN_historial.sql (esquema del historial + triggers de cada tabla de negocio),
// o con --tablas a,b solo los triggers de esas tablas (DROP + CREATE), para la migración futura que les cambie columnas.
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";

const CARPETA = new URL("../src-tauri/migrations/", import.meta.url);
const previas = readdirSync(CARPETA)
  .sort()
  .filter((f) => !f.includes("_historial"));
const db = new DatabaseSync(":memory:");
for (const f of previas) db.exec(readFileSync(new URL(f, CARPETA), "utf8"));

const ESQUEMA = `-- BoldoAtlas · esquema 3: historial de cambios. Los triggers se generan con scripts/generar-historial.mjs.
CREATE TABLE historial_acciones (
  id TEXT PRIMARY KEY,
  fecha TEXT NOT NULL,
  origen TEXT NOT NULL CHECK (origen IN ('app','importar','revisar','suprimir')),
  datos TEXT NOT NULL DEFAULT '{}',
  estado TEXT NOT NULL DEFAULT 'hecha' CHECK (estado IN ('hecha','deshecha')),
  rehacible INTEGER,
  bloqueada INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX historial_acciones_fecha ON historial_acciones (fecha);
CREATE TABLE historial_filas (
  accion_id TEXT NOT NULL REFERENCES historial_acciones (id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  orden INTEGER NOT NULL,
  tabla TEXT NOT NULL,
  fila_id TEXT NOT NULL,
  op TEXT NOT NULL CHECK (op IN ('insert','update','delete')),
  antes TEXT,
  despues TEXT,
  PRIMARY KEY (accion_id, orden)
);
CREATE INDEX historial_filas_fila ON historial_filas (tabla, fila_id);
CREATE TABLE historial_en_curso (uno INTEGER PRIMARY KEY CHECK (uno = 1), accion_id TEXT);
INSERT INTO historial_en_curso VALUES (1, NULL);
`;

const ACCION = "(SELECT accion_id FROM historial_en_curso)";
const ORDEN = `COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = ${ACCION}), 0) + 1`;
const CLAVES_META = "'org_nombre','logo_png','revision_bien','historial_plazo_dias'";
const objeto = (fila, cols) => `json_object(${cols.map((c) => `'${c}', ${fila}.${c}`).join(", ")})`;

const i = process.argv.indexOf("--tablas");
const solo = i >= 0 ? (process.argv[i + 1] ?? "").split(",").filter(Boolean) : null;
const tablas = db
  .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
  .all()
  .map((x) => x.name);
const desconocida = solo?.find((t) => !tablas.includes(t));
if (solo?.length === 0 || desconocida) {
  process.stderr.write(`--tablas: ${desconocida ? `no existe la tabla ${desconocida}` : "falta la lista"}\n`);
  process.exit(1);
}

const salida = solo ? [] : [ESQUEMA];
for (const t of solo ?? tablas) {
  if (solo)
    salida.push(
      ...["insert", "update", "delete"].map((op) => `DROP TRIGGER IF EXISTS historial_${t}_${op};`),
    );
  const cols = db
    .prepare("SELECT name FROM pragma_table_info(?)")
    .all(t)
    .map((c) => c.name);
  const idCol = t === "meta" ? "clave" : "id";
  const cuando = (fila) =>
    `WHEN ${ACCION} IS NOT NULL` + (t === "meta" ? ` AND ${fila}.clave IN (${CLAVES_META})` : "");
  const base = (op, fila, antes, despues) =>
    `INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)\n  SELECT ${ACCION}, ${ORDEN}, '${t}', ${fila}.${idCol}, '${op}', ${antes}, ${despues}`;
  const cambios = cols
    .map((c) => `SELECT '${c}' AS k, OLD.${c} AS a, NEW.${c} AS d WHERE OLD.${c} IS NOT NEW.${c}`)
    .join("\n    UNION ALL ");
  salida.push(
    `CREATE TRIGGER historial_${t}_insert AFTER INSERT ON ${t} ${cuando("NEW")}\nBEGIN\n  ${base("insert", "NEW", "NULL", objeto("NEW", cols))};\nEND;`,
    `CREATE TRIGGER historial_${t}_update AFTER UPDATE ON ${t} ${cuando("NEW")}\nBEGIN\n  ${base("update", "NEW", "json_group_object(k, a)", "json_group_object(k, d)")}\n  FROM (${cambios})\n  HAVING count(*) > 0;\nEND;`,
    `CREATE TRIGGER historial_${t}_delete AFTER DELETE ON ${t} ${cuando("OLD")}\nBEGIN\n  ${base("delete", "OLD", objeto("OLD", cols), "NULL")};\nEND;`,
  );
}
process.stdout.write(salida.join("\n") + "\n");
