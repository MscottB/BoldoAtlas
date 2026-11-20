import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { SQL_HISTORICO } from "@/db/repos/historico";
import { a, p, u } from "@/features/arbol/fixture";
import { VISTA_POR_DEFECTO } from "@/features/arbol/vista";
import { useOrganizacion } from "@/stores/organizacion";
import { MARCA, datos } from "./fixture";
import { datosManual, textosManual, type UnidadManual } from "./manual";
import { documentoManual, type OpcionesManual } from "./manualPdf";
import type { PaginaPdf } from "./pdf";
import { generarDocumento } from "./pdf.worker";
import { prepararImagen, type Alcance } from "./preparar";
import { textoDelPdf, textoPorPagina } from "./textoPdf";
import { dibujarSvg } from "./treeSvg";

// «Organigrama a una fecha» lee lo histórico de la base: aquí, de estas filas.
const h = vi.hoisted(() => ({ filas: new Map<string, unknown[]>() }));
vi.mock("@/db/cliente", async (original) => ({
  ...(await original<object>()),
  consultar: async (sql: string) => h.filas.get(sql) ?? [],
}));

// Los cargos, sin la marca: la marca solo va en los nombres de las personas.
const CARGOS = [
  { id: "c-g", nombre: "Gerente" },
  { id: "c-a", nombre: "Jefe" },
  { id: "c-x", nombre: "Analista" },
];

// g (jefa Ximena) › a1 Finanzas (jefe Bruno; un analista con reemplazo de Carla), a2 Operaciones (un analista vacante);
// a2 › s1 Logística, s2 Mantención; s1 › s3 Bodega.
beforeEach(() => {
  setActivePinia(createPinia());
  h.filas.clear();
  const d = datos();
  const org = useOrganizacion();
  org.$patch({
    unidades: d.unidades,
    puestos: d.puestos.map((x) => (x.id === "p-x" ? { ...x, descripcion: "Lleva las cuentas" } : x)),
    asignaciones: d.asignaciones,
    trabajadores: [...d.trabajadores.values()],
    org: { nombre: "Atlas SA", logo: null },
    catalogos: { ...org.catalogos, cargos: CARGOS } as never,
    cargado: true,
  });
});

const numeros = (us: UnidadManual[]) => us.map((x) => `${x.numero} ${x.nombre}`);

const opciones = (conPersonas: boolean): OpcionesManual => ({
  hoja: "carta",
  orientacion: "vertical",
  encabezado: { organizacion: "Atlas SA", alcance: "Toda la organización", fecha: "20-11-2026", logo: null },
  pagina: "Página {n} de {m}",
  titulo: "Manual de organización y funciones",
  conPersonas,
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

describe("datosManual", () => {
  it("numeracion_y_orden", () => {
    expect(numeros(datosManual({ alcance: "todo", conPersonas: false }))).toEqual([
      "1 Gerencia General",
      "1.1 Finanzas",
      "1.2 Operaciones",
      "1.2.1 Logística",
      "1.2.1.1 Bodega",
      "1.2.2 Mantención",
    ]);
    const us = datosManual({ alcance: "todo", conPersonas: false });
    expect(us.find((x) => x.id === "s3")!.ruta).toEqual(["Gerencia General", "Operaciones", "Logística"]);
    expect(us[0]!.ruta).toEqual([]);

    // Los hermanos van en el orden del lienzo; otra unidad sin superior es otra raíz: «2».
    const org = useOrganizacion();
    org.$patch({
      unidades: [
        ...org.unidades.map((x) => (x.id === "s1" ? { ...x, orden: 2 } : x)),
        u("h", "t-g", "Directorio", null, 1),
      ],
    });
    expect(numeros(datosManual({ alcance: "todo", conPersonas: false }))).toEqual([
      "1 Gerencia General",
      "1.1 Finanzas",
      "1.2 Operaciones",
      "1.2.1 Mantención",
      "1.2.2 Logística",
      "1.2.2.1 Bodega",
      "2 Directorio",
    ]);
  });

  it("sin_descripcion_vacante_y_reemplazo", () => {
    const us = datosManual({ alcance: "todo", conPersonas: true });
    const de = (id: string) => us.find((x) => x.id === id)!;
    expect(de("g").jefatura).toBe(`Ximena Quiroga ${MARCA}`);
    expect(de("a1").puestos).toEqual([
      { cargo: "Jefe", descripcion: null, estado: "ocupado", titular: `Bruno ${MARCA}` },
      { cargo: "Analista", descripcion: "Lleva las cuentas", estado: "vacante", reemplazo: `Carla ${MARCA}` },
    ]);
    // Sin jefatura y con un puesto vacante: ni la jefatura ni el titular aparecen.
    expect(de("a2")).not.toHaveProperty("jefatura");
    expect(de("a2").puestos).toEqual([{ cargo: "Analista", descripcion: null, estado: "vacante" }]);
    expect(de("s1").puestos).toEqual([]);

    // En el documento: «Sin descripción», el estado y el reemplazo, con sus textos.
    const t = textosManual();
    const doc = JSON.stringify(
      documentoManual({ unidades: us, general: [], dibujos: new Map() }, opciones(true)).content,
    );
    for (const x of [t.sinDescripcion, t.vacante, t.ocupado, `${t.reemplazo}: Carla ${MARCA}`, t.ocupa])
      expect(doc).toContain(x);
  });

  it("rama_como_alcance", () => {
    const us = datosManual({ alcance: { rama: "a2" }, conPersonas: false });
    expect(numeros(us)).toEqual(["1 Operaciones", "1.1 Logística", "1.1.1 Bodega", "1.2 Mantención"]);
    // La ruta dice dónde está la rama en la organización.
    expect(us[0]!.ruta).toEqual(["Gerencia General"]);
    expect(us[2]!.ruta).toEqual(["Gerencia General", "Operaciones", "Logística"]);
  });

  it("fecha_elegida", async () => {
    const vida = { created_at: "2025-01-01T12:00:00Z", deleted_at: null };
    h.filas.set(SQL_HISTORICO.unidades, [
      { ...u("g", "t", "Gerencia General", null), jefe_puesto_id: "p-g", ...vida },
      { ...u("a1", "t", "Finanzas", "g"), ...vida },
      { ...u("nueva", "t", "Creada en junio", "g", 1), ...vida, created_at: "2026-06-01T12:00:00Z" },
    ]);
    h.filas.set(SQL_HISTORICO.puestos, [
      { ...p("p-g", "g"), cargo_id: "c-g", ...vida },
      { ...p("p-a1", "a1"), cargo_id: "c-a", ...vida },
    ]);
    h.filas.set(SQL_HISTORICO.asignaciones, [
      // Ximena dejó la gerencia en marzo; Bruno llegó a Finanzas en mayo.
      { ...a("x1", "p-g", "w1", "titular", "2026-03-01"), desde: "2025-01-01", ...vida },
      { ...a("x2", "p-a1", "w2"), desde: "2026-05-01", ...vida },
    ]);
    h.filas.set(
      SQL_HISTORICO.trabajadores,
      useOrganizacion().trabajadores.map((w) => ({ ...w, ...vida })),
    );
    expect((await useOrganizacion().verAFecha("2026-02-01")).ok).toBe(true);

    const us = datosManual({ alcance: "todo", conPersonas: true });
    expect(numeros(us)).toEqual(["1 Gerencia General", "1.1 Finanzas"]);
    expect(us[0]!.jefatura).toBe(`Ximena Quiroga ${MARCA}`);
    expect(us[0]!.puestos).toEqual([
      { cargo: "Gerente", descripcion: null, estado: "ocupado", titular: `Ximena Quiroga ${MARCA}` },
    ]);
    expect(us[1]!.puestos).toEqual([{ cargo: "Jefe", descripcion: null, estado: "vacante" }]);
  });

  it("sin_personas_no_junta_nombres", () => {
    const us = datosManual({ alcance: "todo", conPersonas: false });
    expect(JSON.stringify(us)).not.toContain(MARCA);
    for (const x of us) {
      expect(x).not.toHaveProperty("jefatura");
      for (const y of x.puestos) {
        expect(y).not.toHaveProperty("titular");
        expect(y).not.toHaveProperty("reemplazo");
      }
    }
    // El estado sí está: se sabe si el puesto está ocupado sin saber por quién.
    expect(us.find((x) => x.id === "a1")!.puestos.map((y) => y.estado)).toEqual(["ocupado", "vacante"]);
  });
});

describe("el manual en PDF, con pdfmake", () => {
  // Los dibujos, como los armará la ventana: Estructura sin personas, Presentación con ellas.
  const armar = async (alcance: Alcance, conPersonas: boolean) => {
    const nivel = conPersonas ? "presentacion" : "estructura";
    const dibujo = async (a: Alcance): Promise<PaginaPdf> =>
      dibujarSvg(await prepararImagen({ alcance: a, nivel, abrirTodo: true, config: VISTA_POR_DEFECTO }), {
        sinEncabezado: true,
      });
    const unidades = datosManual({ alcance, conPersonas });
    const general = [{ ...(await dibujo(alcance)), arriba: "Viene de la página 1" }];
    const dibujos = new Map<string, PaginaPdf>();
    for (const x of unidades) dibujos.set(x.id, await dibujo({ rama: x.id }));
    const doc = documentoManual({ unidades, general, dibujos }, opciones(conPersonas));
    return { doc, pdf: await generarDocumento(doc, () => {}, false) };
  };

  it("manual_sin_personas_no_lleva_nombres", async () => {
    const { doc, pdf } = await armar("todo", false);
    expect(new TextDecoder("latin1").decode(pdf)).not.toContain(MARCA);
    const texto = textoDelPdf(pdf);
    expect(texto).not.toContain(MARCA);
    expect(texto).not.toContain("Ximena");
    // Se lee lo que sí va: la tabla, la portada y los dibujos.
    for (const x of ["Analista", "Vacante", "Ocupado", "Mantención", "BoldoAtlas"])
      expect(texto).toContain(x);
    // El organigrama general va en el índice, en la página 3, con su «viene de» bajo el encabezado.
    const paginas = textoPorPagina(pdf).map((x) => x.split("\n").map((y) => y.trim()));
    expect(paginas[1]).toEqual(expect.arrayContaining(["Organigrama", "general", "3"]));
    expect(paginas[2]).toContain("Organigrama general · Viene de la página 1");
    // Los metadatos: solo el título y lo que pdfkit pone solo (programa y fecha).
    expect(doc.info).toEqual({ title: "Manual de organización y funciones" });
    const info = new TextDecoder("latin1")
      .decode(pdf)
      .match(/\/(Title|Author|Subject|Keywords|Creator|Producer)\b/g);
    expect(new Set(info)).toEqual(new Set(["/Title", "/Creator", "/Producer"]));
  });

  it("control: con personas el manual sí lleva los nombres, y así se ve que la búsqueda sirve", async () => {
    const texto = textoDelPdf((await armar("todo", true)).pdf);
    expect(texto).toContain(MARCA);
    expect(texto).toContain("Ximena");
    expect(texto).toContain("Carla");
  });

  it("indice_lleva_cada_unidad", async () => {
    const unidades = datosManual({ alcance: "todo", conPersonas: false });
    // Sin dibujos: cada sección cabe en su página, y la página de cada una se sabe de antemano.
    const doc = documentoManual({ unidades, general: [], dibujos: new Map() }, opciones(false));
    const paginas = textoPorPagina(await generarDocumento(doc, () => {}, false));
    // Portada, índice y una página por unidad.
    expect(paginas).toHaveLength(2 + unidades.length);
    // Cada palabra va aparte, con su espacio.
    const indice = paginas[1]!.split("\n").map((x) => x.trim());
    expect(indice).toContain(textosManual().indice);
    unidades.forEach((x, i) => {
      expect(indice).toContain(x.numero);
      for (const palabra of x.nombre.split(" ")) expect(indice).toContain(palabra);
      // El número de página lo pone pdfmake: la portada, el índice y luego las secciones.
      expect(indice).toContain(String(3 + i));
      expect(paginas[2 + i]).toContain(x.nombre.split(" ")[0]);
    });
  });
});
