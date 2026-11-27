import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { VISTA_POR_DEFECTO } from "@/features/arbol/vista";
import { datos } from "@/features/export/fixture";
import { prepararImagen, type PedidoImagen } from "@/features/export/preparar";
import { dibujarSvg } from "@/features/export/treeSvg";
import { useOrganizacion } from "@/stores/organizacion";
import { datosVisor } from "../datos";
import { dibujar } from "./dibujo";

beforeEach(() => {
  setActivePinia(createPinia());
  const d = datos();
  const org = useOrganizacion();
  org.$patch({
    unidades: d.unidades,
    puestos: d.puestos,
    asignaciones: d.asignaciones,
    trabajadores: [...d.trabajadores.values()],
    org: { nombre: "Atlas SA", logo: null },
    catalogos: { ...org.catalogos, cargos: [...d.cargos].map(([id, nombre]) => ({ id, nombre })) } as never,
    cargado: true,
  });
});

const pedido = (o: Partial<PedidoImagen> = {}): PedidoImagen => ({
  alcance: "todo",
  nivel: "presentacion",
  abrirTodo: true,
  config: VISTA_POR_DEFECTO,
  ...o,
});
const visor = (o: Partial<PedidoImagen> = {}) => datosVisor({ ...pedido(o), correo: false, telefono: false });
const cuantos = (svg: string) => svg.split("data-id=").length - 1;

describe("dibujar", () => {
  it("dibujar_igual_que_la_imagen", async () => {
    const r = await dibujar(visor(), new Set());
    const img = dibujarSvg(await prepararImagen(pedido()));
    expect([r.ancho, r.alto]).toEqual([img.ancho, img.alto]);
  });

  it("plegar_reordena", async () => {
    const d = visor();
    const abierto = await dibujar(d, new Set());
    const plegado = await dibujar(d, new Set(["a2"]));
    expect(cuantos(plegado.svg)).toBeLessThan(cuantos(abierto.svg));
    expect(plegado.svg).toContain("+3 unidades");
  });
});
