import { describe, it, expect, beforeAll, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { abrirBasePrueba, type BasePrueba } from "@/db/prueba/sqlite";
import { useOrganizacion } from "@/stores/organizacion";
import {
  aristasDibujadas,
  cajasDibujadas,
  calcularLayout,
  reubicar,
  subgrafoVisible,
  type Subgrafo,
} from "./layout";
import { trazarLaterales } from "./lateral";
import { VISTA_POR_DEFECTO, separaciones, tamPuesto, tamUnidad, type ConfigVista } from "./vista";

const h = vi.hoisted(() => ({ bd: null as BasePrueba | null }));
vi.mock("@/db/cliente", () => ({
  consultar: async (sql: string, params?: unknown[]) => h.bd!.consultar(sql, params),
  lote: async (s: Parameters<BasePrueba["aplicar"]>[0]) => h.bd!.aplicar(s),
  leerMeta: async () =>
    Object.fromEntries(
      h
        .bd!.consultar<{ clave: string; valor: string | null }>("SELECT clave, valor FROM meta")
        .map((f) => [f.clave, f.valor ?? ""]),
    ),
}));

// El caso de la captura de la alpha.1: el proyecto de ejemplo con «Ver puestos», todo abierto.
let org: ReturnType<typeof useOrganizacion>;
let g: Subgrafo;
beforeAll(async () => {
  h.bd = abrirBasePrueba();
  setActivePinia(createPinia());
  org = useOrganizacion();
  expect((await org.cargarEjemplo()).ok).toBe(true);
  g = subgrafoVisible(org.enFecha.unidades, org.conexiones, new Set(), org.enFecha.puestos);
});

describe("layout del ejemplo con puestos", () => {
  for (const direccion of ["vertical", "horizontal"] as const)
    for (const densidad of ["normal", "compacta"] as const)
      for (const alinearPorTipo of [false, true])
        it(`puestos pegados a su unidad y una sola altura de líneas hacia las hijas (${direccion}, ${densidad}${alinearPorTipo ? ", por tipo" : ""})`, async () => {
          const c: ConfigVista = { ...VISTA_POR_DEFECTO, direccion, densidad, alinearPorTipo };
          const tu = tamUnidad(c, false);
          const tp = tamPuesto(c);
          const pos = await calcularLayout(g, tu, tp, c, org.catalogos.tipos_unidad);
          const hz = direccion === "horizontal";
          // nivel: borde inicial en el eje de los niveles; centro: en el de los hermanos.
          const nivel = (id: string) => (hz ? pos.get(id)!.x : pos.get(id)!.y);
          const esPuesto = new Set(g.puestos.map((p) => p.id));
          const t = (id: string) => (esPuesto.has(id) ? tp : tu);
          const largo = (id: string) => (hz ? t(id).ancho : t(id).alto);
          const centro = (id: string) =>
            hz ? pos.get(id)!.y + t(id).alto / 2 : pos.get(id)!.x + t(id).ancho / 2;
          const fin = (id: string) => nivel(id) + largo(id);

          expect(g.puestos.length).toBeGreaterThan(0);
          for (const u of g.nodos) {
            const propios = g.puestos.filter((p) => p.unidad_id === u.id);
            const hijas = g.nodos.filter((x) => x.parent_id === u.id);
            // Apilados tras la tarjeta, en su orden, centrados con ella y sin pisarse.
            let antes = fin(u.id);
            for (const p of propios) {
              expect(centro(p.id)).toBeCloseTo(centro(u.id), 0);
              expect(nivel(p.id)).toBeGreaterThan(antes);
              antes = fin(p.id);
            }
            // Las hijas empiezan después del último puesto y todas a la misma altura: una sola barra de líneas.
            for (const x of hijas) {
              expect(nivel(x.id)).toBeGreaterThan(antes);
              if (!alinearPorTipo) expect(nivel(x.id)).toBe(nivel(hijas[0]!.id));
            }
          }
          // Las unidades de una misma fila (misma profundidad) empiezan a la misma altura, sean o no del mismo superior y
          // tengan o no puestos (p. ej. Mantención, bajo Operaciones, y Selección, bajo Personas).
          if (!alinearPorTipo) {
            const porId = new Map(g.nodos.map((x) => [x.id, x]));
            const hondura = (id: string): number => {
              const padre = porId.get(id)?.parent_id;
              return padre ? hondura(padre) + 1 : 0;
            };
            const inicios = new Map<number, Set<number>>();
            for (const x of g.nodos)
              inicios.set(hondura(x.id), (inicios.get(hondura(x.id)) ?? new Set()).add(nivel(x.id)));
            expect(inicios.size).toBeGreaterThanOrEqual(4); // el ejemplo tiene filas de primos (nivel 2 y 3)
            for (const [, s] of inicios) expect(s.size).toBe(1);
          }
          // Ningún puesto se cruza con una tarjeta de otra unidad.
          const cajas = [...pos].map(([id, q]) => ({ id, ...q, w: t(id).ancho, h: t(id).alto }));
          for (const a of cajas)
            for (const b of cajas)
              if (a.id < b.id)
                expect(
                  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h,
                  `${a.id} pisa ${b.id}`,
                ).toBe(false);
          expect(separaciones(c).puestos).toBeGreaterThan(0);
        });

  const sinPuestos = (): Subgrafo => ({
    ...g,
    puestos: [],
    jerarquicas: g.jerarquicas.filter(([, b]) => g.nodos.some((u) => u.id === b)),
  });
  // Cada unidad con la siguiente: la misma fila y distinta profundidad, vecinas y lejanas, con y sin puestos.
  for (const direccion of ["vertical", "horizontal"] as const)
    for (const densidad of ["normal", "compacta"] as const)
      for (const conPuestos of [false, true])
        it(`laterales del ejemplo sin cruzar tarjetas (${direccion}, ${densidad}${conPuestos ? ", con puestos" : ""})`, async () => {
          const c: ConfigVista = { ...VISTA_POR_DEFECTO, direccion, densidad };
          const sub = conPuestos ? g : sinPuestos();
          const [tu, tp] = [tamUnidad(c, false), tamPuesto(c)];
          const pos = await calcularLayout(sub, tu, tp, c);
          const cajas = cajasDibujadas(sub, pos, tu, tp);
          const laterales = sub.nodos.flatMap((a, i) =>
            sub.nodos.slice(i + 1).map((b) => ({
              id: `${a.id}-${b.id}`,
              origen_id: a.id,
              destino_id: b.id,
              etiqueta: i % 2 ? "Abastecimiento de repuestos" : null,
            })),
          );
          const trazados = trazarLaterales(laterales, cajas, direccion);
          expect(trazados.size).toBe(laterales.length);
          for (const [id, t] of trazados) expect(t.cruces, id).toBe(0);
        });

  it("la conexión del ejemplo (Mantención con Compras): su etiqueta no tapa ninguna tarjeta", async () => {
    const c = VISTA_POR_DEFECTO;
    const sub = sinPuestos();
    const [tu, tp] = [tamUnidad(c, false), tamPuesto(c)];
    const cajas = cajasDibujadas(sub, await calcularLayout(sub, tu, tp, c), tu, tp);
    const { etiqueta, cruces } = trazarLaterales(sub.laterales, cajas, "vertical").get(sub.laterales[0]!.id)!;
    expect(cruces).toBe(0);
    for (const k of cajas.values()) {
      const dentroX = etiqueta.x + 96 > k.x && etiqueta.x - 96 < k.x + k.ancho;
      const dentroY = etiqueta.y + 10 > k.y && etiqueta.y - 10 < k.y + k.alto;
      expect(dentroX && dentroY).toBe(false);
    }
  });

  it("aristasDibujadas: la unidad baja por sus puestos y de su último puesto salen las líneas a las hijas", () => {
    const gg = g.nodos.find((x) => x.parent_id === null)!;
    const propios = g.puestos.filter((p) => p.unidad_id === gg.id).map((p) => p.id);
    const hijas = g.nodos.filter((x) => x.parent_id === gg.id).map((x) => x.id);
    const aristas = aristasDibujadas(g);
    expect(propios.length).toBeGreaterThan(0);
    expect(aristas).toContainEqual([gg.id, propios[0]]);
    for (const x of hijas) expect(aristas).toContainEqual([propios[propios.length - 1], x]);
    expect(aristas).toHaveLength(g.jerarquicas.length); // una línea por cada relación: ninguna se pierde ni se repite
    expect(new Set(aristas.map(([, b]) => b)).size).toBe(aristas.length);
  });

  it("reubicar («Reordenar» con la misma forma): devuelve a su lugar una tarjeta movida a mano y actualiza lo dibujado", async () => {
    const pos = await calcularLayout(g);
    const dibujadas = new Map([...pos].map(([id, q]) => [id, { position: { ...q } }]));
    const guardadas = new Map(pos);
    const movida = g.nodos[1]!.id;
    dibujadas.get(movida)!.position = { x: 9999, y: -9999 };
    guardadas.set(movida, { x: 1, y: 1 });
    reubicar(pos, guardadas, (id) => dibujadas.get(id));
    for (const [id, q] of pos) {
      expect(dibujadas.get(id)!.position).toEqual(q);
      expect(guardadas.get(id)).toEqual(q);
    }
    reubicar(pos, guardadas, () => undefined); // una tarjeta que aún no está en el lienzo no falla
  });
});
