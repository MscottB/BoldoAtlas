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
    invoke.mockResolvedValueOnce({ disponible: true, activo: false });
    expect(await s.cargar()).toEqual({ ok: true });
    expect(s.disponible).toBe(true);

    // pedido encender, pero el Administrador de tareas lo mantiene apagado
    invoke.mockResolvedValueOnce({ disponible: true, activo: false });
    expect(await s.cambiar(true)).toEqual({ ok: true });
    expect(invoke).toHaveBeenLastCalledWith("cambiar_inicio_sistema", { activo: true });
    expect(s.activo).toBe(false);
  });

  it("si falla devuelve el motivo sin lanzar y no cambia el estado", async () => {
    const s = useInicioSistema();
    invoke.mockResolvedValueOnce({ disponible: true, activo: true });
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
