import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Router } from "vue-router";
import { buscarPersona } from "./buscarPersona";
import { paletaAbierta } from "./useAtajos";

const m = vi.hoisted(() => ({
  org: { cargado: true, vacia: true },
  volverAlProyecto: vi.fn(),
  info: vi.fn(),
}));
vi.mock("vue-sonner", () => ({ toast: { info: m.info } }));
vi.mock("@/stores/organizacion", () => ({ useOrganizacion: () => m.org }));
vi.mock("@/features/pestanas/usePestanas", () => ({
  usePestanas: () => ({ volverAlProyecto: m.volverAlProyecto }),
}));
vi.mock("./useAtajos", async () => {
  const { ref } = await import("vue");
  return { paletaAbierta: ref(false) };
});

const enInicio = { currentRoute: { value: { meta: { sinMarco: true } } } } as unknown as Router;

beforeEach(() => {
  vi.clearAllMocks();
  paletaAbierta.value = false;
});

describe("buscarPersona desde Inicio", () => {
  it("sin personas, avisa y no abre la paleta", async () => {
    m.org = { cargado: true, vacia: true };
    await buscarPersona(enInicio);
    expect(m.info).toHaveBeenCalledOnce();
    expect(paletaAbierta.value).toBe(false);
  });

  it("si los datos no cargaron, no afirma que no hay personas: vuelve a la pestaña, que dice por qué", async () => {
    m.org = { cargado: false, vacia: true };
    await buscarPersona(enInicio);
    expect(m.info).not.toHaveBeenCalled();
    expect(m.volverAlProyecto).toHaveBeenCalledOnce();
  });
});
