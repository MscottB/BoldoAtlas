import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { SQL_HISTORICO } from "@/db/repos/historico";
import { u } from "@/features/arbol/fixture";
import { VISTA_POR_DEFECTO } from "@/features/arbol/vista";
import { formatearFecha } from "@/features/puestos/puestos";
import { useOrganizacion } from "@/stores/organizacion";
import { MARCA, datos } from "./fixture";
import { cuantasTarjetas, prepararImagen, type PedidoImagen } from "./preparar";
import { dibujarSvg } from "./treeSvg";

// «Organigrama a una fecha» lee lo histórico de la base: aquí, de estas filas.
const h = vi.hoisted(() => ({ filas: new Map<string, unknown[]>() }));
vi.mock("@/db/cliente", async (original) => ({
  ...(await original<object>()),
  consultar: async (sql: string) => h.filas.get(sql) ?? [],
}));

// g › a1, a2; a2 › s1, s2; s1 › s3.
const TODAS = ["a1", "a2", "g", "s1", "s2", "s3"];

beforeEach(() => {
  setActivePinia(createPinia());
  h.filas.clear();
  const d = datos();
  const org = useOrganizacion();
  org.$patch({
    unidades: d.unidades,
    puestos: d.puestos,
    asignaciones: d.asignaciones,
    trabajadores: [...d.trabajadores.values()],
    org: { nombre: "Atlas SA", logo: null },
    cargado: true,
  });
});

const pedido = (o: Partial<PedidoImagen> = {}): PedidoImagen => ({
  alcance: "todo",
  nivel: "estructura",
  abrirTodo: false,
  config: VISTA_POR_DEFECTO,
  ...o,
});
// En el orden del recorrido (cada rama entera antes de la siguiente): se comparan ordenados.
const orden = (e: { tarjetas: { id: string }[] }) => e.tarjetas.map((t) => t.id).sort();
const ids = async (o: Partial<PedidoImagen>) => orden(await prepararImagen(pedido(o)));

describe("prepararImagen", () => {
  it("con «Abrir todas» las ramas salen desplegadas, y sin la casilla salen como en pantalla", async () => {
    // En pantalla: Logística (s1) plegada, Operaciones abierta.
    const pantalla = { colapsados: new Set(["s1"]), unidades: new Set(TODAS) };
    const como = await prepararImagen(pedido({ pantalla }));
    expect(orden(como)).toEqual(["a1", "a2", "g", "s1", "s2"]);
    expect(como.tarjetas.find((t) => t.id === "s1")!.mas).toBe(1);

    const abiertas = await prepararImagen(pedido({ pantalla, abrirTodo: true }));
    expect(orden(abiertas)).toEqual(TODAS);
    expect(abiertas.tarjetas.every((t) => t.mas === 0)).toBe(true);
    expect(abiertas.cajas.size).toBe(TODAS.length);

    // Sin lienzo (desde la página), las ramas con que el lienzo empieza: dos niveles.
    expect(await ids({})).toEqual(["a1", "a2", "g"]);
  });

  it("la rama como alcance trae solo esa rama", async () => {
    const e = await prepararImagen(pedido({ alcance: { rama: "a2" }, abrirTodo: true }));
    expect(orden(e)).toEqual(["a2", "s1", "s2", "s3"]);
    expect(e.encabezado.alcance).toBe("Operaciones");
    // Aunque en pantalla esté plegada, la rama pedida se ve abierta.
    const pantalla = { colapsados: new Set(["a2", "s1"]), unidades: new Set(TODAS) };
    expect(await ids({ alcance: { rama: "a2" }, pantalla })).toEqual(["a2", "s1", "s2"]);
  });

  it("con fecha elegida, salen las unidades de esa fecha", async () => {
    const vida = { created_at: "2025-01-01T12:00:00Z", deleted_at: null };
    h.filas.set(SQL_HISTORICO.unidades, [
      { ...u("g", "t", "Gerencia General", null), ...vida },
      { ...u("vieja", "t", "Cerrada en marzo", "g"), ...vida, deleted_at: "2026-03-01T12:00:00Z" },
      { ...u("nueva", "t", "Creada en junio", "g"), ...vida, created_at: "2026-06-01T12:00:00Z" },
    ]);
    expect((await useOrganizacion().verAFecha("2026-02-01")).ok).toBe(true);
    const e = await prepararImagen(pedido({ abrirTodo: true }));
    expect(orden(e)).toEqual(["g", "vieja"]);
    expect(e.encabezado.fecha).toBe(formatearFecha("2026-02-01", "es"));
  });

  it("cuantasTarjetas cuenta bien", () => {
    expect(cuantasTarjetas(pedido({ abrirTodo: true }))).toBe(6);
    expect(cuantasTarjetas(pedido())).toBe(3);
    // Los puestos solo cuentan en «Como en pantalla» con «Ver puestos»: aquí 4, menos los 2 de jefatura en la tarjeta.
    const config = { ...VISTA_POR_DEFECTO, verPuestos: true };
    expect(cuantasTarjetas(pedido({ abrirTodo: true, config }))).toBe(6);
    expect(cuantasTarjetas(pedido({ abrirTodo: true, config, nivel: "pantalla" }))).toBe(6 + 2);
  });
});

describe("privacidad de punta a punta", () => {
  // Todo dato de personas, cargos, etiquetas y leyendas lleva la marca; Personalizar, todo prendido.
  const sembrar = () => {
    const org = useOrganizacion();
    org.$patch({
      puestos: org.puestos.map((x) => ({ ...x, leyenda_id: "ley" })),
      leyendas: [
        {
          id: "ley",
          nombre: `Leyenda ${MARCA}`,
          color: "#ff0000",
          descripcion: `Desc ${MARCA}`,
          orden: 0,
          deleted_at: null,
        },
      ],
      etiquetas: [{ id: "et", nombre: `Etiqueta ${MARCA}`, color: "#00ff00" }],
      unidadEtiquetas: [{ unidad_id: "g", etiqueta_id: "et" }],
      catalogos: { ...org.catalogos, cargos: [{ id: "cargo", nombre: `Cargo ${MARCA}` }] } as never,
    });
  };
  const todo = { ...VISTA_POR_DEFECTO, verPuestos: true, colorearPor: "leyenda", personasEnTarjetas: true };

  it("Estructura no deja salir ningún dato de personas, aunque Personalizar lo pida todo", async () => {
    sembrar();
    const svg = dibujarSvg(
      await prepararImagen(pedido({ nivel: "estructura", abrirTodo: true, config: todo })),
    ).svg;
    expect(svg).not.toContain(MARCA);
    expect(svg).not.toContain("ff0000");
  });

  it("control: «Como en pantalla» con lo mismo sí lleva la marca (la siembra llega)", async () => {
    sembrar();
    const svg = dibujarSvg(
      await prepararImagen(pedido({ nivel: "pantalla", abrirTodo: true, config: todo })),
    ).svg;
    expect(svg).toContain(MARCA);
  });
});
