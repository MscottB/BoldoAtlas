import { afterEach, describe, expect, it } from "vitest";
import { cambiarIdioma, i18n } from "@/i18n";
import { frase } from "./frases";
import type { AccionBreve, FilaBreve } from "./tipos";

const t = i18n.global.t;
afterEach(() => cambiarIdioma("es"));

const fila = (extra: Partial<FilaBreve> = {}): FilaBreve => ({
  tabla: "unidades",
  fila_id: "u1",
  op: "update",
  campos: [],
  nombre: "Ventas",
  nombre_antes: null,
  nombre_despues: null,
  elimina: false,
  ...extra,
});
const accion = (muestra: FilaBreve[], extra: Partial<AccionBreve> = {}): AccionBreve => ({
  id: "a1",
  fecha: "2026-11-18T10:00:00Z",
  origen: "app",
  datos: {},
  estado: "hecha",
  bloqueada: false,
  filas: muestra.length,
  muestra,
  ...extra,
});
const de = (f: Partial<FilaBreve>, extra?: Partial<AccionBreve>) => frase(accion([fila(f)], extra), t);

describe("frase", () => {
  it("crear", () => {
    expect(de({ op: "insert" })).toBe("Creaste la unidad Ventas");
    expect(de({ op: "insert", tabla: "trabajadores", nombre: "Ana" })).toBe("Creaste a Ana");
  });

  it("eliminar y restaurar según cómo queda deleted_at", () => {
    expect(de({ campos: ["deleted_at", "updated_at"], elimina: true })).toBe("Eliminaste la unidad Ventas");
    expect(de({ campos: ["deleted_at", "updated_at"] })).toBe("Restauraste la unidad Ventas");
    expect(de({ op: "delete", tabla: "unidad_etiquetas", nombre: null })).toBe(
      "Eliminaste una etiqueta de una unidad",
    );
  });

  it("mover, renombrar y cambiar", () => {
    expect(de({ campos: ["parent_id", "updated_at"] })).toBe("Moviste Ventas");
    expect(de({ campos: ["nombre"], nombre_antes: "Ventas", nombre_despues: "Ventas Norte" })).toBe(
      "Renombraste Ventas a Ventas Norte",
    );
    expect(de({ campos: ["color"] })).toBe("Cambiaste Ventas");
    expect(de({ tabla: "conexiones", campos: ["etiqueta"], nombre: null })).toBe("Cambiaste una conexión");
  });

  it("con varias filas, cuántas más", () => {
    expect(frase(accion([fila({ op: "insert" })], { filas: 4 }), t)).toBe(
      "Creaste la unidad Ventas y 3 cambios más",
    );
    expect(frase(accion([fila({ op: "insert" })], { filas: 2 }), t)).toBe(
      "Creaste la unidad Ventas y 1 cambio más",
    );
  });

  it("importar y revisar dicen el archivo y los cambios", () => {
    const a = accion([fila()], { origen: "importar", datos: { archivo: "ventas.boldo" }, filas: 12 });
    expect(frase(a, t)).toBe("Importaste ventas.boldo: 12 cambios");
    expect(frase({ ...a, origen: "revisar" }, t)).toBe("Importaste ventas.boldo: 12 cambios");
  });

  it("suprimir conserva el nombre real, no el relleno", () => {
    const f = fila({
      tabla: "trabajadores",
      campos: ["nombre"],
      nombre: "Juan Pérez",
      nombre_antes: "Juan Pérez",
      nombre_despues: "Persona suprimida",
    });
    expect(frase(accion([f], { origen: "suprimir", bloqueada: true }), t)).toBe(
      "Borraste definitivamente a Juan Pérez",
    );
  });

  it("en inglés", () => {
    cambiarIdioma("en");
    expect(de({ op: "insert" })).toBe("You created the unit Ventas");
    expect(de({ campos: ["nombre"], nombre_antes: "Ventas", nombre_despues: "Norte" }, { filas: 3 })).toBe(
      "You renamed Ventas to Norte and 2 more changes",
    );
  });
});
