import { afterEach, describe, expect, it } from "vitest";
import { cambiarIdioma, i18n, idiomaInicial } from "./index";
import es from "./es.json";
import en from "./en.json";
import { traducirError } from "@/db/errores";

// Claves aplanadas: "nav.arbol", "errores.correoDuplicado", …
const claves = (obj: Record<string, unknown>, prefijo = ""): string[] =>
  Object.entries(obj).flatMap(([k, v]) =>
    typeof v === "object" && v !== null
      ? claves(v as Record<string, unknown>, `${prefijo}${k}.`)
      : [`${prefijo}${k}`],
  );

afterEach(() => cambiarIdioma("es"));

describe("idiomaInicial", () => {
  it.each([
    ["es-CL", "es"],
    ["en-US", "en"],
    ["pt-BR", "en"],
  ] as const)("%s → %s", (navegador, esperado) => {
    expect(idiomaInicial(navegador)).toBe(esperado);
  });
});

describe("diccionarios", () => {
  it("es.json y en.json tienen exactamente las mismas claves", () => {
    expect(claves(en).sort()).toEqual(claves(es).sort());
  });
});

describe("traducción fuera de componentes", () => {
  it("traducirError sigue el idioma activo", () => {
    const texto = "UNIQUE constraint failed: index 'ux_trabajadores_correo'";
    expect(traducirError(texto)).toBe("Ya existe una persona con ese correo.");
    cambiarIdioma("en");
    expect(traducirError(texto)).toBe("A person with that email already exists.");
    expect(i18n.global.locale.value).toBe("en");
  });
});
