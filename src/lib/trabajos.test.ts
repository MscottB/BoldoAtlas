import { beforeEach, describe, expect, it } from "vitest";
import {
  conOrganizacion,
  conTrabajo,
  deLaAbierta,
  iniciarTrabajo,
  registrarAbierta,
  trabajos,
  ultimoFin,
} from "./trabajos";

beforeEach(() => {
  trabajos.value = [];
  ultimoFin.value = null;
});

describe("conOrganizacion", () => {
  it("con una sola organización, el trabajo se nombra como hoy", () => {
    expect(conOrganizacion("Respaldo", "Alfa", false)).toBe("Respaldo");
  });

  it("con varias, nombra la organización", () => {
    expect(conOrganizacion("Respaldo", "Alfa", true)).toBe("Alfa · Respaldo");
  });

  it("sin nombre no deja un separador suelto", () => {
    expect(conOrganizacion("Respaldo", "", true)).toBe("Respaldo");
  });
});

describe("deLaAbierta", () => {
  it("sin nadie que la registre, el trabajo se nombra como hoy", () => {
    expect(deLaAbierta("Respaldo")).toBe("Respaldo");
  });

  it("nombra la que está abierta en ese momento, no la de antes", () => {
    let nombre = "Alfa";
    registrarAbierta(() => ({ nombre, varias: true }));
    expect(deLaAbierta("Respaldo")).toBe("Alfa · Respaldo");
    nombre = "Beta";
    expect(deLaAbierta("Respaldo")).toBe("Beta · Respaldo");
    registrarAbierta(() => ({ nombre: "", varias: false }));
  });
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
