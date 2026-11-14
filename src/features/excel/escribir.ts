// Pasa las hojas a un .xlsx con el formato de spec §11: encabezado con el color de la marca y fijo, filtro, anchos
// ajustados, números y fechas como tales y el texto siempre como texto. ExcelJS se carga solo al exportar, en el worker
// de escribir.worker.ts.
import { anchos, nombreHoja, textoFecha, type Hoja } from "./libro";

// --marca y --marca-foreground de los estilos: el texto oscuro sobre el cobre es el que contrasta.
const MARCA = "FFC8743F";
const SOBRE_MARCA = "FF111827";

/** El nombre de cada hoja, sin repetir: Excel no abre un libro con dos hojas iguales (sin mirar mayúsculas). */
function sinRepetir(nombre: string, usados: Set<string>): string {
  let n = nombre;
  for (let i = 2; usados.has(n.toLowerCase()); i++) n = `${nombre.slice(0, 31 - ` (${i})`.length)} (${i})`;
  usados.add(n.toLowerCase());
  return n;
}

export async function escribirLibro(hojas: Hoja[]): Promise<Uint8Array> {
  const { Workbook } = (await import("exceljs/dist/exceljs.bare.min.js")).default;
  const libro = new Workbook();
  libro.creator = "BoldoAtlas";
  const usados = new Set<string>();
  for (const h of hojas) {
    const hoja = libro.addWorksheet(sinRepetir(nombreHoja(h.nombre), usados), {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    const w = anchos(h);
    hoja.columns = h.columnas.map((header, i) => ({ header, width: w[i] }));
    const titulos = hoja.getRow(1);
    titulos.font = { bold: true, color: { argb: SOBRE_MARCA } };
    titulos.eachCell((c) => {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: MARCA } };
    });
    // Un string de ExcelJS se escribe siempre como texto (nunca como fórmula): «=», «+», «-» o «@» no se evalúan.
    hoja.addRows(h.filas);
    h.filas.forEach((fila, i) =>
      fila.forEach((valor, j) => {
        if (valor instanceof Date)
          hoja.getCell(i + 2, j + 1).numFmt =
            textoFecha(valor).length > 10 ? "yyyy-mm-dd hh:mm" : "yyyy-mm-dd";
      }),
    );
    hoja.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: h.filas.length + 1, column: h.columnas.length },
    };
  }
  return new Uint8Array(await libro.xlsx.writeBuffer());
}
