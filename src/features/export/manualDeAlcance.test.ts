import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { i18n } from "@/i18n";
import { u } from "@/features/arbol/fixture";
import { VISTA_POR_DEFECTO } from "@/features/arbol/vista";
import { useOrganizacion } from "@/stores/organizacion";
import { MARCA, datos } from "./fixture";
import { paginasDelPdf } from "./formatos";
import { textosManual } from "./manual";
import { manualDeAlcance, type PedidoManual } from "./manualDeAlcance";
import { documentoManual, type OpcionesManual } from "./manualPdf";
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
  portada: {
    organizacion: "Atlas SA",
    alcance: "Toda la organización",
    fecha: "20 de noviembre de 2026",
    version: "BoldoAtlas 0.13.0",
    revision: "Revisión de los datos: 42",
    logo: null,
  },
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
