import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  convieneConvertir,
  FOTO_LADO_MAX,
  FOTO_TOPE_MS,
  FotoEnorme,
  medidasReducidas,
  prepararFoto,
  procesarFoto,
  puedeTraerDatos,
  type FotoPreparada,
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

describe("prepararFoto: tope de tiempo", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const colgada = () => new Promise<never>(() => {});

  it("un paso que no responde termina con error al llegar al tope, y no antes", async () => {
    const hecho = vi.fn();
    const r = prepararFoto(new Blob(["x"]), () => true, { optimizar: colgada, aBase64: async () => "x" }).then((v) => {
      hecho(v);
      return v;
    });
    await vi.advanceTimersByTimeAsync(FOTO_TOPE_MS - 1);
    expect(hecho).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(await r).toEqual({ error: "fotoDemorada" });
  });

  it("también vale para la lectura final", async () => {
    const r = prepararFoto(new Blob(["x"]), () => true, { optimizar: async (a) => a, aBase64: colgada });
    await vi.advanceTimersByTimeAsync(FOTO_TOPE_MS);
    expect(await r).toEqual({ error: "fotoDemorada" });
  });

  it("lo que termina después del tope no se escribe", async () => {
    let soltar!: (b: Blob) => void;
    const optimizar = () => new Promise<Blob>((ok) => (soltar = ok));
    const guardar = vi.fn(async () => {});
    const avisar = vi.fn();
    const tarea = procesarFoto({
      preparar: () => prepararFoto(new Blob(["x"]), () => true, { optimizar, aBase64: async () => "QUJD" }),
      vigente: () => true,
      guardar,
      avisar,
      terminar: () => {},
    });
    await vi.advanceTimersByTimeAsync(FOTO_TOPE_MS);
    await tarea;
    expect(avisar).toHaveBeenCalledWith("fotoDemorada");
    soltar(new Blob(["x"]));
    await vi.advanceTimersByTimeAsync(0);
    expect(guardar).not.toHaveBeenCalled();
  });

  it("si la ficha cambió antes del tope, tampoco avisa", async () => {
    let abierta = true;
    const r = prepararFoto(new Blob(["x"]), () => abierta, { optimizar: colgada, aBase64: async () => "x" });
    abierta = false;
    await vi.advanceTimersByTimeAsync(FOTO_TOPE_MS);
    expect(await r).toBeNull();
  });

  it("al terminar a tiempo no deja el reloj corriendo", async () => {
    await prepararFoto(new Blob(["x"]), () => true, { optimizar: async (a) => a, aBase64: async () => "x" });
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("procesarFoto: la cola de la ficha", () => {
  const tarea = (cambios: Partial<Parameters<typeof procesarFoto>[0]> = {}) => ({
    preparar: async () => ({ base64: "QUJD" }),
    vigente: () => true,
    guardar: vi.fn(async () => {}),
    avisar: vi.fn(),
    terminar: vi.fn(),
    ...cambios,
  });

  it("si guardar lanza, no rechaza, avisa y termina", async () => {
    const t = tarea({ guardar: () => Promise.reject(new Error("base ocupada")) });
    await expect(procesarFoto(t)).resolves.toBeUndefined();
    expect(t.avisar).toHaveBeenLastCalledWith("fotoGuardado");
    expect(t.terminar).toHaveBeenCalledOnce();
  });

  it("si preparar lanza, tampoco rechaza y termina", async () => {
    const t = tarea({ preparar: () => Promise.reject(new Error("x")) });
    await expect(procesarFoto(t)).resolves.toBeUndefined();
    expect(t.terminar).toHaveBeenCalledOnce();
  });

  it("termina también cuando no hay nada que entregar", async () => {
    const t = tarea({ preparar: async () => null });
    await procesarFoto(t);
    expect(t.guardar).not.toHaveBeenCalled();
    expect(t.avisar).not.toHaveBeenCalled();
    expect(t.terminar).toHaveBeenCalledOnce();
  });

  it("dos fotos seguidas: la primera falla, la segunda sale bien y no queda error", async () => {
    // Como en la ficha: el error es del último aviso, y solo avisa la última foto elegida.
    let error: string | null = "";
    let ultima = 0;
    const eleccion = (preparar: () => Promise<FotoPreparada | null>) => {
      const esta = ++ultima;
      return () =>
        procesarFoto(
          tarea({ preparar, vigente: () => esta === ultima, avisar: (e) => (error = e), guardar: async () => {} }),
        );
    };
    const primera = eleccion(async () => ({ error: "fotoLectura" }));
    const segunda = eleccion(async () => ({ base64: "QUJD" }));
    await primera();
    expect(error).toBe("");
    await segunda();
    expect(error).toBeNull();
  });

  it("si falla la última, sí queda el error", async () => {
    const t = tarea({ preparar: async () => ({ error: "fotoLectura" }) });
    await procesarFoto(t);
    expect(t.avisar).toHaveBeenLastCalledWith("fotoLectura");
    expect(t.guardar).not.toHaveBeenCalled();
  });

  it("la que ya no es la última guarda, pero no toca el mensaje de la siguiente", async () => {
    const t = tarea({ vigente: () => false });
    await procesarFoto(t);
    expect(t.guardar).toHaveBeenCalledWith("QUJD");
    expect(t.avisar).not.toHaveBeenCalled();
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
