import { describe, expect, it } from "vitest";
import { hayCoincidenciaExacta, validarFicha, validarFoto } from "./validar";

const base = { estado: "activo" as const, nombre: "Ana", cargo_id: null, correo: "" };

describe("validarFicha", () => {
  it("activo sin nombre pide el nombre", () => {
    expect(validarFicha({ ...base, nombre: "  " })).toEqual({ nombre: "Escribe el nombre." });
  });
  it("vacante sin cargo pide un cargo", () => {
    expect(validarFicha({ ...base, estado: "vacante", nombre: null })).toEqual({
      cargo: "Una vacante necesita un cargo.",
    });
  });
  it("correo inválido", () => {
    expect(validarFicha({ ...base, correo: "ana@" })).toEqual({ correo: "El correo no es válido." });
  });
  it("vacante con cargo y sin nombre ni correo es válida", () => {
    expect(validarFicha({ estado: "vacante", nombre: null, cargo_id: "c1", correo: null })).toEqual({});
  });
  it("correo válido o en blanco no da error", () => {
    expect(validarFicha({ ...base, correo: "ana@ejemplo.cl" })).toEqual({});
    expect(validarFicha({ ...base, correo: "   " })).toEqual({});
  });
});

describe("validarFoto", () => {
  it.each(["image/png", "image/jpeg", "image/webp"])("acepta %s de hasta 1 MB", (type) => {
    expect(validarFoto({ type, size: 1024 * 1024 })).toBeNull();
  });
  it("rechaza otros tipos", () => {
    expect(validarFoto({ type: "image/gif", size: 10 })).toBe("La foto debe ser PNG, JPG o WebP.");
  });
  it("rechaza más de 1 MB", () => {
    expect(validarFoto({ type: "image/png", size: 1024 * 1024 + 1 })).toBe(
      "La foto no puede pesar más de 1 MB.",
    );
  });
});

describe("hayCoincidenciaExacta", () => {
  const valores = [{ nombre: "Analista Sénior" }, { nombre: "Jefe de área" }];
  it("ignora tildes, mayúsculas y espacios", () => {
    expect(hayCoincidenciaExacta(valores, "  analista   senior ")).toBe(true);
  });
  it("una coincidencia parcial no cuenta", () => {
    expect(hayCoincidenciaExacta(valores, "Analista")).toBe(false);
  });
});
