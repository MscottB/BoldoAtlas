import { describe, expect, it } from "vitest";
import { TIPO_AREA, TIPO_GERENCIA, TIPO_OTRA, TIPO_SUBAREA, type ValorCatalogo } from "@/db/tipos";
import { tiposARenombrar } from "./semillas";

const v = (id: string, nombre: string, deleted_at: string | null = null): ValorCatalogo => ({
  id,
  nombre,
  orden: 0,
  deleted_at,
});
const sembrados = () => [
  v(TIPO_GERENCIA, "Gerencia"),
  v(TIPO_AREA, "Área"),
  v(TIPO_SUBAREA, "Subárea"),
  v(TIPO_OTRA, "Otra"),
];
const sinUso = () => 0;

describe("tiposARenombrar", () => {
  it("en inglés renombra los cuatro sembrados sin uso", () => {
    expect(tiposARenombrar(sembrados(), sinUso, "en")).toEqual([
      { id: TIPO_GERENCIA, nombre: "Management" },
      { id: TIPO_AREA, nombre: "Area" },
      { id: TIPO_SUBAREA, nombre: "Sub-area" },
      { id: TIPO_OTRA, nombre: "Other" },
    ]);
  });
  it("en español no renombra nada", () => {
    expect(tiposARenombrar(sembrados(), sinUso, "es")).toEqual([]);
  });
  it("deja los que ya se usan", () => {
    const r = tiposARenombrar(sembrados(), (id) => (id === TIPO_AREA ? 3 : 0), "en");
    expect(r.map((x) => x.id)).not.toContain(TIPO_AREA);
    expect(r).toHaveLength(3);
  });
  it("deja los que el usuario ya renombró o agregó", () => {
    const tipos = [v(TIPO_GERENCIA, "División"), v(TIPO_AREA, "Área"), v("otro", "Planta")];
    expect(tiposARenombrar(tipos, sinUso, "en")).toEqual([{ id: TIPO_AREA, nombre: "Area" }]);
  });
  it("no renombra a un nombre que otro tipo activo ya tiene", () => {
    const tipos = [v(TIPO_AREA, "Área"), v("otro", "Area")];
    expect(tiposARenombrar(tipos, sinUso, "en")).toEqual([]);
  });
  it("ignora los desactivados", () => {
    expect(tiposARenombrar([v(TIPO_AREA, "Área", "2026-01-01")], sinUso, "en")).toEqual([]);
  });
});
