import { afterEach, describe, expect, it, vi } from "vitest";
import { convieneConvertir, FOTO_LADO_MAX, medidasReducidas, urlFoto } from "./foto";

describe("medidasReducidas", () => {
  it("una foto grande baja a que su lado mayor sea el máximo, sin deformarla", () => {
    expect(medidasReducidas(3000, 4000)).toEqual({ ancho: 192, alto: FOTO_LADO_MAX, reducida: true });
    expect(medidasReducidas(4000, 2000)).toEqual({ ancho: FOTO_LADO_MAX, alto: 128, reducida: true });
  });
  it("una foto pequeña no se agranda", () => {
    expect(medidasReducidas(100, 80)).toEqual({ ancho: 100, alto: 80, reducida: false });
    expect(medidasReducidas(FOTO_LADO_MAX, FOTO_LADO_MAX).reducida).toBe(false);
  });
  it("una imagen muy angosta no queda en cero", () => {
    expect(medidasReducidas(5000, 1).alto).toBe(1);
  });
});

describe("convieneConvertir", () => {
  it("reducida, se convierte si queda más liviana", () => {
    expect(convieneConvertir(1000, 999, true)).toBe(true);
  });
  it("si queda igual o más pesada, se deja la original", () => {
    expect(convieneConvertir(1000, 1000, true)).toBe(false);
    expect(convieneConvertir(1000, 1500, true)).toBe(false);
    expect(convieneConvertir(1000, 1500, false)).toBe(false);
  });
  it("sin reducirla, ganar menos de un 10 % no justifica volver a comprimir", () => {
    expect(convieneConvertir(1000, 950, false)).toBe(false);
    expect(convieneConvertir(1000, 900, false)).toBe(true);
  });
});

describe("urlFoto", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("la forma la da Tauri y lleva la versión", () => {
    const convertFileSrc = vi.fn((p: string, esquema: string) => `http://${esquema}.localhost/${p}`);
    vi.stubGlobal("window", { __TAURI_INTERNALS__: { convertFileSrc } });
    expect(urlFoto({ id: "ana-1", updated_at: "2026-11-01T10:00:00.000Z" })).toBe(
      "http://foto.localhost/ana-1?v=2026-11-01T10%3A00%3A00.000Z",
    );
  });
});
