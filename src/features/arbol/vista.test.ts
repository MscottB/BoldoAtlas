import { describe, expect, it } from "vitest";
import type { Leyenda } from "@/db/tipos";
import { CRITERIO_LEYENDA, VISTA_POR_DEFECTO, leerVista, leyendasEnUso, tipoDeMarca } from "./vista";

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

  it("colorearPor: acepta la leyenda del puesto y no la confunde con una marca", () => {
    expect(CRITERIO_LEYENDA).toBe("leyenda");
    expect(leerVista({ colorearPor: "leyenda" }).colorearPor).toBe("leyenda");
    expect(leerVista({ colorearPor: "leyenda:x" }).colorearPor).toBe("ninguno");
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

describe("leyendasEnUso", () => {
  const ley = (id: string, nombre: string, orden: number, deleted_at: string | null = null): Leyenda => ({
    id,
    nombre,
    color: "#be123c",
    descripcion: null,
    orden,
    deleted_at,
  });
  const leyendas = [
    ley("a", "Crítico", 1),
    ley("b", "En sucesión", 2),
    ley("c", "Clave", 3),
    ley("d", "Antigua", 4, "x"),
  ];

  it("solo las entradas que usan los puestos dibujados, una vez y en el orden de la lista", () => {
    const puestos = [{ leyenda_id: "c" }, { leyenda_id: null }, { leyenda_id: "a" }, { leyenda_id: "c" }];
    expect(leyendasEnUso(puestos, leyendas).map((l) => l.id)).toEqual(["a", "c"]);
  });

  it("incluye una entrada desactivada mientras algún puesto la use", () => {
    expect(leyendasEnUso([{ leyenda_id: "d" }], leyendas).map((l) => l.id)).toEqual(["d"]);
  });

  it("ignora una leyenda que no existe y no devuelve nada sin puestos", () => {
    expect(leyendasEnUso([{ leyenda_id: "zzz" }], leyendas)).toEqual([]);
    expect(leyendasEnUso([], leyendas)).toEqual([]);
  });
});
