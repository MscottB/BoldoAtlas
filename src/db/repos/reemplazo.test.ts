import { describe, expect, it } from "vitest";
import { abrirBasePrueba } from "@/db/prueba/sqlite";
import { TIPOS_SEMILLA } from "./reemplazo";

describe("TIPOS_SEMILLA", () => {
  it("son los mismos que siembra la migración", () => {
    const fresca = abrirBasePrueba()
      .consultar<{ id: string; nombre: string; orden: number }>(
        "SELECT id, nombre, orden FROM tipos_unidad ORDER BY orden",
      )
      .map(({ id, nombre, orden }) => ({ id, nombre, orden }));
    expect(TIPOS_SEMILLA).toEqual(fresca);
  });
});