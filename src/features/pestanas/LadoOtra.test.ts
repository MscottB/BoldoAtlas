import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { createRenderer, createSSRApp, h, type Component } from "vue";
import { renderToString } from "vue/server-renderer";
import { createMemoryHistory, createRouter, type Router } from "vue-router";
import type { Organizacion } from "@/db/cliente";
import { i18n } from "@/i18n";
import { fijarBase } from "@/lib/baseActiva";
import { useOrganizacion } from "@/stores/organizacion";
import { useOrganizaciones } from "@/stores/organizaciones";
import { atenderMensaje, filtrarMensaje, srcLado, useLadoOtra } from "./ladoOtra";
import { irConFoco, registrarRouter } from "./routerConFoco";
import { usePestanas } from "./usePestanas";
import VistaDividida from "./VistaDividida.vue";

const cliente = vi.hoisted(() => ({ ladoAbrir: vi.fn(), ladoCerrar: vi.fn() }));
vi.mock("@/db/cliente", async (original) => ({
  ...(await original<typeof import("@/db/cliente")>()),
  ...cliente,
}));
// El panel de al lado de la abierta, sin el router de la app (que pide `location` al importarse).
vi.mock("./routerLado", () => ({ crearRouterLado: () => nuevoRouter() }));

// Sin DOM: un renderer que no dibuja nada, para montar y desmontar el composable (onMounted, onBeforeUnmount).
const sinDom = createRenderer<object, object>({
  createElement: () => ({}),
  createText: () => ({}),
  createComment: () => ({}),
  insert: () => {},
  remove: () => {},
  setText: () => {},
  setElementText: () => {},
  parentNode: () => null,
  nextSibling: () => null,
  patchProp: () => {},
});

const vacio = { render: () => null };
const nuevoRouter = () =>
  createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", name: "arbol", component: vacio },
      { path: "/directorio", name: "directorio", component: vacio },
      { path: "/revision", name: "revision", component: vacio },
      { path: "/configuracion", name: "configuracion", component: vacio },
    ],
  });

const CLAVE = "boldo:pestanas:C:/datos";
const ORIGEN = "http://tauri.localhost";
const org = (id: string, color = "#112233"): Organizacion =>
  ({ id, nombre: `Org ${id}`, color, abierta: "2026-11-03", existe: true }) as Organizacion;
let datos: Map<string, string>;
let router: Router;
let pinia: Pinia;
let quitarRouter = () => {};
let escuchas: ((e: MessageEvent) => void)[];

beforeEach(() => {
  datos = new Map();
  escuchas = [];
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => datos.set(k, v),
  });
  vi.stubGlobal("document", { activeElement: null, body: {}, getElementById: () => null });
  vi.stubGlobal("location", { pathname: "/index.html", origin: ORIGEN });
  vi.stubGlobal("window", {
    matchMedia: () => ({ matches: false, addEventListener: () => {} }),
    addEventListener: (tipo: string, f: (e: MessageEvent) => void) => tipo === "message" && escuchas.push(f),
    removeEventListener: (_tipo: string, f: (e: MessageEvent) => void) =>
      (escuchas = escuchas.filter((x) => x !== f)),
  });
  cliente.ladoAbrir.mockReset().mockResolvedValue({ id: "B", personas: 10, unidades: 2 });
  cliente.ladoCerrar.mockReset().mockResolvedValue(undefined);
  fijarBase("A");
  pinia = createPinia();
  setActivePinia(pinia);
  useOrganizacion().cargado = true;
  useOrganizaciones().lista = [org("A"), org("B", "#aa0000")];
  router = nuevoRouter();
  quitarRouter = registrarRouter("principal", router);
});
afterEach(() => {
  quitarRouter();
  vi.unstubAllGlobals();
});

/** La abierta es A; `x`, de B, está al lado. */
async function arrancar(deX: { ruta: string; volver?: string } = { ruta: "/directorio" }) {
  datos.set(
    CLAVE,
    JSON.stringify({
      lista: [
        { id: "a", org: "A", ruta: "/" },
        { id: "x", org: "B", ...deX },
      ],
      activa: "a",
      lado: "x",
    }),
  );
  const p = usePestanas();
  p.conectar(router, "C:/datos", "C:/datos/boldo.db");
  await router.replace(p.entrar());
  return p;
}

const marco = { postMessage: () => {} };
/** Monta el composable del panel de la pestaña `x`, con `marco` como ventana del iframe. */
function montar() {
  let lado!: ReturnType<typeof useLadoOtra>;
  const app = sinDom.createApp({
    setup() {
      lado = useLadoOtra("x", () => marco);
      return () => null;
    },
  });
  app.use(pinia).use(i18n);
  app.mount({});
  return { lado, app };
}
const esperar = () => new Promise((r) => setTimeout(r, 0));

describe("filtrarMensaje", () => {
  const de = (data: unknown, source: unknown = marco, origin = ORIGEN) => ({ data, source, origin });

  it("mensaje_de_otro_origen_o_de_otra_ventana_se_ignora", () => {
    const ruta = { tipo: "boldo-lado-ruta", ruta: "/directorio" };
    expect(filtrarMensaje(de(ruta), marco, ORIGEN)).toEqual(ruta);
    expect(filtrarMensaje(de(ruta, {}), marco, ORIGEN)).toBeNull();
    expect(filtrarMensaje(de(ruta, marco, "https://otro.example"), marco, ORIGEN)).toBeNull();
    // Sin iframe aún (o ya soltado), nada vale: tampoco un mensaje sin ventana.
    expect(filtrarMensaje(de(ruta, null), null, ORIGEN)).toBeNull();
  });

  it("solo los tipos conocidos y bien formados", () => {
    expect(filtrarMensaje(de({ tipo: "boldo-lado-fuera", ruta: "/configuracion" }), marco, ORIGEN)).toEqual({
      tipo: "boldo-lado-fuera",
      ruta: "/configuracion",
    });
    expect(filtrarMensaje(de({ tipo: "boldo-lado-tecla", tecla: "F6" }), marco, ORIGEN)).toEqual({
      tipo: "boldo-lado-tecla",
      tecla: "F6",
    });
    for (const malo of [
      null,
      "texto",
      { tipo: "otro", ruta: "/" },
      { tipo: "boldo-lado-ruta" },
      { tipo: "boldo-lado-ruta", ruta: 3 },
      { tipo: "boldo-lado-tecla", tecla: "F5" },
    ])
      expect(filtrarMensaje(de(malo), marco, ORIGEN)).toBeNull();
  });
});

describe("srcLado", () => {
  it("abre en la ruta de la pestaña si es una vista que se ve al lado; si no, en el Árbol", () => {
    expect(srcLado("/index.html", "B", "/directorio?persona=w1", "directorio")).toBe(
      "/index.html?lado=B#/directorio?persona=w1",
    );
    expect(srcLado("/", "B", "/configuracion", "configuracion")).toBe("/?lado=B#/");
  });
});

describe("atenderMensaje", () => {
  it("navegar_a_configuracion_con_foco_en_la_otra_va_al_principal", async () => {
    const p = await arrancar();
    p.enfocarPanel("lado");
    atenderMensaje({ tipo: "boldo-lado-fuera", ruta: "/configuracion" });
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe("/configuracion"));
    expect(p.conFoco).toBe("principal");
    expect(p.lado).toBe("x");
    expect(p.lista.find((x) => x.id === "x")!.ruta).toBe("/directorio");

    // Desde el menú lateral de la ventana, igual.
    await router.replace("/");
    p.enfocarPanel("lado");
    await irConFoco("/configuracion");
    expect(router.currentRoute.value.fullPath).toBe("/configuracion");
    expect(p.conFoco).toBe("principal");
  });

  it("la ruta del iframe queda en su pestaña, y F6 lleva el foco al principal", async () => {
    const p = await arrancar();
    atenderMensaje({ tipo: "boldo-lado-ruta", ruta: "/revision" });
    expect(p.lista.find((x) => x.id === "x")!.ruta).toBe("/revision");
    expect(router.currentRoute.value.fullPath).toBe("/");
    p.enfocarPanel("lado");
    atenderMensaje({ tipo: "boldo-lado-tecla", tecla: "F6" });
    expect(p.conFoco).toBe("principal");
  });
});

describe("useLadoOtra", () => {
  it("copia la otra, arma el iframe en la ruta de la pestaña y al irse la suelta", async () => {
    const p = await arrancar();
    const { lado, app } = montar();
    expect(lado.estado.value).toBe("copiando");
    await esperar();
    expect(cliente.ladoAbrir).toHaveBeenCalledWith("B");
    expect(lado.estado.value).toBe("listo");
    expect(lado.src.value).toBe("/index.html?lado=B#/directorio");
    expect(lado.nombre.value).toBe("Org B");

    // Lo que el iframe dice, solo si viene de él.
    const avisar = (source: unknown) =>
      escuchas.forEach((f) =>
        f({ data: { tipo: "boldo-lado-ruta", ruta: "/revision" }, source, origin: ORIGEN } as unknown as MessageEvent),
      );
    avisar({});
    expect(p.lista.find((x) => x.id === "x")!.ruta).toBe("/directorio");
    avisar(marco);
    expect(p.lista.find((x) => x.id === "x")!.ruta).toBe("/revision");

    app.unmount();
    expect(cliente.ladoCerrar).toHaveBeenCalledTimes(1);
    expect(escuchas).toHaveLength(0);
  });

  it("desde Configuración abre la vista a la que vuelve; sin ella, el Árbol", async () => {
    await arrancar({ ruta: "/configuracion", volver: "/revision" });
    const { lado } = montar();
    await esperar();
    expect(lado.src.value).toBe("/index.html?lado=B#/revision");
  });

  it("sin memoria pregunta: «No» cierra la vista dividida y «Abrir igual» la muestra", async () => {
    const p = await arrancar();
    Object.defineProperty(performance, "memory", {
      value: { usedJSHeapSize: 4 * 2 ** 30, jsHeapSizeLimit: 4 * 2 ** 30 },
      configurable: true,
    });
    try {
      let { lado } = montar();
      await esperar();
      expect(lado.estado.value).toBe("preguntando");
      expect(lado.src.value).toBe("");
      lado.abrirIgual();
      expect(lado.estado.value).toBe("listo");
      expect(lado.src.value).toBe("/index.html?lado=B#/directorio");
      lado.alCerrarPregunta(); // el diálogo se cierra tras elegir: no cuenta como «No»
      expect(p.lado).toBe("x");

      ({ lado } = montar());
      await esperar();
      lado.alCerrarPregunta();
      expect(p.lado).toBeNull();
    } finally {
      Reflect.deleteProperty(performance, "memory");
    }
  });

  it("un fallo se muestra traducido; un pedido reemplazado (`cancelado`) no", async () => {
    await arrancar();
    cliente.ladoAbrir.mockRejectedValueOnce({ codigo: "otra_base", detalle: "" });
    let { lado } = montar();
    await esperar();
    expect(lado.estado.value).toBe("error");
    expect(lado.error.value).toBe(i18n.global.t("respaldos.error.otra_base"));

    cliente.ladoAbrir.mockRejectedValueOnce({ codigo: "cancelado", detalle: "" });
    ({ lado } = montar());
    await esperar();
    expect(lado.estado.value).toBe("copiando");
    expect(lado.error.value).toBe("");
  });

  it("si se suelta antes de terminar la copia, no muestra nada; la siguiente espera a que se suelte", async () => {
    await arrancar();
    let terminar!: (v: unknown) => void;
    cliente.ladoAbrir.mockReturnValueOnce(new Promise((r) => (terminar = r)));
    const { lado, app } = montar();
    await esperar();
    let soltar!: () => void;
    cliente.ladoCerrar.mockReturnValueOnce(new Promise<void>((r) => (soltar = r)));
    app.unmount();
    terminar({ id: "B", personas: 1, unidades: 1 });
    await esperar();
    expect(lado.estado.value).toBe("copiando");

    montar();
    await esperar();
    expect(cliente.ladoAbrir).toHaveBeenCalledTimes(1);
    soltar();
    await esperar();
    expect(cliente.ladoAbrir).toHaveBeenCalledTimes(2);
  });
});

describe("panel de al lado con otra organización", () => {
  async function html(raiz: Component = VistaDividida) {
    const app = createSSRApp({ render: () => h(raiz) });
    app.use(pinia).use(router).use(i18n);
    return renderToString(app);
  }
  const texto = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  it("el encabezado dice su nombre, su color y Solo lectura; mientras copia lo dice", async () => {
    await arrancar();
    const s = await html();
    const t = texto(s);
    expect(t).toContain("Org B");
    expect(t).toContain("Solo lectura");
    expect(t).toContain("Copiando la organización…");
    expect(s).toMatch(/<header[^>]*>.*background-color:#aa0000/s);
    expect(s).toContain('aria-label="Cerrar la vista dividida"');
    expect(s).not.toContain("<iframe");
  });

  it("con una de la abierta al lado, el encabezado es el de siempre", async () => {
    await arrancar();
    useOrganizaciones().idAbierta = "B";
    fijarBase("B");
    const t = texto(await html());
    expect(t).not.toContain("Solo lectura");
    expect(t).not.toContain("Copiando la organización…");
  });
});
