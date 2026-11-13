import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { createSSRApp, h, type Component } from "vue";
import { renderToString } from "vue/server-renderer";
import { createMemoryHistory, createRouter, useRoute, type Router } from "vue-router";
import { i18n } from "@/i18n";
import { fijarBase } from "@/lib/baseActiva";
import { useOrganizacion } from "@/stores/organizacion";
import { finDelArrastre, nuevaProporcion, proporcionDelPuntero } from "./divisor";
import { propsPanel, usePanel } from "./panel";
import { usePestanas } from "./usePestanas";
import VistaDividida from "./VistaDividida.vue";

// Cada vista dice cuál es, qué ruta ve y en qué panel está: así se ve qué router y qué panel le llegan.
const vista = (nombre: string): Component => ({
  setup() {
    const ruta = useRoute();
    const panel = usePanel();
    return () => h("p", `vista ${nombre}: ${ruta.fullPath} en ${panel.panel} de ${panel.pestana()}`);
  },
});
const rutasPrueba = () => [
  { path: "/", name: "arbol", component: vista("arbol") },
  { path: "/directorio", name: "directorio", component: vista("directorio") },
  { path: "/revision", name: "revision", component: vista("revision") },
  { path: "/configuracion", name: "configuracion", component: vista("configuracion") },
];
const nuevoRouter = () => createRouter({ history: createMemoryHistory(), routes: rutasPrueba() });
// El router de al lado ya llegó a su ruta: en el servidor no se espera la primera navegación. `inicial`: con qué se creó.
const lado = vi.hoisted(() => ({ router: null as unknown, inicial: "" }));
vi.mock("./routerLado", () => ({
  crearRouterLado: (inicial: string) => {
    lado.inicial = inicial;
    return lado.router;
  },
}));

const CLAVE = "boldo:pestanas:C:/datos";
let datos: Map<string, string>;
let router: Router;
let pinia: Pinia;

beforeEach(() => {
  datos = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => datos.set(k, v),
  });
  vi.stubGlobal("document", { activeElement: null, body: {}, getElementById: () => null });
  fijarBase("A");
  pinia = createPinia();
  setActivePinia(pinia);
  useOrganizacion().cargado = true;
  router = nuevoRouter();
});
afterEach(() => vi.unstubAllGlobals());

async function arrancar(conLado: boolean, deLado: { ruta: string; volver?: string } = { ruta: "/revision" }) {
  datos.set(
    CLAVE,
    JSON.stringify({
      lista: [
        { id: "a", org: "A", ruta: "/directorio" },
        { id: "b", org: "A", ...deLado },
      ],
      activa: "a",
      lado: conLado ? "b" : null,
    }),
  );
  const p = usePestanas();
  p.conectar(router, "C:/datos", "C:/datos/boldo.db");
  await router.replace(p.entrar());
  const r = nuevoRouter();
  await r.push("/revision");
  lado.router = r;
  return p;
}

async function html() {
  const app = createSSRApp({ render: () => h(VistaDividida) });
  app.use(pinia).use(router).use(i18n);
  return renderToString(app);
}
const texto = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("VistaDividida", () => {
  it("sin_lado_se_ve_como_hoy", async () => {
    await arrancar(false);
    const s = await html();
    expect(texto(s)).toContain("vista directorio: /directorio en principal de a");
    expect(s).not.toContain("<header");
    expect(s).not.toContain('role="separator"');
    expect(s.match(/data-panel=/g)).toHaveLength(1);
    expect(s).toMatch(/<main[^>]*role="tabpanel"[^>]*aria-labelledby="pestana-a"/);
  });

  it("con la vista dividida, el panel de la pestaña activa es el principal y no todo el área", async () => {
    await arrancar(true);
    const s = await html();
    expect(s).not.toMatch(/<main[^>]*role=/);
    expect(s).toMatch(
      /<section[^>]*data-panel="principal"[^>]*role="tabpanel"[^>]*aria-labelledby="pestana-a"/,
    );
    expect(s).not.toMatch(/data-panel="lado"[^>]*role="tabpanel"/);
    expect(s.match(/role="tabpanel"/g)).toHaveLength(1);
  });

  it("una pestaña en Configuración se abre al lado en su vista de trabajo", async () => {
    await arrancar(true, { ruta: "/configuracion", volver: "/directorio" });
    await html();
    expect(lado.inicial).toBe("/directorio");
    setActivePinia((pinia = createPinia()));
    router = nuevoRouter();
    await arrancar(true, { ruta: "/configuracion" });
    await html();
    expect(lado.inicial).toBe("/");
  });

  it("con_lado_dos_paneles_y_foco", async () => {
    await arrancar(true);
    const s = await html();
    const t = texto(s);
    expect(t).toContain("vista directorio: /directorio en principal de a");
    expect(t).toContain("vista revision: /revision en lado de b");
    expect(s.match(/<header/g)).toHaveLength(2);
    expect(t).toContain("Directorio");
    expect(t).toContain("Revisión");
    expect(s).toContain('aria-label="Una sobre otra"');
    expect(s).toContain('aria-label="Cerrar la vista dividida"');
    expect(s).toMatch(/role="separator"/);
    expect(s).toMatch(/aria-orientation="vertical"/);
    expect(s).toMatch(/aria-valuenow="50"/);
    expect(s).toMatch(/aria-valuemin="20"/);
    expect(s).toMatch(/aria-valuemax="80"/);
    expect(s).toMatch(/tabindex="0"/);
    expect(s).toMatch(/data-panel="principal"[^>]*aria-current="true"/);
  });

  it("un focusin o un clic en un panel lo deja con foco y lo marca", async () => {
    const p = await arrancar(true);
    // Los mismos atributos que el panel lleva con v-bind: el manejador de focusin y pointerdown es este.
    propsPanel("lado").onFocusin();
    expect(p.conFoco).toBe("lado");
    expect(propsPanel("lado")["aria-current"]).toBe("true");
    expect(propsPanel("principal")["aria-current"]).toBeUndefined();
    const s = await html();
    expect(s).toMatch(/data-panel="lado"[^>]*aria-current="true"/);
    expect(s).not.toMatch(/data-panel="principal"[^>]*aria-current/);

    propsPanel("principal").onPointerdown();
    expect(p.conFoco).toBe("principal");
  });
});

describe("divisor", () => {
  it("divisor_flechas_inicio_fin_y_doble_clic", () => {
    expect(nuevaProporcion("ArrowRight", 0.5)).toBe(0.55);
    expect(nuevaProporcion("ArrowDown", 0.5)).toBe(0.55);
    expect(nuevaProporcion("ArrowLeft", 0.5)).toBe(0.45);
    expect(nuevaProporcion("ArrowUp", 0.5)).toBe(0.45);
    expect(nuevaProporcion("ArrowRight", 0.78)).toBe(0.8);
    expect(nuevaProporcion("ArrowLeft", 0.22)).toBe(0.2);
    expect(nuevaProporcion("Home", 0.5)).toBe(0.2);
    expect(nuevaProporcion("End", 0.5)).toBe(0.8);
    expect(nuevaProporcion("dblclick", 0.3)).toBe(0.5);
    expect(nuevaProporcion("a", 0.5)).toBeNull();
  });

  it("al arrastrar, el centro del divisor queda bajo el puntero, sobre lo que el divisor deja a los paneles", () => {
    // 1004 px con un divisor de 4: los paneles se reparten 1000.
    const caja = { left: 100, top: 50, width: 1004, height: 404 };
    expect(proporcionDelPuntero("horizontal", { x: 402, y: 0 }, caja, 4)).toBe(0.3);
    expect(proporcionDelPuntero("horizontal", { x: 902, y: 0 }, caja, 4)).toBe(0.8);
    expect(proporcionDelPuntero("vertical", { x: 0, y: 292 }, caja, 4)).toBe(0.6);
    expect(proporcionDelPuntero("horizontal", { x: 0, y: 0 }, caja, 4)).toBe(0.2);
    expect(proporcionDelPuntero("vertical", { x: 0, y: 900 }, caja, 4)).toBe(0.8);
  });

  it("al soltar se guarda una vez, en centésimas, y solo si cambió", () => {
    expect(finDelArrastre(0.5, null)).toBeNull();
    expect(finDelArrastre(0.5, 0.5012)).toBeNull();
    expect(finDelArrastre(0.5, 0.6234)).toBe(0.62);
    expect(finDelArrastre(0.5, 0.2)).toBe(0.2);
  });
});
