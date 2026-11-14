import { describe, expect, it, vi } from "vitest";
import { crearAviso } from "./aviso";
import { exportar } from "./exportar";

function conAviso() {
  const abrir = vi.fn<(abierto: boolean) => void>();
  const aviso = crearAviso(abrir);
  const guardar = vi.fn(async () => "a.xlsx");
  const exportacion = exportar({
    aceptar: aviso.preguntar,
    armar: async () => ({ nombre: "a.xlsx", hojas: [] }),
    escribir: async () => new Uint8Array([1]),
    guardar,
  });
  return { abrir, aviso, guardar, exportacion };
}

describe("el aviso antes de exportar", () => {
  it("se abre al preguntar", () => {
    const { abrir } = conAviso();
    expect(abrir).toHaveBeenCalledWith(true);
  });

  it("cerrarlo (Cancelar, Esc, clic fuera) es no aceptar: no se guarda nada", async () => {
    const { aviso, guardar, exportacion } = conAviso();
    aviso.cerrado();
    await expect(exportacion).resolves.toBeNull();
    expect(guardar).not.toHaveBeenCalled();
  });

  it("aceptar guarda, aunque el diálogo avise que se cerró justo después", async () => {
    const { aviso, guardar, exportacion } = conAviso();
    aviso.aceptar();
    aviso.cerrado(); // el botón cierra el diálogo después de responder
    await expect(exportacion).resolves.toBe("a.xlsx");
    expect(guardar).toHaveBeenCalledOnce();
  });

  it("un cierre sin pregunta pendiente no hace nada", () => {
    const aviso = crearAviso(() => {});
    expect(() => {
      aviso.cerrado();
      aviso.aceptar();
    }).not.toThrow();
  });
});
