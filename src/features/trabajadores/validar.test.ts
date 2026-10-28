import { describe, expect, it } from "vitest";
import {
  camposGuardables,
  cambiosFicha,
  hayCambiosSinGuardar,
  hayCoincidenciaExacta,
  validarFicha,
  validarFoto,
  type DatosFicha,
} from "./validar";

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

const vacia: DatosFicha = {
  estado: "activo",
  nombre: null,
  correo: null,
  telefono: null,
  cargo_id: null,
  tipo_contrato_id: null,
  sede_id: null,
  jornada_id: null,
  unidad_id: "u1",
  foto_png: null,
  notas: null,
};
const guardada: DatosFicha = { ...vacia, nombre: "Ana", correo: "ana@x.cl" };

describe("guardar cada campo válido", () => {
  it("correo inválido y teléfono editados: solo el teléfono se guarda", () => {
    const form = { ...guardada, correo: "ana@", telefono: "123" };
    const cambios = cambiosFicha(form, guardada);
    expect(Object.keys(cambios).sort()).toEqual(["correo", "telefono"]);
    expect(camposGuardables(cambios, validarFicha(form))).toEqual({ telefono: "123" });
  });
  it("la foto se guarda sola aunque otro campo sea inválido", () => {
    const form = { ...guardada, correo: "ana@", foto_png: "AAAA" };
    expect(camposGuardables(cambiosFicha(form, guardada), validarFicha(form))).toEqual({ foto_png: "AAAA" });
  });
  it("pasar a Persona sin nombre no se guarda hasta tener nombre", () => {
    const vacante = { ...vacia, estado: "vacante" as const, cargo_id: "c1" };
    const form = { ...vacante, estado: "activo" as const };
    expect(camposGuardables(cambiosFicha(form, vacante), validarFicha(form))).toEqual({});
    const conNombre = { ...form, nombre: " Luis " };
    expect(camposGuardables(cambiosFicha(conNombre, vacante), validarFicha(conNombre))).toEqual({
      estado: "activo",
      nombre: "Luis",
    });
  });
});

describe("hayCambiosSinGuardar", () => {
  it("ficha nueva sin ninguna entrada: no hay nada que perder", () => {
    expect(hayCambiosSinGuardar(vacia, vacia)).toBe(false);
    expect(hayCambiosSinGuardar({ ...vacia, nombre: "  ", telefono: "" }, vacia)).toBe(false);
  });
  it("ficha nueva con entrada: sí", () => {
    expect(hayCambiosSinGuardar({ ...vacia, sede_id: "s1" }, vacia)).toBe(true);
  });
  it("ficha guardada con un campo inválido pendiente: sí; sin diferencias: no", () => {
    expect(hayCambiosSinGuardar({ ...guardada, correo: "ana@" }, guardada)).toBe(true);
    expect(hayCambiosSinGuardar({ ...guardada, nombre: " Ana " }, guardada)).toBe(false);
  });
});
