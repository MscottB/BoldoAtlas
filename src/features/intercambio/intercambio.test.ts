import { describe, expect, it } from "vitest";
import { indiceHijos } from "@/features/arbol/jerarquia";
import type { Unidad } from "@/db/tipos";
import { i18n } from "@/i18n";
import { filasVisibles, intentar } from "./intercambio";

const unidad = (id: string, parent_id: string | null) => ({ id, parent_id, nombre: id, orden: 0 }) as Unidad;
const indice = indiceHijos([unidad("r", null), unidad("a", "r"), unidad("b", "a"), unidad("c", "r")]);
const ids = (f: ReturnType<typeof filasVisibles>) => f.map((x) => x.unidad.id);

describe("filasVisibles", () => {
  it("solo muestra los hijos de lo que está abierto, en orden y con su nivel", () => {
    expect(ids(filasVisibles(indice, new Set(), new Set()))).toEqual(["r"]);
    const f = filasVisibles(indice, new Set(["r", "a"]), new Set());
    expect(ids(f)).toEqual(["r", "a", "b", "c"]);
    expect(f.map((x) => x.nivel)).toEqual([0, 1, 2, 1]);
    expect(f.map((x) => x.tieneHijos)).toEqual([true, true, false, false]);
  });

  it("marcar una unidad cubre toda su rama, y solo esa", () => {
    const f = filasVisibles(indice, new Set(["r", "a"]), new Set(["a"]));
    expect(f.filter((x) => x.cubierta).map((x) => x.unidad.id)).toEqual(["b"]);
  });
});

describe("intentar", () => {
  it("traduce el código y no lanza", async () => {
    const r = await intentar(() => Promise.reject({ codigo: "no_abre", detalle: "" }));
    expect(r).toEqual({
      ok: false,
      codigo: "no_abre",
      mensaje: i18n.global.t("intercambio.error.no_abre"),
    });
  });

  it("lo que no conoce usa los mensajes de respaldos", async () => {
    const r = await intentar(() => Promise.reject({ codigo: "en_uso", detalle: "" }));
    expect(r).toMatchObject({ ok: false, mensaje: i18n.global.t("respaldos.error.en_uso") });
  });

  it("devuelve el valor", async () => {
    expect(await intentar(() => Promise.resolve(3))).toEqual({ ok: true, valor: 3 });
  });
});
