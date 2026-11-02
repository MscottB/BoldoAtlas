import { describe, expect, it, vi } from "vitest";
import {
  alSoltarDatos,
  baseActual,
  BaseCambiada,
  enCambio,
  fijarBase,
  marcarCambio,
  soltarDatos,
} from "./baseActiva";

describe("baseActiva", () => {
  it("recuerda la base que se fijó", () => {
    fijarBase("A");
    expect(baseActual()).toBe("A");
    fijarBase("B");
    expect(baseActual()).toBe("B");
  });

  it("marca si hay un cambio en curso", () => {
    expect(enCambio()).toBe(false);
    marcarCambio(true);
    expect(enCambio()).toBe(true);
    marcarCambio(false);
    expect(enCambio()).toBe(false);
  });

  it("soltarDatos llama a cada uno de los registrados", () => {
    const [a, b] = [vi.fn(), vi.fn()];
    alSoltarDatos(a);
    alSoltarDatos(b);
    soltarDatos();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("BaseCambiada es un Error que se puede reconocer", () => {
    const e = new BaseCambiada();
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(BaseCambiada);
  });
});
