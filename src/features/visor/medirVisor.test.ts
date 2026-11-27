import { describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { createPinia, setActivePinia } from "pinia";
import programa from "virtual:visor-programa";
import { VISTA_POR_DEFECTO } from "@/features/arbol/vista";
import { useOrganizacion } from "@/stores/organizacion";
import { datosVisor } from "./datos";
import { armarHtml } from "./html";
import { dibujar } from "./programa/dibujo";
import { plegar } from "./programa/estado";

// Medición a mano, no corre en CI: BOLDO_MEDIR=<base creada con scripts/sembrar-grande.mjs> npx vitest run src/features/visor/medirVisor.test.ts
// Mide armar el visor de Presentación (datos y HTML), su peso, y cuánto tarda `dibujar` (el orden con ELK y el SVG) al
// abrir, con todas las ramas abiertas y tras plegar una gerencia con todo abierto.
const RUTA = process.env.BOLDO_MEDIR;
const h = vi.hoisted(() => ({ db: null as DatabaseSync | null }));
vi.mock("@/db/cliente", async (original) => ({
  ...(await original<object>()),
  consultar: async (sql: string) => h.db!.prepare(sql).all(),
  leerMeta: async () => ({}),
}));

describe.skipIf(!RUTA)("medición del visor con la organización grande", () => {
  it("presentacion", async () => {
    h.db = new DatabaseSync(RUTA!, { readOnly: true });
    setActivePinia(createPinia());
    const org = useOrganizacion();
    expect(await org.cargar()).toMatchObject({ ok: true });
    const ms = (t: number) => `${Math.round(performance.now() - t)}ms`;

    let t = performance.now();
    const d = datosVisor({
      alcance: "todo",
      nivel: "presentacion",
      abrirTodo: false,
      config: VISTA_POR_DEFECTO,
      correo: true,
      telefono: true,
    });
    const html = await armarHtml(d, programa);
    const generar = ms(t);
    const peso = `${(new TextEncoder().encode(html).length / 1e6).toFixed(2)}MB`;

    t = performance.now();
    const alAbrir = await dibujar(d, new Set(d.plegadas));
    const abrir = ms(t);
    t = performance.now();
    const todas = await dibujar(d, new Set());
    const abrirTodas = ms(t);
    const raiz = d.unidades.find((u) => !u.parent_id)!;
    const gerencia = d.unidades.find((u) => u.parent_id === raiz.id && u.tipo_id === raiz.tipo_id)!;
    t = performance.now();
    const plegada = await dibujar(d, plegar(new Set(), gerencia.id));
    const plegarGerencia = ms(t);

    const tarjetas = (svg: string) => svg.split("data-id=").length - 1;
    console.log(
      `MEDIDA visor: unidades=${d.unidades.length} generar(datosVisor+armarHtml)=${generar} archivo=${peso} ` +
        `dibujarAlAbrir=${abrir} (${tarjetas(alAbrir.svg)} tarjetas) dibujarAbrirTodas=${abrirTodas} ` +
        `(${tarjetas(todas.svg)}) dibujarTrasPlegarGerencia=${plegarGerencia} (${tarjetas(plegada.svg)})`,
    );
    expect(tarjetas(plegada.svg)).toBeLessThan(tarjetas(todas.svg));
  }, 1_200_000);
});
