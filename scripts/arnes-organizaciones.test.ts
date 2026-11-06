import { describe, expect, it } from "vitest";
import {
  PREFERENCIAS_VIEJAS,
  VISTA_DE_LA_ORGANIZACION,
  VISTA_GENERAL,
  mediana,
  problemasDeActualizacion,
  problemasDeMigracion,
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
    [`boldo:directorio:${ID}`]: PREFERENCIAS_VIEJAS["boldo:directorio"],
    [`boldo:organizaciones:migrado:${DIR}`]: "true",
    [`boldo:pestanas:${DIR}`]: JSON.stringify({
      lista: PESTANAS.map((id) => ({ id, org: ID, ruta: "/" })),
      activa: "p-1",
    }),
  };
}

describe("problemasDeMigracion", () => {
  const revisar = (ahora: Record<string, string>) =>
    problemasDeMigracion(ahora, { id: ID, dirDatos: DIR, rutaBd: RUTA_BD, pestanas: PESTANAS });

  it("una migración correcta no tiene problemas", () => {
    expect(revisar(migradas())).toEqual([]);
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
    const una = problemasDeMigracion(migradas(), {
      id: ID,
      dirDatos: DIR,
      rutaBd: RUTA_BD,
      pestanas: ["p-1"],
    });
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
