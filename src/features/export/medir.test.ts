import { describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { createPinia, setActivePinia } from "pinia";
import { VISTA_POR_DEFECTO } from "@/features/arbol/vista";
import { useOrganizacion } from "@/stores/organizacion";
import { dibujarSvg } from "./treeSvg";
import { prepararImagen, type PedidoImagen } from "./preparar";

// Medición a mano, no corre en CI: BOLDO_MEDIR=<base creada con scripts/sembrar-grande.mjs> npx vitest run src/features/export/medir.test.ts
// Mide el armado y el dibujo del SVG de toda la organización. El PNG (canvas) no se puede medir en node.
const RUTA = process.env.BOLDO_MEDIR;
const h = vi.hoisted(() => ({ db: null as DatabaseSync | null }));
vi.mock("@/db/cliente", async (original) => ({
  ...(await original<object>()),
  consultar: async (sql: string) => h.db!.prepare(sql).all(),
  leerMeta: async () => ({}),
}));

describe.skipIf(!RUTA)("medición del SVG con la organización grande", () => {
  it.each([
    ["estructura", true],
    ["estructura", false],
    ["presentacion", true],
    ["pantalla", true],
  ] as const)(
    "%s, abrirTodo=%s",
    async (nivel, abrirTodo) => {
      h.db = new DatabaseSync(RUTA!, { readOnly: true });
      setActivePinia(createPinia());
      const org = useOrganizacion();
      const t0 = performance.now();
      const c = await org.cargar();
      expect(c, JSON.stringify(c)).toMatchObject({ ok: true });
      const t1 = performance.now();
      const pedido: PedidoImagen = { alcance: "todo", nivel, abrirTodo, config: VISTA_POR_DEFECTO };
      const entrada = await prepararImagen(pedido);
      const t2 = performance.now();
      const { svg } = dibujarSvg(entrada);
      const t3 = performance.now();
      console.log(
        `MEDIDA ${nivel} abrirTodo=${abrirTodo}: tarjetas=${entrada.tarjetas.length} carga=${Math.round(t1 - t0)}ms ` +
          `prepararImagen=${Math.round(t2 - t1)}ms dibujarSvg=${Math.round(t3 - t2)}ms svg=${(svg.length / 1e6).toFixed(1)}MB`,
      );
      expect(svg.startsWith("<svg")).toBe(true);
    },
    600_000,
  );
});
