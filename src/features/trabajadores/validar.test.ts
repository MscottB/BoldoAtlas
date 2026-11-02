import { describe, expect, it } from "vitest";
import {
  FOTO_ENTRADA_MAX_BYTES,
  camposGuardables,
  cambiosFicha,
  guardadoDeFicha,
  hayCambiosSinGuardar,
  hayCoincidenciaExacta,
  normalizarFicha,
  validarFicha,
  validarFoto,
  type DatosFicha,
} from "./validar";

const base = { nombre: "Ana", correo: "" };

describe("validarFicha", () => {
  it("sin nombre pide el nombre", () => {
    expect(validarFicha({ ...base, nombre: "  " })).toEqual({ nombre: "Escribe el nombre." });
  });
  it("correo inválido", () => {
    expect(validarFicha({ ...base, correo: "ana@" })).toEqual({ correo: "El correo no es válido." });
  });
  it("correo válido o en blanco no da error", () => {
    expect(validarFicha({ ...base, correo: "ana@ejemplo.cl" })).toEqual({});
    expect(validarFicha({ ...base, correo: "   " })).toEqual({});
  });
});

describe("validarFoto", () => {
  it.each(["image/png", "image/jpeg", "image/webp"])("acepta %s de hasta 30 MB", (type) => {
    expect(validarFoto({ type, size: FOTO_ENTRADA_MAX_BYTES })).toBeNull();
  });
  it("rechaza otros tipos", () => {
    expect(validarFoto({ type: "image/gif", size: 10 })).toBe("La foto debe ser PNG, JPG o WebP.");
  });
  it("rechaza más de 30 MB", () => {
    expect(validarFoto({ type: "image/png", size: FOTO_ENTRADA_MAX_BYTES + 1 })).toBe(
      "La foto no puede pesar más de 30 MB.",
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
  nombre: "",
  correo: null,
  telefono: null,
  tipo_contrato_id: null,
  sede_id: null,
  jornada_id: null,
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
  it("borrar el nombre no se guarda; el nombre se guarda recortado", () => {
    const sinNombre = { ...guardada, nombre: "  " };
    expect(camposGuardables(cambiosFicha(sinNombre, guardada), validarFicha(sinNombre))).toEqual({});
    const otro = { ...guardada, nombre: " Luis " };
    expect(camposGuardables(cambiosFicha(otro, guardada), validarFicha(otro))).toEqual({ nombre: "Luis" });
  });
});

describe("guardar sin pisar lo que no se cargó", () => {
  // Así queda la ficha antes de que lleguen las notas: lo guardado no las tiene y el formulario las muestra vacías.
  const sinCargar: DatosFicha = { ...guardada, notas: undefined, foto_png: undefined };
  const formAbierto: DatosFicha = { ...sinCargar, notas: "" };

  it("con notas sin cargar, editar otro campo no las incluye: no se borran", () => {
    const cambios = cambiosFicha({ ...formAbierto, telefono: "123" }, sinCargar);
    expect(cambios).toEqual({ telefono: "123" });
    expect("notas" in cambios).toBe(false);
  });
  it("con notas sin cargar, un formulario sin tocar no es un cambio", () => {
    expect(cambiosFicha(formAbierto, sinCargar)).toEqual({});
    expect(hayCambiosSinGuardar(formAbierto, sinCargar)).toBe(false);
  });
  it("normalizar no convierte las notas sin cargar en null", () => {
    expect(normalizarFicha(sinCargar).notas).toBeUndefined();
  });
  it("la foto sin tocar nunca se escribe; quitarla sí", () => {
    expect("foto_png" in cambiosFicha({ ...formAbierto, telefono: "1" }, sinCargar)).toBe(false);
    expect(cambiosFicha({ ...formAbierto, foto_png: null }, sinCargar)).toEqual({ foto_png: null });
  });
  it("ya cargadas, vaciar las notas sí se guarda", () => {
    const base = { ...guardada, notas: "una nota", foto_png: undefined };
    expect(cambiosFicha({ ...base, notas: "  " }, base)).toEqual({ notas: null });
    expect(cambiosFicha({ ...base, notas: " otra " }, base)).toEqual({ notas: "otra" });
  });
  it("sin foto guardada, quitar una recién elegida no es un cambio: una ficha nueva no avisa en falso", () => {
    const nueva = { id: "", nombre: "", correo: null, telefono: null, tipo_contrato_id: null, sede_id: null, jornada_id: null, tiene_foto: 0, updated_at: "" };
    const base = guardadoDeFicha(nueva, null);
    expect(hayCambiosSinGuardar({ ...base, notas: "", foto_png: null }, base)).toBe(false);
    expect(hayCambiosSinGuardar({ ...base, notas: "", foto_png: undefined }, base)).toBe(false);
    expect(hayCambiosSinGuardar({ ...base, foto_png: "AAAA" }, base)).toBe(true);
  });
  it("con foto guardada, quitarla sí es un cambio y no tocarla no", () => {
    const conFoto = { id: "a", nombre: "Ana", correo: null, telefono: null, tipo_contrato_id: null, sede_id: null, jornada_id: null, tiene_foto: 1, updated_at: "u" };
    const base = guardadoDeFicha(conFoto, null);
    expect(cambiosFicha({ ...base, foto_png: null }, base)).toEqual({ foto_png: null });
    expect(cambiosFicha({ ...base, foto_png: undefined }, base)).toEqual({});
  });
  it("ignora lo que no edita la ficha, aunque venga en el objeto", () => {
    const conExtras = { ...sinCargar, id: "x", tiene_foto: 1, updated_at: "ayer" };
    expect(cambiosFicha(conExtras as DatosFicha, sinCargar)).toEqual({});
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
