import { describe, expect, it } from "vitest";
import { hace } from "./recientes";

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
