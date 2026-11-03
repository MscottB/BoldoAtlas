import { describe, expect, it } from "vitest";
import {
  acotarPista,
  caminoSvg,
  encuadreDeLinea,
  escalaPunta,
  puntaFlecha,
  trazarLaterales,
  type Caja,
  type Lateral,
  type Punto,
  type Trazado,
} from "./lateral";

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

describe("sentido de la línea", () => {
  const cajas = new Map([...fila("a", 3, 0), ...fila("b", 3, 200)]);
  const extremos = (l: Lateral, c: Map<string, Caja>, d: "vertical" | "horizontal" = "vertical") => {
    const { puntos } = trazarLaterales([l], c, d).get(l.id)!;
    return { inicio: puntos[0]!, fin: puntos[puntos.length - 1]! };
  };

  it("va del borde del origen al del destino, y al invertir la conexión se invierte", () => {
    const ida = extremos(lat("a0", "b2"), cajas);
    expect(enBorde(ida.inicio, cajas.get("a0")!)).toBe(true);
    expect(enBorde(ida.fin, cajas.get("b2")!)).toBe(true);
    const vuelta = extremos(lat("b2", "a0"), cajas);
    expect(enBorde(vuelta.inicio, cajas.get("b2")!)).toBe(true);
    expect(enBorde(vuelta.fin, cajas.get("a0")!)).toBe(true);
  });

  it("también en horizontal", () => {
    const giradas = new Map(
      [...cajas].map(([id, c]): [string, Caja] => [id, { x: c.y, y: c.x, ancho: c.alto, alto: c.ancho }]),
    );
    const { inicio, fin } = extremos(lat("a0", "b2"), giradas, "horizontal");
    expect(enBorde(inicio, giradas.get("a0")!)).toBe(true);
    expect(enBorde(fin, giradas.get("b2")!)).toBe(true);
  });

  it("también junto a otras: trazar primero las con descripción no cambia el sentido", () => {
    const ts = trazarLaterales(
      [lat("a0", "b2", null, "x"), lat("b1", "a2", "Texto", "y")],
      cajas,
      "vertical",
    );
    const fin = (p: Punto[]) => p[p.length - 1]!;
    expect(enBorde(ts.get("x")!.puntos[0]!, cajas.get("a0")!)).toBe(true);
    expect(enBorde(fin(ts.get("x")!.puntos), cajas.get("b2")!)).toBe(true);
    expect(enBorde(ts.get("y")!.puntos[0]!, cajas.get("b1")!)).toBe(true);
    expect(enBorde(fin(ts.get("y")!.puntos), cajas.get("a2")!)).toBe(true);
  });
});

describe("puntaFlecha", () => {
  /** Los tres vértices del triángulo que devuelve. */
  const vertices = (d: string) =>
    [...d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m): Punto => ({ x: Number(m[1]), y: Number(m[2]) }));

  it("tiene el vértice en el final de la línea y la base hacia atrás, en cada dirección", () => {
    const fin = { x: 100, y: 100 };
    for (const [desde, base] of [
      [
        { x: 100, y: 0 },
        { x: 100, y: 90 },
      ], // baja
      [
        { x: 100, y: 200 },
        { x: 100, y: 110 },
      ], // sube
      [
        { x: 0, y: 100 },
        { x: 90, y: 100 },
      ], // a la derecha
      [
        { x: 200, y: 100 },
        { x: 110, y: 100 },
      ], // a la izquierda
    ] as const) {
      const [vertice, a, b] = vertices(puntaFlecha([desde, fin], 1, 10, 8)!);
      expect(vertice).toEqual(fin);
      expect({ x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 }).toEqual(base);
      expect(Math.hypot(a!.x - b!.x, a!.y - b!.y)).toBe(8);
    }
  });

  it("mira solo el último tramo, aunque la línea tenga codos", () => {
    const codo = [
      { x: 0, y: 0 },
      { x: 0, y: 50 },
      { x: 80, y: 50 },
    ];
    const [vertice, a] = vertices(puntaFlecha(codo, 1, 10, 8)!);
    expect(vertice).toEqual({ x: 80, y: 50 });
    expect(a!.x).toBe(70);
  });

  it("sirve para la línea diagonal de emergencia", () => {
    const diagonal = [
      { x: 0, y: 0 },
      { x: 30, y: 40 },
    ];
    const [vertice, a, b] = vertices(puntaFlecha(diagonal, 1, 10, 8)!);
    expect(vertice).toEqual({ x: 30, y: 40 });
    expect((a!.x + b!.x) / 2).toBeCloseTo(24);
    expect((a!.y + b!.y) / 2).toBeCloseTo(32);
  });

  it("la base no pasa del último codo", () => {
    const corto = [
      { x: 0, y: 0 },
      { x: 0, y: 50 },
      { x: 4, y: 50 },
    ];
    const [, a] = vertices(puntaFlecha(corto, 1, 10, 8)!);
    expect(a!.x).toBe(0);
  });

  it("crece al alejar, con un tope, y a zoom normal no cambia", () => {
    expect(escalaPunta(1)).toBe(1);
    expect(escalaPunta(0.25)).toBe(3);
    expect(escalaPunta(0.05)).toBe(4);
    const recto = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    const [, a] = vertices(puntaFlecha(recto, 3)!);
    expect(a!.x).toBe(73);
  });

  it("sin un tramo que le dé dirección, no hay punta", () => {
    expect(puntaFlecha([{ x: 1, y: 1 }])).toBeNull();
    expect(
      puntaFlecha([
        { x: 1, y: 1 },
        { x: 1, y: 1 },
      ]),
    ).toBeNull();
  });
});

describe("acotarPista", () => {
  const ventana = { ancho: 1000, alto: 600 };
  const medida = { ancho: 200, alto: 40 };
  const punto = (x: number, y: number): Caja => ({ x, y, ancho: 0, alto: 0 });

  it("centrada sobre el puntero, con su separación", () => {
    expect(acotarPista(punto(500, 300), medida, ventana)).toEqual({ x: 400, y: 246 });
  });

  it("sobre un botón: se centra en él y se separa de su borde de arriba", () => {
    expect(acotarPista({ x: 450, y: 300, ancho: 100, alto: 20 }, medida, ventana)).toEqual({
      x: 400,
      y: 246,
    });
  });

  it("no se sale por los costados", () => {
    expect(acotarPista(punto(10, 300), medida, ventana).x).toBe(8);
    expect(acotarPista(punto(995, 300), medida, ventana).x).toBe(792);
  });

  it("sin lugar arriba va debajo del ancla, sin taparla", () => {
    expect(acotarPista({ x: 450, y: 20, ancho: 100, alto: 20 }, medida, ventana).y).toBe(54);
  });

  it("sin lugar arriba ni abajo queda dentro de la ventana", () => {
    const baja = { ancho: 1000, alto: 60 };
    const { y } = acotarPista(punto(500, 30), medida, baja);
    expect(y).toBeGreaterThanOrEqual(8);
    expect(y + medida.alto).toBeLessThanOrEqual(baja.alto);
  });

  it("más ancha que la ventana: empieza en el margen", () => {
    expect(acotarPista(punto(50, 300), { ancho: 400, alto: 40 }, { ancho: 300, alto: 600 }).x).toBe(8);
  });

  describe("sin cubrir la etiqueta resaltada", () => {
    const etiqueta = { x: 420, y: 260, ancho: 160, alto: 20 };
    const cubre = ({ x, y }: Punto) =>
      x < etiqueta.x + etiqueta.ancho &&
      x + medida.ancho > etiqueta.x &&
      y < etiqueta.y + etiqueta.alto &&
      y + medida.alto > etiqueta.y;

    it("si arriba la cubriría, va debajo del puntero", () => {
      const p = acotarPista(punto(500, 300), medida, ventana, etiqueta);
      expect(cubre(p)).toBe(false);
      expect(p).toEqual({ x: 400, y: 314 });
    });

    it("si no la cubre, queda donde siempre", () => {
      expect(acotarPista(punto(500, 300), medida, ventana, { ...etiqueta, x: 800 })).toEqual({
        x: 400,
        y: 246,
      });
    });

    it("va al lado que menos pisa las tarjetas; a igual solape, el de siempre", () => {
      const arriba = caja(300, 240, 400, 40);
      const abajo = caja(300, 320, 400, 40);
      expect(acotarPista(punto(500, 300), medida, ventana, null, [arriba]).y).toBe(314);
      expect(acotarPista(punto(500, 300), medida, ventana, null, [abajo]).y).toBe(246);
      expect(acotarPista(punto(500, 300), medida, ventana, null, [arriba, abajo]).y).toBe(246);
      expect(acotarPista(punto(500, 300), medida, ventana, null, [arriba, { ...abajo, y: 350 }]).y).toBe(314);
    });

    it("si tampoco cabe debajo, se corre más allá de la etiqueta", () => {
      const baja = { ancho: 1000, alto: 330 };
      const p = acotarPista(punto(500, 300), medida, baja, etiqueta);
      expect(cubre(p)).toBe(false);
      expect(p.y + medida.alto).toBeLessThanOrEqual(baja.alto);
    });
  });
});

describe("encuadreDeLinea", () => {
  const panta = { width: 1000, height: 600 };
  const vp = (x: number, y: number, zoom: number) => ({ x, y, zoom });
  const linea = [
    { x: 100, y: 100 },
    { x: 300, y: 100 },
  ];

  it("si la línea ya se ve entera, no mueve nada", () => {
    expect(encuadreDeLinea(linea, vp(0, 0, 1), panta)).toBeNull();
  });

  it("si queda fuera, la centra y conserva el zoom: no acerca de más", () => {
    expect(encuadreDeLinea(linea, vp(-2000, 0, 1), panta)).toEqual({ x: 200, y: 100, zoom: 1 });
    expect(encuadreDeLinea(linea, vp(-2000, 0, 0.5), panta)).toEqual({ x: 200, y: 100, zoom: 0.5 });
  });

  it("si es más larga que la pantalla, aleja lo justo para que quepa con margen", () => {
    const larga = [
      { x: 0, y: 0 },
      { x: 2000, y: 0 },
      { x: 2000, y: 1000 },
    ];
    expect(encuadreDeLinea(larga, vp(0, 0, 1), panta)).toEqual({ x: 1000, y: 500, zoom: 0.4 });
  });
});

describe("trazado de las conexiones laterales", () => {
  it("sin descripción, el punto va sobre la línea, fuera de las tarjetas y no en su inicio", () => {
    const cajas = new Map(fila("a", 5, 0));
    const t = validar(cajas, lat("a0", "a4"));
    expect(t.etiqueta).not.toEqual(t.puntos[0]);
    expect(tapa(t.etiqueta, cajas, 14, 20)).toBe(false);
    const sobreLaLinea = t.puntos.slice(1).some((q, k) => {
      const p = t.puntos[k]!;
      return (
        t.etiqueta.x >= Math.min(p.x, q.x) - 8 &&
        t.etiqueta.x <= Math.max(p.x, q.x) + 8 &&
        t.etiqueta.y >= Math.min(p.y, q.y) - 8 &&
        t.etiqueta.y <= Math.max(p.y, q.y) + 8
      );
    });
    expect(sobreLaLinea).toBe(true);
  });

  it("las descripciones se ubican antes que los puntos, aunque vengan después en la lista", () => {
    // Tres puntos en carriles vecinos: si se ubicaran antes, el texto tendría que correrse del centro de su tramo.
    const cajas = new Map(fila("a", 5, 0));
    const puntos = ["p", "q", "r"].map((id) => lat("a0", "a4", null, id));
    const t = trazarLaterales([...puntos, lat("a0", "a4", "Descripción", "x")], cajas, "vertical").get("x")!;
    const tramos = t.puntos.slice(1).map((q, k) => [t.puntos[k]!, q] as const);
    const [p, q] = tramos.sort(([a, b], [c, d]) => Math.abs(d.x - c.x) - Math.abs(b.x - a.x))[0]!;
    expect(t.etiqueta).toEqual({ x: (p.x + q.x) / 2, y: p.y });
  });

  it("sin lugar para el texto queda su punto, pero sin tapar tarjetas si la línea tiene por dónde", () => {
    // Dos tarjetas lado a lado y cuatro líneas sin más lugar que el mismo hueco.
    const cajas = new Map([
      ["a", caja(0, 0)],
      ["b", caja(248, 0)],
    ]);
    const ls = ["x", "y", "z", "w"].map((id) => lat("a", "b", null, id));
    const t = trazarLaterales(ls, cajas, "vertical");
    for (const id of ["x", "y", "z", "w"]) expect(tapa(t.get(id)!.etiqueta, cajas, 14, 20)).toBe(false);
  });

  it("la descripción con texto nunca toca una tarjeta, aunque el hueco entre vecinas sea de 2 px", () => {
    const cajas = new Map([
      ["a", caja(0, 0)],
      ["b", caja(222, 0)],
    ]);
    const t = trazarLaterales([lat("a", "b", "Una descripción bien larga", "x")], cajas, "vertical").get(
      "x",
    )!;
    if (t.conTexto) expect(tapa(t.etiqueta, cajas, 26 * 6.5 + 14, 20)).toBe(false);
  });

  it("los puntos de dos líneas por la misma franja no quedan uno sobre otro", () => {
    const cajas = new Map(fila("a", 5, 0));
    const t = trazarLaterales([lat("a0", "a4", null, "x"), lat("a0", "a4", null, "y")], cajas, "vertical");
    const [p, q] = [t.get("x")!.etiqueta, t.get("y")!.etiqueta];
    expect(Math.abs(p.x - q.x) >= 14 || Math.abs(p.y - q.y) >= 20).toBe(true);
  });

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
    // Dos caben sin tocarse. La tercera, anidada en las otras: si una franja de 64 px no da para más, queda como punto.
    const [t1, t2, t3] = ls.map((l) => r.get(l.id)!) as [Trazado, Trazado, Trazado];
    expect(t1.conTexto && t2.conTexto).toBe(true);
    expect(Math.abs(t1.etiqueta.y - t2.etiqueta.y)).toBeGreaterThanOrEqual(20);
    if (t3.conTexto)
      for (const otra of [t1, t2])
        expect(Math.abs(otra.etiqueta.y - t3.etiqueta.y)).toBeGreaterThanOrEqual(20);
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
    expect(t.conTexto).toBe(true);
    expect(tapa(t.etiqueta, cajas, 170 * 1.3, 20 * 1.3)).toBe(false);
  });

  it("compacta: la etiqueta se corre un poco de su línea para caber en la franja de 28 px", () => {
    const f = (y: number, pre: string) =>
      Array.from({ length: 6 }, (_, i): [string, Caja] => [`${pre}${i}`, caja(i * 230, y, 220, 40)]);
    const cajas = new Map([...f(0, "a"), ...f(68, "b")]);
    const t = trazarLaterales([lat("a1", "a3", "Flujo")], cajas, "vertical").get("l")!;
    expect(t.conTexto).toBe(true);
    const linea = t.puntos.find((p, k) => k && t.puntos[k - 1]!.y === p.y)!;
    expect(Math.abs(t.etiqueta.y - linea.y)).toBeLessThanOrEqual(8);
  });

  it("sin lugar libre se queda con su punto en la línea, sin texto", () => {
    const apretada = new Map<string, Caja>();
    for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) apretada.set(`${r}-${c}`, caja(c * 224, r * 116)); // huecos de 4 px
    const t = trazarLaterales([lat("3-3", "3-4", "Texto que no cabe en un hueco")], apretada, "vertical").get(
      "l",
    )!;
    expect(t.cruces).toBe(0);
    expect(t.conTexto).toBe(false);
  });

  describe("en reposo nada se pisa", () => {
    /** La caja de una etiqueta, con el ancho que reserva el trazado. */
    const cajaTexto = (l: Lateral, e: Punto, escala: number) => {
      const [w, h] = [Math.min(192, l.etiqueta!.length * 6.5 + 14) * escala, 20 * escala];
      return caja(e.x - w / 2, e.y - h / 2, w, h);
    };
    const tocan = (a: Caja, b: Caja, margen: number) =>
      a.x - margen < b.x + b.ancho &&
      a.x + a.ancho + margen > b.x &&
      a.y - margen < b.y + b.alto &&
      a.y + a.alto + margen > b.y;

    // Muchas conexiones con descripción entre las mismas filas, como en un árbol cargado.
    function cargado(alto: number, franja: number, gap: number) {
      const cajas = new Map([
        ...fila("a", 8, 0, gap, alto),
        ...fila("b", 8, alto + franja, gap, alto),
        ...fila("c", 8, 2 * (alto + franja), gap, alto),
      ]);
      const ls: Lateral[] = [];
      for (let i = 0; i < 8; i++)
        for (let k = 0; k < 8; k++)
          if (i !== k)
            ls.push(
              lat(
                `${"ab"[i % 2]}${i}`,
                `${"bc"[k % 2]}${k}`,
                `Descripción larga número ${i}-${k}`,
                `l${i}-${k}`,
              ),
            );
      return { cajas, ls: ls.filter((l) => l.origen_id !== l.destino_id) };
    }

    for (const [nombre, alto, franja, gap, escala] of [
      ["normal", 112, 64, 28, 1.3],
      ["compacta", 40, 28, 10, 1],
    ] as const) {
      it(`${nombre}: ninguna etiqueta toca una tarjeta ni otra etiqueta, con su margen`, () => {
        const { cajas, ls } = cargado(alto, franja, gap);
        const t = trazarLaterales(ls, cajas, "vertical", escala);
        const conTexto = ls.filter((l) => t.get(l.id)?.conTexto);
        expect(conTexto.length).toBeGreaterThan(0); // alguna cabe
        expect(conTexto.length).toBeLessThan(ls.length); // y no todas: el caso sirve
        const textos = conTexto.map((l) => cajaTexto(l, t.get(l.id)!.etiqueta, escala));
        for (const [k, c] of textos.entries()) {
          for (const tarjeta of cajas.values()) expect(tocan(c, tarjeta, 0)).toBe(false);
          for (const otra of textos.slice(k + 1)) expect(tocan(c, otra, 0)).toBe(false);
        }
      });
    }

    it("en horizontal también", () => {
      // En horizontal las columnas se separan 64 y las hermanas, una bajo otra, 28.
      const { cajas, ls } = cargado(112, 64, 28);
      const giradas = new Map(
        [...cajas].map(([id, c]): [string, Caja] => [
          id,
          caja((c.y / 176) * (220 + 64), (c.x / 248) * (112 + 28)),
        ]),
      );
      const t = trazarLaterales(ls, giradas, "horizontal", 1.3);
      const textos = ls
        .filter((l) => t.get(l.id)?.conTexto)
        .map((l) => {
          const e = t.get(l.id)!.etiqueta;
          const [w, h] = [Math.min(192, l.etiqueta!.length * 6.5 + 14) * 1.3, 20 * 1.3];
          return caja(e.x - w / 2, e.y - h / 2, w, h);
        });
      expect(textos.length).toBeGreaterThan(0);
      for (const [k, c] of textos.entries()) {
        for (const tarjeta of giradas.values()) expect(tocan(c, tarjeta, 0)).toBe(false);
        for (const otra of textos.slice(k + 1)) expect(tocan(c, otra, 0)).toBe(false);
      }
    });

    it("el texto se queda con el primer lugar libre: el centro del tramo a lo ancho más largo", () => {
      const cajas = new Map(fila("a", 5, 0));
      const t = trazarLaterales([lat("a0", "a4", "Texto")], cajas, "vertical").get("l")!;
      const [p, q] = t.puntos
        .slice(1)
        .map((b, k) => [t.puntos[k]!, b] as const)
        .sort(([a, b], [c, d]) => Math.abs(d.x - c.x) - Math.abs(b.x - a.x))[0]!;
      expect(t.conTexto).toBe(true);
      expect(t.etiqueta.x).toBe((p.x + q.x) / 2);
      expect(Math.abs(t.etiqueta.y - p.y)).toBeLessThanOrEqual(8); // se corre lo justo para no rozar la tarjeta
    });

    it("un texto que no cabe no le quita el lugar a otro: queda su punto sobre su línea", () => {
      const { cajas, ls } = cargado(40, 28, 10);
      const t = trazarLaterales(ls, cajas, "vertical");
      const sinTexto = ls.filter((l) => !t.get(l.id)!.conTexto);
      expect(sinTexto.length).toBeGreaterThan(0);
      for (const l of sinTexto) {
        const { etiqueta: e, puntos } = t.get(l.id)!;
        const cerca = puntos.slice(1).some((q, k) => {
          const p = puntos[k]!;
          return (
            e.x >= Math.min(p.x, q.x) - 8 &&
            e.x <= Math.max(p.x, q.x) + 8 &&
            e.y >= Math.min(p.y, q.y) - 8 &&
            e.y <= Math.max(p.y, q.y) + 8
          );
        });
        expect(cerca).toBe(true);
      }
    });

    it("el orden es estable: no depende del orden de la lista", () => {
      const { cajas, ls } = cargado(40, 28, 10);
      const a = trazarLaterales(ls, cajas, "vertical");
      const b = trazarLaterales([...ls].reverse(), cajas, "vertical");
      for (const l of ls) expect(b.get(l.id)).toEqual(a.get(l.id));
    });

    it("una conexión nueva no mueve a las que ya estaban", () => {
      const { cajas, ls } = cargado(112, 64, 28);
      const a = trazarLaterales(ls.slice(0, 20), cajas, "vertical", 1.3);
      const nueva = lat("a0", "c2", "Conexión recién creada", "z-nueva");
      const b = trazarLaterales([nueva, ...ls.slice(0, 20)], cajas, "vertical", 1.3);
      for (const l of ls.slice(0, 20)) expect(b.get(l.id)).toEqual(a.get(l.id));
    });
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
