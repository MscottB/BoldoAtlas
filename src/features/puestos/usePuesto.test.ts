import { describe, it, expect, afterEach } from "vitest";
import { usePuesto } from "./usePuesto";

afterEach(() => usePuesto().cerrar());

describe("usePuesto", () => {
  it("nuevo abre un puesto sin crear, para la unidad, y por defecto no es jefatura", () => {
    const c = usePuesto();
    c.nuevo("u1");
    expect(c.abierta.value).toEqual({ id: null, unidadId: "u1", comoJefatura: false });
  });

  it("nuevo desde la lista de Jefatura pide quedar como jefatura al crearse", () => {
    const c = usePuesto();
    c.nuevo("u1", true);
    expect(c.abierta.value).toMatchObject({ id: null, unidadId: "u1", comoJefatura: true });
  });

  it("abrir un puesto existente no arrastra la petición de jefatura", () => {
    const c = usePuesto();
    c.nuevo("u1", true);
    c.abrir("p1");
    expect(c.abierta.value?.comoJefatura).toBeUndefined();
  });
});
