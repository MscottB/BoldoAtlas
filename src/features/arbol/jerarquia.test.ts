import { describe, expect, it } from "vitest";
import { a, asignaciones, p, puestos, u, unidades } from "./fixture";
import {
  creaCiclo,
  descendientes,
  dotacion,
  dotacionPorUnidad,
  gerenciaYArea,
  hijos,
  indexar,
  indiceHijos,
  jefeVisible,
  marcaHeredada,
  ruta,
  rutaTexto,
  unidadesDePersona,
  vigentesPorPuesto,
} from "./jerarquia";

const BORRADO = "2026-01-01T00:00:00.000Z";

describe("jerarquía", () => {
  it("indexar indexa por id", () => {
    expect(indexar(unidades).get("mecanica")?.nombre).toBe("Mecánica");
  });

  it("hijos ordena por orden y luego nombre, e ignora borradas", () => {
    expect(hijos(unidades, "gg").map((x) => x.id)).toEqual(["operaciones", "finanzas"]);
    expect(hijos(unidades, "mantencion").map((x) => x.id)).toEqual(["electrica", "mecanica"]);
  });

  it("ruta y rutaTexto van de la raíz a la unidad", () => {
    expect(ruta(unidades, "mecanica").map((x) => x.id)).toEqual([
      "gg",
      "operaciones",
      "mantencion",
      "mecanica",
    ]);
    expect(rutaTexto(unidades, "mecanica")).toBe("Gerencia General › Operaciones › Mantención › Mecánica");
  });

  it("descendientes no incluye la propia unidad ni las borradas", () => {
    expect(descendientes(unidades, "operaciones")).toEqual(new Set(["mantencion", "mecanica", "electrica"]));
  });

  it("creaCiclo detecta mover bajo sí misma o bajo un descendiente", () => {
    expect(creaCiclo(unidades, "operaciones", "mecanica")).toBe(true);
    expect(creaCiclo(unidades, "mecanica", "finanzas")).toBe(false);
    expect(creaCiclo(unidades, "x", "x")).toBe(true);
    expect(creaCiclo(unidades, "gg", null)).toBe(false);
  });

  it("dotacion cuenta puestos con titular vigente (directos y de la rama) y vacantes de la rama", () => {
    // p6 tiene solo un reemplazo vigente y p2 solo un titular cerrado: son vacantes y no suman dotación.
    expect(dotacion(unidades, puestos, asignaciones, "mantencion")).toEqual({
      directa: 1,
      total: 5,
      vacantes: 1,
    });
    expect(dotacion(unidades, puestos, asignaciones, "gg")).toEqual({ directa: 1, total: 6, vacantes: 2 });
  });

  it("dotacionPorUnidad da lo mismo que dotacion para cada unidad viva, en una pasada", () => {
    const ps = [...puestos, { ...p("p9", "mecanica"), deleted_at: BORRADO }];
    const as = [...asignaciones, a("a9", "p9", "t9"), { ...a("a10", "p6", "t9"), deleted_at: BORRADO }];
    const todas = dotacionPorUnidad(unidades, ps, as);
    const vivas = unidades.filter((x) => !x.deleted_at);
    expect([...todas.keys()].sort()).toEqual(vivas.map((x) => x.id).sort());
    for (const x of vivas) expect(todas.get(x.id)).toEqual(dotacion(unidades, ps, as, x.id));
  });

  it("dotacion ignora puestos y asignaciones borrados", () => {
    const ps = [...puestos, { ...p("p9", "mantencion"), deleted_at: BORRADO }];
    const as = [...asignaciones, a("a9", "p9", "t9"), { ...a("a10", "p6", "t9"), deleted_at: BORRADO }];
    expect(dotacion(unidades, ps, as, "mantencion")).toEqual({ directa: 1, total: 5, vacantes: 1 });
  });

  it("gerenciaYArea deriva gerencia, área y subárea de los ancestros", () => {
    expect(gerenciaYArea(unidades, "mecanica")).toEqual({
      gerencia: "Operaciones",
      area: "Mantención",
      subarea: "Mecánica",
    });
    expect(gerenciaYArea(unidades, "finanzas")).toEqual({ gerencia: "Finanzas", area: null, subarea: null });
  });
});

describe("puestos y asignaciones", () => {
  const conJefe = (jefe_puesto_id: string | null) => ({ ...u("x", "area", "X", null), jefe_puesto_id });

  it("vigentesPorPuesto ignora las cerradas y las borradas", () => {
    const v = vigentesPorPuesto([...asignaciones, { ...a("a9", "p2", "t9"), deleted_at: BORRADO }]);
    expect(v.get("p2")).toBeUndefined();
    expect(v.get("p6")).toEqual({ reemplazo: asignaciones[5] });
    expect(v.get("p1")).toEqual({ titular: asignaciones[0] });
  });

  it("jefeVisible: el titular vigente del puesto de jefatura o, si no hay, su reemplazo vigente", () => {
    const v = vigentesPorPuesto([...asignaciones, a("a9", "p1", "t9", "reemplazo")]);
    expect(jefeVisible(conJefe("p1"), v)?.trabajador_id).toBe("t1");
    expect(jefeVisible(conJefe("p6"), v)).toMatchObject({ trabajador_id: "t3", tipo: "reemplazo" });
    expect(jefeVisible(conJefe("p2"), v)).toBeNull();
    expect(jefeVisible(conJefe(null), v)).toBeNull();
  });

  it("unidadesDePersona: unidades de sus asignaciones vigentes, sin repetir ni contar las cerradas", () => {
    expect(unidadesDePersona(puestos, asignaciones, "t3")).toEqual(["mantencion", "mecanica"]);
    expect(unidadesDePersona(puestos, asignaciones, "t2")).toEqual([]);
    const otroEnMecanica = [...asignaciones, a("a9", "p5", "t4", "reemplazo")];
    expect(unidadesDePersona(puestos, otroEnMecanica, "t4")).toEqual(["mecanica"]);
    const borrado = [...puestos.slice(0, 2), { ...p("p3", "mantencion"), deleted_at: BORRADO }];
    expect(unidadesDePersona(borrado, asignaciones, "t3")).toEqual([]);
  });
});

describe("marcaHeredada", () => {
  const marcadas = unidades.map((x) =>
    x.id === "operaciones"
      ? { ...x, marca_color: "#c2410c", marca_codigo: "OPE" }
      : x.id === "mecanica"
        ? { ...x, marca_color: "#2563eb", marca_codigo: null }
        : x,
  );

  it("toma la unidad más cercana hacia arriba, incluida ella misma, con marca y del nivel pedido", () => {
    expect(marcaHeredada(marcadas, "mecanica", "cualquiera")).toEqual({ color: "#2563eb", codigo: null });
    expect(marcaHeredada(marcadas, "mecanica", "gerencia")).toEqual({ color: "#c2410c", codigo: "OPE" });
    expect(marcaHeredada(marcadas, "operaciones", "gerencia")).toEqual({ color: "#c2410c", codigo: "OPE" });
    expect(marcaHeredada(marcadas, "electrica", "cualquiera")).toEqual({ color: "#c2410c", codigo: "OPE" });
  });

  it("null si ninguna unidad de ese nivel en la ruta tiene marca", () => {
    expect(marcaHeredada(marcadas, "mecanica", "area")).toBeNull();
    expect(marcaHeredada(marcadas, "finanzas", "gerencia")).toBeNull();
    expect(marcaHeredada(marcadas, "gg", "cualquiera")).toBeNull();
  });
});

describe("indiceHijos", () => {
  it("agrupa igual que hijos para cada unidad y para las raíces", () => {
    const indice = indiceHijos(unidades);
    for (const x of unidades) expect(indice.get(x.id) ?? []).toEqual(hijos(unidades, x.id));
    expect(indice.get(null)?.map((x) => x.id)).toEqual(["gg"]);
  });
});
