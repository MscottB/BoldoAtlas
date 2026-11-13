import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { createMemoryHistory, createRouter } from "vue-router";
import { TooltipProvider } from "@/components/ui/tooltip";
import { i18n } from "@/i18n";
import { fijarBase } from "@/lib/baseActiva";
import VistaDirectorio from "./VistaDirectorio.vue";

vi.hoisted(() => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
  vi.stubGlobal("window", { addEventListener: () => {}, removeEventListener: () => {} });
});
const lado = vi.hoisted(() => ({ activo: false }));
vi.mock("@/lado/modo", () => ({
  get MODO_LADO() {
    return lado.activo;
  },
  idLado: () => "",
}));

let pinia: Pinia;
async function html() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/directorio", name: "directorio", component: { render: () => null } }],
  });
  await router.push("/directorio");
  const app = createSSRApp({ render: () => h(TooltipProvider, () => h(VistaDirectorio)) });
  app.use(pinia).use(router).use(i18n);
  return renderToString(app);
}
const t = (clave: string) => i18n.global.t(clave);

beforeEach(() => {
  fijarBase("A");
  pinia = createPinia();
  setActivePinia(pinia);
});

describe("El directorio vacío", () => {
  it("al lado no invita a crear unidades y puestos", async () => {
    lado.activo = true;
    const s = await html();
    expect(s).not.toContain(t("directorio.vacio"));
    expect(s).toContain(t("directorio.vacioLado"));
  });

  it("fuera del lado, como siempre", async () => {
    lado.activo = false;
    expect(await html()).toContain(t("directorio.vacio"));
  });
});
