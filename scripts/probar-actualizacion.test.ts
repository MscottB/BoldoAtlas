import { describe, expect, it } from "vitest";
import { problemas } from "./probar-actualizacion.mjs";

const entrada = { id: "abc", ruta: "boldo.db", nombre: "Prueba CI" };
const BIEN = {
  lista: { organizaciones: [entrada] },
  dbId: "abc",
  nombre: "Prueba CI",
  unidades: ["Unidad de prueba CI"],
  respaldo: true,
  dbIdAntes: "abc",
};

describe("problemas", () => {
  it("nada si la organización sigue igual, con o sin db_id previo", () => {
    expect(problemas(BIEN)).toEqual([]);
    expect(problemas({ ...BIEN, dbIdAntes: null })).toEqual([]);
  });

  it("dice cada cosa que falla", () => {
    expect(problemas({ ...BIEN, lista: {} })).toHaveLength(4);
    const lejos = { organizaciones: [{ ...entrada, ruta: "organizaciones/x/organizacion.db" }] };
    expect(problemas({ ...BIEN, lista: lejos })).toEqual([expect.stringContaining("boldo.db")]);
    expect(problemas({ ...BIEN, dbId: "otro" })).toHaveLength(2);
    expect(problemas({ ...BIEN, nombre: null, unidades: [], respaldo: false })).toHaveLength(3);
  });
});
