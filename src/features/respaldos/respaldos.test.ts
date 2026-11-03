import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cambiarIdioma } from "@/i18n";
import { conRespaldoPrevio, mensajeFallo, mensajeOrganizacion } from "./respaldos";

describe("mensajeFallo", () => {
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

describe("conRespaldoPrevio", () => {
  const ok = { ok: true } as const;

  it("respalda y luego ejecuta la acción", async () => {
    const orden: string[] = [];
    const r = await conRespaldoPrevio(
      async () => void orden.push("respaldo"),
      async () => (orden.push("accion"), ok),
    );
    expect(r).toEqual(ok);
    expect(orden).toEqual(["respaldo", "accion"]);
  });

  it("si el respaldo falla no ejecuta la acción y devuelve el motivo", async () => {
    let corrio = false;
    const r = await conRespaldoPrevio(
      () => Promise.reject({ codigo: "en_uso", detalle: "x" }),
      async () => ((corrio = true), ok),
    );
    expect(corrio).toBe(false);
    expect(r).toMatchObject({ ok: false, mensaje: expect.stringMatching(/Otra ventana/) });
  });
});
