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

describe("mensajes de arranque de la parte nativa", () => {
  const nuevo =
    "Esta base fue creada con una versión más nueva de BoldoAtlas (esquema 9; esta app conoce hasta el 3). Actualiza BoldoAtlas para abrirla.";
  const sinPermiso =
    "No se puede escribir en C:\Datos\Boldo. Mueve BoldoAtlas a una carpeta con permiso de escritura (por ejemplo, Documentos) o revisa los permisos de esa carpeta. Detalle: acceso denegado";

  it("se muestran en el idioma activo con sus datos", () => {
    expect(traducirError(nuevo)).toBe(nuevo);
    cambiarIdioma("en");
    expect(traducirError(nuevo)).toContain("schema 9; this app supports up to 3");
    expect(traducirError(sinPermiso)).toContain("can't write to C:\Datos\Boldo");
    expect(traducirError(sinPermiso)).toContain("Details: acceso denegado");
  });

  it("lo que no se reconoce llega tal cual", () => {
    expect(traducirError("algo raro")).toBe("algo raro");
  });
});
