import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { ElkNode } from "elkjs/lib/elk.bundled.js";
import { i18n } from "@/i18n";
import { p, u } from "@/features/arbol/fixture";
import { VISTA_POR_DEFECTO } from "@/features/arbol/vista";
import { useOrganizacion } from "@/stores/organizacion";
import { MARCA, datos } from "./fixture";
import { escalaParaHoja, type Reparto } from "./paginas";
import { paginasPdf } from "./paginasDeAlcance";
import { prepararImagen, type PedidoImagen } from "./preparar";

// Cuántas veces se dibuja: la vista previa de la cuadrícula no debe dibujar las hojas.
const cuenta = vi.hoisted(() => ({ dibujos: 0 }));
vi.mock("./treeSvg", async (original) => {
  const m = await original<typeof import("./treeSvg")>();
  return {
    ...m,
    dibujarSvg: (...a: Parameters<typeof m.dibujarSvg>) => (cuenta.dibujos++, m.dibujarSvg(...a)),
  };
});

const t = i18n.global.t;
beforeEach(() => setActivePinia(createPinia()));

const cargar = (unidades: ReturnType<typeof u>[]) =>
  useOrganizacion().$patch({ unidades, org: { nombre: "Atlas SA", logo: null }, cargado: true });
// r › a, b, c, y cada una con 3 hijas: a lo ancho caben las 3 de un nivel, pero no las 9 del siguiente.
const tresYNueve = () =>
  cargar([
    u("r", "t", "Gerencia General", null),
    ...["a", "b", "c"].flatMap((x, i) => [
      u(x, "t", `Área ${x}`, "r", i),
      ...[0, 1, 2].map((k) => u(`${x}${k}`, "t", `Sección ${x}${k}`, x, k)),
    ]),
  ]);
// r con 12 hijas: muy ancho para una hoja carta a 8 pt.
const ancho = () =>
  cargar([
    u("r", "t", "Gerencia General", null),
    ...Array.from({ length: 12 }, (_, i) => u(`h${i}`, "t", `Área ${i}`, "r", i)),
  ]);

const pedido = (o: Partial<PedidoImagen> = {}): PedidoImagen => ({
  alcance: "todo",
  nivel: "estructura",
  abrirTodo: true,
  config: VISTA_POR_DEFECTO,
  ...o,
});
const carta = (reparto: Reparto) => ({ hoja: "carta" as const, orientacion: "horizontal" as const, reparto });
// Lo que hará Guardar: el reparto y después todas sus páginas.
async function todas(pe: PedidoImagen, reparto: Reparto) {
  const r = await paginasPdf(pe, carta(reparto));
  return { ...r, lista: await r.paginas() };
}
// elk en este hilo, contando los layouts. `alPedir(n)` corre antes del n-ésimo.
function contador(alPedir: (n: number) => void = () => {}) {
  const c = {
    n: 0,
    ubicar: async (g: ElkNode) => {
      alPedir(++c.n);
      const { default: ELK } = await import("elkjs/lib/elk.bundled.js");
      return (await new ELK().layout(g)).children ?? [];
    },
  };
  return c;
}

describe("paginasPdf", () => {
  it("por ramas da varias páginas con «sigue» y «viene», y cada una se lee", async () => {
    tresYNueve();
    const r = await todas(pedido(), "ramas");
    expect(r.mapa).toBeUndefined();
    expect(r.lista).toHaveLength(4);
    expect(r.total).toBe(4);
    expect(r.ilegible).toBe(false);
    const [primera, ...resto] = r.lista;
    expect(r.primera).toBe(primera!.svg);
    expect(primera!.arriba).toBeUndefined();
    // Cada área cortada dice dónde sigue, en la línea de su tarjeta; su página dice de dónde viene.
    for (const [i, x] of ["a", "b", "c"].entries()) {
      expect(primera!.svg).toContain(`>Área ${x}</text>`);
      expect(primera!.svg).toContain(`>${t("pdf.sigue", { n: i + 2 })}</text>`);
      expect(resto[i]!.arriba).toBe(t("pdf.viene", { n: 1 }));
      expect(resto[i]!.svg).toContain(`>Sección ${x}2</text>`);
    }
    expect(primera!.svg).not.toContain("Sección");
    expect(primera!.svg).not.toContain(t("imagen.masUnidades", { n: 3 }, 3));
    // Lo que midió el reparto es lo que se dibuja: ninguna página baja de 8 pt. Sin encabezado propio.
    for (const pa of r.lista) {
      expect(escalaParaHoja(pa.ancho, pa.alto, "carta", "horizontal", "estructura").ilegible).toBe(false);
      expect(pa.svg).not.toContain(">Atlas SA</text>");
    }
    expect(r.encabezado.organizacion).toBe("Atlas SA");
  });

  it("por ramas, las hijas que no caben juntas van en partes, con «continuación k de n»", async () => {
    cargar([
      u("r", "t", "Gerencia General", null),
      ...Array.from({ length: 9 }, (_, i) => u(`h${i}`, "t", `Área ${i}`, "r", i)),
    ]);
    const r = await todas(pedido(), "ramas");
    const n = r.lista.length;
    expect(n).toBeGreaterThan(1);
    r.lista.forEach((pa, k) => {
      expect(pa.arriba).toBe(t("pdf.continuacion", { nombre: "Gerencia General", k: k + 1, n }));
      expect(escalaParaHoja(pa.ancho, pa.alto, "carta", "horizontal", "estructura").ilegible).toBe(false);
    });
    // Cada hija sale una vez.
    const hijas = r.lista.flatMap((pa) => [...pa.svg.matchAll(/>(Área \d+)<\/text>/g)].map((m) => m[1]));
    expect(hijas.sort()).toEqual(Array.from({ length: 9 }, (_, i) => `Área ${i}`).sort());
  });

  it("por ramas avisa si una página no se lee: una unidad que no cabe ni sola", async () => {
    // 60 puestos bajo una unidad sin hijas: su página no se puede cortar más.
    cargar([u("r", "t", "Gerencia General", null)]);
    useOrganizacion().$patch({
      puestos: Array.from({ length: 60 }, (_, i) => ({ ...p(`p${i}`, "r"), orden: i })),
    });
    const config = { ...VISTA_POR_DEFECTO, verPuestos: true };
    const r = await paginasPdf(pedido({ nivel: "pantalla", config }), carta("ramas"));
    expect(r.total).toBe(1);
    expect(r.ilegible).toBe(true);
  });

  it("en una da una sola página, y avisa si no se lee", async () => {
    tresYNueve();
    const chico = await todas(pedido({ abrirTodo: false }), "una");
    expect(chico.lista).toHaveLength(1);
    expect(chico.lista[0]!.recorte).toBeUndefined();
    expect(chico.ilegible).toBe(false);

    ancho();
    const grande = await todas(pedido(), "una");
    expect(grande.lista).toHaveLength(1);
    expect(grande.ilegible).toBe(true);
  });

  it("con la entrada ya calculada, una página o la cuadrícula no repiten el layout", async () => {
    ancho();
    const c = contador();
    const entero = prepararImagen(pedido({ ubicar: c.ubicar }));
    for (const reparto of ["una", "cuadricula"] as const)
      await paginasPdf(pedido({ ubicar: c.ubicar }), carta(reparto), { entero });
    expect(c.n).toBe(1);
  });

  it("en cuadrícula da el mapa más las hojas, cada una con su parte", async () => {
    ancho();
    const r = await todas(pedido(), "cuadricula");
    expect(r.mapa?.svg).toContain(">Área 0</text>");
    expect(r.mapa?.svg).toContain(">Área 11</text>");
    expect(r.primera).toBe(r.mapa?.svg);
    expect(r.lista.length).toBeGreaterThan(1);
    expect(r.total).toBe(r.lista.length + 1);
    expect(r.ilegible).toBe(false);
    expect(r.lista[0]!.arriba).toBe(t("pdf.filaColumna", { fila: 1, columna: 1 }));
    for (const pa of r.lista) {
      const h = pa.recorte!;
      expect(pa.svg).toContain(`viewBox="${h.x} ${h.y} ${h.ancho} ${h.alto}"`);
    }
    // La primera hoja no lleva lo del otro extremo.
    expect(r.lista[0]!.svg).not.toContain(">Área 11</text>");
    expect(r.lista[r.lista.length - 1]!.svg).toContain(">Área 11</text>");
  });

  it("en cuadrícula, la vista previa solo dibuja el mapa: las hojas, al guardar", async () => {
    ancho();
    cuenta.dibujos = 0;
    const r = await paginasPdf(pedido(), carta("cuadricula"));
    expect(cuenta.dibujos).toBe(1);
    const lista = await r.paginas();
    expect(cuenta.dibujos).toBe(1 + lista.length);
    // Y se pueden detener.
    const control = new AbortController();
    control.abort();
    await expect(r.paginas(control.signal)).rejects.toMatchObject({ name: "AbortError" });
  });

  it("con la señal abortada, el reparto por ramas para antes", async () => {
    tresYNueve();
    const entera = contador();
    await paginasPdf(pedido({ ubicar: entera.ubicar }), carta("ramas"));
    // El primer layout es el dibujo entero; en el segundo (la primera medida) se cancela.
    const control = new AbortController();
    const cortada = contador((n) => n === 2 && control.abort());
    await expect(
      paginasPdf(pedido({ ubicar: cortada.ubicar }), carta("ramas"), { senal: control.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(cortada.n).toBe(2);
    expect(entera.n).toBeGreaterThan(cortada.n);
  });

  it("la leyenda de «Colorear por» va en su propia página, al final", async () => {
    const d = datos();
    const org = useOrganizacion();
    org.$patch({
      unidades: d.unidades,
      puestos: d.puestos.map((x) => ({ ...x, leyenda_id: "ley" })),
      asignaciones: d.asignaciones,
      trabajadores: [...d.trabajadores.values()],
      leyendas: [
        {
          id: "ley",
          nombre: `Leyenda ${MARCA}`,
          color: "#ff0000",
          descripcion: "",
          orden: 0,
          deleted_at: null,
        },
      ],
      org: { nombre: "Atlas SA", logo: null },
      cargado: true,
    });
    const config = { ...VISTA_POR_DEFECTO, verPuestos: true, colorearPor: "leyenda" };
    const r = await todas(pedido({ nivel: "pantalla", config }), "una");
    expect(r.lista).toHaveLength(2);
    expect(r.lista[0]!.svg).not.toContain(`Leyenda ${MARCA}`);
    expect(r.lista[1]!.arriba).toBe(t("pdf.leyenda"));
    expect(r.lista[1]!.svg).toContain(`>Leyenda ${MARCA}</text>`);
    expect(r.lista[1]!.svg).not.toContain("Gerencia General</text>");
  });
});

describe("privacidad del PDF de punta a punta", () => {
  // Como en preparar.test.ts: todo dato de personas, cargos, etiquetas y leyendas lleva la marca, y Personalizar lo
  // pide todo.
  const sembrar = () => {
    const d = datos();
    useOrganizacion().$patch({
      unidades: d.unidades,
      puestos: d.puestos.map((x) => ({ ...x, leyenda_id: "ley" })),
      asignaciones: d.asignaciones,
      trabajadores: [...d.trabajadores.values()],
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
      org: { nombre: "Atlas SA", logo: null },
      cargado: true,
    });
    const org = useOrganizacion();
    org.$patch({
      catalogos: { ...org.catalogos, cargos: [{ id: "cargo", nombre: `Cargo ${MARCA}` }] } as never,
    });
  };
  const todo = { ...VISTA_POR_DEFECTO, verPuestos: true, colorearPor: "leyenda", personasEnTarjetas: true };

  it.each(["una", "ramas", "cuadricula"] as const)(
    "Estructura en %s no lleva ninguna marca, ni en las páginas, ni arriba, ni en el mapa, ni en el encabezado",
    async (reparto) => {
      sembrar();
      const r = await todas(pedido({ config: todo }), reparto);
      const textos = [
        r.primera,
        r.mapa?.svg ?? "",
        JSON.stringify(r.encabezado),
        ...r.lista.flatMap((pa) => [pa.svg, pa.arriba ?? ""]),
      ];
      expect(r.lista.length).toBeGreaterThan(0);
      expect(textos.join("\n")).toContain("Gerencia General");
      for (const s of textos) expect(s).not.toContain(MARCA);
    },
  );

  it("control: «Como en pantalla» con lo mismo sí lleva la marca", async () => {
    sembrar();
    const r = await todas(pedido({ nivel: "pantalla", config: todo }), "ramas");
    expect(r.lista.map((pa) => pa.svg).join("")).toContain(MARCA);
  });
});
