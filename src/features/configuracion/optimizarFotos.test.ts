import { describe, expect, it, vi } from "vitest";
import {
  armarLote,
  estimar,
  muestra,
  optimizarTodas,
  type Candidata,
  type FotoLista,
  type Pasos,
} from "./optimizarFotos";

const candidata = (i: number, bytes = 400_000): Candidata => ({
  id: `p${i}`,
  nombre: `Persona ${i}`,
  updated_at: "v1",
  bytes,
});
const lista = (n: number) => Array.from({ length: n }, (_, i) => candidata(i));
const blob = (n: number) => new Blob([new Uint8Array(n)]);

/** Pasos que funcionan; cada prueba reemplaza el que quiere hacer fallar. */
const pasos = (cambios: Partial<Pasos> = {}): Pasos => ({
  leer: async () => blob(300_000),
  convertir: async () => blob(6_000),
  guardar: async (lote) => lote.length,
  ...cambios,
});
const opciones = () => ({ cancelado: () => false, alAvanzar: vi.fn() });

describe("optimizarTodas", () => {
  it("guarda por lotes, deja el resto para el final y avisa cada avance", async () => {
    const guardar = vi.fn(async (l: unknown[]) => l.length);
    const o = opciones();
    const r = await optimizarTodas(lista(7), pasos({ guardar }), { ...o, lote: 3 });
    expect(guardar.mock.calls.map(([l]) => l.length)).toEqual([3, 3, 1]);
    expect(o.alAvanzar).toHaveBeenLastCalledWith(7);
    expect(r).toEqual({ optimizadas: 7, sinGanancia: 0, fallidas: [], cancelado: false });
  });

  it("una foto que falla al leer o convertir se omite, se informa y las demás siguen", async () => {
    const leer = vi.fn(async (id: string) => {
      if (id === "p1") throw new Error("sin foto");
      return blob(300_000);
    });
    let n = 0;
    const convertir = vi.fn(async () => {
      if (++n === 2) throw new Error("no es imagen");
      return blob(6_000);
    });
    const guardar = vi.fn(async (l: FotoLista[]) => l.length);
    const r = await optimizarTodas(lista(4), pasos({ leer, convertir, guardar }), opciones());
    expect(r.fallidas).toEqual(["Persona 1", "Persona 2"]);
    expect(r.optimizadas).toBe(2);
    expect(guardar.mock.calls[0]![0].map((f) => f.candidata.id)).toEqual(["p0", "p3"]);
  });

  it("si un lote no se puede guardar, sus fotos se informan y el trabajo sigue", async () => {
    let n = 0;
    const guardar = vi.fn(async (l: unknown[]) => {
      if (++n === 1) throw new Error("base ocupada");
      return l.length;
    });
    const r = await optimizarTodas(lista(4), pasos({ guardar }), { ...opciones(), lote: 2 });
    expect(r.fallidas).toEqual(["Persona 0", "Persona 1"]);
    expect(r.optimizadas).toBe(2);
  });

  it("al cancelar para, guarda lo ya convertido y no toca lo que falta", async () => {
    const leer = vi.fn(async () => blob(300_000));
    const guardar = vi.fn(async (l: unknown[]) => l.length);
    let hechas = 0;
    const r = await optimizarTodas(lista(10), pasos({ leer, guardar }), {
      cancelado: () => hechas >= 3,
      alAvanzar: (h) => (hechas = h),
    });
    expect(r.cancelado).toBe(true);
    expect(leer).toHaveBeenCalledTimes(3);
    expect(r.optimizadas).toBe(3);
    expect(guardar).toHaveBeenCalledTimes(1);
  });

  it("cancelar antes de empezar no lee ni guarda nada", async () => {
    const leer = vi.fn(async () => blob(1));
    const guardar = vi.fn(async () => 0);
    const r = await optimizarTodas(lista(3), pasos({ leer, guardar }), {
      cancelado: () => true,
      alAvanzar: () => {},
    });
    expect(r.cancelado).toBe(true);
    expect(leer).not.toHaveBeenCalled();
    expect(guardar).not.toHaveBeenCalled();
  });

  it("una foto que no bajaría de peso no se escribe", async () => {
    const original = blob(30_000);
    const guardar = vi.fn(async () => 0);
    const r = await optimizarTodas(
      lista(2),
      pasos({ leer: async () => original, convertir: async (f) => f, guardar }),
      opciones(),
    );
    expect(r.sinGanancia).toBe(2);
    expect(guardar).not.toHaveBeenCalled();
  });

  it("cuenta solo lo que la base escribió: quien cambió entre medio no suma", async () => {
    const r = await optimizarTodas(lista(3), pasos({ guardar: async () => 2 }), opciones());
    expect(r.optimizadas).toBe(2);
  });
});

describe("estimar", () => {
  it("extiende la muestra al total, sin leer todas las fotos", async () => {
    const leer = vi.fn(async () => blob(300_000));
    const e = await estimar(lista(100), { leer, convertir: async () => blob(3_000) });
    expect(leer).toHaveBeenCalledTimes(8);
    expect(e).toEqual({ fotos: 100, total: 40_000_000, quedarian: 400_000 });
  });
  it("si toda la muestra falla, no promete ahorro", async () => {
    const e = await estimar(lista(3), {
      leer: async () => {
        throw new Error("x");
      },
      convertir: async (f) => f,
    });
    expect(e.quedarian).toBe(e.total);
  });
});

describe("muestra", () => {
  it("reparte parejo y no repite", () => {
    expect(muestra([0, 1, 2, 3, 4, 5, 6, 7], 4)).toEqual([0, 2, 4, 6]);
    expect(muestra([1, 2], 8)).toEqual([1, 2]);
  });
});

describe("armarLote", () => {
  it("largo de la descripción, descripción sin imágenes e imágenes seguidas", async () => {
    const c = await armarLote(
      [
        { candidata: candidata(1, 10), foto: new Blob([new Uint8Array([1, 2])]) },
        { candidata: candidata(2, 20), foto: new Blob([new Uint8Array([3])]) },
      ],
      "1.0",
    );
    const largo = new DataView(c.buffer).getUint32(0, true);
    const meta = JSON.parse(new TextDecoder().decode(c.slice(4, 4 + largo)));
    expect(meta).toEqual({
      version_app: "1.0",
      filas: [
        { id: "p1", version: "v1", previos: 10, largo: 2 },
        { id: "p2", version: "v1", previos: 20, largo: 1 },
      ],
    });
    expect([...c.slice(4 + largo)]).toEqual([1, 2, 3]);
  });
});
