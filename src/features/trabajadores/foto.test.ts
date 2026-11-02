import { afterEach, describe, expect, it, vi } from "vitest";
import {
  convieneConvertir,
  FOTO_LADO_MAX,
  FotoEnorme,
  medidasReducidas,
  prepararFoto,
  puedeTraerDatos,
  tipoImagen,
  urlFoto,
} from "./foto";
import { FOTO_MAX_BYTES } from "./validar";

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

describe("convieneConvertir con datos ocultos", () => {
  it("basta con que no pese más, para quitar el GPS", () => {
    expect(convieneConvertir(1000, 1000, false, true)).toBe(true);
    expect(convieneConvertir(1000, 990, false, true)).toBe(true);
  });
  it("si pesaría más, se deja la original", () => {
    expect(convieneConvertir(1000, 1001, false, true)).toBe(false);
    expect(convieneConvertir(1000, 1001, true, true)).toBe(false);
  });
});

describe("puedeTraerDatos", () => {
  const SOI = [0xff, 0xd8];
  const segmento = (marca: number) => [0xff, marca, 0, 4, 1, 2];
  const SOS = [0xff, 0xda, 0, 2];
  const jpeg = (...s: number[][]) => new Uint8Array([...SOI, ...s.flat()]);
  const webp = (chunk: string, flags = 0) =>
    new Uint8Array([...new TextEncoder().encode(`RIFF\0\0\0\0WEBP${chunk}`), 0, 0, 0, 0, flags]);

  it("JPEG sin datos: no", () => {
    expect(puedeTraerDatos(jpeg(segmento(0xe0), segmento(0xdb), SOS))).toBe(false);
  });
  it.each([
    ["EXIF o XMP", 0xe1],
    ["IPTC", 0xed],
    ["comentario", 0xfe],
  ])("JPEG con %s: sí", (_, marca) => {
    expect(puedeTraerDatos(jpeg(segmento(0xe0), segmento(marca), SOS))).toBe(true);
  });
  it("JPEG cortado antes de la imagen o con una cabecera rara: sí, por si acaso", () => {
    expect(puedeTraerDatos(jpeg(segmento(0xe0)))).toBe(true);
    expect(puedeTraerDatos(jpeg([0x00, 0x00, 0, 4], SOS))).toBe(true);
  });
  it("WebP: según las marcas de EXIF y XMP", () => {
    expect(puedeTraerDatos(webp("VP8 "))).toBe(false);
    expect(puedeTraerDatos(webp("VP8X", 0))).toBe(false);
    expect(puedeTraerDatos(webp("VP8X", 0x08))).toBe(true);
    expect(puedeTraerDatos(webp("VP8X", 0x04))).toBe(true);
  });
  it("PNG u otro: sí", () => {
    expect(puedeTraerDatos(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(true);
  });
});

describe("tipoImagen", () => {
  it("sale de los bytes", () => {
    expect(tipoImagen(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(tipoImagen(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe("image/png");
    expect(tipoImagen(new TextEncoder().encode("RIFF0000WEBP"))).toBe("image/webp");
    expect(tipoImagen(new TextEncoder().encode("<svg/>"))).toBe("application/octet-stream");
  });
});

describe("prepararFoto: la foto de una persona no termina en otra", () => {
  const pendiente = <T>() => {
    let ok!: (v: T) => void;
    let mal!: (e: unknown) => void;
    const p = new Promise<T>((a, b) => ((ok = a), (mal = b)));
    return { p, ok, mal };
  };
  // Como en la ficha: cada apertura es un objeto distinto, y se compara cuál sigue abierta.
  const fichaA = { id: "a" };
  const fichaB = { id: "b" };

  it("si se abre otra ficha mientras se optimiza, no entrega nada", async () => {
    let abierta = fichaA;
    const optimizar = pendiente<Blob>();
    const aBase64 = vi.fn(async () => "QUJD");
    const r = prepararFoto(new Blob(["x"]), () => abierta === fichaA, { optimizar: () => optimizar.p, aBase64 });
    abierta = fichaB;
    optimizar.ok(new Blob(["x"]));
    expect(await r).toBeNull();
    expect(aBase64).not.toHaveBeenCalled();
  });

  it("si se abre otra ficha mientras se lee, tampoco", async () => {
    let abierta = fichaA;
    const leer = pendiente<string>();
    const r = prepararFoto(new Blob(["x"]), () => abierta === fichaA, {
      optimizar: async (a) => a,
      aBase64: () => leer.p,
    });
    await Promise.resolve();
    await Promise.resolve();
    abierta = fichaB;
    leer.ok("QUJD");
    expect(await r).toBeNull();
  });

  it("si la ficha ya cambió antes de empezar, ni siquiera procesa", async () => {
    const optimizar = vi.fn(async (a: Blob) => a);
    const r = await prepararFoto(new Blob(["x"]), () => false, { optimizar, aBase64: async () => "x" });
    expect(r).toBeNull();
    expect(optimizar).not.toHaveBeenCalled();
  });

  it("un error de la ficha anterior no se muestra en la nueva", async () => {
    let abierta = fichaA;
    const optimizar = pendiente<Blob>();
    const r = prepararFoto(new Blob(["x"]), () => abierta === fichaA, {
      optimizar: () => optimizar.p,
      aBase64: async () => "x",
    });
    abierta = fichaB;
    optimizar.mal(new Error("no se pudo"));
    expect(await r).toBeNull();
  });

  it("con la misma apertura entrega el base64, aunque una ficha nueva haya cambiado de id", async () => {
    const nueva = { id: null as string | null };
    const abierta = nueva;
    const r = prepararFoto(new Blob(["x"]), () => abierta === nueva, {
      optimizar: async (a) => {
        nueva.id = "creada";
        return a;
      },
      aBase64: async () => "QUJD",
    });
    expect(await r).toEqual({ base64: "QUJD" });
  });

  it("dice qué falló", async () => {
    const pasos = (optimizar: (a: Blob) => Promise<Blob>) => ({ optimizar, aBase64: async () => "x" });
    const sigue = () => true;
    const a = new Blob(["x"]);
    expect(await prepararFoto(a, sigue, pasos(() => Promise.reject(new Error("x"))))).toEqual({ error: "fotoLectura" });
    expect(await prepararFoto(a, sigue, pasos(() => Promise.reject(new FotoEnorme())))).toEqual({ error: "fotoEnorme" });
    const pesada = new Blob([new Uint8Array(FOTO_MAX_BYTES + 1)]);
    expect(await prepararFoto(a, sigue, pasos(async () => pesada))).toEqual({ error: "fotoPesada" });
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
