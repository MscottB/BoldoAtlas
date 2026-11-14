import { describe, expect, it } from "vitest";
import { generarArbolFalso } from "@/dev/arbolFalso";
import { contraste, marcaTenue, textoSobre } from "@/features/tema/tema";
import { a, asignaciones, p, puestos, u, unidades } from "./fixture";
import { dotacionPorUnidad, vigentesPorPuesto } from "./jerarquia";
import {
  COLOR_NEUTRO,
  COLORES_ESCALA,
  LIMITES,
  aniosCumplidos,
  clasesEnUso,
  etiquetaEscala,
  escalaPorTarjeta,
  rango,
  textoEscala,
} from "./escala";

describe("rango", () => {
  it("antigüedad: el límite inferior entra, el superior no", () => {
    const r = (v: number) => rango(v, LIMITES.antiguedad);
    expect([0, 0.99, 1, 2, 3, 4, 5, 9, 10, 40].map(r)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });

  it("personas a cargo: 1 a 5, 6 a 15, 16 a 50, 51 a 200, más de 200", () => {
    const r = (v: number) => rango(v, LIMITES.aCargo);
    expect([1, 5, 6, 15, 16, 50, 51, 200, 201, 5000].map(r)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });
});

describe("aniosCumplidos", () => {
  it("cuenta años completos, exacto en el aniversario", () => {
    expect(aniosCumplidos("2020-06-15", "2023-06-14")).toBe(2);
    expect(aniosCumplidos("2020-06-15", "2023-06-15")).toBe(3);
    expect(aniosCumplidos("2020-06-15", "2020-06-15")).toBe(0);
  });

  it("un desde posterior a la fecha que se ve cuenta como cero, no negativo", () => {
    expect(aniosCumplidos("2027-01-01", "2026-11-14")).toBe(0);
  });

  it("entrado un 29 de febrero, cumple el 1 de marzo en los años no bisiestos", () => {
    expect(aniosCumplidos("2020-02-29", "2021-02-28")).toBe(0);
    expect(aniosCumplidos("2020-02-29", "2021-03-01")).toBe(1);
    expect(aniosCumplidos("2020-02-29", "2024-02-29")).toBe(4);
  });
});

// Mantención (p3) con jefatura titular; Mecánica con jefatura en p6 (solo reemplazo); Finanzas con p2 vacante; GG sin jefatura.
const conJefes = unidades.map((x) =>
  x.id === "mantencion"
    ? { ...x, jefe_puesto_id: "p3" }
    : x.id === "mecanica"
      ? { ...x, jefe_puesto_id: "p6" }
      : x.id === "finanzas"
        ? { ...x, jefe_puesto_id: "p2" }
        : x,
);
const antiguas = asignaciones.map((x) => (x.id === "a3" ? { ...x, desde: "2020-03-01" } : x));
const vigentes = vigentesPorPuesto(antiguas);
const dotaciones = dotacionPorUnidad(conJefes, puestos, antiguas);

describe("escalaPorTarjeta: antigüedad", () => {
  const m = escalaPorTarjeta("antiguedad", conJefes, puestos, vigentes, dotaciones, "2026-11-14");

  it("cada puesto por los años de su titular; sin titular, vacante (un reemplazo no cuenta)", () => {
    expect(m.get("p3")).toEqual({ valor: 6, rango: 3 });
    expect(m.get("p4")).toEqual({ valor: 0, rango: 0 });
    expect(m.get("p6")).toEqual({ aparte: "vacante" });
    expect(m.get("p2")).toEqual({ aparte: "vacante" });
  });

  it("la unidad, por el titular de su jefatura; sin titular, vacante; sin jefatura, aparte", () => {
    expect(m.get("mantencion")).toEqual({ valor: 6, rango: 3 });
    expect(m.get("mecanica")).toEqual({ aparte: "vacante" });
    expect(m.get("finanzas")).toEqual({ aparte: "vacante" });
    expect(m.get("gg")).toEqual({ aparte: "sinJefatura" });
  });

  it("se mide a la fecha que se ve", () => {
    const antes = escalaPorTarjeta("antiguedad", conJefes, puestos, vigentes, dotaciones, "2023-03-01");
    expect(antes.get("p3")).toEqual({ valor: 3, rango: 2 });
  });
});

describe("escalaPorTarjeta: personas a cargo", () => {
  const m = escalaPorTarjeta("aCargo", conJefes, puestos, vigentes, dotaciones, "2026-11-14");

  it("la dotación total de la rama menos el jefe titular, en la unidad y en su puesto de jefatura", () => {
    // Rama de Mantención: 5 con titular (p3, p4, p5, p7, p8); su jefe es p3.
    expect(m.get("mantencion")).toEqual({ valor: 4, rango: 0 });
    expect(m.get("p3")).toEqual({ valor: 4, rango: 0 });
  });

  it("con la jefatura en reemplazo nadie se descuenta (el reemplazo no suma a la dotación)", () => {
    expect(m.get("mecanica")).toEqual({ valor: 2, rango: 0 });
  });

  it("sin jefe, aparte; los demás puestos no se colorean", () => {
    expect(m.get("gg")).toEqual({ aparte: "sinJefatura" });
    expect(m.get("finanzas")).toEqual({ aparte: "sinJefatura" });
    expect(m.has("p4")).toBe(false);
  });

  it("un jefe sin nadie bajo él queda en «sin personas a cargo»", () => {
    const sola = [{ ...u("x", "t", "X", null), jefe_puesto_id: "px" }];
    const ps = [p("px", "x")];
    const as = [a("ax", "px", "tx")];
    const r = escalaPorTarjeta(
      "aCargo",
      sola,
      ps,
      vigentesPorPuesto(as),
      dotacionPorUnidad(sola, ps, as),
      "2026-11-14",
    );
    expect(r.get("x")).toEqual({ aparte: "sinPersonas" });
  });

  const aCargo = (us: ReturnType<typeof u>[], ps: ReturnType<typeof p>[], as: ReturnType<typeof a>[]) =>
    escalaPorTarjeta("aCargo", us, ps, vigentesPorPuesto(as), dotacionPorUnidad(us, ps, as), "2026-11-14");

  it("el jefe en reemplazo que es titular de otro puesto de la rama no se cuenta bajo sí mismo", () => {
    // 4 analistas; la jefatura está vacante y la cubre t1, titular de uno de esos puestos.
    const us = [{ ...u("x", "t", "X", null), jefe_puesto_id: "jx" }, u("hija", "t", "Hija", "x")];
    const ps = [p("jx", "x"), p("p1", "x"), p("p2", "x"), p("p3", "hija"), p("p4", "hija")];
    const as = [
      a("r", "jx", "t1", "reemplazo"),
      a("a1", "p1", "t1"),
      a("a2", "p2", "t2"),
      a("a3", "p3", "t3"),
      a("a4", "p4", "t4"),
    ];
    expect(aCargo(us, ps, as).get("x")).toEqual({ valor: 3, rango: 0 });
  });

  it("con la jefatura en un puesto de otra unidad, solo se descuenta al jefe si está en la dotación de la rama", () => {
    const us = [
      { ...u("y", "t", "Y", null), jefe_puesto_id: "jz" },
      u("z", "t", "Z", null),
      { ...u("w", "t", "W", null), jefe_puesto_id: "jw" },
    ];
    const ps = [p("jz", "z"), p("p1", "y"), p("p2", "y"), p("jw", "z"), p("p3", "w")];
    const as = [
      a("a0", "jz", "t0"),
      a("a1", "p1", "t1"),
      a("a2", "p2", "t2"),
      a("aw", "jw", "tw"),
      a("a3", "p3", "t3"),
    ];
    const r = aCargo(us, ps, as);
    expect(r.get("y")).toEqual({ valor: 2, rango: 0 });
    expect(r.get("w")).toEqual({ valor: 1, rango: 0 }); // una sola persona en la rama: no queda «sin personas a cargo»
  });
});

describe("clasesEnUso", () => {
  it("los rangos que aparecen, de menor a mayor, y después lo que va aparte", () => {
    const m = escalaPorTarjeta("antiguedad", conJefes, puestos, vigentes, dotaciones, "2026-11-14");
    expect(clasesEnUso(m, ["gg", "mantencion", "p4", "p6", "p5"])).toEqual([0, 3, "vacante", "sinJefatura"]);
    expect(clasesEnUso(m, ["p4"])).toEqual([0]);
    expect(clasesEnUso(m, ["no-existe"])).toEqual([]);
  });
});

describe("colores", () => {
  it("el texto sobre cada color de la escala y el neutro se lee (≥ 4,5:1)", () => {
    for (const c of [...COLORES_ESCALA, COLOR_NEUTRO])
      expect(contraste(textoSobre(c), c)).toBeGreaterThanOrEqual(4.5);
  });

  it("hay un color por rango, todos distintos del neutro", () => {
    expect(COLORES_ESCALA).toHaveLength(LIMITES.antiguedad.length + 1);
    expect(COLORES_ESCALA).toHaveLength(LIMITES.aCargo.length + 1);
    expect(COLORES_ESCALA).not.toContain(COLOR_NEUTRO);
  });

  it("los del medio se distinguen de la tarjeta en los dos temas (los extremos llevan contorno)", () => {
    for (const c of COLORES_ESCALA.slice(2, 4)) {
      expect(marcaTenue(c, false)).toBe(false);
      expect(marcaTenue(c, true)).toBe(false);
    }
  });
});

describe("rendimiento", () => {
  it("la organización grande (5.000 unidades y 20.000 puestos) se colorea al instante", () => {
    const { nodos } = generarArbolFalso(5000, 8, 7);
    const us = nodos.map((n) => ({ ...u(n.id, "t", n.nombre, n.padre), jefe_puesto_id: `${n.id}-0` }));
    const ps = nodos.flatMap((n) => [0, 1, 2, 3].map((i) => p(`${n.id}-${i}`, n.id)));
    const as = ps
      .filter((_, i) => i % 5)
      .map((x, i) => ({ ...a(`a${i}`, x.id, `t${i}`), desde: `20${10 + (i % 15)}-05-0${1 + (i % 8)}` }));
    const v = vigentesPorPuesto(as);
    const d = dotacionPorUnidad(us, ps, as);
    const t0 = performance.now();
    for (const c of ["antiguedad", "aCargo"] as const) {
      const m = escalaPorTarjeta(c, us, ps, v, d, "2026-11-14");
      clasesEnUso(m, m.keys());
    }
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(500); // solo atrapa algo desbocado; lo medido va en el informe
  });
});

describe("textoEscala", () => {
  it("la antigüedad en años; lo que va aparte, por su nombre; sin personas a cargo, «0 a cargo»", () => {
    expect(textoEscala("antiguedad", { valor: 3, rango: 2 })).toEqual({ clave: "arbol.vista.anios", n: 3 });
    expect(textoEscala("aCargo", { valor: 12, rango: 1 })).toEqual({
      clave: "arbol.vista.aCargoValor",
      n: 12,
    });
    expect(textoEscala("antiguedad", { aparte: "vacante" })).toEqual({
      clave: "arbol.vista.aparte.vacante",
      n: 0,
    });
    expect(textoEscala("aCargo", { aparte: "sinPersonas" })).toEqual({
      clave: "arbol.vista.aCargoValor",
      n: 0,
    });
  });
});

describe("etiquetaEscala", () => {
  const t = ((clave: string, nombrados?: Record<string, unknown>) =>
    nombrados ? `${clave}:${String(nombrados.n)}` : clave) as Parameters<typeof etiquetaEscala>[0];

  it("color del rango, valor escrito y nombre del criterio; sin valor o con otro criterio, nada", () => {
    expect(etiquetaEscala(t, "aCargo", { valor: 12, rango: 1 })).toEqual({
      color: COLORES_ESCALA[1],
      texto: "arbol.vista.aCargoValor:12",
      criterio: "arbol.vista.aCargo",
    });
    expect(etiquetaEscala(t, "antiguedad", { aparte: "vacante" })?.color).toBe(COLOR_NEUTRO);
    expect(etiquetaEscala(t, "antiguedad", undefined)).toBeNull();
    expect(etiquetaEscala(t, "leyenda", { valor: 1, rango: 0 })).toBeNull();
  });
});
