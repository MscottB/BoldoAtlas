import { describe, it, expect, beforeEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const SQL = readFileSync(new URL("../../src-tauri/migrations/0001_inicial.sql", import.meta.url), "utf8");
const AHORA = "2026-10-28T12:00:00.000Z";

let db: DatabaseSync;
let u: string;

function ins(tabla: string, fila: Record<string, string | number | null>): string {
  const datos = { id: randomUUID(), created_at: AHORA, updated_at: AHORA, ...fila };
  const cols = Object.keys(datos);
  db.prepare(`INSERT INTO ${tabla} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`).run(
    ...Object.values(datos),
  );
  return datos.id;
}

function actividadConPersonas() {
  const p = ins("procesos", { unidad_id: u, nombre: "Compras" });
  const a = ins("actividades", { proceso_id: p, nombre: "Cotizar" });
  const t1 = ins("trabajadores", { nombre: "Ana", unidad_id: u });
  const t2 = ins("trabajadores", { nombre: "Beto", unidad_id: u });
  return { a, t1, t2 };
}

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(SQL);
  u = ins("unidades", { tipo: "gerencia", nombre: "Operaciones" });
});

describe("esquema 0001", () => {
  it("rechaza vacante sin cargo", () =>
    expect(() => ins("trabajadores", { estado: "vacante", unidad_id: u })).toThrow(/CHECK/));

  it("rechaza activo sin nombre", () =>
    expect(() => ins("trabajadores", { estado: "activo", unidad_id: u })).toThrow(/CHECK/));

  it("acepta vacante con cargo y sin nombre", () => {
    const cargo = ins("cargos", { nombre: "Analista" });
    expect(() => ins("trabajadores", { estado: "vacante", cargo_id: cargo, unidad_id: u })).not.toThrow();
  });

  it("cargos rechaza un nombre repetido sin importar mayúsculas ni espacios", () => {
    ins("cargos", { nombre: "analista" });
    expect(() => ins("cargos", { nombre: " ANALISTA " })).toThrow(/UNIQUE/);
  });

  it("cargos acepta el nombre de uno desactivado", () => {
    ins("cargos", { nombre: "analista", deleted_at: AHORA });
    expect(() => ins("cargos", { nombre: " ANALISTA " })).not.toThrow();
  });

  it("trabajadores.cargo_id inexistente falla al confirmar", () => {
    db.exec("BEGIN");
    ins("trabajadores", { nombre: "Ana", cargo_id: randomUUID(), unidad_id: u });
    expect(() => db.exec("COMMIT")).toThrow(/FOREIGN KEY/);
    db.exec("ROLLBACK");
  });

  it("rechaza tipo de unidad inválido", () =>
    expect(() => ins("unidades", { tipo: "gerncia", nombre: "X" })).toThrow(/CHECK/));

  it("rechaza correo duplicado sin importar mayúsculas ni espacios", () => {
    ins("trabajadores", { nombre: "A", correo: "ana@x.cl", unidad_id: u });
    expect(() => ins("trabajadores", { nombre: "B", correo: " ANA@x.cl ", unidad_id: u })).toThrow(/UNIQUE/);
  });

  it("permite reutilizar el correo de un trabajador borrado", () => {
    ins("trabajadores", { nombre: "A", correo: "ana@x.cl", unidad_id: u, deleted_at: AHORA });
    expect(() => ins("trabajadores", { nombre: "B", correo: "ana@x.cl", unidad_id: u })).not.toThrow();
  });

  it("rechaza dos aprobadores en la misma actividad", () => {
    const { a, t1, t2 } = actividadConPersonas();
    ins("actividad_roles", { actividad_id: a, trabajador_id: t1, rol: "A" });
    expect(() => ins("actividad_roles", { actividad_id: a, trabajador_id: t2, rol: "A" })).toThrow(/UNIQUE/);
  });

  it("rechaza dos roles para la misma persona en una actividad", () => {
    const { a, t1 } = actividadConPersonas();
    ins("actividad_roles", { actividad_id: a, trabajador_id: t1, rol: "R" });
    expect(() => ins("actividad_roles", { actividad_id: a, trabajador_id: t1, rol: "C" })).toThrow(/UNIQUE/);
  });

  it("rechaza conexión de una unidad consigo misma", () =>
    expect(() => ins("conexiones", { origen_id: u, destino_id: u })).toThrow(/CHECK/));

  it("FK diferida: permite insertar hijo antes que padre dentro de una transacción", () => {
    const nueva = randomUUID();
    db.exec("BEGIN");
    ins("trabajadores", { nombre: "Ana", unidad_id: nueva });
    ins("unidades", { id: nueva, tipo: "area", nombre: "Logística", parent_id: u });
    expect(() => db.exec("COMMIT")).not.toThrow();
  });

  it("rechaza id nulo", () =>
    expect(() => ins("unidades", { id: null, tipo: "area", nombre: "X" })).toThrow(/NOT NULL/));

  it("acepta varias personas con correo vacío", () => {
    ins("trabajadores", { nombre: "A", correo: "", unidad_id: u });
    expect(() => ins("trabajadores", { nombre: "B", correo: "  ", unidad_id: u })).not.toThrow();
  });

  it("toda clave foránea tiene un índice completo que empieza por ella", () => {
    const tablas = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
      name: string;
    }[];
    const sinIndice: string[] = [];
    for (const { name } of tablas) {
      const fks = db.prepare('SELECT "from" AS col FROM pragma_foreign_key_list(?)').all(name) as {
        col: string;
      }[];
      const indices = db.prepare("SELECT name FROM pragma_index_list(?) WHERE partial = 0").all(name) as {
        name: string;
      }[];
      const primeras = indices.map(
        (i) =>
          (
            db.prepare("SELECT name FROM pragma_index_info(?) WHERE seqno = 0").get(i.name) as {
              name: string;
            }
          )?.name,
      );
      for (const { col } of fks) if (!primeras.includes(col)) sinIndice.push(`${name}.${col}`);
    }
    expect(sinIndice).toEqual([]);
  });

  it("FK diferida: falla al confirmar si el padre no existe", () => {
    db.exec("BEGIN");
    ins("trabajadores", { nombre: "Ana", unidad_id: randomUUID() });
    expect(() => db.exec("COMMIT")).toThrow(/FOREIGN KEY/);
    db.exec("ROLLBACK");
  });
});
