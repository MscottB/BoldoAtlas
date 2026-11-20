import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { i18n } from "@/i18n";
import { p, u } from "@/features/arbol/fixture";
import { VISTA_POR_DEFECTO } from "@/features/arbol/vista";
import { useOrganizacion } from "@/stores/organizacion";
import { MARCA, datos } from "./fixture";
import { paginasDelPdf } from "./formatos";
import { textosManual } from "./manual";
import { dibujoChico, manualDeAlcance, type PedidoManual } from "./manualDeAlcance";
import { cabezaDeSeccion, documentoManual, type OpcionesManual } from "./manualPdf";
import { areaUtil, cajaDibujoManual } from "./paginas";
import { generarDocumento } from "./pdf.worker";
import { textoPorPagina } from "./textoPdf";

const t = i18n.global.t;
beforeEach(() => setActivePinia(createPinia()));

// Los cargos, sin la marca: la marca solo va en los nombres de las personas.
const CARGOS = [
  { id: "c-g", nombre: "Gerente" },
  { id: "c-a", nombre: "Jefe" },
  { id: "c-x", nombre: "Analista" },
];
// g › a1 Finanzas (jefe y un analista con reemplazo), a2 Operaciones (un analista vacante) › s1 › s3, s2.
const conPersonas = () => {
  const d = datos();
  const org = useOrganizacion();
  org.$patch({
    unidades: d.unidades,
    puestos: d.puestos,
    asignaciones: d.asignaciones,
    trabajadores: [...d.trabajadores.values()],
    org: { nombre: "Atlas SA", logo: null },
    catalogos: { ...org.catalogos, cargos: CARGOS } as never,
    cargado: true,
  });
};
// r › a, b, c, y cada una con 3 hijas: en carta vertical caben las 3 de un nivel, pero no las 9 del siguiente.
const tresYNueve = () =>
  useOrganizacion().$patch({
    unidades: [
      u("r", "t", "Gerencia General", null),
      ...["a", "b", "c"].flatMap((x, i) => [
        u(x, "t", `Área ${x}`, "r", i),
        ...[0, 1, 2].map((k) => u(`${x}${k}`, "t", `Sección ${x}${k}`, x, k)),
      ]),
    ],
    org: { nombre: "Atlas SA", logo: null },
    cargado: true,
  });

const pedido = (o: Partial<PedidoManual> = {}): PedidoManual => ({
  alcance: "todo",
  conPersonas: false,
  hoja: "carta",
  orientacion: "vertical",
  config: VISTA_POR_DEFECTO,
  ...o,
});
const opciones = (personas = false): OpcionesManual => ({
  hoja: "carta",
  orientacion: "vertical",
  encabezado: { organizacion: "Atlas SA", alcance: "Toda la organización", fecha: "20-11-2026", logo: null },
  pagina: "Página {n} de {m}",
  titulo: "Manual de organización y funciones",
  conPersonas: personas,
  textos: textosManual(),
  portada: { version: "BoldoAtlas 0.13.0", revision: "Revisión de los datos: 42" },
});
// r con `n` hijas (cada una con la suya) y `puestos` puestos.
const conHijas = (n: number, puestos = 3) =>
  useOrganizacion().$patch({
    unidades: [
      u("r", "t", "Gerencia General", null),
      ...Array.from({ length: n }, (_, i) => [
        u(`h${i}`, "t", `Área ${i}`, "r", i),
        u(`n${i}`, "t", `Sección ${i}`, `h${i}`),
      ]).flat(),
    ],
    puestos: Array.from({ length: puestos }, (_, i) => i).map((i) => ({
      ...p(`q${i}`, "r"),
      cargo_id: "c-x",
      orden: i,
    })),
    asignaciones: [],
    org: { nombre: "Atlas SA", logo: null },
    cargado: true,
  });
const svgs = (m: Awaited<ReturnType<typeof manualDeAlcance>>) =>
  [...m.dibujos.values()].map((x) => x.svg).join("\n");

describe("manualDeAlcance", () => {
  it("el general va por ramas, cada hoja es una lámina y «sigue» y «viene» hablan de láminas", async () => {
    tresYNueve();
    const m = await manualDeAlcance(pedido());
    expect(m.general.length).toBeGreaterThan(1);
    m.general.forEach((x, i) => expect(x.arriba!.split(" · ")[0]).toBe(t("manual.lamina", { n: i + 1 })));
    // Las áreas cortadas siguen en otras láminas, que dicen de cuál vienen: siempre una anterior.
    const vienen = m.general.flatMap((x, i) => {
      const n = /Viene de la lámina (\d+)/.exec(x.arriba!)?.[1];
      return n ? [[Number(n), i + 1]] : [];
    });
    expect(vienen.length).toBeGreaterThan(0);
    for (const [de, lamina] of vienen) {
      expect(de).toBeLessThan(lamina!);
      expect(m.general[de! - 1]!.svg).toContain(t("manual.sigue", { n: "" }));
    }
    expect(JSON.stringify(m.general)).not.toMatch(/página/i);
  });

  it("cada «Sigue en la lámina N» del PDF lleva a una hoja que dice «Lámina N»", async () => {
    tresYNueve();
    const m = await manualDeAlcance(pedido());
    const pdf = await generarDocumento(documentoManual(m, opciones()), () => {}, false);
    const paginas = textoPorPagina(pdf);
    const laminas = new Map<number, number>(); // lámina → página del PDF
    paginas.forEach((x, i) => {
      for (const [, n] of x.matchAll(/· Lámina (\d+)/g)) laminas.set(Number(n), i);
    });
    expect([...laminas.keys()]).toEqual(m.general.map((_, i) => i + 1));
    const a = (re: RegExp) => paginas.flatMap((x) => [...x.matchAll(re)].map(([, n]) => Number(n)));
    const sigue = a(/Sigue en la lámina (\d+)/g);
    const viene = a(/Viene de la lámina (\d+)/g);
    expect(sigue.length).toBeGreaterThan(0);
    expect(viene.length).toBeGreaterThanOrEqual(sigue.length);
    for (const n of [...sigue, ...viene]) expect(laminas.has(n)).toBe(true);
    // Cada «sigue» lleva a una lámina que dice «viene de»: la primera de esa rama (sus otras partes también lo dicen).
    const conViene = m.general.flatMap((x, i) => (x.arriba!.includes("Viene de") ? [i + 1] : []));
    for (const n of sigue) expect(conViene).toContain(n);
    // La cuenta de páginas sale del PDF mismo, comprimido o no.
    expect(paginasDelPdf(pdf)).toBe(paginas.length);
    expect(paginasDelPdf(await generarDocumento(documentoManual(m, opciones()), () => {}))).toBe(
      paginas.length,
    );
  });

  it("un dibujo por unidad: la unidad, sus hijas directas y sus puestos", async () => {
    conPersonas();
    const m = await manualDeAlcance(pedido());
    expect([...m.dibujos.keys()]).toEqual(m.unidades.map((x) => x.id));
    const finanzas = m.dibujos.get("a1")!.svg;
    expect(finanzas).toContain("Finanzas");
    expect(finanzas).toContain("Jefe");
    expect(finanzas).toContain("Analista");
    expect(finanzas).not.toContain("Gerencia General");
    // Operaciones: sus hijas, pero no la nieta, ni los puestos de otra unidad.
    const operaciones = m.dibujos.get("a2")!.svg;
    for (const x of ["Operaciones", "Logística", "Mantención", "Analista"]) expect(operaciones).toContain(x);
    expect(operaciones).not.toContain("Bodega");
    expect(operaciones).not.toContain("Jefe");
  });

  it("sin personas, los dibujos van en Estructura y sin nombres; con personas, en Presentación", async () => {
    conPersonas();
    const sin = await manualDeAlcance(pedido());
    const todo = JSON.stringify([sin.unidades, sin.general]) + svgs(sin);
    expect(todo).not.toContain(MARCA);
    expect(todo).not.toContain("Ximena");
    // Estructura: ni la jefatura ni «Vacante» en las tarjetas.
    expect(svgs(sin)).not.toContain(t("puesto.vacante"));

    const con = await manualDeAlcance(pedido({ conPersonas: true }));
    expect(svgs(con)).toContain(`Ximena Quiroga ${MARCA}`);
    expect(svgs(con)).toContain(t("puesto.vacante"));
    expect(JSON.stringify(con.general)).toContain("Ximena");
  });

  it("avisa si el dibujo de una unidad queda con letra bajo 8 pt", async () => {
    conPersonas();
    expect((await manualDeAlcance(pedido())).ilegible).toBe(false);
    // Se lee en carta vertical: 3 hijas en fila con 3 puestos; 6 hijas en columna con un puesto (en horizontal, los
    // puestos van al lado de la unidad, como en el lienzo, y con más de uno ya no cabe a lo ancho).
    for (const [n, puestos] of [
      [3, 3],
      [6, 1],
    ] as const) {
      conHijas(n, puestos);
      for (const conPersonas of [false, true])
        expect((await manualDeAlcance(pedido({ conPersonas }))).ilegible).toBe(false);
    }
    useOrganizacion().$patch({
      unidades: [
        u("r", "t", "Gerencia General", null),
        ...Array.from({ length: 30 }, (_, i) => u(`h${i}`, "t", `Área ${i}`, "r", i)),
      ],
      org: { nombre: "Atlas SA", logo: null },
      cargado: true,
    });
    expect((await manualDeAlcance(pedido())).ilegible).toBe(true);
  });

  it("el dibujo chico usa la página entera, salvo la cabeza de la sección", async () => {
    conPersonas();
    // Finanzas con 12 puestos: una pila alta, más que media página.
    const org = useOrganizacion();
    org.$patch({
      puestos: [
        ...org.puestos,
        ...Array.from({ length: 10 }, (_, i) => ({ ...p(`m${i}`, "a1"), cargo_id: "c-x", orden: 2 + i })),
      ],
    });
    const m = await manualDeAlcance(pedido());
    const svg = m.dibujos.get("a1")!.svg;
    const nodos: { height: number; width: number }[] = [];
    JSON.stringify(documentoManual(m, opciones()).content, (_, v: unknown) => {
      if (v && typeof v === "object" && (v as { svg?: string }).svg === svg)
        nodos.push(v as { height: number; width: number });
      return v;
    });
    const area = areaUtil("carta", "vertical");
    const caja = cajaDibujoManual(
      area,
      cabezaDeSeccion(
        m.unidades.find((x) => x.id === "a1")!,
        textosManual(),
      ),
    );
    expect(nodos).toHaveLength(1);
    expect(nodos[0]!.height).toBeGreaterThan(area.alto / 2);
    expect(nodos[0]!.height).toBeLessThanOrEqual(caja.alto);
    expect(nodos[0]!.width).toBeLessThanOrEqual(caja.ancho);
  });

  it("el dibujo chico elige la dirección con la que queda más grande", async () => {
    conHijas(6);
    const caja = cajaDibujoManual(areaUtil("carta", "vertical"), {
      titulo: "1  Gerencia General",
      ruta: null,
      jefatura: null,
    });
    const de = (direcciones?: ("vertical" | "horizontal")[]) =>
      dibujoChico(
        {
          alcance: { rama: "r" },
          nivel: "estructura",
          abrirTodo: true,
          config: VISTA_POR_DEFECTO,
          puestosDe: "r",
          pagina: {
            raiz: "r",
            cortadas: new Set(Array.from({ length: 6 }, (_, i) => `h${i}`)),
            fuera: new Set(),
          },
        },
        caja,
        direcciones,
      );
    const abajo = await de(["vertical"]);
    const alLado = await de(["horizontal"]);
    const elegido = await de();
    // Seis hijas en fila no caben a lo ancho de una carta vertical; en columna, sí.
    expect(alLado.escala).toBeGreaterThan(abajo.escala);
    expect(elegido.escala).toBe(Math.max(abajo.escala, alLado.escala));
    expect(elegido.direccion).toBe("horizontal");
    expect(elegido.pagina.svg).toBe(alLado.pagina.svg);
    // Si la de la vista ya cabe sin achicar, se queda con ella.
    conHijas(1);
    expect((await de()).direccion).toBe("vertical");
  });

  it("si el título, la ruta o la jefatura se parten en dos, el dibujo deja ese lugar", async () => {
    const area = areaUtil("carta", "vertical");
    const corta = {
      titulo: "1  Finanzas",
      ruta: "Gerencia",
      jefatura: { etiqueta: "Jefatura: ", texto: "Jefe" },
    };
    const larga =
      "Dirección de Planificación, Control de Gestión y Desarrollo Institucional de la Región Norte";
    const una = cajaDibujoManual(area, corta);
    for (const c of [
      { ...corta, titulo: `1  ${larga}` },
      { ...corta, ruta: `${larga} › ${larga}` },
      { ...corta, jefatura: { etiqueta: "Jefatura: ", texto: `${larga} · ${larga}` } },
    ])
      expect(cajaDibujoManual(area, c).alto).toBeLessThan(una.alto);
    expect(
      cajaDibujoManual(area, { titulo: "1  Finanzas", ruta: null, jefatura: null }).alto,
    ).toBeGreaterThan(una.alto);

    // En el PDF real: con un nombre de tres líneas y un dibujo que llena su caja, el dibujo queda en la página del título.
    conPersonas();
    const org = useOrganizacion();
    org.$patch({
      unidades: org.unidades.map((x) => (x.id === "a1" ? { ...x, nombre: `Zeta ${larga} ${larga}` } : x)),
      puestos: [
        ...org.puestos,
        ...Array.from({ length: 10 }, (_, i) => ({ ...p(`m${i}`, "a1"), cargo_id: "c-x", orden: 2 + i })),
      ],
    });
    const m = await manualDeAlcance(pedido({ alcance: { rama: "a1" } }));
    const paginas = textoPorPagina(await generarDocumento(documentoManual(m, opciones()), () => {}, false));
    const seccion = paginas.findIndex((x) => x.includes("Jefatura"));
    // El título y la tarjeta de la unidad en el dibujo.
    expect(paginas[seccion]!.match(/Zeta/g)!.length).toBeGreaterThanOrEqual(2);
  });

  it("dice cuánto lleva, y se cancela", async () => {
    conPersonas();
    const textos: string[] = [];
    await manualDeAlcance(pedido(), { alAvanzar: (x) => textos.push(x) });
    expect(textos[textos.length - 1]).toBe(t("manual.dibujando", { n: 6, m: 6 }));

    const yaCancelado = new AbortController();
    yaCancelado.abort();
    await expect(manualDeAlcance(pedido(), { senal: yaCancelado.signal })).rejects.toMatchObject({
      name: "AbortError",
    });

    // Cancelar a mitad de los dibujos: no sigue con el resto.
    const control = new AbortController();
    const vistos: string[] = [];
    await expect(
      manualDeAlcance(pedido(), {
        senal: control.signal,
        alAvanzar: (x) => {
          vistos.push(x);
          if (x === t("manual.dibujando", { n: 2, m: 6 })) control.abort();
        },
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(vistos).not.toContain(t("manual.dibujando", { n: 3, m: 6 }));
  });
});
