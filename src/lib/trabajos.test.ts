import { beforeEach, describe, expect, it } from "vitest";
import { conTrabajo, iniciarTrabajo, trabajos, ultimoFin } from "./trabajos";

beforeEach(() => {
  trabajos.value = [];
  ultimoFin.value = null;
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

  it("conTrabajo lo quita también si la acción falla, y deja dicho que falló", async () => {
    await expect(conTrabajo("A", () => Promise.reject(new Error("no")))).rejects.toThrow("no");
    expect(trabajos.value).toEqual([]);
    expect(ultimoFin.value).toEqual({ nombre: "A", fallo: true });
  });

  it("sin fallo, deja dicho que terminó bien", async () => {
    await conTrabajo("A", async () => {});
    expect(ultimoFin.value).toEqual({ nombre: "A", fallo: false });
  });

  it("terminar dos veces no cambia cómo terminó", () => {
    const a = iniciarTrabajo("A");
    a(true);
    a();
    expect(ultimoFin.value).toEqual({ nombre: "A", fallo: true });
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
