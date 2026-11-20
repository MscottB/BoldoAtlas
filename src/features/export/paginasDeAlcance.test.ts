import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { i18n } from "@/i18n";
import { u } from "@/features/arbol/fixture";
import { VISTA_POR_DEFECTO } from "@/features/arbol/vista";
import { useOrganizacion } from "@/stores/organizacion";
import { MARCA, datos } from "./fixture";
import { escalaParaHoja, type Reparto } from "./paginas";
import { paginasPdf } from "./paginasDeAlcance";
import type { PedidoImagen } from "./preparar";

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

describe("paginasPdf", () => {
  it("por ramas da varias páginas con «sigue» y «viene», y cada una se lee", async () => {
    tresYNueve();
    const r = await paginasPdf(pedido(), carta("ramas"));
    expect(r.mapa).toBeUndefined();
    expect(r.paginas).toHaveLength(4);
    const [primera, ...resto] = r.paginas;
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
    for (const p of r.paginas) {
      expect(escalaParaHoja(p.ancho, p.alto, "carta", "horizontal", "estructura").ilegible).toBe(false);
      expect(p.svg).not.toContain(">Atlas SA</text>");
    }
    expect(r.encabezado.organizacion).toBe("Atlas SA");
  });

  it("por ramas, las hijas que no caben juntas van en partes, con «continuación k de n»", async () => {
    cargar([
      u("r", "t", "Gerencia General", null),
      ...Array.from({ length: 9 }, (_, i) => u(`h${i}`, "t", `Área ${i}`, "r", i)),
    ]);
    const r = await paginasPdf(pedido(), carta("ramas"));
    const n = r.paginas.length;
    expect(n).toBeGreaterThan(1);
    r.paginas.forEach((p, k) => {
      expect(p.arriba).toBe(t("pdf.continuacion", { nombre: "Gerencia General", k: k + 1, n }));
      expect(escalaParaHoja(p.ancho, p.alto, "carta", "horizontal", "estructura").ilegible).toBe(false);
    });
    // Cada hija sale una vez.
    const hijas = r.paginas.flatMap((p) => [...p.svg.matchAll(/>(Área \d+)<\/text>/g)].map((m) => m[1]));
    expect(hijas.sort()).toEqual(Array.from({ length: 9 }, (_, i) => `Área ${i}`).sort());
  });

  it("en una da una sola página, y avisa si no se lee", async () => {
    tresYNueve();
    const chico = await paginasPdf(pedido({ abrirTodo: false }), carta("una"));
    expect(chico.paginas).toHaveLength(1);
    expect(chico.paginas[0]!.recorte).toBeUndefined();
    expect(chico.ilegible).toBe(false);

    ancho();
    const grande = await paginasPdf(pedido(), carta("una"));
    expect(grande.paginas).toHaveLength(1);
    expect(grande.ilegible).toBe(true);
  });

  it("en cuadrícula da el mapa más las hojas, cada una con su parte", async () => {
    ancho();
    const r = await paginasPdf(pedido(), carta("cuadricula"));
    expect(r.mapa?.svg).toContain(">Área 0</text>");
    expect(r.mapa?.svg).toContain(">Área 11</text>");
    expect(r.paginas.length).toBeGreaterThan(1);
    expect(r.paginas[0]!.arriba).toBe(t("pdf.filaColumna", { fila: 1, columna: 1 }));
    for (const p of r.paginas) {
      const h = p.recorte!;
      expect(p.svg).toContain(`viewBox="${h.x} ${h.y} ${h.ancho} ${h.alto}"`);
    }
    // La primera hoja no lleva lo del otro extremo.
    expect(r.paginas[0]!.svg).not.toContain(">Área 11</text>");
    expect(r.paginas[r.paginas.length - 1]!.svg).toContain(">Área 11</text>");
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
    const r = await paginasPdf(pedido({ nivel: "pantalla", config }), carta("una"));
    expect(r.paginas).toHaveLength(2);
    expect(r.paginas[0]!.svg).not.toContain(`Leyenda ${MARCA}`);
    expect(r.paginas[1]!.arriba).toBe(t("pdf.leyenda"));
    expect(r.paginas[1]!.svg).toContain(`>Leyenda ${MARCA}</text>`);
    expect(r.paginas[1]!.svg).not.toContain("Gerencia General</text>");
  });
});
