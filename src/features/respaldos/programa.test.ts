import { describe, expect, it } from "vitest";
import { tocaRespaldar, ultimoRespaldo } from "./programa";

const ahora = new Date(2026, 9, 30, 12, 0);
const haceHoras = (h: number) => new Date(ahora.getTime() - h * 3_600_000);

describe("tocaRespaldar", () => {
  it("nunca: no respalda aunque no haya respaldos", () => {
    expect(tocaRespaldar("nunca", null, ahora)).toBe(false);
  });

  it("al abrir: respalda siempre", () => {
    expect(tocaRespaldar("abrir", haceHoras(0), ahora)).toBe(true);
  });

  it("con la app abierta, «Cada vez» no respalda en cada revisión", () => {
    expect(tocaRespaldar("abrir", haceHoras(24 * 30), ahora, false)).toBe(false);
    expect(tocaRespaldar("abrir", null, ahora, false)).toBe(false);
  });

  it("con la app abierta, las demás frecuencias respetan su intervalo", () => {
    expect(tocaRespaldar("nunca", null, ahora, false)).toBe(false);
    expect(tocaRespaldar("24h", null, ahora, false)).toBe(true);
    expect(tocaRespaldar("24h", haceHoras(23.9), ahora, false)).toBe(false);
    expect(tocaRespaldar("24h", haceHoras(24), ahora, false)).toBe(true);
    expect(tocaRespaldar("7d", haceHoras(24 * 7), ahora, false)).toBe(true);
  });

  it("con la app abierta, un respaldo «en el futuro» no hace respaldar en cada revisión", () => {
    expect(tocaRespaldar("24h", haceHoras(-5), ahora, false)).toBe(false);
  });

  it("sin respaldos previos respalda en cualquier frecuencia distinta de nunca", () => {
    for (const f of ["abrir", "24h", "7d"] as const) expect(tocaRespaldar(f, null, ahora)).toBe(true);
  });

  it("cada 24 h y cada 7 días respetan el intervalo", () => {
    expect(tocaRespaldar("24h", haceHoras(23.9), ahora)).toBe(false);
    expect(tocaRespaldar("24h", haceHoras(24), ahora)).toBe(true);
    expect(tocaRespaldar("7d", haceHoras(24 * 7 - 1), ahora)).toBe(false);
    expect(tocaRespaldar("7d", haceHoras(24 * 7), ahora)).toBe(true);
  });

  it("un respaldo con fecha futura (reloj cambiado) no bloquea los respaldos", () => {
    expect(tocaRespaldar("24h", haceHoras(-5), ahora)).toBe(true);
  });

  it("una preferencia desconocida vale como cada 24 h", () => {
    expect(tocaRespaldar("raro", haceHoras(2), ahora)).toBe(false);
    expect(tocaRespaldar("raro", haceHoras(25), ahora)).toBe(true);
  });
});

describe("ultimoRespaldo", () => {
  it("toma la fecha más nueva de la lista, en hora local", () => {
    const lista = [
      { fecha: "2026-10-29T08:15", legible: true },
      { fecha: "2026-10-30T09:05", legible: true },
      { fecha: "2026-01-01T00:00", legible: true },
    ];
    expect(ultimoRespaldo(lista)).toEqual(new Date(2026, 9, 30, 9, 5));
    expect(ultimoRespaldo([])).toBeNull();
  });

  it("ignora los archivos ilegibles: uno dañado y reciente no frena el respaldo automático", () => {
    const lista = [
      { fecha: "2026-10-30T11:00", legible: false },
      { fecha: "2026-10-20T09:00", legible: true },
    ];
    expect(ultimoRespaldo(lista)).toEqual(new Date(2026, 9, 20, 9, 0));
    expect(ultimoRespaldo([{ fecha: "2026-10-30T11:00", legible: false }])).toBeNull();
  });
});
