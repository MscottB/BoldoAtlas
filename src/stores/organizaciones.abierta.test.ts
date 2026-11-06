import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { effect, stop } from "vue";
import { i18n } from "@/i18n";
import { fijarBase } from "@/lib/baseActiva";
import { deLaAbierta } from "@/lib/trabajos";
import { useOrganizacion } from "./organizacion";
import { useOrganizaciones } from "./organizaciones";

const c = vi.hoisted(() => ({
  consultar: vi.fn(),
  leerMeta: vi.fn(),
  listarOrganizaciones: vi.fn(),
  sincronizarOrganizacion: vi.fn(),
}));
vi.mock("@/db/cliente", () => c);
vi.mock("vue-sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), warning: vi.fn() }) }));

const de = (id: string, nombre: string) => ({ id, nombre, color: "#000" });

beforeEach(() => {
  fijarBase("A");
  setActivePinia(createPinia());
  c.consultar.mockResolvedValue([]);
  c.leerMeta.mockResolvedValue({ org_nombre: "Alfa" });
  c.sincronizarOrganizacion.mockResolvedValue(undefined);
});

describe("el nombre de la abierta", () => {
  it("con una sola organización, los trabajos se nombran como hoy", async () => {
    c.listarOrganizaciones.mockResolvedValue([de("A", "Alfa")]);
    const o = useOrganizaciones();
    await o.cargarLista();
    expect(o.varias).toBe(false);
    expect(deLaAbierta("Respaldo")).toBe("Respaldo");
  });

  it("con una sola, renombrar no despierta a quien nombra un trabajo; con varias, sí", async () => {
    c.listarOrganizaciones.mockResolvedValue([de("A", "Alfa")]);
    const o = useOrganizaciones();
    const org = useOrganizacion();
    await o.cargarLista();
    await org.cargar();
    let veces = 0;
    const e = effect(() => {
      deLaAbierta("Respaldo");
      veces++;
    });
    c.leerMeta.mockResolvedValue({ org_nombre: "Otro" });
    await org.cargar();
    expect(veces).toBe(1);

    c.listarOrganizaciones.mockResolvedValue([de("A", "Otro"), de("B", "Beta")]);
    await o.cargarLista();
    expect(veces).toBeGreaterThan(1);
    const conVarias = veces;
    c.leerMeta.mockResolvedValue({ org_nombre: "Tercero" });
    await org.cargar();
    expect(veces).toBeGreaterThan(conVarias);
    stop(e);
  });

  it("con varias, nombran la abierta", async () => {
    c.listarOrganizaciones.mockResolvedValue([de("A", "Alfa"), de("B", "Beta")]);
    const o = useOrganizaciones();
    await o.cargarLista();
    await useOrganizacion().cargar();
    expect(o.varias).toBe(true);
    expect(deLaAbierta("Respaldo")).toBe("Alfa · Respaldo");
  });

  it("antes de cargar sus datos, el nombre es el de la lista; sin él, sin nombre y no un separador suelto", async () => {
    c.listarOrganizaciones.mockResolvedValue([de("A", "Lista"), de("B", "Beta")]);
    const o = useOrganizaciones();
    await o.cargarLista();
    expect(o.nombreAbierta).toBe("Lista");

    c.listarOrganizaciones.mockResolvedValue([de("A", ""), de("B", "Beta")]);
    await o.cargarLista();
    expect(deLaAbierta("Respaldo")).toBe(`${i18n.global.t("barra.sinNombre")} · Respaldo`);
  });
});
