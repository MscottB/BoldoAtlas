import { describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { createPinia, setActivePinia } from "pinia";
import { VISTA_POR_DEFECTO } from "@/features/arbol/vista";
import { useOrganizacion } from "@/stores/organizacion";
import type { Reparto } from "./paginas";
import { paginasPdf } from "./paginasDeAlcance";
import { generarPdf } from "./pdf.worker";
import { prepararImagen, type PedidoImagen } from "./preparar";

// Medición a mano, no corre en CI: BOLDO_MEDIR=<base creada con scripts/sembrar-grande.mjs> npx vitest run src/features/export/medirPdf.test.ts
// Mide el reparto en páginas (carta horizontal, «Abrir todas») y el tamaño del PDF armado con pdfmake en node.
const RUTA = process.env.BOLDO_MEDIR;
const h = vi.hoisted(() => ({ db: null as DatabaseSync | null }));
vi.mock("@/db/cliente", async (original) => ({
  ...(await original<object>()),
  consultar: async (sql: string) => h.db!.prepare(sql).all(),
  leerMeta: async () => ({}),
}));

describe.skipIf(!RUTA)("medición del PDF con la organización grande", () => {
  it.each(["ramas", "cuadricula"] as const)(
    "%s",
    async (reparto: Reparto) => {
      h.db = new DatabaseSync(RUTA!, { readOnly: true });
      setActivePinia(createPinia());
      expect(await useOrganizacion().cargar()).toMatchObject({ ok: true });
      const pedido: PedidoImagen = {
        alcance: "todo",
        nivel: "estructura",
        abrirTodo: true,
        config: VISTA_POR_DEFECTO,
      };
      const o = { hoja: "carta", orientacion: "horizontal", reparto } as const;
      const t0 = performance.now();
      const entero = prepararImagen(pedido);
      await entero;
      const t1 = performance.now();
      const r = await paginasPdf(pedido, o, { entero });
      const t2 = performance.now();
      const { lista, total, ilegible } = await r.paginas();
      const t3 = performance.now();
      const opciones = {
        ...o,
        encabezado: r.encabezado,
        pagina: "Página {n} de {m}",
        titulo: "Organigrama",
        mapa: r.mapa,
      };
      const pdf = await generarPdf(lista, opciones, () => {});
      const t4 = performance.now();
      console.log(
        `MEDIDA ${reparto}: layoutEntero=${Math.round(t1 - t0)}ms vistaPrevia(paginasPdf)=${Math.round(t2 - t1)}ms ` +
          `guardar(paginas)=${Math.round(t3 - t2)}ms pdfmake=${Math.round(t4 - t3)}ms paginas=${total} ` +
          `ilegible=${ilegible} pdf=${(pdf.length / 1e6).toFixed(2)}MB`,
      );
      expect(new TextDecoder("latin1").decode(pdf.subarray(0, 4))).toBe("%PDF");
    },
    1_200_000,
  );
});
