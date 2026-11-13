import { describe, expect, it } from "vitest";
import {
  PREFERENCIAS_VIEJAS,
  VISTA_DE_LA_ORGANIZACION,
  VISTA_GENERAL,
  etiquetaComparar,
  eventosTecla,
  lineaDivision,
  mediana,
  problemasDeActualizacion,
  problemasDeMigracion,
  textoEs,
} from "./arnes-organizaciones.mjs";

const ID = "0190a000-0000-7000-8000-000000000001";
const DIR = "C:\\temp\\boldo-migracion-x\\datos";
const RUTA_BD = `${DIR}\\boldo.db`;
const PESTANAS = ["p-1", "p-2"];

/** Lo que deja una migración correcta: las viejas igual, sus copias por organización, las pestañas con `org`, sin recientes. */
function migradas(): Record<string, string> {
  return {
    ...PREFERENCIAS_VIEJAS,
    [`boldo:pestanas:${RUTA_BD}`]: JSON.stringify({ lista: PESTANAS.map((id) => ({ id, ruta: "/" })) }),
    // la app reescribe la vista completa al leerla
    [`boldo:vista:${ID}`]: JSON.stringify({ direccion: "horizontal", densidad: "normal" }),
    [`boldo:vista:completo:${ID}`]: JSON.stringify({ direccion: "horizontal", densidad: "normal" }),
    [`boldo:directorio:${ID}`]: PREFERENCIAS_VIEJAS["boldo:directorio"],
    [`boldo:organizaciones:migrado:${DIR}`]: "true",
    [`boldo:pestanas:${DIR}`]: JSON.stringify({
      lista: PESTANAS.map((id) => ({ id, org: ID, ruta: "/" })),
      activa: "p-1",
    }),
  };
}

describe("problemasDeMigracion", () => {
  const base = { id: ID, dirDatos: DIR, rutaBd: RUTA_BD, pestanas: PESTANAS, viejas: PREFERENCIAS_VIEJAS };
  const revisar = (ahora: Record<string, string>) => problemasDeMigracion(ahora, base);

  it("una migración correcta no tiene problemas", () => {
    expect(revisar(migradas())).toEqual([]);
  });

  it("la vista del árbol completo se copió con la de fábrica: el árbol se vería vertical", () => {
    const ahora = migradas();
    ahora[`boldo:vista:completo:${ID}`] = JSON.stringify({ direccion: "vertical" });
    expect(revisar(ahora)).toEqual([expect.stringContaining(`boldo:vista:completo:${ID}`)]);
  });

  it("si la vieja no dejó las vistas en horizontal, la prueba no pasa", () => {
    const viejas = {
      ...PREFERENCIAS_VIEJAS,
      "boldo:vista:completo": JSON.stringify({ direccion: "vertical" }),
    };
    const ahora = { ...migradas(), ...viejas };
    expect(problemasDeMigracion(ahora, { ...base, viejas })).toEqual([
      expect.stringContaining("la vieja no dejó boldo:vista:completo"),
    ]);
  });

  it("una clave vieja que cambió o se borró", () => {
    const ahora = migradas();
    ahora["boldo:vista"] = "{}";
    delete ahora["boldo:plegado:x"];
    delete ahora[`boldo:pestanas:${RUTA_BD}`];
    expect(revisar(ahora)).toHaveLength(3);
  });

  it("la vista de la organización sin lo sembrado: se leyó antes de migrar", () => {
    const ahora = migradas();
    ahora[`boldo:vista:${ID}`] = JSON.stringify({ direccion: "vertical" });
    expect(revisar(ahora)).toEqual([expect.stringContaining(`boldo:vista:${ID}`)]);
  });

  it("el directorio no se copió", () => {
    const ahora = migradas();
    delete ahora[`boldo:directorio:${ID}`];
    expect(revisar(ahora)).toEqual([expect.stringContaining(`boldo:directorio:${ID}`)]);
  });

  it("plegado:* se copió, y es por PC", () => {
    expect(revisar({ ...migradas(), [`boldo:plegado:x:${ID}`]: "true" })).toEqual([
      expect.stringContaining("plegado"),
    ]);
  });

  it("quedan recientes de antes", () => {
    expect(revisar({ ...migradas(), [`boldo:recientes:${RUTA_BD}`]: "[]" })).toEqual([
      expect.stringContaining("recientes"),
    ]);
  });

  it("las pestañas no llegaron, sin org, de otra organización o con otros ids", () => {
    const clave = `boldo:pestanas:${DIR}`;
    const sin = migradas();
    delete sin[clave];
    expect(revisar(sin)).toHaveLength(1);
    const otra = migradas();
    otra[clave] = otra[clave]!.split(ID).join("otra");
    expect(revisar(otra)).toHaveLength(1);
    const otrosIds = migradas();
    otrosIds[clave] = JSON.stringify({
      lista: [
        { id: "x", org: ID },
        { id: "y", org: ID },
      ],
    });
    expect(revisar(otrosIds)).toHaveLength(1);
  });

  it("si la vieja no guardó dos pestañas, la prueba no pasa", () => {
    const una = problemasDeMigracion(migradas(), { ...base, pestanas: ["p-1"] });
    expect(una).toHaveLength(1);
  });
});

describe("problemasDeActualizacion", () => {
  const actualizada = (): Record<string, string> => ({
    "boldo:vista": VISTA_GENERAL,
    [`boldo:vista:${ID}`]: JSON.stringify({ ...VISTA_DE_LA_ORGANIZACION, lineas: "smoothstep" }),
  });
  const revisar = (ahora: Record<string, string>) => problemasDeActualizacion(ahora, { id: ID });

  it("lo de la organización igual y sin recientes no tiene problemas", () => {
    expect(revisar(actualizada())).toEqual([]);
  });

  it("quedan recientes de antes", () => {
    expect(revisar({ ...actualizada(), [`boldo:recientes:${RUTA_BD}`]: "[]" })).toHaveLength(1);
  });

  it("la vista de la organización se pisó con la general, o la general cambió", () => {
    expect(revisar({ ...actualizada(), [`boldo:vista:${ID}`]: VISTA_GENERAL })).toHaveLength(1);
    expect(revisar({ ...actualizada(), "boldo:vista": "{}" })).toHaveLength(1);
  });
});

describe("mediana", () => {
  it("con un número impar, la del medio; con uno par, el promedio de las dos", () => {
    expect(mediana([900, 100, 300])).toBe(300);
    expect(mediana([400, 100, 300, 200])).toBe(250);
  });

  it("no ordena la lista recibida", () => {
    const ms = [3, 1, 2];
    mediana(ms);
    expect(ms).toEqual([3, 1, 2]);
  });
});

describe("etiquetaComparar", () => {
  it("arma la de la paleta desde es.json, con el nombre y sin la llave", () => {
    const etiqueta = etiquetaComparar("Aparte del arnés");
    expect(etiqueta).toContain("Aparte del arnés");
    expect(etiqueta).not.toContain("{");
  });
});

describe("textoEs", () => {
  it("lee de es.json el aviso de coincidencia aproximada", () => {
    expect(textoEs("comparar.aproximada")).toMatch(/\S/);
  });

  it("una clave que no está, o que no es un texto, lanza", () => {
    expect(() => textoEs("comparar.noExiste")).toThrow("comparar.noExiste");
    expect(() => textoEs("comparar")).toThrow();
  });
});

describe("lineaDivision", () => {
  const MB = 2 ** 20;

  it("la mediana de las aperturas y lo que creció la memoria, en MB con un decimal", () => {
    expect(lineaDivision([1500.4, 900, 1200], 100 * MB, 130.46 * MB)).toBe(
      "dividir: 1200 ms, memoria: +30.5 MB",
    );
  });

  it("si la memoria bajó lleva el signo menos, y sin performance.memory lo dice", () => {
    expect(lineaDivision([800], 50 * MB, 48 * MB)).toBe("dividir: 800 ms, memoria: -2.0 MB");
    expect(lineaDivision([800, 1000], null, null)).toBe("dividir: 900 ms, memoria: sin medir");
  });
});

describe("eventosTecla", () => {
  it("abajo y arriba con su código de Windows; Mayús va en los modificadores", () => {
    expect(eventosTecla("F10", true)).toEqual([
      { type: "rawKeyDown", key: "F10", code: "F10", windowsVirtualKeyCode: 121, modifiers: 8 },
      { type: "keyUp", key: "F10", code: "F10", windowsVirtualKeyCode: 121, modifiers: 8 },
    ]);
    expect(eventosTecla("F6").map((e) => [e.windowsVirtualKeyCode, e.modifiers])).toEqual([
      [117, 0],
      [117, 0],
    ]);
  });

  it("una tecla sin código lanza", () => {
    expect(() => eventosTecla("Hyper")).toThrow("Hyper");
  });
});
