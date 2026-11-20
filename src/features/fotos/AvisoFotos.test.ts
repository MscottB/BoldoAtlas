import { describe, expect, it, vi } from "vitest";
import { createPinia } from "pinia";
import { createSSRApp, h, type Slots } from "vue";
import { renderToString } from "vue/server-renderer";
import { i18n } from "@/i18n";
import { aviso } from "./aviso";
import AvisoFotos from "./AvisoFotos.vue";

vi.hoisted(() =>
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} }),
);
// Los diálogos de reka solo se abren en el navegador: aquí el aviso deja ver lo que lleva.
vi.mock("@/components/ui/alert-dialog", async () => {
  const { h: hh } = await import("vue");
  const pasa = {
    setup:
      (_: unknown, { slots }: { slots: Slots }) =>
      () =>
        hh("div", slots.default?.()),
  };
  return {
    AlertDialog: pasa,
    AlertDialogContent: pasa,
    AlertDialogDescription: pasa,
    AlertDialogFooter: pasa,
    AlertDialogHeader: pasa,
    AlertDialogTitle: pasa,
  };
});

describe("AvisoFotos", () => {
  it("muestra el texto y los dos botones", async () => {
    i18n.global.locale.value = "es";
    aviso.value = { texto: "Tienes fotos en «Norte» y 2 respaldos.", externa: false, baseId: "A" };
    const app = createSSRApp({ render: () => h(AvisoFotos) });
    app.use(createPinia()).use(i18n);
    const s = await renderToString(app);
    expect(s).toContain("Tienes fotos en «Norte» y 2 respaldos.");
    expect(s).toContain("Quitar las fotos ahora");
    expect(s).toContain("Más tarde");
    // el arnés de la app real busca el botón por este atributo, no por su texto (cambia con el idioma)
    expect(s).toContain('data-accion="quitar-fotos"');
  });
});
