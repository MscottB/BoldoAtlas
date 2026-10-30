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
  const t1 = ins("trabajadores", { nombre: "Ana" });
  const t2 = ins("trabajadores", { nombre: "Beto" });
  return { a, t1, t2 };
}

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(SQL);
  u = ins("unidades", { tipo: "gerencia", nombre: "Operaciones" });
});

describe("esquema 0001", () => {
  it("rechaza persona sin nombre", () =>
    expect(() => ins("trabajadores", { correo: "ana@x.cl" })).toThrow(
      /NOT NULL constraint failed: trabajadores.nombre/,
    ));

  it("cargos rechaza un nombre repetido sin importar mayúsculas ni espacios", () => {
    ins("cargos", { nombre: "analista" });
    expect(() => ins("cargos", { nombre: " ANALISTA " })).toThrow(/UNIQUE/);
  });

  it("cargos acepta el nombre de uno desactivado", () => {
    ins("cargos", { nombre: "analista", deleted_at: AHORA });
    expect(() => ins("cargos", { nombre: " ANALISTA " })).not.toThrow();
  });

  it("puestos.cargo_id inexistente falla al confirmar", () => {
    db.exec("BEGIN");
    ins("puestos", { unidad_id: u, cargo_id: randomUUID() });
    expect(() => db.exec("COMMIT")).toThrow(/FOREIGN KEY/);
    db.exec("ROLLBACK");
  });

  it("rechaza tipo de unidad inválido", () =>
    expect(() => ins("unidades", { tipo: "gerncia", nombre: "X" })).toThrow(/CHECK/));

  it("rechaza correo duplicado sin importar mayúsculas ni espacios", () => {
    ins("trabajadores", { nombre: "A", correo: "ana@x.cl" });
    expect(() => ins("trabajadores", { nombre: "B", correo: " ANA@x.cl " })).toThrow(/UNIQUE/);
  });

  it("permite reutilizar el correo de un trabajador borrado", () => {
    ins("trabajadores", { nombre: "A", correo: "ana@x.cl", deleted_at: AHORA });
    expect(() => ins("trabajadores", { nombre: "B", correo: "ana@x.cl" })).not.toThrow();
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
    ins("puestos", { unidad_id: nueva, cargo_id: ins("cargos", { nombre: "Analista" }) });
    ins("unidades", { id: nueva, tipo: "area", nombre: "Logística", parent_id: u });
    expect(() => db.exec("COMMIT")).not.toThrow();
  });

  it("rechaza id nulo", () =>
    expect(() => ins("unidades", { id: null, tipo: "area", nombre: "X" })).toThrow(/NOT NULL/));

  it("acepta varias personas con correo vacío", () => {
    ins("trabajadores", { nombre: "A", correo: "" });
    expect(() => ins("trabajadores", { nombre: "B", correo: "  " })).not.toThrow();
  });

  it("subarboles_guardados: un segundo subárbol activo de la misma unidad falla y tras quitarlo se puede volver a guardar", () => {
    const primero = ins("subarboles_guardados", { unidad_id: u });
    expect(() => ins("subarboles_guardados", { unidad_id: u })).toThrow(/UNIQUE/);
    db.prepare("UPDATE subarboles_guardados SET deleted_at = ? WHERE id = ?").run(AHORA, primero);
    expect(() => ins("subarboles_guardados", { unidad_id: u })).not.toThrow();
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
    ins("puestos", { unidad_id: randomUUID(), cargo_id: ins("cargos", { nombre: "Analista" }) });
    expect(() => db.exec("COMMIT")).toThrow(/FOREIGN KEY/);
    db.exec("ROLLBACK");
  });

  describe("puestos y asignaciones", () => {
    let puesto: string;
    let ana: string;
    let beto: string;
    const asignar = (fila: Record<string, string | null>) =>
      ins("asignaciones", {
        puesto_id: puesto,
        trabajador_id: ana,
        tipo: "titular",
        desde: "2026-01-01",
        ...fila,
      });

    beforeEach(() => {
      puesto = ins("puestos", { unidad_id: u, cargo_id: ins("cargos", { nombre: "Analista" }) });
      ana = ins("trabajadores", { nombre: "Ana" });
      beto = ins("trabajadores", { nombre: "Beto" });
    });

    it("rechaza un segundo titular vigente en el mismo puesto", () => {
      asignar({});
      expect(() => asignar({ trabajador_id: beto })).toThrow(/UNIQUE/);
    });

    it("rechaza un segundo reemplazo vigente, pero un titular y un reemplazo vigentes conviven", () => {
      asignar({});
      expect(() => asignar({ trabajador_id: beto, tipo: "reemplazo" })).not.toThrow();
      expect(() => asignar({ tipo: "reemplazo" })).toThrow(/UNIQUE/);
    });

    it("un titular cerrado y uno vigente conviven; también uno vigente borrado", () => {
      asignar({ hasta: "2026-03-01" });
      asignar({ trabajador_id: beto, deleted_at: AHORA });
      expect(() => asignar({ trabajador_id: beto, desde: "2026-03-01" })).not.toThrow();
    });

    it("rechaza hasta anterior a desde y acepta el mismo día", () => {
      expect(() => asignar({ hasta: "2025-12-31" })).toThrow(/CHECK/);
      expect(() => asignar({ hasta: "2026-01-01" })).not.toThrow();
    });

    it("rechaza un tipo de asignación inválido", () =>
      expect(() => asignar({ tipo: "interino" })).toThrow(/CHECK/));

    it("marca_codigo admite hasta 4 caracteres", () => {
      expect(() =>
        ins("unidades", { tipo: "area", nombre: "A", marca_color: "#c2410c", marca_codigo: "OPER" }),
      ).not.toThrow();
      expect(() => ins("unidades", { tipo: "area", nombre: "B", marca_codigo: "OPERA" })).toThrow(/CHECK/);
    });

    it("jefe_puesto_id apunta a un puesto existente", () => {
      expect(() => ins("unidades", { tipo: "area", nombre: "A", jefe_puesto_id: puesto })).not.toThrow();
      db.exec("BEGIN");
      ins("unidades", { tipo: "area", nombre: "B", jefe_puesto_id: randomUUID() });
      expect(() => db.exec("COMMIT")).toThrow(/FOREIGN KEY/);
      db.exec("ROLLBACK");
    });
  });
});
