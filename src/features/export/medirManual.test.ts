import { describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { createPinia, setActivePinia } from "pinia";
import { VISTA_POR_DEFECTO } from "@/features/arbol/vista";
import { useOrganizacion } from "@/stores/organizacion";
import { paginasDelPdf } from "./formatos";
import { textosManual } from "./manual";
import { manualDeAlcance } from "./manualDeAlcance";
import { documentoManual } from "./manualPdf";
import { generarDocumento } from "./pdf.worker";

// Medición a mano, no corre en CI: BOLDO_MEDIR=<base creada con scripts/sembrar-grande.mjs> npx vitest run src/features/export/medirManual.test.ts
// Mide el manual de toda la organización en carta vertical: el cálculo (layouts) y armar el documento con pdfmake en node.
const RUTA = process.env.BOLDO_MEDIR;
const h = vi.hoisted(() => ({ db: null as DatabaseSync | null }));
vi.mock("@/db/cliente", async (original) => ({
  ...(await original<object>()),
  consultar: async (sql: string) => h.db!.prepare(sql).all(),
  leerMeta: async () => ({}),
}));

describe.skipIf(!RUTA)("medición del manual con la organización grande", () => {
  it.each([false, true])(
    "con personas: %s",
    async (conPersonas) => {
      h.db = new DatabaseSync(RUTA!, { readOnly: true });
      setActivePinia(createPinia());
      expect(await useOrganizacion().cargar()).toMatchObject({ ok: true });
      const t0 = performance.now();
      const m = await manualDeAlcance({
        alcance: "todo",
        conPersonas,
        hoja: "carta",
        orientacion: "vertical",
        config: VISTA_POR_DEFECTO,
      });
      const t1 = performance.now();
      const e = { organizacion: "Grande", alcance: "Toda la organización", fecha: "20-11-2026", logo: null };
      const pdf = await generarDocumento(
        documentoManual(m, {
          hoja: "carta",
          orientacion: "vertical",
          encabezado: e,
          pagina: "Página {n} de {m}",
          titulo: "Manual de organización y funciones",
          conPersonas,
          textos: textosManual(),
          portada: { version: "BoldoAtlas", revision: "?" },
        }),
        () => {},
      );
      const t2 = performance.now();
      process.stdout.write(
        `MEDIDA manual conPersonas=${conPersonas}: manualDeAlcance=${Math.round(t1 - t0)}ms pdfmake=${Math.round(t2 - t1)}ms ` +
          `total=${Math.round(t2 - t0)}ms unidades=${m.unidades.length} laminas=${m.general.length} ` +
          `paginas=${paginasDelPdf(pdf)} pdf=${(pdf.length / 1e6).toFixed(2)}MB
`,
      );
      expect(new TextDecoder("latin1").decode(pdf.subarray(0, 4))).toBe("%PDF");
    },
    1_800_000,
  );
});
