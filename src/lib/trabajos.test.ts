import { beforeEach, describe, expect, it } from "vitest";
import { conTrabajo, iniciarTrabajo, trabajos } from "./trabajos";

beforeEach(() => {
  trabajos.value = [];
});

describe("trabajos en curso", () => {
  it("lista lo que está en curso y lo quita al terminar", () => {
    const a = iniciarTrabajo("A");
    const b = iniciarTrabajo("B");
    expect(trabajos.value).toEqual(["A", "B"]);
    a();
    expect(trabajos.value).toEqual(["B"]);
    b();
    expect(trabajos.value).toEqual([]);
  });

  it("terminar dos veces no quita otro trabajo con el mismo nombre", () => {
    const a = iniciarTrabajo("A");
    iniciarTrabajo("A");
    a();
    a();
    expect(trabajos.value).toEqual(["A"]);
  });

  it("conTrabajo lo quita también si la acción falla", async () => {
    await expect(conTrabajo("A", () => Promise.reject(new Error("no")))).rejects.toThrow("no");
    expect(trabajos.value).toEqual([]);
  });

  it("conTrabajo lo mantiene mientras la acción no termina", async () => {
    let fin = () => {};
    const p = conTrabajo("A", () => new Promise<void>((r) => (fin = r)));
    expect(trabajos.value).toEqual(["A"]);
    fin();
    await p;
    expect(trabajos.value).toEqual([]);
  });
});
