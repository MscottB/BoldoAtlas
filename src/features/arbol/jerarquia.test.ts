import { describe, expect, it } from "vitest";
import { t, trabajadores, unidades } from "./fixture";
import {
  creaCiclo,
  descendientes,
  dotacion,
  gerenciaYArea,
  hijos,
  indexar,
  indiceHijos,
  ruta,
  rutaTexto,
} from "./jerarquia";

describe("jerarquía", () => {
  it("indexar indexa por id", () => {
    expect(indexar(unidades).get("mecanica")?.nombre).toBe("Mecánica");
  });

  it("hijos ordena por orden y luego nombre, e ignora borradas", () => {
    expect(hijos(unidades, "gg").map((x) => x.id)).toEqual(["operaciones", "finanzas"]);
    expect(hijos(unidades, "mantencion").map((x) => x.id)).toEqual(["electrica", "mecanica"]);
  });

  it("ruta y rutaTexto van de la raíz a la unidad", () => {
    expect(ruta(unidades, "mecanica").map((x) => x.id)).toEqual([
      "gg",
      "operaciones",
      "mantencion",
      "mecanica",
    ]);
    expect(rutaTexto(unidades, "mecanica")).toBe("Gerencia General › Operaciones › Mantención › Mecánica");
  });

  it("descendientes no incluye la propia unidad ni las borradas", () => {
    expect(descendientes(unidades, "operaciones")).toEqual(new Set(["mantencion", "mecanica", "electrica"]));
  });

  it("creaCiclo detecta mover bajo sí misma o bajo un descendiente", () => {
    expect(creaCiclo(unidades, "operaciones", "mecanica")).toBe(true);
    expect(creaCiclo(unidades, "mecanica", "finanzas")).toBe(false);
    expect(creaCiclo(unidades, "x", "x")).toBe(true);
    expect(creaCiclo(unidades, "gg", null)).toBe(false);
  });

  it("dotacion cuenta activos directos, activos de la rama y vacantes de la rama", () => {
    expect(dotacion(unidades, trabajadores, "mantencion")).toEqual({ directa: 1, total: 5, vacantes: 1 });
    expect(dotacion(unidades, trabajadores, "gg")).toEqual({ directa: 1, total: 6, vacantes: 2 });
  });

  it("dotacion ignora trabajadores borrados", () => {
    const conBorrado = [
      ...trabajadores,
      { ...t("t9", "mantencion"), deleted_at: "2026-01-01T00:00:00.000Z" },
    ];
    expect(dotacion(unidades, conBorrado, "mantencion")).toEqual({ directa: 1, total: 5, vacantes: 1 });
  });

  it("gerenciaYArea deriva gerencia, área y subárea de los ancestros", () => {
    expect(gerenciaYArea(unidades, "mecanica")).toEqual({
      gerencia: "Operaciones",
      area: "Mantención",
      subarea: "Mecánica",
    });
    expect(gerenciaYArea(unidades, "finanzas")).toEqual({ gerencia: "Finanzas", area: null, subarea: null });
  });
});

describe("indiceHijos", () => {
  it("agrupa igual que hijos para cada unidad y para las raíces", () => {
    const indice = indiceHijos(unidades);
    for (const x of unidades) expect(indice.get(x.id) ?? []).toEqual(hijos(unidades, x.id));
    expect(indice.get(null)?.map((x) => x.id)).toEqual(["gg"]);
  });
});
