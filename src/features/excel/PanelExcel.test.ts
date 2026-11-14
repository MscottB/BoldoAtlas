import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { createSSRApp } from "vue";
import { renderToString } from "vue/server-renderer";
import { i18n } from "@/i18n";
import PanelExcel from "./PanelExcel.vue";
import { ID_HOJAS } from "./seleccion";

// Lo que quedó marcado en este PC (`boldo:excel:completa`).
const guardada = vi.hoisted(() => ({ valor: null as string | null }));
vi.hoisted(() => {
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => (k === "boldo:excel:completa" ? guardada.valor : null),
    setItem: () => {},
    removeItem: () => {},
  });
  vi.stubGlobal("window", { addEventListener: () => {}, removeEventListener: () => {} });
});

const html = () => {
  const app = createSSRApp(PanelExcel);
  app.use(createPinia()).use(i18n);
  return renderToString(app);
};
const nada = i18n.global.t("excel.completa.nada");

beforeEach(() => setActivePinia(createPinia()));

describe("Exportar a Excel sin nada marcado", () => {
  it("sin ninguna hoja, el botón queda deshabilitado y dice por qué", async () => {
    guardada.valor = JSON.stringify(Object.fromEntries(ID_HOJAS.map((h) => [h, { incluida: false }])));
    const s = await html();
    expect(s).toContain(nada);
    // la etiqueta del botón, sin sus clases (traen «disabled:…»)
    const boton = s.match(/<button[^>]*aria-describedby="excel-nada"[^>]*>/)![0].replace(/class="[^"]*"/, "");
    expect(boton).toMatch(/\sdisabled(=""|\s|>)/);
  });

  it("con hojas pero sin ninguna columna, igual", async () => {
    guardada.valor = JSON.stringify({
      ...Object.fromEntries(ID_HOJAS.map((h) => [h, { incluida: false }])),
      conexiones: { incluida: true, columnas: { origen: false, destino: false, etiqueta: false } },
    });
    expect(await html()).toContain(nada);
  });

  it("con lo de fábrica se puede exportar", async () => {
    guardada.valor = null;
    const s = await html();
    expect(s).not.toContain(nada);
    expect(s).not.toContain('aria-describedby="excel-nada"');
  });
});
