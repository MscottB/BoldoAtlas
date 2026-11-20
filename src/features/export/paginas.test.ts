import { describe, expect, it } from "vitest";
import {
  LETRA_MIN_PT,
  MARGEN,
  SOLAPE,
  areaUtil,
  cuadricula,
  escalaParaHoja,
  repartirPorRamas,
  type PaginaRamas,
} from "./paginas";
import { letraMinima } from "./treeSvg";

// Un árbol de prueba: id → hijas, en orden.
type Arbol = Record<string, string[]>;
const hijosDe = (a: Arbol) => (id: string) => a[id] ?? [];

// Las filas de tarjetas que dibuja una página: la raíz, sus hijas (o el tramo) y así hasta la profundidad.
function filas(a: Arbol, raiz: string, profundidad: number, hijas?: [number, number]): string[][] {
  const res = [[raiz]];
  let fila = profundidad > 0 ? hijosDe(a)(raiz).slice(...(hijas ?? [])) : [];
  for (let d = 1; d <= profundidad && fila.length; d++) {
    res.push(fila);
    fila = fila.flatMap(hijosDe(a));
  }
  return res;
}

// Un `medir` falso: cada tarjeta mide 160 × 100, y el dibujo es tan ancho como su fila más larga.
// En carta horizontal con letra de 8 pt caben 6 tarjetas a lo ancho y 6 filas a lo alto.
const medirFalso = (a: Arbol) => async (raiz: string, profundidad: number, hijas?: [number, number]) => {
  const f = filas(a, raiz, profundidad, hijas);
  return { ancho: 160 * Math.max(...f.map((x) => x.length)), alto: 100 * f.length };
};

const repartir = (a: Arbol, raiz = "r", medir = medirFalso(a)) =>
  repartirPorRamas(raiz, hijosDe(a), medir, "carta", "horizontal", "estructura");

// Una cadena r → n1 → n2 → … → n{largo}.
function cadena(largo: number): Arbol {
  const a: Arbol = { r: ["n1"] };
  for (let i = 1; i < largo; i++) a[`n${i}`] = [`n${i + 1}`];
  return a;
}

// Un árbol parejo: cada unidad con `ancho` hijas, hasta `alto` niveles bajo la raíz.
function parejo(ancho: number, alto: number): Arbol {
  const a: Arbol = {};
  const crecer = (id: string, d: number) => {
    if (d === alto) return;
    a[id] = Array.from({ length: ancho }, (_, i) => `${id}.${i}`);
    for (const h of a[id]) crecer(h, d + 1);
  };
  crecer("r", 0);
  return a;
}

describe("repartirPorRamas", () => {
  it("cabe_en_una_pagina", async () => {
    const a = parejo(2, 2);
    expect(await repartir(a)).toEqual([{ numero: 1, raiz: "r", profundidad: 2, sigue: [], viene: null }]);
  });

  it("rama_cortada_sigue_y_viene", async () => {
    // 9 filas: caben 6 (profundidad 5); n5 sigue en la página 2, que muestra n5, n6, n7 y n8.
    const p = await repartir(cadena(8));
    expect(p).toEqual([
      { numero: 1, raiz: "r", profundidad: 5, sigue: [{ unidad: "n5", pagina: 2 }], viene: null },
      { numero: 2, raiz: "n5", profundidad: 3, sigue: [], viene: 1 },
    ]);
  });

  it("sigue_y_viene_coinciden", async () => {
    // Muchas hijas (en partes) y, bajo una hoja, una cadena larga (páginas hondas que siguen).
    const a = parejo(8, 3);
    a["r.1.1.1"] = ["c1"];
    for (let i = 1; i < 12; i++) a[`c${i}`] = [`c${i + 1}`];
    const p = await repartir(a);
    expect(p.some((x) => x.hijas)).toBe(true);
    expect(p.some((x) => x.profundidad > 2)).toBe(true);
    const por = new Map(p.map((x) => [x.numero, x]));
    expect(p.map((x) => x.numero)).toEqual(p.map((_, i) => i + 1));
    for (const x of p) {
      for (const s of x.sigue) {
        const destino = por.get(s.pagina)!;
        expect(destino.raiz).toBe(s.unidad);
        expect(destino.viene).toBe(x.numero);
        // La unidad cortada se ve en la última fila de la página que la corta.
        const vistas = filas(a, x.raiz, x.profundidad, x.hijas && [x.hijas.desde, x.hijas.hasta]);
        expect(vistas[vistas.length - 1]).toContain(s.unidad);
      }
      if (x.viene !== null) expect(por.get(x.viene)!.sigue.map((s) => s.unidad)).toContain(x.raiz);
    }
    // Cada unidad se dibuja en alguna página.
    const vistas = new Set(
      p.flatMap((x) => filas(a, x.raiz, x.profundidad, x.hijas && [x.hijas.desde, x.hijas.hasta]).flat()),
    );
    expect(vistas.size).toBe(Object.values(a).flat().length + 1);
  });

  it("muchas_hijas_en_partes", async () => {
    const a: Arbol = { r: Array.from({ length: 15 }, (_, i) => `h${i}`) };
    const p = await repartir(a);
    expect(p.map((x) => [x.raiz, x.profundidad, x.hijas, x.viene])).toEqual([
      ["r", 1, { desde: 0, hasta: 6, parte: 1, partes: 3 }, null],
      ["r", 1, { desde: 6, hasta: 12, parte: 2, partes: 3 }, null],
      ["r", 1, { desde: 12, hasta: 15, parte: 3, partes: 3 }, null],
    ]);
  });

  it("numeracion_por_niveles", async () => {
    // Con una sola fila de hijas por página (cada una con 6 nietas), A y B quedan juntas antes que sus ramas.
    const seis = (id: string) => Array.from({ length: 6 }, (_, i) => `${id}${i}`);
    const a: Arbol = { r: ["A", "B"], A: ["A1"], B: ["B1"], A1: seis("A1"), B1: seis("B1") };
    for (const id of [...seis("A1"), ...seis("B1")]) a[id] = seis(id);
    const p = await repartir(a, "r", async (raiz, prof, h) => {
      const f = filas(a, raiz, prof, h);
      return {
        ancho: 160 * Math.max(...f.map((x) => x.length)),
        alto: 100 * f.length * (f.length > 2 ? 3 : 1),
      };
    });
    expect(p.map((x) => x.raiz)).toEqual(["r", "A", "B", "A1", "B1", ...seis("A1"), ...seis("B1")]);
    expect(p.find((x) => x.raiz === "A")!.sigue).toEqual([{ unidad: "A1", pagina: 4 }]);
  });

  it("rama_que_no_cabe_ni_sola_termina", async () => {
    const enorme = async () => ({ ancho: 1e7, alto: 1e7 });
    const a: Arbol = { r: ["a", "b"], a: ["a1"] };
    const p: PaginaRamas[] = await repartir(a, "r", enorme);
    expect(p.map((x) => [x.raiz, x.profundidad, x.hijas?.parte ?? null, x.viene])).toEqual([
      ["r", 1, 1, null],
      ["r", 1, 2, null],
      ["a", 1, null, 1],
    ]);
    // Una unidad sola, sin hijas, sale igual en una página.
    expect(await repartir({}, "sola", enorme)).toEqual([
      { numero: 1, raiz: "sola", profundidad: 0, sigue: [], viene: null },
    ]);
  });
});

describe("escalaParaHoja", () => {
  it("escala_para_hoja_por_tamano_y_orientacion", () => {
    const v = areaUtil("carta", "vertical");
    const h = areaUtil("carta", "horizontal");
    expect(v.ancho).toBeCloseTo(612 - 2 * MARGEN);
    expect(v.alto).toBeCloseTo(792 - 2 * MARGEN - 28 - 22);
    expect(h.ancho).toBeCloseTo(792 - 2 * MARGEN);
    expect(h.alto).toBeCloseTo(612 - 2 * MARGEN - 28 - 22);
    expect(areaUtil("oficio", "vertical").alto).toBeCloseTo(936 - 2 * MARGEN - 50);
    // Un dibujo ancho manda el ancho; en horizontal cabe más grande que en vertical.
    expect(escalaParaHoja(2 * h.ancho, 100, "carta", "horizontal", "estructura").escala).toBeCloseTo(0.5);
    expect(escalaParaHoja(2 * h.ancho, 100, "carta", "vertical", "estructura").escala).toBeCloseTo(
      v.ancho / (2 * h.ancho),
    );
    // Uno alto manda el alto.
    expect(escalaParaHoja(100, 4 * v.alto, "carta", "vertical", "estructura").escala).toBeCloseTo(0.25);
    // Una hoja más grande da más escala.
    const a4 = escalaParaHoja(3000, 2000, "a4", "horizontal", "pantalla").escala;
    const a3 = escalaParaHoja(3000, 2000, "a3", "horizontal", "pantalla").escala;
    const a2 = escalaParaHoja(3000, 2000, "a2", "horizontal", "pantalla").escala;
    expect(a4).toBeLessThan(a3);
    expect(a3).toBeLessThan(a2);
    // Un dibujo chico no se agranda.
    expect(escalaParaHoja(100, 100, "a2", "vertical", "presentacion")).toEqual({
      escala: 1,
      ilegible: false,
    });
    expect(escalaParaHoja(0, 0, "carta", "vertical", "estructura")).toEqual({ escala: 1, ilegible: false });
  });

  it("ilegible_bajo_8_pt", () => {
    const { ancho } = areaUtil("carta", "horizontal");
    const justa = LETRA_MIN_PT / letraMinima("estructura");
    expect(escalaParaHoja(ancho / (justa + 0.001), 10, "carta", "horizontal", "estructura").ilegible).toBe(
      false,
    );
    expect(escalaParaHoja(ancho / (justa - 0.001), 10, "carta", "horizontal", "estructura").ilegible).toBe(
      true,
    );
  });
});

describe("cuadricula", () => {
  // Los tramos [inicio, fin) de cada fila o columna, en orden.
  const tramos = (c: ReturnType<typeof cuadricula>, eje: "x" | "y") => {
    const vistos = new Map<number, [number, number]>();
    for (const h of c.hojas)
      vistos.set(eje === "x" ? h.columna : h.fila, eje === "x" ? [h.x, h.x + h.ancho] : [h.y, h.y + h.alto]);
    return [...vistos.entries()].sort((p, q) => p[0] - q[0]).map(([, t]) => t);
  };

  it("cuadricula_cubre_todo", () => {
    const [ancho, alto] = [3000, 2000];
    const c = cuadricula(ancho, alto, "carta", "horizontal", "estructura");
    const area = areaUtil("carta", "horizontal");
    expect(c.escala).toBeCloseTo(LETRA_MIN_PT / letraMinima("estructura"));
    expect(c.hojas).toHaveLength(c.filas * c.columnas);
    // Cada hoja muestra 1011 × 695 del dibujo y avanza 39 menos (el solape): 3 columnas llegan a 2955 de 3000.
    expect(c.columnas).toBe(4);
    expect(c.filas).toBe(3);
    // Cada recorte cabe en la hoja a esa escala.
    for (const h of c.hojas) {
      expect(h.ancho * c.escala).toBeLessThanOrEqual(area.ancho + 1e-6);
      expect(h.alto * c.escala).toBeLessThanOrEqual(area.alto + 1e-6);
    }
    // Sin huecos: cada columna (y fila) empieza antes de que termine la anterior, y la última llega al borde.
    for (const [eje, total] of [
      ["x", ancho],
      ["y", alto],
    ] as const) {
      const t = tramos(c, eje);
      expect(t[0]![0]).toBe(0);
      expect(t[t.length - 1]![1]).toBeCloseTo(total);
      for (let i = 1; i < t.length; i++) {
        expect(t[i]![0]).toBeLessThan(t[i - 1]![1]);
        // La última no sale vacía: trae algo que la anterior no muestra.
        expect(t[i]![1]).toBeGreaterThan(t[i - 1]![1]);
      }
    }
    // Un dibujo que cabe en una sola hoja da una hoja, sin solape.
    const una = cuadricula(500, 300, "carta", "horizontal", "estructura");
    expect(una.hojas).toEqual([{ fila: 1, columna: 1, x: 0, y: 0, ancho: 500, alto: 300 }]);
  });

  it("cuadricula_solape_y_bordes", () => {
    const c = cuadricula(3000, 2000, "carta", "horizontal", "pantalla");
    const solape = SOLAPE / c.escala;
    for (const t of [tramos(c, "x"), tramos(c, "y")]) {
      for (let i = 1; i < t.length; i++) expect(t[i - 1]![1] - t[i]![0]).toBeCloseTo(solape);
    }
    // La hoja de arriba a la izquierda empieza en el borde; la de abajo a la derecha termina en el borde.
    const primera = c.hojas[0]!;
    const ultima = c.hojas[c.hojas.length - 1]!;
    expect([primera.fila, primera.columna, primera.x, primera.y]).toEqual([1, 1, 0, 0]);
    expect([ultima.fila, ultima.columna]).toEqual([c.filas, c.columnas]);
    expect(ultima.x + ultima.ancho).toBeCloseTo(3000);
    expect(ultima.y + ultima.alto).toBeCloseTo(2000);
    // Justo lo que cabe en dos columnas no deja una tercera vacía.
    const area = areaUtil("carta", "horizontal");
    const doble = 2 * (area.ancho / c.escala) - solape;
    expect(cuadricula(doble, 100, "carta", "horizontal", "pantalla").columnas).toBe(2);
  });
});
