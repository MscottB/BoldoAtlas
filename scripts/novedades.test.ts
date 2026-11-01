import { describe, expect, it } from "vitest";
import { limpiarNotas, novedades } from "./novedades.mjs";

const release = (tag: string, body: string, published_at = "2026-11-01T00:02:59Z", draft = false) => ({
  tag_name: tag,
  body,
  published_at,
  draft,
});

describe("limpiarNotas", () => {
  it("deja las novedades y corta en las secciones de la página del release", () => {
    const cuerpo = [
      "### Pestañas de trabajo (#3)",
      "",
      "- Varias pestañas.",
      "<!-- comentario de la plantilla -->",
      "## Descargas (Windows 10/11, 64 bits)",
      "",
      "- `BoldoAtlas_windows_x64_portable.zip`: portable.",
    ].join("\r\n");
    expect(limpiarNotas(cuerpo)).toBe("### Pestañas de trabajo (#3)\n\n- Varias pestañas.");
  });

  it("corta en el separador del resumen en inglés y tolera notas vacías", () => {
    expect(limpiarNotas("Primera versión.\n\n---\n\n**English:** first preview")).toBe("Primera versión.");
    expect(limpiarNotas(null)).toBe("");
    expect(limpiarNotas("")).toBe("");
  });
});

describe("novedades", () => {
  it("ordena por SemVer (la API pone alpha.9 antes que alpha.10) y salta borradores y etiquetas raras", () => {
    const r = novedades([
      release("v0.1.0-alpha.9", "- nueve"),
      release("v0.1.0-alpha.10", "- diez"),
      release("v0.1.0-alpha.11", "- borrador", undefined, true),
      release("prueba", "- no es SemVer"),
      release("v0.1.0-alpha.1", "- uno"),
    ]);
    expect(r.versiones.map((v) => v.version)).toEqual(["0.1.0-alpha.10", "0.1.0-alpha.9", "0.1.0-alpha.1"]);
  });

  it("la fecha es la de Santiago, como la de la versión", () => {
    // 00:02 UTC del 1 de noviembre es todavía 31 de octubre en Santiago
    expect(novedades([release("v1.0.0", "x")]).versiones[0]!.fecha).toBe("2026-10-31");
  });

  it("el release que se compila entra con sus notas y deja fuera las versiones posteriores", () => {
    const r = novedades(
      [
        release("v0.1.0-alpha.11", "- once"),
        release("v0.1.0-alpha.13", "- futura"),
        release("v0.1.0-alpha.12", "- vieja"),
      ],
      { version: "v0.1.0-alpha.12", fecha: "2026-11-02", notas: "- doce\n\n## Descargas\n- x" },
    );
    expect(r.versiones).toEqual([
      { version: "0.1.0-alpha.12", fecha: "2026-11-02", notas: "- doce" },
      { version: "0.1.0-alpha.11", fecha: "2026-10-31", notas: "- once" },
    ]);
  });

  it("una versión final va después de sus pre-releases", () => {
    const r = novedades([release("v1.0.0-beta.2", "b"), release("v1.0.0", "f"), release("v0.9.0", "a")]);
    expect(r.versiones.map((v) => v.version)).toEqual(["1.0.0", "1.0.0-beta.2", "0.9.0"]);
  });
});
