import { describe, expect, it } from "vitest";
import { mediana, preferenciasViejas, problemasDePreferencias } from "./arnes-organizaciones.mjs";

const ID = "0190a000-0000-7000-8000-000000000001";
const DIR = "C:\\temp\\boldo-migracion-x\\datos";
const RUTA_BD = `${DIR}\\boldo.db`;
const viejas = preferenciasViejas(RUTA_BD);

/** Lo que deja una migración correcta: las viejas igual, más sus copias por organización y las pestañas con `org`. */
function migradas(): Record<string, string> {
  return {
    ...viejas,
    // la app reescribe la vista completa al leerla
    [`boldo:vista:${ID}`]: JSON.stringify({ direccion: "horizontal", densidad: "normal" }),
    [`boldo:directorio:${ID}`]: viejas["boldo:directorio"]!,
    [`boldo:organizaciones:migrado:${DIR}`]: "true",
    [`boldo:pestanas:${DIR}`]: JSON.stringify({
      lista: [
        { id: "arnes-1", org: ID, ruta: "/" },
        { id: "arnes-2", org: ID, ruta: "/directorio" },
      ],
      activa: "arnes-1",
    }),
  };
}

describe("problemasDePreferencias", () => {
  const revisar = (ahora: Record<string, string>) =>
    problemasDePreferencias(viejas, ahora, { id: ID, dirDatos: DIR });

  it("una migración correcta no tiene problemas", () => {
    expect(revisar(migradas())).toEqual([]);
  });

  it("las pestañas viejas van sin org, en la clave de boldo.db", () => {
    const p = JSON.parse(viejas[`boldo:pestanas:${RUTA_BD}`]!) as { lista: object[] };
    expect(p.lista).toHaveLength(2);
    expect(p.lista.every((x) => !("org" in x))).toBe(true);
  });

  it("una clave vieja que cambió o se borró", () => {
    const ahora = migradas();
    ahora["boldo:vista"] = "{}";
    delete ahora["boldo:plegado:x"];
    expect(revisar(ahora)).toHaveLength(2);
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
    const ahora = { ...migradas(), [`boldo:plegado:x:${ID}`]: "true" };
    expect(revisar(ahora)).toEqual([expect.stringContaining("plegado")]);
  });

  it("las pestañas no llegaron, o sin org, o de otra organización", () => {
    const sinPestanas = migradas();
    delete sinPestanas[`boldo:pestanas:${DIR}`];
    expect(revisar(sinPestanas)).toHaveLength(1);
    const otraOrg = migradas();
    otraOrg[`boldo:pestanas:${DIR}`] = otraOrg[`boldo:pestanas:${DIR}`]!.split(ID).join("otra");
    expect(revisar(otraOrg)).toHaveLength(1);
    const una = migradas();
    una[`boldo:pestanas:${DIR}`] = JSON.stringify({ lista: [{ id: "arnes-1", org: ID, ruta: "/" }] });
    expect(revisar(una)).toHaveLength(1);
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
