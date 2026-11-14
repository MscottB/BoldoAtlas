import { describe, expect, it, vi } from "vitest";
import { exportar, type Pasos } from "./exportar";

function pasos(acepta: boolean): Pasos {
  return {
    aceptar: vi.fn(async () => acepta),
    armar: vi.fn(async () => ({ nombre: "Org_2026-11-14_r1.xlsx", hojas: [] })),
    escribir: vi.fn(async () => new Uint8Array([0x50, 0x4b])),
    guardar: vi.fn(async (nombre: string) => nombre),
  };
}

describe("exportar a Excel", () => {
  it("sin aceptar el aviso no se arma ni se escribe ningún archivo", async () => {
    const p = pasos(false);
    await expect(exportar(p)).resolves.toBeNull();
    expect(p.aceptar).toHaveBeenCalledOnce();
    expect(p.armar).not.toHaveBeenCalled();
    expect(p.escribir).not.toHaveBeenCalled();
    expect(p.guardar).not.toHaveBeenCalled();
  });

  it("al aceptar arma lo que se ve, lo escribe y lo guarda con el nombre sugerido", async () => {
    const p = pasos(true);
    await expect(exportar(p)).resolves.toBe("Org_2026-11-14_r1.xlsx");
    expect(p.guardar).toHaveBeenCalledWith("Org_2026-11-14_r1.xlsx", new Uint8Array([0x50, 0x4b]));
  });
});
