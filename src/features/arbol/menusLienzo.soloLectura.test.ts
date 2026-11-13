import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { createSSRApp, h, type Component } from "vue";
import { renderToString } from "vue/server-renderer";
import { createMemoryHistory, createRouter } from "vue-router";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TIPO_AREA, TIPO_GERENCIA } from "@/db/tipos";
import { i18n } from "@/i18n";
import { fijarBase } from "@/lib/baseActiva";
import { useOrganizacion } from "@/stores/organizacion";
import BarraLienzo from "./BarraLienzo.vue";
import { CONTEXTO_LIENZO, type ContextoLienzo } from "./contexto";
import { p, u } from "./fixture";
import MenuLienzo from "./MenuLienzo.vue";

vi.hoisted(() =>
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} }),
);
const lado = vi.hoisted(() => ({ activo: false, apuntado: "" }));
vi.mock("@/lado/modo", () => ({
  get MODO_LADO() {
    return lado.activo;
  },
  idLado: () => "",
}));
// Los menús de reka solo se abren en el navegador: aquí cada pieza deja ver lo que lleva dentro.
const pasaTodo = vi.hoisted(() => async (nombres: string[]) => {
  const { h: hh } = await import("vue");
  const pasa = {
    setup:
      (_: unknown, { slots }: { slots: Record<string, () => unknown> }) =>
      () =>
        hh("div", slots.default?.() as never),
  };
  return Object.fromEntries(nombres.map((n) => [n, pasa]));
});
vi.mock("@/components/ui/popover", () => pasaTodo(["Popover", "PopoverContent", "PopoverTrigger"]));
vi.mock("@/components/ui/dropdown-menu", () =>
  pasaTodo([
    "DropdownMenu",
    "DropdownMenuCheckboxItem",
    "DropdownMenuContent",
    "DropdownMenuGroup",
    "DropdownMenuItem",
    "DropdownMenuLabel",
    "DropdownMenuSeparator",
    "DropdownMenuSub",
    "DropdownMenuSubContent",
    "DropdownMenuSubTrigger",
    "DropdownMenuTrigger",
  ]),
);
// El clic derecho: el disparador simula el que apunta a la tarjeta `lado.apuntado` (o al fondo) antes de que se dibuje
// el menú, con el mismo manejador del componente.
vi.mock("@/components/ui/context-menu", async () => {
  const { h: hh } = await import("vue");
  const piezas = await pasaTodo([
    "ContextMenu",
    "ContextMenuContent",
    "ContextMenuItem",
    "ContextMenuSeparator",
    "ContextMenuShortcut",
  ]);
  const ContextMenuTrigger = {
    setup:
      (_: unknown, { slots }: { slots: Record<string, () => { props: Record<string, unknown> }[]> }) =>
      () => {
        const hijos = slots.default!();
        const nodo = lado.apuntado ? { dataset: { id: lado.apuntado }, querySelector: () => null } : null;
        const target = { closest: (sel: string) => (sel === ".vue-flow__node" ? nodo : null) };
        (hijos[0].props.onContextmenuCapture as (e: unknown) => void)({ target });
        return hh("div", hijos as never);
      },
  };
  return { ...piezas, ContextMenuTrigger };
});

const contexto = { encuadrar: async () => true } as unknown as ContextoLienzo;
let pinia: Pinia;
async function html(componente: Component, props: Record<string, unknown>) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/", name: "arbol", component: { render: () => null } }],
  });
  await router.push("/");
  const app = createSSRApp({ render: () => h(TooltipProvider, () => h(componente, props)) });
  app.use(pinia).use(router).use(i18n).provide(CONTEXTO_LIENZO, contexto);
  return renderToString(app);
}
const t = (clave: string) => i18n.global.t(clave);
const menu = () =>
  html(MenuLienzo, { unidades: useOrganizacion().unidades, visibles: new Set(), raiz: null });

beforeEach(() => {
  fijarBase("A");
  pinia = createPinia();
  setActivePinia(pinia);
  const org = useOrganizacion();
  org.unidades = [u("g", TIPO_GERENCIA, "Gerencia", null), u("a", TIPO_AREA, "Finanzas", "g")];
  org.puestos = [p("p1", "a")];
});

const DE_UNIDAD = [
  "arbol.nuevaSubunidad",
  "arbol.menu.renombrar",
  "unidad.conectarCon",
  "arbol.menu.seleccionarRama",
  "unidad.duplicar",
  "arboles.guardarEnArboles",
  "arbol.menu.eliminar",
];
const DE_PUESTO = [
  "puesto.accion.titular",
  "puesto.accion.reemplazo",
  "leyenda.copiar",
  "leyenda.pegar",
  "leyenda.quitar",
];

describe("El menú contextual del lienzo", () => {
  it("al lado, en una unidad, solo lo de leer", async () => {
    lado.activo = true;
    lado.apuntado = "a";
    const s = await menu();
    for (const clave of DE_UNIDAD) expect(s, clave).not.toContain(t(clave));
    for (const clave of [
      "arbol.menu.abrirPanel",
      "arbol.menu.verPersonas",
      "arbol.abrirComoArbol",
      "arbol.menu.expandirRama",
    ])
      expect(s, clave).toContain(t(clave));
  });

  it("al lado, en un puesto, solo abrirlo", async () => {
    lado.activo = true;
    lado.apuntado = "p1";
    const s = await menu();
    for (const clave of DE_PUESTO) expect(s, clave).not.toContain(t(clave));
    expect(s).toContain(t("arbol.menu.abrirPuesto"));
  });

  it("al lado, en el fondo, sin nueva raíz", async () => {
    lado.activo = true;
    lado.apuntado = "";
    const s = await menu();
    expect(s).not.toContain(t("arbol.menu.nuevaRaiz"));
    expect(s).toContain(t("arbol.reordenar"));
  });

  it("fuera del lado, como siempre", async () => {
    lado.activo = false;
    lado.apuntado = "a";
    let s = await menu();
    for (const clave of DE_UNIDAD) expect(s, clave).toContain(t(clave));
    lado.apuntado = "p1";
    s = await menu();
    for (const clave of DE_PUESTO) expect(s, clave).toContain(t(clave));
    lado.apuntado = "";
    expect(await menu()).toContain(t("arbol.menu.nuevaRaiz"));
  });
});

describe("La barra del lienzo", () => {
  const barra = () => html(BarraLienzo, { raiz: "a", unidades: useOrganizacion().unidades });

  it("al lado no ofrece nueva unidad ni guardar en Árboles", async () => {
    lado.activo = true;
    const s = await barra();
    expect(s).not.toContain(t("arbol.nuevaUnidad"));
    expect(s).not.toContain(t("arboles.guardarEnArboles"));
    expect(s).toContain(t("arbol.ramas.expandirTodo"));
  });

  it("fuera del lado sigue como siempre; viendo una fecha, deshabilitadas", async () => {
    lado.activo = false;
    let s = await barra();
    expect(s).toContain(t("arbol.nuevaUnidad"));
    expect(s).toContain(t("arboles.guardarEnArboles"));
    useOrganizacion().fechaVista = "2026-01-01";
    s = await barra();
    expect(s).toMatch(
      new RegExp(`<button[^>]*\\sdisabled[^>]*>(?:(?!</button>).)*${t("arbol.nuevaUnidad")}`),
    );
  });
});
