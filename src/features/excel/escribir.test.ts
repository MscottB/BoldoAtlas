import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs/dist/exceljs.bare.min.js";
import { escribirLibro } from "./escribir";
import { fechaExcel, momentoExcel, type Hoja } from "./libro";

// Se lee de vuelta con la misma ExcelJS: lo que importa es lo que queda en el archivo.
async function leer(bytes: Uint8Array) {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(bytes.buffer as ArrayBuffer);
  return libro;
}

const lista: Hoja = {
  nombre: "Directorio",
  columnas: ["Persona", "Días", "Desde"],
  filas: [
    ["=SUMA(A1:A9)", 120, fechaExcel("2026-11-14")],
    ["+56 9 1234 5678", 0, null],
    ["-Ana", null, null],
    ["@Beto", 3.5, null],
  ],
};

describe("escribir el libro", () => {
  it("un .xlsx (zip) con las hojas en orden y sus nombres válidos para Excel", async () => {
    const bytes = await escribirLibro([lista, { nombre: "Info: [x]", columnas: ["A"], filas: [] }]);
    expect([...bytes.slice(0, 2)]).toEqual([0x50, 0x4b]); // PK
    const libro = await leer(bytes);
    expect(libro.worksheets.map((h) => h.name)).toEqual(["Directorio", "Info_ _x_"]);
  });

  it("el texto queda como texto, también si empieza con =, +, - o @", async () => {
    const h = (await leer(await escribirLibro([lista]))).getWorksheet("Directorio")!;
    for (const [fila, texto] of [
      [2, "=SUMA(A1:A9)"],
      [3, "+56 9 1234 5678"],
      [4, "-Ana"],
      [5, "@Beto"],
    ] as const) {
      const c = h.getCell(fila, 1);
      expect(c.type).toBe(ExcelJS.ValueType.String);
      expect(c.value).toBe(texto);
      expect(c.formula).toBeUndefined();
    }
  });

  it("números y fechas son números y fechas de Excel", async () => {
    const h = (await leer(await escribirLibro([lista]))).getWorksheet("Directorio")!;
    expect(h.getCell(2, 2).type).toBe(ExcelJS.ValueType.Number);
    expect(h.getCell(2, 2).value).toBe(120);
    expect(h.getCell(2, 3).type).toBe(ExcelJS.ValueType.Date);
    expect((h.getCell(2, 3).value as Date).toISOString()).toBe("2026-11-14T00:00:00.000Z");
    expect(h.getCell(2, 3).numFmt).toBe("yyyy-mm-dd");
    expect(h.getCell(3, 3).type).toBe(ExcelJS.ValueType.Null);
  });

  it("un momento lleva la hora", async () => {
    const m = momentoExcel(new Date(2026, 10, 14, 9, 30));
    const h = (
      await leer(await escribirLibro([{ nombre: "I", columnas: ["F"], filas: [[m]] }]))
    ).getWorksheet("I")!;
    expect(h.getCell(2, 1).numFmt).toBe("yyyy-mm-dd hh:mm");
  });

  it("encabezado con el color de la marca, fijo al desplazarse, con filtro y anchos ajustados", async () => {
    const h = (await leer(await escribirLibro([lista]))).getWorksheet("Directorio")!;
    expect(h.getRow(1).values).toEqual([undefined, "Persona", "Días", "Desde"]);
    const titulo = h.getCell(1, 1);
    expect(titulo.font?.bold).toBe(true);
    expect(titulo.fill).toMatchObject({ type: "pattern", pattern: "solid", fgColor: { argb: "FFC8743F" } });
    expect(h.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    expect(h.autoFilter).toBe("A1:C5");
    expect(h.columns.map((c) => c.width)).toEqual([17, 8, 12]);
  });

  it("dos hojas con el mismo nombre no rompen el libro", async () => {
    const libro = await leer(await escribirLibro([lista, lista]));
    expect(libro.worksheets.map((h) => h.name)).toEqual(["Directorio", "Directorio (2)"]);
  });

  it("el logo va como imagen a la derecha de los datos, sin taparlos; sin logo no hay imagen", async () => {
    const png =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNoAAAAggCBd81ytgAAAABJRU5ErkJggg==";
    const info: Hoja = { nombre: "Información", columnas: ["Dato", "Valor"], filas: [["A", "b"]] };
    const con = (await leer(await escribirLibro([{ ...info, imagen: { png } }]))).getWorksheet(
      "Información",
    )!;
    const imagenes = con.getImages();
    expect(imagenes).toHaveLength(1);
    expect(imagenes[0]!.range.tl.col).toBeGreaterThanOrEqual(info.columnas.length);
    const sin = (await leer(await escribirLibro([info]))).getWorksheet("Información")!;
    expect(sin.getImages()).toHaveLength(0);
  });

  it("un logo que no es PNG no se pone (ni rompe el libro)", async () => {
    const h: Hoja = {
      nombre: "I",
      columnas: ["A"],
      filas: [],
      imagen: { png: "/9j/4AAQSkZJRgABAQAAAQABAAD" },
    };
    expect((await leer(await escribirLibro([h]))).getWorksheet("I")!.getImages()).toHaveLength(0);
  });

  it("una celda de texto más larga de lo que Excel acepta se corta con «…»", async () => {
    const h = { nombre: "Notas", columnas: ["Notas"], filas: [["n".repeat(50_000)]] };
    const celda = (await leer(await escribirLibro([h]))).getWorksheet("Notas")!.getCell(2, 1).value as string;
    expect(celda).toHaveLength(32_767);
    expect(celda.endsWith("…")).toBe(true);
  });
});
