import { describe, expect, it } from "vitest";
import { anchos, fechaExcel, hojaInformacion, momentoExcel, nombreArchivo, nombreHoja } from "./libro";

const t = (clave: string) => `[${clave}]`;

describe("nombre del archivo", () => {
  it("es Organizacion_AAAA-MM-DD_rN.xlsx, sin lo que un sistema de archivos no acepta", () => {
    expect(nombreArchivo("Minera Los Andes S.A.", "2026-11-14", 37)).toBe(
      "Minera_Los_Andes_S_A__2026-11-14_r37.xlsx",
    );
    expect(nombreArchivo("Ñuñoa: Sur/Norte*", "2026-01-02", 0)).toBe("Ñuñoa__Sur_Norte__2026-01-02_r0.xlsx");
  });

  it("sin nombre de organización usa BoldoAtlas", () => {
    expect(nombreArchivo("  ", "2026-11-14", 3)).toBe("BoldoAtlas_2026-11-14_r3.xlsx");
  });
});

describe("nombre de hoja", () => {
  it("quita lo que Excel no acepta y corta en 31 caracteres", () => {
    expect(nombreHoja("Cargos: [activos]/inactivos?")).toBe("Cargos_ _activos__inactivos_");
    expect(nombreHoja("x".repeat(40))).toHaveLength(31);
    expect(nombreHoja("   ")).toBe("Hoja");
    expect(nombreHoja("'Taller'")).toBe("Taller");
  });
});

describe("fechas", () => {
  it("un día queda como ese día en Excel, sin correrse por la zona horaria", () => {
    expect(fechaExcel("2026-11-14").toISOString()).toBe("2026-11-14T00:00:00.000Z");
  });

  it("un momento queda con la hora del reloj de este computador", () => {
    const local = new Date(2026, 10, 14, 9, 30, 15);
    expect(momentoExcel(local).toISOString()).toBe("2026-11-14T09:30:15.000Z");
  });
});

describe("hoja Información", () => {
  const datos = {
    organizacion: "Minera",
    generado: new Date(2026, 10, 14, 9, 30),
    versionApp: "0.9.0",
    versionEsquema: 21,
    revision: 37,
    dbId: "0193-abc",
    lista: "Directorio",
    fecha: "2026-11-14",
    filtros: [["Unidad", "Operaciones"]] as [string, string][],
    orden: "Persona (ascendente)",
  };

  it("lleva organización, fecha, versiones, revisión, db_id, la lista y sus filtros", () => {
    const h = hojaInformacion(datos, t);
    expect(h.nombre).toBe("[excel.info.hoja]");
    expect(h.columnas).toEqual(["[excel.info.dato]", "[excel.info.valor]"]);
    expect(h.filas).toEqual([
      ["[excel.info.organizacion]", "Minera"],
      ["[excel.info.generado]", momentoExcel(datos.generado)],
      ["[excel.info.datosAl]", fechaExcel("2026-11-14")],
      ["[excel.info.versionApp]", "0.9.0"],
      ["[excel.info.versionEsquema]", 21],
      ["[excel.info.revision]", 37],
      ["[excel.info.dbId]", "0193-abc"],
      ["[excel.info.lista]", "Directorio"],
      ["Unidad", "Operaciones"],
      ["[excel.info.orden]", "Persona (ascendente)"],
    ]);
  });

  it("sin filtros lo dice; sin orden que elegir, no lo menciona", () => {
    const h = hojaInformacion({ ...datos, filtros: [], orden: undefined }, t);
    expect(h.filas[h.filas.length - 1]).toEqual(["[excel.info.filtros]", "[excel.info.sinFiltros]"]);
  });
});

describe("anchos de columna", () => {
  it("según el texto más largo de cada columna, con un mínimo y un máximo", () => {
    const h = {
      nombre: "x",
      columnas: ["Persona", "N"],
      filas: [
        ["Ana", 12345],
        ["x".repeat(200), null],
      ],
    };
    expect(anchos(h)).toEqual([60, 8]);
    expect(anchos({ ...h, filas: [["Ana María Pérez", 1]] })).toEqual([17, 8]);
  });

  it("una fecha mide lo que se ve (AAAA-MM-DD)", () => {
    expect(anchos({ nombre: "x", columnas: ["F"], filas: [[fechaExcel("2026-11-14")]] })).toEqual([12]);
  });
});
