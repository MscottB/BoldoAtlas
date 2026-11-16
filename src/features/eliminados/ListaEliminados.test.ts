import { describe, it, expect } from "vitest";
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { i18n } from "@/i18n";
import ListaEliminados from "./ListaEliminados.vue";
import type { Eliminado } from "./eliminados";

const base = { fecha: "2026-03-01T10:00:00Z", bloqueo: null };
async function html(filas: Eliminado[], soloLectura = false) {
  const app = createSSRApp({ render: () => h(ListaEliminados, { filas, soloLectura }) });
  app.use(i18n);
  return renderToString(app);
}
const t = (k: string, v: Record<string, string> = {}) => i18n.global.t(k, v);
// el atributo, no las clases «disabled:...» del botón
const DESACTIVADO = / disabled(?=[ >])/;
const filas = (s: string) => s.split("<li").length - 1;

describe("ListaEliminados", () => {
  it("persona: una fila con su nombre y Restaurar activo", async () => {
    const s = await html([{ ...base, tipo: "persona", id: "p", nombre: "Ana" }]);
    expect(filas(s)).toBe(1);
    expect(s).toContain("Ana");
    expect(s).toContain(t("eliminados.restaurar"));
    expect(s).not.toMatch(DESACTIVADO);
  });

  it("unidad: dice que vuelve vacía", async () => {
    const s = await html([{ ...base, tipo: "unidad", id: "u", nombre: "Ventas" }]);
    expect(filas(s)).toBe(1);
    expect(s).toContain(t("eliminados.vuelveVacia"));
  });

  it("puesto bloqueado: botón desactivado y su motivo", async () => {
    const s = await html([{ ...base, tipo: "puesto", id: "q", nombre: "Analista", bloqueo: "Ventas" }]);
    expect(filas(s)).toBe(1);
    expect(s).toMatch(DESACTIVADO);
    expect(s).toContain(t("eliminados.primeroUnidad", { unidad: "Ventas" }));
  });

  it("vacía dice que no hay nada; en solo lectura no hay botón", async () => {
    expect(await html([])).toContain(t("eliminados.vacio"));
    const s = await html([{ ...base, tipo: "persona", id: "p", nombre: "Ana" }], true);
    expect(s).toContain("Ana");
    expect(s).not.toContain(t("eliminados.restaurar"));
  });
});
