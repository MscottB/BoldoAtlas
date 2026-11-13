import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { createSSRApp, h, type Slots } from "vue";
import { renderToString } from "vue/server-renderer";
import { createMemoryHistory, createRouter } from "vue-router";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Trabajador } from "@/db/tipos";
import { i18n } from "@/i18n";
import { fijarBase } from "@/lib/baseActiva";
import { useOrganizacion } from "@/stores/organizacion";
import FichaTrabajador from "./FichaTrabajador.vue";
import { useFicha } from "./useFicha";

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
vi.mock("@/db/cliente", () => ({ consultar: vi.fn(async () => []) }));
vi.mock("./foto", async (original) => ({
  ...(await original<typeof import("./foto")>()),
  urlFoto: () => "foto://w1",
}));
// Los diálogos de reka solo se abren en el navegador: aquí la ficha deja ver lo que lleva; el aviso de cambios, cerrado.
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
    DialogClose: pasa,
    DialogContent: pasa,
    DialogDescription: pasa,
    DialogFooter: pasa,
    DialogHeader: pasa,
    DialogTitle: pasa,
  };
});
vi.mock("@/components/ui/alert-dialog", () => {
  const nada = { render: () => null };
  return {
    AlertDialog: nada,
    AlertDialogAction: nada,
    AlertDialogCancel: nada,
    AlertDialogContent: nada,
    AlertDialogDescription: nada,
    AlertDialogFooter: nada,
    AlertDialogHeader: nada,
    AlertDialogTitle: nada,
  };
});

const persona: Trabajador = {
  id: "w1",
  nombre: "Ana Pérez",
  correo: "ana@x.cl",
  telefono: null,
  tipo_contrato_id: null,
  sede_id: null,
  jornada_id: null,
  tiene_foto: 1,
  updated_at: "",
};

let pinia: Pinia;
async function html() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/directorio", name: "directorio", component: { render: () => null } }],
  });
  await router.push("/directorio");
  const app = createSSRApp({ render: () => h(TooltipProvider, () => h(FichaTrabajador)) });
  app.use(pinia).use(router).use(i18n);
  return renderToString(app);
}
const t = (clave: string) => i18n.global.t(clave);
/** La etiqueta de apertura del elemento con ese id. */
const etiqueta = (s: string, id: string) => s.match(new RegExp(`<[^>]*id="${id}"[^>]*>`))?.[0] ?? "";

beforeEach(() => {
  fijarBase("A");
  pinia = createPinia();
  setActivePinia(pinia);
  useOrganizacion().trabajadores = [persona];
  useFicha().abrir("w1");
});

describe("La ficha en solo lectura", () => {
  it("al lado los campos se ven deshabilitados y no hay eliminar ni foto; ver en el organigrama y cerrar siguen", async () => {
    lado.activo = true;
    const s = await html();
    for (const id of ["ficha-nombre", "ficha-correo", "ficha-telefono", "ficha-notas", "ficha-sede_id"])
      expect(etiqueta(s, id), id).toMatch(/\sdisabled[\s>=]/);
    expect(s).toContain('value="Ana Pérez"');
    expect(s).not.toContain(t("ficha.eliminar"));
    expect(s).not.toContain(t("ficha.elegirFoto"));
    expect(s).not.toContain(t("ficha.quitarFoto"));
    expect(s).toContain(t("ubicar.ver"));
    expect(s).toContain(t("ficha.cerrar"));
  });

  it("fuera del lado se edita como siempre", async () => {
    lado.activo = false;
    const s = await html();
    for (const id of ["ficha-nombre", "ficha-correo", "ficha-telefono", "ficha-sede_id"])
      expect(etiqueta(s, id), id).not.toMatch(/\sdisabled[\s>=]/);
    expect(s).toContain(t("ficha.eliminar"));
    expect(s).toContain(t("ficha.elegirFoto"));
    expect(s).toContain(t("ficha.quitarFoto"));
  });
});
