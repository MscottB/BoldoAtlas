import { describe, expect, it } from "vitest";
import { celdaExcel } from "./libro";
import { hojasPersona, type AsignacionHistorica } from "./persona";

const t = (clave: string) => `[${clave}]`;
const nombres = {
  tipos_contrato: [{ id: "c1", nombre: "Indefinido", orden: 0, deleted_at: null }],
  sedes: [{ id: "s1", nombre: "Norte", orden: 0, deleted_at: null }],
  jornadas: [{ id: "j1", nombre: "Completa", orden: 0, deleted_at: null }],
};
const persona = {
  id: "w1",
  nombre: "Ana Pérez",
  correo: "ana@x.cl",
  telefono: "+56 9 1111",
  tipo_contrato_id: "c1",
  sede_id: "s1",
  jornada_id: "j1",
  tiene_foto: 1,
  updated_at: "2026-01-01T00:00:00Z",
  notas: "Prefiere reunirse en la mañana",
};
const asig = (a: Partial<AsignacionHistorica>): AsignacionHistorica => ({
  unidad: "Ventas",
  cargo: "Analista",
  tipo: "titular",
  desde: "2024-01-01",
  hasta: null,
  motivo: null,
  ...a,
});

describe("hojasPersona", () => {
  it("Datos lleva nombre, correo, teléfono, contrato, sede, jornada y notas; sin foto", () => {
    const [datos] = hojasPersona(persona, [], nombres, t);
    expect(datos!.nombre).toBe("[excel.persona.datos]");
    const f = Object.fromEntries(datos!.filas.map(([k, v]) => [k, v]));
    expect(f).toEqual({
      "[ficha.nombre]": "Ana Pérez",
      "[ficha.correo]": "ana@x.cl",
      "[ficha.telefono]": "+56 9 1111",
      "[ficha.tipoContrato]": "Indefinido",
      "[ficha.sede]": "Norte",
      "[ficha.jornada]": "Completa",
      "[ficha.notas]": "Prefiere reunirse en la mañana",
    });
    expect(datos!.filas).toHaveLength(7);
  });

  it("lo que falta queda vacío", () => {
    const [datos] = hojasPersona(
      { ...persona, correo: null, telefono: null, tipo_contrato_id: null, notas: null },
      [],
      nombres,
      t,
    );
    expect(datos!.filas.filter(([, v]) => v === null)).toHaveLength(4);
  });

  it("Puestos trae también las asignaciones terminadas, con unidad, cargo, tipo, desde, hasta y motivo", () => {
    const [, puestos] = hojasPersona(
      persona,
      [
        asig({
          hasta: "2024-06-30",
          motivo: "Renuncia",
          tipo: "reemplazo",
          cargo: "Jefa",
          unidad: "Compras",
        }),
        asig({}),
      ],
      nombres,
      t,
    );
    expect(puestos!.nombre).toBe("[excel.persona.puestos]");
    expect(puestos!.columnas).toEqual(
      ["unidad", "cargo", "tipo", "desde", "hasta", "motivo"].map((c) => `[excel.persona.${c}]`),
    );
    expect(puestos!.filas).toHaveLength(2);
    const [terminada, vigente] = puestos!.filas;
    expect(terminada!.slice(0, 3)).toEqual(["Compras", "Jefa", "[puesto.tipo.reemplazo]"]);
    expect((terminada![3] as Date).toISOString()).toBe("2024-01-01T00:00:00.000Z");
    expect((terminada![4] as Date).toISOString()).toBe("2024-06-30T00:00:00.000Z");
    expect(terminada![5]).toBe("Renuncia");
    expect(vigente![4]).toBeNull();
  });

  it("un texto que empieza con = sigue siendo texto", () => {
    const [datos, puestos] = hojasPersona(
      { ...persona, notas: "=1+1" },
      [asig({ motivo: "@x" })],
      nombres,
      t,
    );
    // lo que escribir.ts hace con cada celda: un string va como texto, nunca como fórmula
    const celdas = [datos!.filas[6]![1], puestos!.filas[0]![5]].map(celdaExcel);
    expect(celdas).toEqual(["=1+1", "@x"]);
    expect(celdas.every((c) => typeof c === "string")).toBe(true);
  });
});
