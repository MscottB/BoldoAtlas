import { describe, expect, it } from "vitest";
import { caminoSvg, trazarLaterales, type Caja, type Lateral, type Punto } from "./lateral";

const caja = (x: number, y: number, ancho = 220, alto = 112): Caja => ({ x, y, ancho, alto });
const lat = (origen_id: string, destino_id: string, etiqueta: string | null = null, id = "l"): Lateral => ({
  id,
  origen_id,
  destino_id,
  etiqueta,
});
/** Una fila de tarjetas a la altura `y`, separadas por `gap`. */
const fila = (prefijo: string, n: number, y: number, gap = 28, alto = 112) =>
  Array.from({ length: n }, (_, i): [string, Caja] => [
    `${prefijo}${i}`,
    caja(i * (220 + gap), y, 220, alto),
  ]);

function cruzadas(puntos: Punto[], cajas: Map<string, Caja>) {
  const nombres = new Set<string>();
  for (let k = 1; k < puntos.length; k++) {
    const [p, q] = [puntos[k - 1]!, puntos[k]!];
    for (const [id, c] of cajas)
      if (
        Math.min(p.x, q.x) < c.x + c.ancho &&
        Math.max(p.x, q.x) > c.x &&
        Math.min(p.y, q.y) < c.y + c.alto &&
        Math.max(p.y, q.y) > c.y
      )
        nombres.add(id);
  }
  return nombres;
}
const enBorde = (p: Punto, c: Caja) =>
  ((p.x === c.x || p.x === c.x + c.ancho) && p.y >= c.y && p.y <= c.y + c.alto) ||
  ((p.y === c.y || p.y === c.y + c.alto) && p.x >= c.x && p.x <= c.x + c.ancho);

/** Lo que vale para todo trazado: ángulos rectos, de borde a borde, sin atravesar tarjetas. */
function validar(cajas: Map<string, Caja>, l: Lateral, direccion: "vertical" | "horizontal" = "vertical") {
  const t = trazarLaterales([l], cajas, direccion).get(l.id)!;
  expect(t.cruces).toBe(0);
  expect([...cruzadas(t.puntos, cajas)]).toEqual([]);
  for (let k = 1; k < t.puntos.length; k++) {
    const [p, q] = [t.puntos[k - 1]!, t.puntos[k]!];
    expect(p.x === q.x || p.y === q.y).toBe(true);
  }
  expect(enBorde(t.puntos[0]!, cajas.get(l.origen_id)!)).toBe(true);
  expect(enBorde(t.puntos[t.puntos.length - 1]!, cajas.get(l.destino_id)!)).toBe(true);
  return t;
}
const tapa = (e: Punto, cajas: Map<string, Caja>, w = 120, h = 20) =>
  [...cajas.values()].some(
    (c) =>
      e.x - w / 2 < c.x + c.ancho && e.x + w / 2 > c.x && e.y - h / 2 < c.y + c.alto && e.y + h / 2 > c.y,
  );

describe("trazado de las conexiones laterales", () => {
  it("misma fila, con tarjetas de por medio: va por la franja libre bajo la fila", () => {
    const cajas = new Map(fila("a", 5, 0));
    const t = validar(cajas, lat("a0", "a4"));
    expect(Math.max(...t.puntos.map((p) => p.y))).toBeGreaterThan(112);
  });

  it("vecinas de la misma fila con etiqueta: no se queda en el hueco, donde el texto no cabe", () => {
    const cajas = new Map([...fila("a", 4, 0), ...fila("b", 4, 176)]);
    const t = validar(cajas, lat("a1", "a2", "Abastecimiento de repuestos"));
    expect(tapa(t.etiqueta, cajas, 160)).toBe(false);
    expect(t.etiqueta.y).toBeGreaterThan(112);
    expect(t.etiqueta.y).toBeLessThan(176);
  });

  it("vecinas sin etiqueta: basta una línea corta de costado a costado", () => {
    const cajas = new Map(fila("a", 3, 0));
    const t = validar(cajas, lat("a0", "a1"));
    expect(t.puntos).toHaveLength(2);
    expect(t.puntos[0]!.x).toBe(220);
    expect(t.puntos[1]!.x).toBe(248);
  });

  it("distinta profundidad: cruza las filas de por medio por un hueco entre tarjetas", () => {
    const cajas = new Map([...fila("a", 3, 0), ...fila("b", 5, 176), ...fila("c", 3, 352)]);
    validar(cajas, lat("a1", "c2", "Flujo"));
    validar(cajas, lat("c0", "a2")); // también de abajo hacia arriba
  });

  it("horizontal: el mismo trazado con los ejes cambiados", () => {
    const cajas = new Map<string, Caja>([
      ...fila("a", 4, 0).map(([id, c]): [string, Caja] => [id, { x: c.y, y: c.x, ancho: 112, alto: 220 }]),
      ...fila("b", 4, 176).map(([id, c]): [string, Caja] => [id, { x: c.y, y: c.x, ancho: 112, alto: 220 }]),
    ]);
    const t = validar(cajas, lat("a0", "a3", "Flujo"), "horizontal");
    expect(Math.max(...t.puntos.map((p) => p.x))).toBeGreaterThan(112);
    validar(cajas, lat("a0", "b3"), "horizontal");
  });

  it("tarjetas de distinto alto: una unidad con su puesto debajo no estorba a la vecina más baja", () => {
    const cajas = new Map<string, Caja>([
      ["u", caja(0, 0)],
      ["p", caja(10, 124, 200, 68)], // el puesto de u
      ["v", caja(248, 0)],
      ["w", caja(496, 0, 220, 300)], // más alta que sus vecinas: no deja franja a esa altura
      ["h", caja(0, 340)],
    ]);
    validar(cajas, lat("v", "h"));
    validar(cajas, lat("u", "w", "Larga"));
    validar(cajas, lat("p", "h"));
  });

  it("compacta: huecos de 10 px y franjas de 28 px", () => {
    const f = (y: number, pre: string) =>
      Array.from({ length: 6 }, (_, i): [string, Caja] => [`${pre}${i}`, caja(i * 230, y, 220, 40)]);
    const cajas = new Map([...f(0, "a"), ...f(68, "b"), ...f(136, "c")]);
    validar(cajas, lat("a0", "c5"));
    validar(cajas, lat("b1", "b4", "Flujo"));
  });

  it("sin camino libre (rodeada por completo): cruza lo menos posible y lo dice", () => {
    const anillo: [string, Caja][] = [];
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++) if (i || j) anillo.push([`r${i}${j}`, caja(i * 220, j * 112)]); // pegadas: sin huecos
    const cajas = new Map<string, Caja>([["dentro", caja(0, 0)], ["fuera", caja(1000, 0)], ...anillo]);
    const t = trazarLaterales([lat("dentro", "fuera")], cajas, "vertical").get("l")!;
    expect(t.cruces).toBe(1);
    expect(cruzadas(t.puntos, cajas).size).toBe(1);
  });

  it("varias líneas por la misma franja: no se pisan y sus etiquetas no chocan", () => {
    const cajas = new Map([...fila("a", 6, 0), ...fila("b", 6, 176)]);
    const ls = [
      lat("a0", "a5", "Flujo de materiales", "1"),
      lat("a1", "a4", "Reportes mensuales", "2"),
      lat("a2", "a3", "Apoyo técnico", "3"),
    ];
    const r = trazarLaterales(ls, cajas, "vertical");
    const franjas = ls.map((l) => Math.max(...r.get(l.id)!.puntos.map((p) => p.y)));
    expect(new Set(franjas).size).toBe(3);
    // Dos caben sin tocarse. La tercera, anidada en las otras, puede rozarlas (una franja de 64 px no da para más): no las tapa.
    const [e1, e2, e3] = ls.map((l) => r.get(l.id)!.etiqueta) as [Punto, Punto, Punto];
    expect(Math.abs(e1.y - e2.y)).toBeGreaterThanOrEqual(20);
    for (const otra of [e1, e2]) expect(Math.abs(otra.y - e3.y)).toBeGreaterThan(5);
    for (const l of ls) expect(r.get(l.id)!.cruces).toBe(0);
  });

  it("dos líneas de una misma tarjeta salen de puntos distintos, sin importar el orden de la lista", () => {
    const cajas = new Map([...fila("a", 8, 0), ...fila("b", 8, 176)]);
    // Con un desvío por posición en la lista, la 0.ª y la 3.ª coincidían.
    const r = trazarLaterales(
      [
        lat("a0", "b5", null, "1"),
        lat("a2", "b6", null, "2"),
        lat("a3", "b7", null, "3"),
        lat("a0", "b4", null, "4"),
      ],
      cajas,
      "vertical",
    );
    expect(r.get("1")!.puntos[0]).not.toEqual(r.get("4")!.puntos[0]);
  });

  it("la etiqueta agrandada al alejar cabe donde se la ubicó: no tapa tarjetas ni otras etiquetas", () => {
    const cajas = new Map([...fila("a", 4, 0), ...fila("b", 4, 176)]);
    const t = trazarLaterales([lat("a1", "a2", "Abastecimiento de repuestos")], cajas, "vertical", 1.3).get(
      "l",
    )!;
    expect(t.etiquetaTapa).toBe(false);
    expect(tapa(t.etiqueta, cajas, 170 * 1.3, 20 * 1.3)).toBe(false);
  });

  it("compacta: la etiqueta se corre un poco de su línea para caber en la franja de 28 px", () => {
    const f = (y: number, pre: string) =>
      Array.from({ length: 6 }, (_, i): [string, Caja] => [`${pre}${i}`, caja(i * 230, y, 220, 40)]);
    const cajas = new Map([...f(0, "a"), ...f(68, "b")]);
    const t = trazarLaterales([lat("a1", "a3", "Flujo")], cajas, "vertical").get("l")!;
    expect(t.etiquetaTapa).toBe(false);
    const linea = t.puntos.find((p, k) => k && t.puntos[k - 1]!.y === p.y)!;
    expect(Math.abs(t.etiqueta.y - linea.y)).toBeLessThanOrEqual(8);
  });

  it("sin lugar libre la etiqueta lo avisa, para no capturar los clics de la tarjeta", () => {
    const apretada = new Map<string, Caja>();
    for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) apretada.set(`${r}-${c}`, caja(c * 224, r * 116)); // huecos de 4 px
    const t = trazarLaterales([lat("3-3", "3-4", "Texto que no cabe en un hueco")], apretada, "vertical").get(
      "l",
    )!;
    expect(t.cruces).toBe(0);
    expect(t.etiquetaTapa).toBe(true);
  });

  it("muchas etiquetas por la misma franja: todas se trazan, sin cruces", () => {
    const cajas = new Map([...fila("a", 400, 0), ...fila("b", 400, 176)]);
    const ls = Array.from({ length: 400 }, (_, i) =>
      lat(`a${i}`, `a${(i + 7) % 400}`, `Flujo ${i}`, String(i)),
    );
    const r = trazarLaterales(ls, cajas, "vertical");
    expect(r.size).toBe(400);
    for (const t of r.values()) expect(t.cruces).toBe(0);
  });

  it("omite lo que no se puede dibujar: sin laterales, sin tarjeta o de una unidad a sí misma", () => {
    const cajas = new Map(fila("a", 2, 0));
    expect(trazarLaterales([], cajas, "vertical").size).toBe(0);
    expect(trazarLaterales([lat("a0", "nadie")], cajas, "vertical").size).toBe(0);
    expect(trazarLaterales([lat("a0", "a0")], cajas, "vertical").size).toBe(0);
  });

  it("organización grande: cada trazado tarda poco aunque las tarjetas estén lejos", () => {
    const cajas = new Map<string, Caja>();
    for (let r = 0; r < 8; r++) for (const [id, c] of fila(`r${r}-`, 250, r * 176)) cajas.set(id, c);
    const ls = Array.from({ length: 100 }, (_, i) =>
      lat(`r${i % 8}-${(i * 37) % 250}`, `r${(i * 3) % 8}-${(i * 91) % 250}`, `Flujo ${i}`, String(i)),
    );
    const inicio = performance.now();
    const r = trazarLaterales(ls, cajas, "vertical");
    const ms = performance.now() - inicio;
    expect(r.size).toBeGreaterThan(90);
    for (const t of r.values()) expect(t.cruces).toBe(0);
    expect(ms).toBeLessThan(15000); // solo atrapa un trazado desbocado, sin depender de la máquina; lo medido está en el informe
  });
});

describe("caminoSvg", () => {
  it("redondea las esquinas sin pasarse de la mitad del tramo", () => {
    expect(
      caminoSvg([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ]),
    ).toBe("M 0 0 L 100 0");
    expect(
      caminoSvg(
        [
          { x: 0, y: 0 },
          { x: 0, y: 6 },
          { x: 100, y: 6 },
        ],
        8,
      ),
    ).toBe("M 0 0 L 0 3 Q 0 6 3 6 L 100 6");
  });
});
