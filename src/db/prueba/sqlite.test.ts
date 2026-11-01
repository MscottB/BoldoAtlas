import { describe, it, expect } from "vitest";
import { abrirBasePrueba } from "./sqlite";

describe("abrirBasePrueba imita las sentencias permitidas de db.rs", () => {
  it.each(["DROP TABLE meta", "COMMIT", "PRAGMA foreign_keys = OFF", "/* x */ DELETE FROM meta"])(
    "aplicar rechaza %s y no deja nada a medias",
    (sql) => {
      const base = abrirBasePrueba();
      const borrar = { sql: "DELETE FROM meta" };
      expect(() => base.aplicar([borrar, { sql }])).toThrow(/no permitida/);
      expect(base.consultar("SELECT clave FROM meta")).toHaveLength(1);
    },
  );

  it.each(["PRAGMA user_version", "ATTACH ':memory:' AS y"])("consultar rechaza %s", (sql) =>
    expect(() => abrirBasePrueba().consultar(sql)).toThrow(/no permitida/),
  );

  it("acepta lo que usa la app, sin importar mayúsculas ni espacios", () => {
    const base = abrirBasePrueba();
    base.aplicar([{ sql: "  insert INTO meta (clave, valor) VALUES ('a', 'b')" }]);
    expect(base.consultar("\n with x AS (SELECT valor FROM meta WHERE clave = 'a') SELECT * FROM x")).toEqual(
      [{ valor: "b" }],
    );
  });
});
