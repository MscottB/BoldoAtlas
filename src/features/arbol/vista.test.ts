import { describe, expect, it } from "vitest";
import { VISTA_POR_DEFECTO, leerVista, tipoDeMarca } from "./vista";

describe("leerVista", () => {
  it("sin datos o con basura devuelve los valores por defecto", () => {
    for (const crudo of [null, undefined, 3, "x", [], true])
      expect(leerVista(crudo)).toEqual(VISTA_POR_DEFECTO);
    expect(VISTA_POR_DEFECTO.verPuestos).toBe(false);
  });

  it("acepta una configuración válida y descarta claves desconocidas", () => {
    const v = {
      verPuestos: true,
      mostrarCargo: false,
      mostrarPersona: true,
      rutaTipos: ["a", "b"],
      colorearPor: "marca:a",
      leyenda: false,
    };
    expect(leerVista({ ...v, otra: 1 })).toEqual(v);
  });

  it("cada campo inválido vuelve a su valor por defecto sin afectar a los demás", () => {
    const r = leerVista({
      verPuestos: "si",
      mostrarCargo: false,
      rutaTipos: ["a", 2],
      colorearPor: "rojo",
      leyenda: 0,
    });
    expect(r).toEqual({ ...VISTA_POR_DEFECTO, mostrarCargo: false });
  });

  it("colorearPor: acepta ninguno y marca:<tipo>, rechaza lo demás", () => {
    expect(leerVista({ colorearPor: "ninguno" }).colorearPor).toBe("ninguno");
    expect(leerVista({ colorearPor: "marca:" }).colorearPor).toBe("ninguno");
    expect(leerVista({ colorearPor: "otro:a" }).colorearPor).toBe("ninguno");
  });
});

describe("tipoDeMarca", () => {
  const enUso = [{ id: "g" }, { id: "a" }];
  it("devuelve el tipo si está en uso", () => expect(tipoDeMarca("marca:g", enUso)).toBe("g"));
  it("null si no se colorea, el tipo ya no se usa o el criterio es otro", () => {
    expect(tipoDeMarca("ninguno", enUso)).toBeNull();
    expect(tipoDeMarca("marca:z", enUso)).toBeNull();
    expect(tipoDeMarca("leyenda", enUso)).toBeNull();
  });
});
