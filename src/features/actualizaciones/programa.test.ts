import { describe, expect, it } from "vitest";
import { tocaBuscar } from "./programa";

const ahora = new Date(2026, 9, 31, 12, 0).getTime();
const hace = (h: number) => ahora - h * 3_600_000;

describe("tocaBuscar", () => {
  it("nunca: no consulta ni al abrir", () => {
    expect(tocaBuscar("nunca", null, ahora, true)).toBe(false);
  });

  it("al abrir: solo en el arranque, aunque haya consultado hace poco", () => {
    expect(tocaBuscar("abrir", hace(0.1), ahora, true)).toBe(true);
    expect(tocaBuscar("abrir", null, ahora, false)).toBe(false);
  });

  it("toda frecuencia salvo «Nunca» consulta al abrir, aunque haya consultado hace poco", () => {
    for (const f of ["cadaHora", "seisHoras", "diaria", "semanal"])
      expect(tocaBuscar(f, hace(0.1), ahora, true)).toBe(true);
  });

  it("con la app abierta, cada frecuencia respeta su intervalo", () => {
    expect(tocaBuscar("cadaHora", hace(0.9), ahora, false)).toBe(false);
    expect(tocaBuscar("cadaHora", hace(1), ahora, false)).toBe(true);
    expect(tocaBuscar("seisHoras", hace(5.9), ahora, false)).toBe(false);
    expect(tocaBuscar("seisHoras", hace(6), ahora, false)).toBe(true);
    expect(tocaBuscar("diaria", hace(23.9), ahora, false)).toBe(false);
    expect(tocaBuscar("diaria", hace(24), ahora, false)).toBe(true);
    expect(tocaBuscar("semanal", hace(24 * 7 - 1), ahora, false)).toBe(false);
    expect(tocaBuscar("semanal", hace(24 * 7), ahora, false)).toBe(true);
  });

  it("sin consultas previas consulta en el arranque", () => {
    expect(tocaBuscar("diaria", null, ahora, true)).toBe(true);
    expect(tocaBuscar("semanal", null, ahora, true)).toBe(true);
  });

  it("una consulta «en el futuro» (reloj cambiado) no bloquea las siguientes", () => {
    expect(tocaBuscar("diaria", hace(-3), ahora, false)).toBe(true);
  });

  it("una preferencia desconocida vale como cada día", () => {
    expect(tocaBuscar("raro", hace(2), ahora, false)).toBe(false);
    expect(tocaBuscar("raro", hace(25), ahora, false)).toBe(true);
  });
});
