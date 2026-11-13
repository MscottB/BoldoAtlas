import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { createSSRApp, h, type Slots } from "vue";
import { renderToString } from "vue/server-renderer";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TIPO_AREA, type Trabajador } from "@/db/tipos";
import { a, p, u } from "@/features/arbol/fixture";
import { i18n } from "@/i18n";
import { fijarBase } from "@/lib/baseActiva";
import { useOrganizacion } from "@/stores/organizacion";
import DialogoPuesto from "./DialogoPuesto.vue";
import { usePuesto } from "./usePuesto";

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
// El diálogo de reka solo se abre en el navegador: aquí deja ver lo que lleva; el aviso de descartar, cerrado.
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

const persona = { id: "w1", nombre: "Ana Pérez" } as Trabajador;

let pinia: Pinia;
async function html() {
  const app = createSSRApp({ render: () => h(TooltipProvider, () => h(DialogoPuesto)) });
  app.use(pinia).use(i18n);
  return renderToString(app);
}
const t = (clave: string, valores: Record<string, string> = {}) => i18n.global.t(clave, valores);
/** La etiqueta de apertura del botón que dice `texto` (o lo lleva en un atributo). */
function boton(s: string, texto: string) {
  const b = s.split("<button").find((x) => x.slice(0, x.indexOf("</button>")).includes(texto)) ?? "";
  return b.slice(0, b.indexOf(">") + 1);
}
const deshabilitado = /\sdisabled[\s>=]/;
const EDITAR = [
  "puesto.accion.titular",
  "puesto.accion.reemplazo",
  "puesto.eliminar",
  "leyenda.copiar",
  "leyenda.pegar",
  "leyenda.quitar",
] as const;
const terminar = () => t("puesto.terminarDe", { nombre: "Ana Pérez" });

beforeEach(() => {
  fijarBase("A");
  pinia = createPinia();
  setActivePinia(pinia);
  const org = useOrganizacion();
  org.unidades = [u("a", TIPO_AREA, "Finanzas", null)];
  org.puestos = [p("p1", "a")];
  org.asignaciones = [a("as1", "p1", "w1")];
  org.trabajadores = [persona];
  org.catalogos.cargos = [{ id: "cargo", nombre: "Analista", orden: 0, deleted_at: null }];
  usePuesto().abrir("p1");
});

describe("El puesto en solo lectura", () => {
  it("al lado no hay acciones de editar y los campos quedan deshabilitados, sin el aviso de la fecha", async () => {
    lado.activo = true;
    const s = await html();
    for (const clave of EDITAR) expect(s, clave).not.toContain(t(clave));
    expect(s).not.toContain(terminar());
    expect(s).toMatch(/<textarea[^>]*id="puesto-descripcion"[^>]*\sdisabled/);
    expect(s).toMatch(/<input type="checkbox"[^>]*\sdisabled/);
    expect(s).toMatch(/<fieldset[^>]*\sdisabled/);
    expect(s).not.toContain(t("arbol.fecha.dialogoSoloLectura", { fecha: "" }).split(": ")[1]);
    expect(boton(s, "Ana Pérez")).not.toMatch(deshabilitado);
    expect(s).toContain(t("ficha.cerrar"));
  });

  it("viendo una fecha, como hoy: las acciones están, deshabilitadas", async () => {
    lado.activo = false;
    useOrganizacion().fechaVista = "2026-01-01";
    const s = await html();
    for (const clave of ["puesto.accion.titular", "puesto.accion.reemplazo", "puesto.eliminar"])
      expect(boton(s, t(clave)), clave).toMatch(deshabilitado);
    expect(boton(s, terminar())).toMatch(deshabilitado);
    expect(s).toMatch(/<fieldset[^>]*\sdisabled/);
    expect(s).toContain(t("leyenda.copiar"));
  });

  it("fuera del lado se edita como siempre", async () => {
    lado.activo = false;
    const s = await html();
    for (const clave of ["puesto.accion.titular", "puesto.accion.reemplazo", "puesto.eliminar"])
      expect(boton(s, t(clave)), clave).not.toMatch(deshabilitado);
    for (const clave of EDITAR) expect(s, clave).toContain(t(clave));
    expect(s).not.toMatch(/<fieldset[^>]*\sdisabled/);
  });
});
