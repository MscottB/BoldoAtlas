import { describe, it, expect } from "vitest";
import { abrirBasePrueba } from "@/db/prueba/sqlite";
import { guardarMeta } from "./meta";

describe("meta", () => {
  it("inserta y luego reemplaza la clave", () => {
    const bd = abrirBasePrueba();
    const valor = () => bd.consultar<{ valor: string }>("SELECT valor FROM meta WHERE clave = 'org_nombre'");
    bd.aplicar(guardarMeta("org_nombre", "X"));
    expect(valor()).toEqual([{ valor: "X" }]);
    bd.aplicar(guardarMeta("org_nombre", "Y"));
    expect(valor()).toEqual([{ valor: "Y" }]);
  });

  it("la base de prueba imita db_lote: cada lote sube data_revision y uno fallido no la toca", () => {
    const bd = abrirBasePrueba();
    const rev = () =>
      bd.consultar<{ valor: string }>("SELECT valor FROM meta WHERE clave = 'data_revision'")[0].valor;
    bd.aplicar(guardarMeta("org_nombre", "X"));
    expect(rev()).toBe("1");
    expect(() =>
      bd.aplicar([...guardarMeta("org_nombre", "Z"), { sql: "INSERT INTO nada VALUES (1)" }]),
    ).toThrow();
    expect(rev()).toBe("1");
    expect(
      bd.consultar<{ valor: string }>("SELECT valor FROM meta WHERE clave = 'org_nombre'")[0].valor,
    ).toBe("X");
  });
});
