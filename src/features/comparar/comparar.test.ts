import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { effectScope } from "vue";
import type { Organizacion, ResumenComparacion } from "@/db/cliente";
import { fijarBase } from "@/lib/baseActiva";
import { trabajos } from "@/lib/trabajos";
import { useOrganizaciones } from "@/stores/organizaciones";
import { useComparar } from "./comparar";

// localStorage simulado desde antes de importar: hay módulos que leen sus preferencias al cargarse.
vi.hoisted(() =>
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} }),
);
const c = vi.hoisted(() => ({
  compararOrganizaciones: vi.fn(),
  comparacionPagina: vi.fn(),
  comparacionDetalle: vi.fn(),
  comparacionCancelar: vi.fn(),
  comparacionCerrar: vi.fn(),
  listarOrganizaciones: vi.fn(),
}));
vi.mock("@/db/cliente", () => c);

const org = (id: string): Organizacion =>
  ({ id, nombre: `Org ${id}`, color: "#112233", abierta: "2026-11-03", existe: true }) as Organizacion;
const RESUMEN: ResumenComparacion = {
  otra: "B",
  aproximada: false,
  sinCorreo: 0,
  grupos: [{ tabla: "unidades", soloAqui: 1, soloAlla: 0, difieren: 2 }],
  iguales: 5,
};
const pendiente = <T>() => {
  let resolver!: (v: T) => void;
  let rechazar!: (e: unknown) => void;
  const promesa = new Promise<T>((res, rej) => ((resolver = res), (rechazar = rej)));
  return { promesa, resolver, rechazar };
};

function montar() {
  const scope = effectScope();
  const cmp = scope.run(() => useComparar())!;
  return { cmp, salir: () => scope.stop() };
}

beforeEach(() => {
  fijarBase("A");
  setActivePinia(createPinia());
  trabajos.value = [];
  for (const f of Object.values(c)) f.mockReset();
  c.comparacionCancelar.mockResolvedValue(undefined);
  c.comparacionCerrar.mockResolvedValue(undefined);
  c.listarOrganizaciones.mockResolvedValue([org("A"), org("B")]);
  const organizaciones = useOrganizaciones();
  organizaciones.lista = [org("A"), org("B")];
  organizaciones.listaAlDia = true;
});

describe("useComparar", () => {
  it("con una organización que ya no está en la lista lo dice y no llama a Rust", async () => {
    const { cmp } = montar();
    const r = await cmp.comparar("Z");
    expect(r).toEqual({
      ok: false,
      codigo: "desconocido",
      mensaje: "Esa organización ya no está en la lista.",
    });
    expect(c.compararOrganizaciones).not.toHaveBeenCalled();
  });

  it("mientras compara hay un trabajo registrado; al terminar queda el resumen", async () => {
    const p = pendiente<ResumenComparacion>();
    c.compararOrganizaciones.mockReturnValue(p.promesa);
    const { cmp } = montar();
    const hecho = cmp.comparar("B");
    await vi.waitFor(() => expect(c.compararOrganizaciones).toHaveBeenCalled());
    expect(cmp.cargando.value).toBe(true);
    expect(trabajos.value).toEqual(["Org A · Comparar con otra organización"]);
    p.resolver(RESUMEN);
    expect(await hecho).toEqual({ ok: true });
    expect(cmp.resumen.value).toEqual(RESUMEN);
    expect(cmp.cargando.value).toBe(false);
    expect(trabajos.value).toEqual([]);
  });

  it("Cancelar avisa a Rust con el mismo trabajo, y lo que llega tarde no se muestra", async () => {
    const p = pendiente<ResumenComparacion>();
    c.compararOrganizaciones.mockReturnValue(p.promesa);
    const { cmp } = montar();
    const hecho = cmp.comparar("B");
    await vi.waitFor(() => expect(c.compararOrganizaciones).toHaveBeenCalled());
    const trabajo = c.compararOrganizaciones.mock.calls[0]![1];
    await cmp.cancelar();
    expect(c.comparacionCancelar).toHaveBeenCalledWith(trabajo);
    expect(cmp.cargando.value).toBe(false);
    p.resolver(RESUMEN);
    expect(await hecho).toMatchObject({ ok: false, codigo: "cancelado" });
    expect(cmp.resumen.value).toBeNull();
  });

  it("un fallo de Rust vuelve traducido, sin lanzar", async () => {
    c.compararOrganizaciones.mockRejectedValue({ codigo: "misma", detalle: "" });
    const { cmp } = montar();
    expect(await cmp.comparar("B")).toEqual({
      ok: false,
      codigo: "misma",
      mensaje: "No puedes comparar una organización consigo misma.",
    });
    expect(trabajos.value).toEqual([]);
  });

  it("una página vencida lo marca, y comparar de nuevo vuelve a llamar a Rust", async () => {
    c.compararOrganizaciones.mockResolvedValue(RESUMEN);
    c.comparacionPagina.mockRejectedValue({ codigo: "comparacion_vencida", detalle: "" });
    const { cmp } = montar();
    await cmp.comparar("B");
    const filtro = { tabla: null, presencia: null, desde: 0, cuantos: 50 };
    expect(await cmp.verPagina(filtro)).toMatchObject({ ok: false, codigo: "comparacion_vencida" });
    expect(cmp.vencida.value).toBe(true);
    expect(c.comparacionPagina).toHaveBeenCalledWith(filtro);

    await cmp.comparar("B");
    expect(c.compararOrganizaciones).toHaveBeenCalledTimes(2);
    expect(cmp.vencida.value).toBe(false);
  });

  it("verPagina y verDetalle dejan lo que dio Rust", async () => {
    const pagina = { filas: [], total: 0 };
    const detalle = {
      campos: [],
      puestosAqui: [],
      puestosAlla: [],
      actualizadaAqui: null,
      actualizadaAlla: null,
    };
    c.comparacionPagina.mockResolvedValue(pagina);
    c.comparacionDetalle.mockResolvedValue(detalle);
    const { cmp } = montar();
    expect(await cmp.verPagina({ tabla: "unidades", presencia: "difieren", desde: 50, cuantos: 50 })).toEqual(
      {
        ok: true,
      },
    );
    expect(cmp.pagina.value).toEqual(pagina);
    expect(await cmp.verDetalle("unidades", "u1")).toEqual({ ok: true });
    expect(c.comparacionDetalle).toHaveBeenCalledWith("unidades", "u1");
    expect(cmp.detalle.value).toEqual(detalle);
  });

  it("una página vencida en el detalle también lo marca", async () => {
    c.comparacionDetalle.mockRejectedValue({ codigo: "comparacion_vencida", detalle: "" });
    const { cmp } = montar();
    expect(await cmp.verDetalle("unidades", "u1")).toMatchObject({
      ok: false,
      mensaje: "Esta comparación ya no vale. Compara de nuevo.",
    });
    expect(cmp.vencida.value).toBe(true);
  });

  it("salir de la vista suelta la comparación en Rust", async () => {
    c.compararOrganizaciones.mockResolvedValue(RESUMEN);
    const { cmp, salir } = montar();
    await cmp.comparar("B");
    salir();
    await vi.waitFor(() => expect(c.comparacionCerrar).toHaveBeenCalled());
    expect(c.comparacionCancelar).not.toHaveBeenCalled();
  });

  it("salir mientras compara cancela el trabajo y suelta la comparación", async () => {
    c.compararOrganizaciones.mockReturnValue(pendiente<ResumenComparacion>().promesa);
    const { cmp, salir } = montar();
    void cmp.comparar("B");
    await vi.waitFor(() => expect(c.compararOrganizaciones).toHaveBeenCalled());
    salir();
    await vi.waitFor(() => expect(c.comparacionCerrar).toHaveBeenCalled());
    expect(c.comparacionCancelar).toHaveBeenCalledWith(c.compararOrganizaciones.mock.calls[0]![1]);
  });

  it("la siguiente comparación espera a que la anterior se suelte", async () => {
    const cierre = pendiente<void>();
    c.comparacionCerrar.mockReturnValue(cierre.promesa);
    c.compararOrganizaciones.mockResolvedValue(RESUMEN);
    montar().salir();
    const hecho = montar().cmp.comparar("B");
    await Promise.resolve();
    expect(c.compararOrganizaciones).not.toHaveBeenCalled();
    cierre.resolver();
    expect(await hecho).toEqual({ ok: true });
  });
});
