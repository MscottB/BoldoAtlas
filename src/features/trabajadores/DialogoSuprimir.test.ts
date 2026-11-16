import { describe, expect, it, vi } from "vitest";
import { createSSRApp, h, type Slots } from "vue";
import { renderToString } from "vue/server-renderer";
import { i18n } from "@/i18n";
import DialogoSuprimir from "./DialogoSuprimir.vue";

// Los diálogos de reka solo se abren en el navegador: aquí dejan ver lo que llevan.
vi.mock("@/components/ui/alert-dialog", async () => {
  const { h: hh } = await import("vue");
  const pasa = (tag: string) => ({
    setup:
      (_: unknown, { slots }: { slots: Slots }) =>
      () =>
        hh(tag, slots.default?.()),
  });
  return {
    AlertDialog: pasa("div"),
    AlertDialogAction: pasa("button"),
    AlertDialogCancel: pasa("button"),
    AlertDialogContent: pasa("div"),
    AlertDialogDescription: pasa("div"),
    AlertDialogFooter: pasa("div"),
    AlertDialogHeader: pasa("div"),
    AlertDialogTitle: pasa("div"),
  };
});

const t = (k: string, v: Record<string, string> = {}) => i18n.global.t(k, v);
// el atributo, no las clases «disabled:...» del botón
const DESACTIVADO = / disabled(?=[ >])/;

async function html() {
  const app = createSSRApp({ render: () => h(DialogoSuprimir, { open: true, nombre: "Ana Pérez" }) });
  app.use(i18n);
  return renderToString(app);
}

describe("DialogoSuprimir", () => {
  it("abre con el botón desactivado y dice qué se borra, que no se deshace y lo de los 30 días", async () => {
    const s = await html();
    expect(s).toContain(t("suprimir.noSeDeshace"));
    expect(s).toContain(t("suprimir.respaldos"));
    expect(s).toContain(t("suprimir.queSeBorra"));
    expect(s).toContain("Ana Pérez");
    const boton = new RegExp(`<button[^>]*>${t("suprimir.confirmar")}</button>`).exec(s);
    expect(boton).not.toBeNull();
    expect(boton![0]).toMatch(DESACTIVADO);
  });
});
