import { describe, it, expect } from "vitest";
import { traducirError } from "./errores";

describe("traducirError", () => {
  it.each([
    ["UNIQUE constraint failed: index 'ux_trabajadores_correo'", "Ya existe una persona con ese correo."],
    ["UNIQUE constraint failed: index 'ux_etiquetas_nombre'", "Ya existe una etiqueta con ese nombre."],
    ["UNIQUE constraint failed: index 'ux_unidad_etiquetas'", "La unidad ya tiene esa etiqueta."],
    ["UNIQUE constraint failed: index 'ux_cargos_nombre'", "Ese valor ya existe en la lista."],
    ["UNIQUE constraint failed: index 'ux_tipos_contrato_nombre'", "Ese valor ya existe en la lista."],
    ["UNIQUE constraint failed: index 'ux_sedes_nombre'", "Ese valor ya existe en la lista."],
    ["UNIQUE constraint failed: index 'ux_jornadas_nombre'", "Ese valor ya existe en la lista."],
    [
      "CHECK constraint failed: estado = 'vacante' OR length(trim(coalesce(nombre, ''))) > 0",
      "Falta el nombre de la persona.",
    ],
    ["CHECK constraint failed: estado = 'activo' OR cargo_id IS NOT NULL", "Una vacante necesita un cargo."],
    ["CHECK constraint failed: origen_id <> destino_id", "Una unidad no puede conectarse consigo misma."],
    ["FOREIGN KEY constraint failed", "La unidad o persona relacionada ya no existe."],
  ])("traduce %s", (texto, esperado) => {
    expect(traducirError(texto)).toBe(esperado);
  });

  it("acepta un Error con el texto de SQLite", () => {
    expect(traducirError(new Error("UNIQUE constraint failed: index 'ux_sedes_nombre'"))).toBe(
      "Ese valor ya existe en la lista.",
    );
  });

  it("no confunde el CHECK de nombre de un catálogo con el de la persona", () => {
    const texto = "CHECK constraint failed: length(trim(nombre)) > 0";
    expect(traducirError(texto)).toBe(texto);
  });

  it("devuelve tal cual un texto desconocido, sin ocultarlo", () => {
    expect(traducirError("disk I/O error")).toBe("disk I/O error");
    expect(traducirError(new Error("database is locked"))).toBe("database is locked");
  });

  it("convierte cualquier otro valor con String", () => {
    expect(traducirError(42)).toBe("42");
  });
});
