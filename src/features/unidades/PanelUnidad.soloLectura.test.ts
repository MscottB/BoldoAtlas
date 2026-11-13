import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { createMemoryHistory, createRouter } from "vue-router";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TIPO_AREA, TIPO_GERENCIA } from "@/db/tipos";
import { u } from "@/features/arbol/fixture";
import { i18n } from "@/i18n";
import { fijarBase } from "@/lib/baseActiva";
import { useOrganizacion } from "@/stores/organizacion";
import PanelUnidad from "./PanelUnidad.vue";

vi.hoisted(() =>
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} }),
);
const lado = vi.hoisted(() => ({ activo: false }));
vi.mock("@/lado/modo", () => ({
  get MODO_LADO() {
    return lado.activo;
  },
  idLado: () => "",
}));

const finanzas = u("a", TIPO_AREA, "Finanzas", "g");
let pinia: Pinia;
async function html() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/", name: "arbol", component: { render: () => null } }],
  });
  await router.push("/");
  const app = createSSRApp({ render: () => h(TooltipProvider, () => h(PanelUnidad, { unidad: finanzas })) });
  app.use(pinia).use(router).use(i18n);
  return renderToString(app);
}
const t = (clave: string) => i18n.global.t(clave);

beforeEach(() => {
  fijarBase("A");
  pinia = createPinia();
  setActivePinia(pinia);
  useOrganizacion().unidades = [u("g", TIPO_GERENCIA, "Gerencia", null), finanzas];
});

describe("El panel de la unidad en solo lectura", () => {
  it("al lado todo el resumen queda deshabilitado, sin el aviso de la fecha; las pestañas y cerrar siguen", async () => {
    lado.activo = true;
    const s = await html();
    expect(s).toMatch(/<fieldset[^>]*\sdisabled/);
    expect(s).not.toContain(t("arbol.fecha.panelSoloLectura"));
    expect(s).not.toContain(t("unidad.nuevoPuestoJefatura"));
    expect(s).toContain(t("unidad.cerrar"));
    expect(s).toContain(t("personas.pestana"));
  });

  it("fuera del lado se edita como siempre", async () => {
    lado.activo = false;
    const s = await html();
    expect(s).not.toMatch(/<fieldset[^>]*\sdisabled/);
    expect(s).toContain(t("unidad.nuevoPuestoJefatura"));
  });
});
