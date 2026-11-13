import { describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { fijarBase } from "@/lib/baseActiva";
import { useOrganizacion } from "./organizacion";
import { useOrganizaciones } from "./organizaciones";

vi.hoisted(() =>
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} }),
);
vi.mock("@/lado/modo", () => ({ MODO_LADO: true, idLado: () => "B" }));
const c = vi.hoisted(() => ({ sincronizarOrganizacion: vi.fn(), listarOrganizaciones: vi.fn() }));
vi.mock("@/db/cliente", async (original) => ({
  ...(await original<typeof import("@/db/cliente")>()),
  ...c,
}));

describe("useOrganizaciones en el iframe de al lado", () => {
  it("cargar el nombre de la otra no sincroniza nada: en el lado no se escribe", async () => {
    fijarBase("B");
    setActivePinia(createPinia());
    useOrganizaciones(); // lo crea useAtajos en AppLado
    useOrganizacion().org = { nombre: "Org B", logo: null };
    await nextTick();
    expect(c.sincronizarOrganizacion).not.toHaveBeenCalled();
    expect(c.listarOrganizaciones).not.toHaveBeenCalled();
  });
});
