import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { computed, createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { createMemoryHistory, createRouter } from "vue-router";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TIPO_AREA, TIPO_GERENCIA } from "@/db/tipos";
import { u } from "@/features/arbol/fixture";
import { i18n } from "@/i18n";
import { fijarBase } from "@/lib/baseActiva";
import { useOrganizacion } from "@/stores/organizacion";
import { CONTEXTO_LIENZO, type ContextoLienzo } from "@/features/arbol/contexto";
import { useLienzo } from "@/features/arbol/useLienzo";
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

let finanzas = u("a", TIPO_AREA, "Finanzas", "g");
let pinia: Pinia;
async function html() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/", name: "arbol", component: { render: () => null } }],
  });
  await router.push("/");
  const app = createSSRApp({ render: () => h(TooltipProvider, () => h(PanelUnidad, { unidad: finanzas })) });
  const contexto = { mostradas: computed(() => useOrganizacion().unidades) } as unknown as ContextoLienzo;
  app.use(pinia).use(router).use(i18n).provide(CONTEXTO_LIENZO, contexto);
  return renderToString(app);
}
const t = (clave: string, valores: Record<string, string> = {}) => i18n.global.t(clave, valores);

beforeEach(() => {
  fijarBase("A");
  pinia = createPinia();
  setActivePinia(pinia);
  finanzas = { ...u("a", TIPO_AREA, "Finanzas", "g"), marca_color: "#445566" };
  const org = useOrganizacion();
  org.unidades = [u("g", TIPO_GERENCIA, "Gerencia", null), finanzas, u("c", TIPO_AREA, "Compras", "g")];
  org.etiquetas = [{ id: "e1", nombre: "Clave", color: "#112233" }];
  org.unidadEtiquetas = [{ unidad_id: "a", etiqueta_id: "e1" }];
  org.conexiones = [{ id: "x1", origen_id: "a", destino_id: "c", etiqueta: null }];
});

// Lo que cambia datos, en el resumen; «Nuevo puesto» está en la pestaña Puestos.
const EDITAR: [string, Record<string, string>?][] = [
  ["arboles.guardarEnArboles"],
  ["unidad.duplicar"],
  ["unidad.eliminar"],
  ["unidad.quitarMarca"],
  ["unidad.agregarEtiqueta"],
  ["unidad.quitarEtiqueta", { nombre: "Clave" }],
  ["unidad.conectarCon"],
  ["unidad.editarConexion", { nombre: "Compras" }],
  ["unidad.quitarConexion", { nombre: "Compras" }],
];
const puestos = () => {
  useLienzo().pestanaPanel.value = "puestos";
  return html();
};

describe("El panel de la unidad en solo lectura", () => {
  it("al lado no hay acciones de editar y los campos quedan deshabilitados, sin el aviso de la fecha", async () => {
    lado.activo = true;
    const s = await html();
    for (const [clave, v] of EDITAR) expect(s, clave).not.toContain(t(clave, v));
    expect(s).toMatch(/<fieldset[^>]*\sdisabled/);
    expect(s).not.toContain(t("arbol.fecha.panelSoloLectura"));
    expect(s).not.toContain(t("unidad.nuevoPuestoJefatura"));
    expect(s).toContain(t("unidad.cerrar"));
    expect(s).toContain(t("personas.pestana"));
    expect(s).toContain("Clave");
    expect(await puestos()).not.toContain(t("puesto.nuevoPuesto"));
  });

  it("fuera del lado se edita como siempre", async () => {
    lado.activo = false;
    const s = await html();
    for (const [clave, v] of EDITAR) expect(s, clave).toContain(t(clave, v));
    expect(s).not.toMatch(/<fieldset[^>]*\sdisabled/);
    expect(s).toContain(t("unidad.nuevoPuestoJefatura"));
    expect(await puestos()).toContain(t("puesto.nuevoPuesto"));
  });

  it("viendo una fecha, las mismas acciones siguen ahí, deshabilitadas", async () => {
    lado.activo = false;
    useOrganizacion().fechaVista = "2026-01-01";
    const s = await html();
    for (const [clave, v] of EDITAR) expect(s, clave).toContain(t(clave, v));
    expect(s).toMatch(/<fieldset[^>]*\sdisabled/);
    expect(s).toContain(t("arbol.fecha.panelSoloLectura"));
  });
});
