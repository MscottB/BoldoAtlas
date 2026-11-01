import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { abrirEnPestanaNueva } from "@/features/pestanas/usePestanas";
import { useOrganizacion } from "@/stores/organizacion";
import { puestos, unidades } from "./fixture";
import { useLienzo } from "./useLienzo";
import { rutaPuesto, useUbicar } from "./useUbicar";

const m = vi.hoisted(() => ({
  ruta: { name: "arbol", query: {} as Record<string, string> },
  push: vi.fn(),
  guardarEstado: vi.fn(),
}));
vi.mock("vue-router", () => ({ useRoute: () => m.ruta, useRouter: () => ({ push: m.push }) }));
vi.mock("@/features/pestanas/usePestanas", () => ({
  abrirEnPestanaNueva: vi.fn(),
  usePestanas: () => ({ activa: "pestana", guardarEstado: m.guardarEstado }),
}));

// p4 está en Mecánica (GG › Operaciones › Mantención › Mecánica).
const destino = rutaPuesto({ id: "p4", unidad_id: "mecanica" });

describe("useUbicar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.ruta = { name: "arbol", query: {} };
    setActivePinia(createPinia());
    useOrganizacion().$patch({ unidades: unidades.filter((u) => !u.deleted_at), puestos });
    useLienzo().seleccion.value = null;
  });

  it("un puesto que no está en lo que se ve: lo dice y no navega", () => {
    expect(useUbicar().ubicar("no-existe").ok).toBe(false);
    expect(m.push).not.toHaveBeenCalled();
    expect(abrirEnPestanaNueva).not.toHaveBeenCalled();
  });

  it("con `nueva`, en una pestaña nueva: esta queda como estaba", () => {
    expect(useUbicar().ubicar("p4", true)).toEqual({ ok: true });
    expect(abrirEnPestanaNueva).toHaveBeenCalledWith(destino);
    expect(m.push).not.toHaveBeenCalled();
    expect(m.guardarEstado).not.toHaveBeenCalled();
    expect(useLienzo().seleccion.value).toBeNull();
  });

  it("ya en el árbol (sin enfocar o dentro de la rama): se revela ahí mismo", () => {
    expect(useUbicar().ubicar("p4")).toEqual({ ok: true });
    expect(useLienzo().seleccion.value).toBe("mecanica");

    useLienzo().seleccion.value = null;
    m.ruta.query = { raiz: "operaciones" };
    expect(useUbicar().ubicar("p4")).toEqual({ ok: true });
    expect(useLienzo().seleccion.value).toBe("mecanica");
    expect(m.push).not.toHaveBeenCalled();
  });

  it("una rama enfocada que no existe en lo que se ve no cuenta: se revela ahí mismo", () => {
    m.ruta.query = { raiz: "ya-no-existe" };
    expect(useUbicar().ubicar("p4")).toEqual({ ok: true });
    expect(useLienzo().seleccion.value).toBe("mecanica");
    expect(m.push).not.toHaveBeenCalled();
  });

  it.each([
    ["otra vista", { name: "revision", query: {} }],
    ["otra rama", { name: "arbol", query: { raiz: "finanzas" } }],
  ])("desde %s: olvida el estado guardado de la pestaña y luego navega", (_, ruta) => {
    m.ruta = ruta as typeof m.ruta;
    expect(useUbicar().ubicar("p4")).toEqual({ ok: true });
    expect(m.guardarEstado).toHaveBeenCalledWith("pestana", "", null);
    expect(m.push).toHaveBeenCalledWith(destino);
    expect(m.guardarEstado.mock.invocationCallOrder[0]).toBeLessThan(m.push.mock.invocationCallOrder[0]!);
  });
});
