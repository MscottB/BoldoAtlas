import { beforeEach, describe, expect, it } from "vitest";
import { indiceHijos } from "@/features/arbol/jerarquia";
import type { Unidad } from "@/db/tipos";
import { i18n } from "@/i18n";
import { trabajos, ultimoFin } from "@/lib/trabajos";
import { filasVisibles, intentar, intentarTrabajo, revisionConDecisiones } from "./intercambio";

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

  it("un campo demasiado largo dice dónde, con etiquetas legibles", async () => {
    const r = await intentar(() =>
      Promise.reject({
        codigo: "muy_pesado",
        detalle: "",
        donde: { tabla: "trabajadores", columna: "notas", nombre: "Ana" },
      }),
    );
    expect(r).toMatchObject({
      ok: false,
      mensaje: expect.stringMatching(/Personas.*Ana.*Notas/),
    });
    const sinNombre = await intentar(() =>
      Promise.reject({
        codigo: "muy_pesado",
        detalle: "",
        donde: { tabla: "tabla_rara", columna: "campo_raro", nombre: null },
      }),
    );
    if (sinNombre.ok) throw new Error("debía fallar");
    expect(sinNombre.mensaje).not.toMatch(/tabla_rara|campo_raro/);
  });

  it("si lo que se pasa es el total, sugiere exportar por ramas", async () => {
    const r = await intentar(() => Promise.reject({ codigo: "exportar_muy_pesado", detalle: "bytes" }));
    expect(r).toMatchObject({ ok: false, mensaje: expect.stringContaining("Exporta por ramas") });
    expect(r).toMatchObject({ mensaje: expect.stringContaining("512 MB") });
    const filas = await intentar(() => Promise.reject({ codigo: "muy_pesado_total", detalle: "filas" }));
    expect(filas).toMatchObject({ mensaje: expect.stringContaining("500.000 filas") });
  });
});

describe("revisión con decisiones", () => {
  beforeEach(() => {
    trabajos.value = [];
    revisionConDecisiones(false);
    trabajos.value = [];
  });

  it("mientras haya decisiones cuenta como trabajo en curso, una sola vez", () => {
    revisionConDecisiones(true);
    revisionConDecisiones(true);
    expect(trabajos.value).toEqual([i18n.global.t("trabajos.revisionAbierta")]);
    revisionConDecisiones(false);
    expect(trabajos.value).toEqual([]);
    revisionConDecisiones(false);
    expect(trabajos.value).toEqual([]);
  });

  it("cada grupo y cada acción en bloque tiene su texto, en los dos idiomas", () => {
    const { te } = i18n.global;
    for (const locale of ["es", "en"] as const) {
      for (const tipo of [
        "nuevo",
        "diferente",
        "borrado_vs_editado",
        "borrado_sin_conflicto",
        "duplicado_persona",
        "union",
      ]) {
        expect(te(`intercambio.revisar.grupo.${tipo}.titulo`, locale), tipo).toBe(true);
        expect(te(`intercambio.revisar.grupo.${tipo}.ayuda`, locale), tipo).toBe(true);
      }
      for (const a of ["todo_mio", "todo_archivo", "agregar_todo", "omitir_todo", "mantener_todo", "borrar_todo"])
        expect(te(`intercambio.revisar.masivo.${a}`, locale), a).toBe(true);
      for (const b of ["unica", "regla", "referencia", "ciclo"])
        expect(te(`intercambio.revisar.bloqueo.${b}`, locale), b).toBe(true);
      for (const r of ["conservar_mio", "conservar_archivo", "vaciar", "descartar"])
        expect(te(`intercambio.revisar.resuelto.${r}`, locale), r).toBe(true);
    }
  });

  it("los fallos propios de la revisión dicen qué pasó y que no se aplicó nada", async () => {
    for (const codigo of ["base_cambio", "bloqueada", "sin_verificar"]) {
      const r = await intentar(() => Promise.reject({ codigo, detalle: "" }));
      expect(r).toMatchObject({ ok: false, codigo, mensaje: expect.stringContaining("No se aplicó nada") });
    }
  });
});

describe("intentarTrabajo", () => {
  beforeEach(() => {
    trabajos.value = [];
    ultimoFin.value = null;
  });

  it("anota el trabajo mientras dura y lo da por bueno", async () => {
    let fin: (n: number) => void = () => {};
    const p = intentarTrabajo("A", () => new Promise<number>((r) => (fin = r)));
    expect(trabajos.value).toEqual(["A"]);
    fin(3);
    expect(await p).toEqual({ ok: true, valor: 3 });
    expect(trabajos.value).toEqual([]);
    expect(ultimoFin.value).toEqual({ nombre: "A", fallo: false });
  });

  it("un fallo real llega a conTrabajo y a quien llama", async () => {
    const r = await intentarTrabajo("A", () => Promise.reject({ codigo: "no_abre", detalle: "" }));
    expect(r).toMatchObject({ ok: false, codigo: "no_abre" });
    expect(ultimoFin.value).toEqual({ nombre: "A", fallo: true });
  });

  it("cancelar no cuenta como fallo: no trae la ventana al frente", async () => {
    const r = await intentarTrabajo("A", () => Promise.reject({ codigo: "cancelado", detalle: "" }));
    expect(r).toMatchObject({ ok: false, codigo: "cancelado" });
    expect(ultimoFin.value).toEqual({ nombre: "A", fallo: false });
    expect(trabajos.value).toEqual([]);
  });
});
