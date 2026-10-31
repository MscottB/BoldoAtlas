import { readFileSync } from "node:fs";
import { join } from "node:path";
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
  // La entrada de cada caso es el literal REAL de Rust (se lee del código fuente) con sus datos puestos: si alguien
  // lo reescribe en Rust, este test falla en vez de dejar la interfaz en español sin aviso.
  const rust = (f: string) => readFileSync(join(process.cwd(), "src-tauri", "src", f), "utf8");
  const escapar = (t: string) => t.replace(/[.*+?^$()|[\]{}\\]/g, "\\$&");
  const casos: {
    nombre: string;
    archivo: string;
    marca: string;
    datos: Record<string, string>;
    conserva: string[];
  }[] = [
    {
      nombre: "desdeZip",
      archivo: "rutas.rs",
      marca: "ejecutando desde dentro de un .zip",
      datos: { "{}": "C:\\Descargas\\boldo.zip" },
      conserva: ["C:\\Descargas\\boldo.zip"],
    },
    {
      nombre: "esquemaNuevo",
      archivo: "db.rs",
      marca: "creada con una versión más nueva",
      datos: { "{actual}": "9", "{conocida}": "3" },
      conserva: ["9", "3"],
    },
    {
      nombre: "sinPermiso",
      archivo: "rutas.rs",
      marca: "No se puede escribir en",
      datos: { "{}": "C:\\Datos\\Boldo", "{e}": "acceso denegado" },
      conserva: ["C:\\Datos\\Boldo", "acceso denegado"],
    },
    {
      nombre: "translocado",
      archivo: "rutas.rs",
      marca: "copia temporal de solo lectura",
      datos: { "{}": "/private/var/folders/x/AppTranslocation/1/d" },
      conserva: ["/private/var/folders/x/AppTranslocation/1/d", "xattr -dr com.apple.quarantine"],
    },
    {
      nombre: "sinAppdata",
      archivo: "rutas.rs",
      marca: "No se encontró la carpeta de datos del usuario",
      datos: {},
      conserva: [],
    },
    {
      nombre: "sinCarpeta (programa)",
      archivo: "comandos.rs",
      marca: "No se pudo ubicar la carpeta del programa",
      datos: {},
      conserva: [],
    },
    {
      nombre: "sinCarpeta (datos)",
      archivo: "comandos.rs",
      marca: "No se ubicó la carpeta de datos",
      datos: {},
      conserva: [],
    },
    {
      nombre: "baseNoDisponible (cerrada)",
      archivo: "comandos.rs",
      marca: "La base de datos no está abierta",
      datos: {},
      conserva: [],
    },
    {
      nombre: "baseNoDisponible (estado)",
      archivo: "comandos.rs",
      marca: "estado inválido",
      datos: {},
      conserva: [],
    },
    {
      nombre: "baseSoloLectura",
      archivo: "db.rs",
      marca: "modo solo lectura",
      datos: {},
      conserva: ["boldo.db"],
    },
  ];

  it.each(casos)(
    "$nombre: el texto de Rust se traduce y conserva sus datos",
    ({ archivo, marca, datos, conserva }) => {
      const literal = new RegExp(`"([^"\n]*${escapar(marca)}[^"\n]*)"`).exec(rust(archivo))?.[1];
      expect(literal, `no está «${marca}» en ${archivo}`).toBeDefined();
      const entrada = Object.entries(datos).reduce(
        (t, [marcador, dato]) => t.replace(marcador, () => dato),
        literal!,
      );
      for (const idioma of ["es", "en"] as const) {
        cambiarIdioma(idioma);
        const salida = traducirError(entrada);
        if (idioma === "en") expect(salida).not.toBe(entrada);
        for (const dato of conserva) expect(salida).toContain(dato);
      }
    },
  );

  it("lo que no se reconoce llega tal cual", () => {
    cambiarIdioma("en");
    expect(traducirError("algo raro")).toBe("algo raro");
  });
});
