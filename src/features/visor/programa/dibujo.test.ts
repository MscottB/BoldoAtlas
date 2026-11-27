import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { VISTA_POR_DEFECTO } from "@/features/arbol/vista";
import { datos } from "@/features/export/fixture";
import { prepararImagen, type PedidoImagen } from "@/features/export/preparar";
import { dibujarSvg } from "@/features/export/treeSvg";
import { useOrganizacion } from "@/stores/organizacion";
import { datosVisor } from "../datos";
import { dibujar, traductor } from "./dibujo";

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
    const img = dibujarSvg(await prepararImagen(pedido()), { sinEncabezado: true });
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

describe("traductor", () => {
  const t = traductor({
    uno: "+{n} unidad | +{n} unidades",
    tres: "ninguna | una | {n} muchas",
    hola: "Hola {nombre}",
  });
  it("elige la forma como vue-i18n", () => {
    expect(t("uno", { n: 1 }, 1)).toBe("+1 unidad");
    expect(t("uno", { n: 3 }, 3)).toBe("+3 unidades");
    expect(t("tres", { n: 0 }, 0)).toBe("ninguna");
    expect(t("tres", { n: 1 }, 1)).toBe("una");
    expect(t("tres", { n: 5 }, 5)).toBe("5 muchas");
  });
  it("reemplaza {nombre} y deja la clave si falta", () => {
    expect(t("hola", { nombre: "Ana" })).toBe("Hola Ana");
    expect(t("falta")).toBe("falta");
  });
});
