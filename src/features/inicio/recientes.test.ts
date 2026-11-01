import { describe, expect, it } from "vitest";
import { MAX_RECIENTES, agregarReciente, esVistaReciente, hace, leerRecientes } from "./recientes";

describe("esVistaReciente", () => {
  it("cuenta árbol, árboles, directorio y revisión; no Inicio, Configuración, Ayuda, Acerca ni Importar/Exportar", () => {
    for (const n of ["arbol", "arboles", "directorio", "revision"]) expect(esVistaReciente(n)).toBe(true);
    for (const n of [
      "bienvenida",
      "configuracion",
      "mantenedores",
      "ayuda",
      "acerca",
      "importarExportar",
      undefined,
    ])
      expect(esVistaReciente(n)).toBe(false);
  });
});

describe("agregarReciente", () => {
  it("pone lo nuevo al frente", () => {
    const l = agregarReciente(agregarReciente([], "/", 1), "/directorio", 2);
    expect(l.map((r) => r.ruta)).toEqual(["/directorio", "/"]);
  });
  it("sin repetidos: volver a una ruta la sube y le pone la hora nueva", () => {
    let l = agregarReciente([], "/", 1);
    l = agregarReciente(l, "/revision", 2);
    l = agregarReciente(l, "/", 3);
    expect(l).toEqual([
      { ruta: "/", en: 3 },
      { ruta: "/revision", en: 2 },
    ]);
  });
  it("guarda a lo más 8 y descarta la más antigua", () => {
    let l = agregarReciente([], "/?ver=0", 0);
    for (let i = 1; i <= MAX_RECIENTES; i++) l = agregarReciente(l, `/?ver=${i}`, i);
    expect(l).toHaveLength(MAX_RECIENTES);
    expect(l[0]!.ruta).toBe(`/?ver=${MAX_RECIENTES}`);
    expect(l.some((r) => r.ruta === "/?ver=0")).toBe(false);
  });
  it("no modifica la lista de entrada", () => {
    const l = [{ ruta: "/", en: 1 }];
    agregarReciente(l, "/revision", 2);
    expect(l).toEqual([{ ruta: "/", en: 1 }]);
  });
});

describe("leerRecientes", () => {
  const todo = () => true;
  it("lo que no es una lista, o está mal formado, no rompe", () => {
    expect(leerRecientes(null, todo)).toEqual([]);
    expect(leerRecientes({ ruta: "/" }, todo)).toEqual([]);
    expect(leerRecientes([null, 3, "x", {}, { ruta: 7 }], todo)).toEqual([]);
  });
  it("descarta las rutas que ya no existen y los repetidos, y conserva el orden", () => {
    const crudo = [
      { ruta: "/?ver=borrada", en: 5 },
      { ruta: "/directorio", en: 4 },
      { ruta: "/directorio", en: 3 },
      { ruta: "/", en: 2 },
    ];
    expect(leerRecientes(crudo, (r) => !r.includes("borrada"))).toEqual([
      { ruta: "/directorio", en: 4 },
      { ruta: "/", en: 2 },
    ]);
  });
  it("una hora ilegible queda en 0", () => {
    expect(leerRecientes([{ ruta: "/", en: "ayer" }], todo)).toEqual([{ ruta: "/", en: 0 }]);
  });
  it("respeta el máximo", () => {
    const crudo = Array.from({ length: 20 }, (_, i) => ({ ruta: `/?ver=${i}`, en: i }));
    expect(leerRecientes(crudo, todo)).toHaveLength(MAX_RECIENTES);
  });
});

describe("hace", () => {
  const ahora = Date.UTC(2026, 10, 1, 12, 0, 0);
  const min = 60_000;
  it("menos de un minuto (o en el futuro) es «hace un momento»", () => {
    expect(hace(ahora - 30_000, ahora)).toBeNull();
    expect(hace(ahora + 5 * min, ahora)).toBeNull();
  });
  it("minutos, horas y días, redondeando hacia abajo", () => {
    expect(hace(ahora - 5 * min, ahora)).toEqual({ valor: -5, unidad: "minute" });
    expect(hace(ahora - 59 * min, ahora)).toEqual({ valor: -59, unidad: "minute" });
    expect(hace(ahora - 60 * min, ahora)).toEqual({ valor: -1, unidad: "hour" });
    expect(hace(ahora - 150 * min, ahora)).toEqual({ valor: -2, unidad: "hour" });
    expect(hace(ahora - 24 * 60 * min, ahora)).toEqual({ valor: -1, unidad: "day" });
    expect(hace(ahora - 3 * 24 * 60 * min, ahora)).toEqual({ valor: -3, unidad: "day" });
  });
});
