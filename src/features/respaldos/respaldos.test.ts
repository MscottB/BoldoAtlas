import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cambiarIdioma, i18n } from "@/i18n";
import { BaseCambiada } from "@/lib/baseActiva";
import { mensajeFallo, mensajeOrganizacion } from "./respaldos";

describe("un archivo que no se deja abrir", () => {
  const de = (detalle: string) => mensajeOrganizacion({ codigo: "contenido_invalido", detalle });

  it("dice por qué según el sistema; uno dañado de verdad no culpa a otro programa", () => {
    expect(de("retenido")).toContain("Otro programa está usando");
    expect(de("sin_causa")).toContain("Puede que otro programa");
    expect(de("no_se_puede")).toContain("no lo arregla");
    expect(de("no_esta")).toContain("ya no está");
    expect(mensajeOrganizacion({ codigo: "danado", detalle: "x" })).not.toContain("otro programa");
    expect(de("esquema")).not.toContain("otro programa");
  });

  it.each(["retenido", "sin_causa", "no_se_puede", "no_esta"])(
    "%s: tiene texto en los dos idiomas, que no repite «no se pudo abrir» del título",
    (detalle) => {
      for (const idioma of ["es", "en"] as const)
        expect(i18n.global.te(`respaldos.error.contenido_invalido_${detalle}`, idioma), idioma).toBe(true);
      expect(de(detalle)).not.toMatch(/no se pudo abrir/i);
    },
  );
});

describe("mensajeFallo", () => {
  it("con BaseCambiada no hay nada que decir", () => {
    expect(mensajeFallo(new BaseCambiada())).toBe("");
    expect(mensajeOrganizacion(new BaseCambiada())).toBe("");
  });

  describe.each(["es", "en"] as const)("códigos de las organizaciones en %s", (idioma) => {
    beforeEach(() => void cambiarIdioma(idioma));
    afterEach(() => void cambiarIdioma("es"));

    const generico = () => mensajeFallo({ codigo: "raro", detalle: "x" });

    it.each([
      "otra_base",
      "abierta",
      "otro_id",
      "no_encontrado",
      "abierta_en_otra_copia",
      "trabajo_en_curso",
      "migracion",
      "lista_protegida",
      "sin_espacio",
      "esquema_nuevo",
      "danado",
      "desconocido",
      "contenido_invalido",
      "muy_pesado",
    ])("%s tiene su texto", (codigo) => {
      const texto = mensajeFallo({ codigo, detalle: "x" });
      expect(texto).not.toBe(generico());
      expect(texto).not.toBe(codigo);
    });

    it("contenido_invalido se distingue por el detalle", () => {
      const textos = ["red", "wal", "journal", "archivo"].map((detalle) =>
        mensajeFallo({ codigo: "contenido_invalido", detalle }),
      );
      expect(new Set(textos).size).toBe(4);
      expect(textos[3]).toBe(mensajeFallo({ codigo: "contenido_invalido", detalle: "extension" }));
    });
  });

  it("nunca aconseja borrar el diario", () => {
    for (const idioma of ["es", "en"] as const) {
      cambiarIdioma(idioma);
      expect(mensajeFallo({ codigo: "contenido_invalido", detalle: "journal" })).not.toMatch(/borr|delet/i);
    }
    cambiarIdioma("es");
  });

  it("el aviso otro_id no da por hecho que el archivo es externo", () => {
    expect(mensajeFallo({ codigo: "otro_id", detalle: "C:\\datos\\boldo.db" })).not.toMatch(/extern/i);
  });
});

describe("mensajeOrganizacion", () => {
  it.each(["desconocido", "esquema_nuevo", "danado"])("%s no habla de un respaldo", (codigo) => {
    expect(mensajeOrganizacion({ codigo, detalle: "x" })).not.toMatch(/respaldo/i);
  });

  it("lo demás es lo de mensajeFallo", () => {
    const e = { codigo: "no_encontrado", detalle: "x" };
    expect(mensajeOrganizacion(e)).toBe(mensajeFallo(e));
    expect(mensajeOrganizacion("raro")).toBe(mensajeFallo("raro"));
  });

  it("traduce el código que devuelve Rust", () => {
    expect(mensajeFallo({ codigo: "en_uso", detalle: "C:\\x\\boldo.db" })).toMatch(
      /Otra ventana de BoldoAtlas/,
    );
  });

  it("un código desconocido o un error sin código muestran el detalle", () => {
    expect(mensajeFallo({ codigo: "raro", detalle: "disco lleno" })).toMatch(/disco lleno$/);
    expect(mensajeFallo("command not found")).toMatch(/command not found$/);
  });
});
