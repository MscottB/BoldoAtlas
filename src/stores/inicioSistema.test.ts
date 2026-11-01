import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invoke(...a) }));

const { useInicioSistema } = await import("./inicioSistema");

beforeEach(() => {
  setActivePinia(createPinia());
  invoke.mockReset();
});

describe("inicio con el sistema", () => {
  it("muestra lo que dice el sistema, no lo que se pidió", async () => {
    const s = useInicioSistema();
    invoke.mockResolvedValueOnce({ activo: false, noDisponible: null });
    expect(await s.cargar()).toEqual({ ok: true });
    expect(s.noDisponible).toBeNull();

    // pedido encender, pero el sistema lo mantiene apagado
    invoke.mockResolvedValueOnce({ activo: false, noDisponible: null });
    expect(await s.cambiar(true)).toEqual({ ok: true });
    expect(invoke).toHaveBeenLastCalledWith("cambiar_inicio_sistema", { activo: true });
    expect(s.activo).toBe(false);
  });

  it("dice por qué no se ofrece", async () => {
    const s = useInicioSistema();
    invoke.mockResolvedValueOnce({ activo: false, noDisponible: "sistema" });
    await s.cargar();
    expect(s.noDisponible).toBe("sistema");
  });

  it("si falla devuelve el motivo sin lanzar y no cambia el estado", async () => {
    const s = useInicioSistema();
    invoke.mockResolvedValueOnce({ activo: true, noDisponible: null });
    await s.cargar();
    invoke.mockRejectedValueOnce("acceso denegado");
    const r = await s.cambiar(false);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.mensaje).toContain("acceso denegado");
    expect(s.activo).toBe(true);

    invoke.mockRejectedValueOnce("sin registro");
    expect((await s.cargar()).ok).toBe(false);
  });
});
