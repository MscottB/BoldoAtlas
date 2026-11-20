import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { createSSRApp, h, type Slots } from "vue";
import { renderToString } from "vue/server-renderer";
import { i18n } from "@/i18n";
import { u } from "@/features/arbol/fixture";
import { useOrganizacion } from "@/stores/organizacion";
import DialogoManual from "./DialogoManual.vue";

// Lo elegido la última vez (en node no hay localStorage).
const pref = vi.hoisted(() => ({ valor: {} as Record<string, unknown> }));
vi.mock("@/lib/preferencias", async (original) => ({
  ...(await original<object>()),
  leerPreferencia: () => pref.valor,
  guardarPreferencia: () => {},
}));

// Los diálogos de reka solo se abren en el navegador: aquí la ventana deja ver lo que lleva.
vi.mock("@/components/ui/dialog", async () => {
  const { h: hh } = await import("vue");
  const pasa = {
    setup:
      (_: unknown, { slots }: { slots: Slots }) =>
      () =>
        hh("div", slots.default?.()),
  };
  return {
    Dialog: pasa,
    DialogContent: pasa,
    DialogDescription: pasa,
    DialogFooter: pasa,
    DialogHeader: pasa,
    DialogTitle: pasa,
  };
});

const t = i18n.global.t;
let pinia: Pinia;
beforeEach(() => {
  pref.valor = {};
  pinia = createPinia();
  setActivePinia(pinia);
  useOrganizacion().$patch({
    unidades: [u("r", "t", "Gerencia General", null), u("a", "t", "Finanzas", "r")],
    cargado: true,
  });
});

async function html(rama?: string) {
  const app = createSSRApp({ render: () => h(DialogoManual, { open: true, rama }) });
  app.use(pinia).use(i18n);
  return renderToString(app);
}
const input = (s: string, accion: string) =>
  new RegExp(`<input[^>]*data-accion="${accion}"[^>]*>`).exec(s)?.[0];

describe("DialogoManual", () => {
  it("muestra las opciones: personas marcadas, carta vertical, y Guardar", async () => {
    const s = await html();
    expect(s).toContain(t("manual.titulo"));
    expect(s).toContain(t("imagen.alcanceTodo"));
    expect(s).toContain(t("manual.personas"));
    expect(input(s, "manual-personas")).toContain("checked");
    for (const x of ["carta", "oficio", "a4", "a3", "a2"]) expect(input(s, `hoja-${x}`)).toBeDefined();
    expect(input(s, "hoja-carta")).toContain("checked");
    expect(input(s, "hoja-a4")).not.toContain("checked");
    expect(input(s, "orientacion-vertical")).toContain("checked");
    expect(input(s, "orientacion-horizontal")).not.toContain("checked");
    expect(s).toContain('data-accion="guardar-manual"');
    // Cancelar solo mientras se arma; ni reparto ni nivel: el manual los fija.
    expect(s).not.toContain('data-accion="cancelar-manual"');
    expect(s).not.toContain('data-accion="reparto-');
    expect(s).not.toContain('data-accion="nivel-');
  });

  it("recuerda las opciones, salvo el alcance, que trae quien la abre", async () => {
    pref.valor = { personas: false, hoja: "a3", orientacion: "horizontal", alcance: "a" };
    const s = await html();
    expect(input(s, "manual-personas")).not.toContain("checked");
    expect(input(s, "hoja-a3")).toContain("checked");
    expect(input(s, "orientacion-horizontal")).toContain("checked");
    expect(s).toContain(t("imagen.alcanceTodo"));
    expect(s).not.toContain("Finanzas");

    // Desde el clic derecho, la rama.
    expect(await html("a")).toContain("Finanzas");
  });
});
