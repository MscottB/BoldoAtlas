import { describe, it, expect, beforeEach } from "vitest";
import { abrirBasePrueba, type BasePrueba } from "@/db/prueba/sqlite";
import { crearUnidad } from "./unidades";
import { crearEtiqueta, etiquetarUnidad, quitarEtiqueta } from "./etiquetas";
import { TIPO_GERENCIA } from "@/db/tipos";

let bd: BasePrueba;
let unidadId: string;
let etiquetaId: string;
const activas = () => bd.consultar("SELECT id FROM unidad_etiquetas WHERE deleted_at IS NULL");

beforeEach(() => {
  bd = abrirBasePrueba();
  const u = crearUnidad({ tipo_id: TIPO_GERENCIA, nombre: "Operaciones" });
  const e = crearEtiqueta("Crítica", "#C8743F");
  bd.aplicar([...u.sentencias, ...e.sentencias]);
  unidadId = u.id;
  etiquetaId = e.id;
});

describe("etiquetas", () => {
  it("etiquetar dos veces lo mismo falla por UNIQUE", () => {
    bd.aplicar(etiquetarUnidad(unidadId, etiquetaId));
    expect(() => bd.aplicar(etiquetarUnidad(unidadId, etiquetaId))).toThrow(/UNIQUE/);
  });

  it("quitar marca deleted_at y permite volver a etiquetar", () => {
    bd.aplicar(etiquetarUnidad(unidadId, etiquetaId));
    bd.aplicar(quitarEtiqueta(unidadId, etiquetaId));
    expect(activas()).toHaveLength(0);
    expect(() => bd.aplicar(etiquetarUnidad(unidadId, etiquetaId))).not.toThrow();
    expect(activas()).toHaveLength(1);
  });
});
