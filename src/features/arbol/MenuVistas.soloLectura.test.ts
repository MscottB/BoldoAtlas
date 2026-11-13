import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { createSSRApp, h, type Slots } from "vue";
import { renderToString } from "vue/server-renderer";
import { i18n } from "@/i18n";
import { fijarBase } from "@/lib/baseActiva";
import { useOrganizacion } from "@/stores/organizacion";
import MenuVistas from "./MenuVistas.vue";

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
// La ventanita de reka solo se abre en el navegador: aquí deja ver lo que lleva.
vi.mock("@/components/ui/popover", async () => {
  const { h: hh } = await import("vue");
  const pasa = {
    setup:
      (_: unknown, { slots }: { slots: Slots }) =>
      () =>
        hh("div", slots.default?.()),
  };
  return { Popover: pasa, PopoverContent: pasa, PopoverTrigger: pasa };
});

let pinia: Pinia;
async function html(raiz: string | null = null) {
  const app = createSSRApp({ render: () => h(MenuVistas, { raiz, unidades: [] }) });
  app.use(pinia).use(i18n);
  return renderToString(app);
}
const t = (clave: string, valores: Record<string, string> = {}) => i18n.global.t(clave, valores);

beforeEach(() => {
  fijarBase("A");
  pinia = createPinia();
  setActivePinia(pinia);
  useOrganizacion().vistas = [{ id: "v1", arbol_id: null, nombre: "Mía", config: "{}" }];
});

describe("Las vistas guardadas en solo lectura", () => {
  it("al lado no se guardan, renombran ni eliminan; aplicarlas sigue", async () => {
    lado.activo = true;
    const s = await html();
    expect(s).not.toContain(t("arbol.vistas.guardar"));
    expect(s).not.toContain(t("arbol.vistas.nombre"));
    expect(s).not.toContain(t("arbol.vistas.renombrar", { nombre: "Mía" }));
    expect(s).not.toContain(t("arbol.vistas.eliminar", { nombre: "Mía" }));
    expect(s).toContain(t("arbol.vistas.aplicar", { nombre: "Mía" }));
  });

  it("una rama no guardada: al lado no invita a guardarla", async () => {
    lado.activo = true;
    let s = await html("a");
    expect(s).not.toContain(t("arbol.vistas.sinArbol"));
    expect(s).toContain(t("arbol.vistas.sinArbolLado"));
    lado.activo = false;
    s = await html("a");
    expect(s).toContain(t("arbol.vistas.sinArbol"));
  });

  it("fuera del lado, como siempre", async () => {
    lado.activo = false;
    const s = await html();
    expect(s).toContain(t("arbol.vistas.guardar"));
    expect(s).toContain(t("arbol.vistas.renombrar", { nombre: "Mía" }));
    expect(s).toContain(t("arbol.vistas.eliminar", { nombre: "Mía" }));
  });
});
