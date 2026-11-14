import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { computed, createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { i18n } from "@/i18n";
import { fijarBase } from "@/lib/baseActiva";
import { CONTEXTO_LIENZO, type ContextoLienzo } from "./contexto";
import { COLOR_NEUTRO, COLORES_ESCALA, type ValorEscala } from "./escala";
import { useVista } from "./useVista";
import NodoPuesto from "./NodoPuesto.vue";

vi.hoisted(() =>
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} }),
);
// Sin el lienzo de Vue Flow: los puntos de conexión no importan aquí.
vi.mock("@vue-flow/core", async (original) => ({
  ...(await original<object>()),
  Handle: { render: () => null },
}));

let pinia: Pinia;
beforeEach(() => {
  fijarBase("A");
  pinia = createPinia();
  setActivePinia(pinia);
});

async function html(valor: ValorEscala | undefined) {
  const contexto = {
    leyendas: computed(() => null),
    escala: computed(() => (valor ? new Map([["px", valor]]) : null)),
    ligera: computed(() => false),
  } as unknown as ContextoLienzo;
  const app = createSSRApp({
    render: () =>
      h(NodoPuesto, { id: "px", data: { cargo: "Analista", titular: "Ana", reemplazo: null, leyendaId: null } }),
  });
  app.use(pinia).use(i18n).provide(CONTEXTO_LIENZO, contexto);
  return renderToString(app);
}

describe("NodoPuesto coloreado con escala", () => {
  it("escribe el valor junto al color de su rango (el color nunca va solo)", async () => {
    useVista().config.value.colorearPor = "antiguedad";
    const s = await html({ valor: 3, rango: 2 });
    expect(s).toContain(i18n.global.t("arbol.vista.anios", { n: 3 }, 3));
    expect(s).toContain(i18n.global.t("arbol.vista.antiguedad"));
    expect(s.toLowerCase()).toContain(COLORES_ESCALA[2]);
  });

  it("una vacante va en gris y con su nombre", async () => {
    useVista().config.value.colorearPor = "antiguedad";
    const s = await html({ aparte: "vacante" });
    expect(s).toContain(i18n.global.t("arbol.vista.aparte.vacante"));
    expect(s.toLowerCase()).toContain(COLOR_NEUTRO);
  });

  it("sin valor para el puesto (a cargo: no es una jefatura), ni color ni texto", async () => {
    useVista().config.value.colorearPor = "aCargo";
    const s = await html(undefined);
    expect(s).not.toContain(i18n.global.t("arbol.vista.aCargo"));
    expect(s.toLowerCase()).not.toContain(COLOR_NEUTRO);
  });
});
