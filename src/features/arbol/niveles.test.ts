import { describe, expect, it } from "vitest";
import { TIPO_GERENCIA } from "@/db/tipos";
import { u } from "./fixture";
import { profundidad } from "./niveles";

const g = (id: string, padre: string | null) => u(id, TIPO_GERENCIA, id, padre);

describe("profundidad", () => {
  it("vacío, una raíz y una cadena larga", () => {
    expect(profundidad([])).toBe(0);
    expect(profundidad([g("a", null)])).toBe(1);
    const cadena = [g("n0", null)];
    for (let i = 1; i < 12; i++) cadena.push(g(`n${i}`, `n${i - 1}`));
    expect(profundidad(cadena)).toBe(12);
  });

  it("rama enfocada: la raíz con superior fuera de la lista cuenta como nivel 1", () => {
    expect(profundidad([g("b", "fuera"), g("c", "b"), g("d", "c")])).toBe(3);
  });

  it("varias raíces: gana la más honda; las borradas no cuentan", () => {
    const borrada = { ...g("x", "c"), deleted_at: "2026-01-01" };
    expect(profundidad([g("a", null), g("b", null), g("c", "b"), borrada])).toBe(2);
  });

  it("con colapsados cuenta solo lo que se ve", () => {
    const l = [g("a", null), g("b", "a"), g("c", "b"), g("d", "c")];
    expect(profundidad(l, new Set())).toBe(4);
    expect(profundidad(l, new Set(["b"]))).toBe(2);
    expect(profundidad(l, new Set(["a"]))).toBe(1);
  });

  it("la organización grande (1.102 unidades) se mide al instante", () => {
    const grande = [g("gg", null), g("a", "gg")];
    for (let i = 0; i < 1100; i++) grande.push(g(`h${i}`, "a"));
    const t0 = performance.now();
    expect(profundidad(grande)).toBe(3);
    expect(performance.now() - t0).toBeLessThan(200);
  });
});
