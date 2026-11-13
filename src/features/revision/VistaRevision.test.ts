import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { createMemoryHistory, createRouter } from "vue-router";
import { TIPO_AREA, TIPO_GERENCIA } from "@/db/tipos";
import { p, u } from "@/features/arbol/fixture";
import { i18n } from "@/i18n";
import { fijarBase } from "@/lib/baseActiva";
import { useOrganizacion } from "@/stores/organizacion";
import VistaRevision from "./VistaRevision.vue";

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
    routes: [{ path: "/revision", component: { render: () => null } }],
  });
  await router.push("/revision");
  const app = createSSRApp({ render: () => h(VistaRevision) });
  app.use(pinia).use(router).use(i18n);
  return renderToString(app);
}
const t = (clave: string) => i18n.global.t(clave);
const EDICION = ["bien", "eliminar", "desactivar", "volver"];

beforeEach(() => {
  lado.activo = false;
  fijarBase("A");
  pinia = createPinia();
  setActivePinia(pinia);
  // Sin jefatura: las dos unidades. Vacía: «vacia». Vacante de 120 días: p1. Sin uso: la sede s1.
  useOrganizacion().$patch({
    unidades: [u("raiz", TIPO_GERENCIA, "Raíz", null), u("vacia", TIPO_AREA, "Vacía", "raiz")],
    puestos: [{ ...p("p1", "raiz"), created_at: new Date(Date.now() - 120 * 86_400_000).toISOString() }],
    catalogos: {
      cargos: [],
      tipos_contrato: [],
      sedes: [{ id: "s1", nombre: "Sede", orden: 0, deleted_at: null }],
      jornadas: [],
      tipos_unidad: [],
    },
    marcasRevision: JSON.stringify({ "sinJefatura:vacia": { motivo: "Es nueva", fecha: "2026-11-01" } }),
  });
});

describe("Revisión de datos", () => {
  it("resume por niveles, en orden, y muestra solo las secciones con avisos", async () => {
    const s = await html();
    const niveles = ["importante", "revisar", "limpieza"].map((n) =>
      s.indexOf(t(`revision.niveles.${n}.titulo`)),
    );
    expect(niveles.every((i) => i >= 0)).toBe(true);
    expect([...niveles].sort((x, y) => x - y)).toEqual(niveles);
    for (const tipo of ["sinJefatura", "vacantesLargas", "marcados"])
      expect(s).toContain(`data-tipo="${tipo}"`);
    expect(s).not.toContain('data-tipo="correos"');
    expect(s).toContain('href="#revision-sinJefatura"');
    expect(s).toContain("Es nueva");
    // Los títulos de sección son encabezados, y un marcado lleva su detalle (la ruta), también en el aria-label.
    expect(s).toContain(`<h3>${t("revision.sinJefatura.titulo")}</h3>`);
    // Sin nada guardado, solo las secciones de «Importante» empiezan abiertas.
    const etiqueta = (tipo: string) => s.match(new RegExp(`<details[^>]*data-tipo="${tipo}"[^>]*>`))?.[0];
    expect(etiqueta("sinJefatura")).toMatch(/\sopen[\s>]/);
    expect(etiqueta("vacias")).toBeDefined();
    expect(etiqueta("vacias")).not.toMatch(/\sopen[\s>]/);
    expect(s).toContain(`aria-label="${t("revision.acciones.volver")}: Vacía · Raíz"`);
  });

  it("un nivel sin avisos dice «Todo en orden»", async () => {
    const s0 = await html();
    expect(s0).not.toContain(t("revision.todoEnOrden"));
    useOrganizacion().$patch({
      marcasRevision: JSON.stringify({ "sinUso:sedes:s1": { motivo: "Se usará", fecha: "2026-11-01" } }),
    });
    expect(await html()).toContain(t("revision.todoEnOrden"));
  });

  it("ofrece las acciones a un clic", async () => {
    const s = await html();
    for (const id of [...EDICION, "jefatura", "asignar"]) expect(s).toContain(`data-accion="${id}"`);
    expect(s).toContain(`aria-label="${t("revision.acciones.jefatura")}: Raíz"`);
  });

  it.each([
    ["al lado", () => (lado.activo = true)],
    ["viendo una fecha", () => useOrganizacion().$patch({ fechaVista: "2026-01-01" })],
  ])("%s no ofrece cambiar nada, pero sí ir a ver", async (_, soloLectura) => {
    soloLectura();
    const s = await html();
    for (const id of EDICION) expect(s).not.toContain(`data-accion="${id}"`);
    expect(s).toContain('data-accion="jefatura"');
    expect(s).toContain('data-accion="asignar"');
    // Solo abren el puesto o la unidad: se nombran por lo que hacen.
    expect(s).not.toContain(t("revision.acciones.asignar"));
    expect(s).not.toContain(t("revision.acciones.jefatura"));
    expect(s).toContain(`aria-label="${t("revision.acciones.verPuesto")}: `);
    expect(s).toContain(`aria-label="${t("revision.acciones.verUnidad")}: Raíz"`);
  });

  it("la línea del filtro dice que el aviso queda fuera de la rama, no que no tenga unidad", () => {
    // Con `window` simulado, el idioma inicial sale de navigator.language (en el CI, inglés): se pide cada uno.
    const f = (n: number, locale: "es" | "en") => i18n.global.t("revision.fueraDeRama", n, { locale });
    expect(f(1, "es")).toBe("1 aviso queda fuera de esta rama");
    expect(f(3, "es")).toBe("3 avisos quedan fuera de esta rama");
    expect(f(1, "en")).toBe("1 warning is outside this branch");
    expect(f(3, "en")).toBe("3 warnings are outside this branch");
  });
});
