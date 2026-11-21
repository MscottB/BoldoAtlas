import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { VISTA_POR_DEFECTO } from "@/features/arbol/vista";
import { useOrganizacion } from "@/stores/organizacion";
import { MARCA, datos } from "./fixture";
import type { Nivel } from "./niveles";
import { anchoTexto } from "./medida";
import { MARGEN } from "./paginas";
import { documentoPdf, type OpcionesPdf, type PaginaPdf } from "./pdf";
import { generarPdf } from "./pdf.worker";
import { prepararImagen } from "./preparar";
import { textoDelPdf } from "./textoPdf";
import { dibujarSvg } from "./treeSvg";

// Un PNG de 1 × 1, como el logo de la organización.
const LOGO =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const o: OpcionesPdf = {
  hoja: "carta",
  orientacion: "horizontal",
  encabezado: { organizacion: "Atlas SA", alcance: "Toda la organización", fecha: "20-11-2026", logo: LOGO },
  pagina: "Página {n} de {m}",
  titulo: "Organigrama",
};
const svg = (ancho: number, alto: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}" viewBox="0 0 ${ancho} ${alto}" font-family="Inter"><rect width="10" height="10"/></svg>`;

describe("documentoPdf", () => {
  it("documento_lleva_encabezado_y_pie", () => {
    const paginas: PaginaPdf[] = [
      { svg: svg(300, 200), ancho: 300, alto: 200 },
      { svg: svg(300, 200), ancho: 300, alto: 200, arriba: "viene de la página 1" },
    ];
    const d = documentoPdf(paginas, o);
    // Carta horizontal.
    expect(d.pageSize).toEqual({ width: 792, height: 612 });
    expect(d.content).toHaveLength(2);
    expect(d.content[1]).toMatchObject({ pageBreak: "before" });

    const arriba = JSON.stringify(d.header(2, 2));
    for (const x of ["Atlas SA", "Toda la organización", "20-11-2026", "viene de la página 1"])
      expect(arriba).toContain(x);
    expect(JSON.stringify(d.header(1, 2))).not.toContain("viene de");
    const abajo = JSON.stringify(d.footer(2, 2));
    expect(abajo).toContain("Página 2 de 2");
    expect(abajo).toContain(LOGO);
    // Un logo que pdfmake no sabe leer (ni PNG ni JPG) no va.
    const sinLogo = documentoPdf(paginas, {
      ...o,
      encabezado: { ...o.encabezado, logo: "https://x/logo.png" },
    });
    expect(JSON.stringify(sinLogo.footer(1, 2))).not.toContain("https://");
  });

  it("el pie y el título salen en el idioma que se pide", () => {
    const d = documentoPdf([{ svg: svg(10, 10), ancho: 10, alto: 10 }], {
      ...o,
      pagina: "Page {n} of {m}",
      titulo: "Org chart",
    });
    expect(JSON.stringify(d.footer(3, 7))).toContain("Page 3 of 7");
    expect(d.info).toEqual({ title: "Org chart" });
  });

  it("un nombre largo no parte el encabezado: va en una línea, cortado con «…»", () => {
    const largo = "Corporación Nacional de Servicios Integrados del Norte Grande y Asociados ".repeat(4);
    const d = documentoPdf([{ svg: svg(10, 10), ancho: 10, alto: 10, arriba: largo }], {
      ...o,
      orientacion: "vertical",
      encabezado: { ...o.encabezado, organizacion: largo, alcance: largo },
    });
    type Texto = { text: string; noWrap: boolean };
    const [fila, linea] = (d.header(1, 1) as { stack: [{ columns: Texto[] }, Texto] }).stack;
    const [izq, der] = fila.columns;
    const util = 612 - 2 * MARGEN; // carta vertical
    expect(izq!.text.endsWith("…")).toBe(true);
    expect(der!.text.endsWith("…")).toBe(true);
    expect([izq!.noWrap, der!.noWrap, linea.noWrap]).toEqual([true, true, true]);
    expect(anchoTexto(izq!.text, 9, true) + anchoTexto(der!.text, 8)).toBeLessThanOrEqual(util);
    expect(anchoTexto(linea.text, 8)).toBeLessThanOrEqual(util);
  });

  it("el dibujo se achica hasta caber en el área útil, y uno chico no se agranda", () => {
    const d = documentoPdf(
      [
        { svg: svg(7200, 100), ancho: 7200, alto: 100 },
        { svg: svg(100, 50), ancho: 100, alto: 50 },
      ],
      o,
    );
    // Carta horizontal: 792 − 2 cm de ancho útil.
    expect(d.content[0]!.width).toBeCloseTo(792 - 2 * 28.35);
    expect(d.content[0]!.height).toBeCloseTo((100 * (792 - 2 * 28.35)) / 7200);
    expect(d.content[1]).toMatchObject({ width: 100, height: 50 });
  });

  it("en cuadrícula, la primera página es el mapa y cada hoja recorta su parte con marcas de corte", () => {
    const entero = svg(2000, 1000);
    // Cada hoja trae solo su parte, ya recortada (como la da `dibujarSvg` con `recorte`): el mapa sale de `o.mapa`.
    const hoja = (fila: number, columna: number, x: number, ancho = 1000) => ({
      svg: svg(ancho, 1000).replace(/viewBox="[^"]*"/, `viewBox="${x} 0 ${ancho} 1000"`),
      ancho: 2000,
      alto: 1000,
      arriba: `fila ${fila}, columna ${columna}`,
      recorte: { fila, columna, x, y: 0, ancho, alto: 1000 },
    });
    const d = documentoPdf([hoja(1, 1, 0), hoja(1, 2, 1000, 500)], {
      ...o,
      mapa: { svg: entero, ancho: 2000, alto: 1000 },
    });
    expect(d.content).toHaveLength(3);
    const [mapa, , segunda] = d.content as { svg: string; stack?: unknown[] }[];
    // El mapa: el dibujo entero con la cuadrícula numerada encima.
    expect(JSON.stringify(mapa)).toContain('viewBox=\\"0 0 2000 1000\\"');
    expect(JSON.stringify(mapa)).toContain("1·2");
    expect(JSON.stringify(segunda)).toContain('viewBox=\\"1000 0 500 1000\\"');
    // La hoja angosta del final va con la misma escala que las otras: al pegarlas, calzan.
    const ancho = (n: unknown) => (n as { stack: { width: number }[] }).stack[0]!.width;
    expect(ancho(d.content[2]) / 500).toBeCloseTo(ancho(d.content[1]) / 1000);
    expect(JSON.stringify(segunda)).toContain('"canvas"');
    expect(JSON.stringify(d.header(3, 3))).toContain("fila 1, columna 2");
    expect(JSON.stringify(d.footer(1, 3))).toContain("Página 1 de 3");
    // Sin el dibujo entero no hay mapa que hacer: es un error de quien llama.
    expect(() => documentoPdf([hoja(1, 1, 0)], o)).toThrow("o.mapa");
  });

  it("metadatos_sin_personas", () => {
    const d = documentoPdf([{ svg: svg(10, 10), ancho: 10, alto: 10 }], o);
    expect(d.info).toEqual({ title: "Organigrama" });
  });
});

describe("el PDF de verdad, con pdfmake", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    const d = datos();
    useOrganizacion().$patch({
      unidades: d.unidades,
      puestos: d.puestos,
      asignaciones: d.asignaciones,
      trabajadores: [...d.trabajadores.values()],
      org: { nombre: "Atlas SA", logo: null },
      cargado: true,
    });
  });
  // Como en preparar.test.ts: todo dato de personas, cargos, etiquetas y leyendas lleva la marca; Personalizar, todo prendido.
  const sembrar = () => {
    const org = useOrganizacion();
    org.$patch({
      puestos: org.puestos.map((x) => ({ ...x, leyenda_id: "ley" })),
      leyendas: [
        {
          id: "ley",
          nombre: `Leyenda ${MARCA}`,
          color: "#ff0000",
          descripcion: `Desc ${MARCA}`,
          orden: 0,
          deleted_at: null,
        },
      ],
      etiquetas: [{ id: "et", nombre: `Etiqueta ${MARCA}`, color: "#00ff00" }],
      unidadEtiquetas: [{ unidad_id: "g", etiqueta_id: "et" }],
      catalogos: { ...org.catalogos, cargos: [{ id: "cargo", nombre: `Cargo ${MARCA}` }] } as never,
    });
  };
  const todo = { ...VISTA_POR_DEFECTO, verPuestos: true, colorearPor: "leyenda", personasEnTarjetas: true };
  const pdfDe = async (nivel: Nivel) => {
    sembrar();
    const e = await prepararImagen({ alcance: "todo", nivel, abrirTodo: true, config: todo });
    const { svg, ancho, alto } = dibujarSvg(e);
    const paginas = [
      { svg, ancho, alto },
      {
        svg,
        ancho,
        alto,
        arriba: "fila 1, columna 1",
        recorte: { fila: 1, columna: 1, x: 0, y: 0, ancho, alto },
      },
    ];
    return generarPdf(
      paginas,
      { ...o, encabezado: e.encabezado, mapa: { svg, ancho, alto } },
      () => {},
      false,
    );
  };

  it("pdf_estructura_sin_personas", async () => {
    const pdf = await pdfDe("estructura");
    expect(new TextDecoder("latin1").decode(pdf)).not.toContain(MARCA);
    const texto = textoDelPdf(pdf);
    expect(texto).not.toContain(MARCA);
    expect(texto).toContain("Gerencia General");
    // Los metadatos: solo el título genérico y lo que pdfkit pone solo (programa y fecha).
    const info = new TextDecoder("latin1")
      .decode(pdf)
      .match(/\/(Title|Author|Subject|Keywords|Creator|Producer)\b/g);
    expect(new Set(info)).toEqual(new Set(["/Title", "/Creator", "/Producer"]));
  });

  it("control: «Como en pantalla» sí lleva la marca, y así se ve que la búsqueda sirve", async () => {
    const texto = textoDelPdf(await pdfDe("pantalla"));
    expect(texto).toContain(MARCA);
    // El encabezado de la página (texto de pdfmake, no del dibujo) también se lee.
    expect(texto).toContain("Atlas SA");
    expect(texto).toContain("fila"); // con la ligadura «fi»; pdfmake escribe cada palabra aparte
  });

  it("pdf_empieza_con_%PDF", async () => {
    const avance: [number, number][] = [];
    const pdf = await generarPdf([{ svg: svg(100, 50), ancho: 100, alto: 50 }], o, (h, t) =>
      avance.push([h, t]),
    );
    expect(new TextDecoder("latin1").decode(pdf.subarray(0, 5))).toBe("%PDF-");
    expect(avance[avance.length - 1]).toEqual([1, 1]);
  });
});

describe("si el PDF falla", () => {
  it("pdf_armar se dice con su propio texto, en los dos idiomas", async () => {
    const { mensajeFallo } = await import("@/features/respaldos/respaldos");
    const { i18n } = await import("@/i18n");
    for (const idioma of ["es", "en"] as const) {
      i18n.global.locale.value = idioma;
      expect(i18n.global.te("respaldos.error.pdf_armar")).toBe(true);
      expect(mensajeFallo({ codigo: "pdf_armar", detalle: "x" })).toBe(
        i18n.global.t("respaldos.error.pdf_armar", { detalle: "x" }),
      );
    }
    i18n.global.locale.value = "es";
  });

  it("un error al dibujar rechaza, no deja esperando", async () => {
    await expect(generarPdf([{ svg: "<no es svg", ancho: 10, alto: 10 }], o, () => {})).rejects.toThrow();
  });
});
