import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { createRenderer, createSSRApp, h, type Component } from "vue";
import { renderToString } from "vue/server-renderer";
import { createMemoryHistory, createRouter, type Router } from "vue-router";
import type { Organizacion } from "@/db/cliente";
import { paletaAbierta } from "@/features/atajos/useAtajos";
import { i18n } from "@/i18n";
import { filtrarMensaje } from "@/lado/mensajes";
import { fijarBase } from "@/lib/baseActiva";
import { useOrganizacion } from "@/stores/organizacion";
import { useOrganizaciones } from "@/stores/organizaciones";
import { ESPERA_COPIA, atenderMensaje, srcLado, useLadoOtra } from "./useLadoOtra";
import { esRutaConFoco, irConFoco, registrarRouter, routerDel } from "./routerConFoco";
import { usePestanas } from "./usePestanas";
import VistaDividida from "./VistaDividida.vue";

// localStorage simulado desde antes de importar: hay módulos que leen sus preferencias al cargarse.
vi.hoisted(() =>
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} }),
);
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
      { path: "/importar-exportar", name: "importarExportar", component: vacio },
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
  marco.postMessage.mockReset();
  paletaAbierta.value = false;
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
  vi.useRealTimers();
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
        { id: "y", org: "B", ruta: "/revision" },
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

const marco = { postMessage: vi.fn() };
/** Monta el composable del panel de la pestaña `x`, con `marco` como ventana del iframe. */
function montar(id = "x") {
  let lado!: ReturnType<typeof useLadoOtra>;
  const app = sinDom.createApp({
    setup() {
      lado = useLadoOtra(id, () => marco);
      return () => null;
    },
  });
  app.use(pinia).use(i18n);
  app.mount({});
  return { lado, app };
}
/** Pasa la espera antes de copiar, y lo que la sigue. */
const esperar = () => vi.advanceTimersByTimeAsync(ESPERA_COPIA);
/** Lo que el iframe le dice a la ventana, desde `source`. */
const delIframe = (data: unknown, source: unknown = marco) =>
  escuchas.forEach((f) => f({ data, source, origin: ORIGEN } as unknown as MessageEvent));
const rutaDe = (id: string) => usePestanas().lista.find((x) => x.id === id)?.ruta;

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
    for (const bueno of [
      { tipo: "boldo-lado-fuera", ruta: "/configuracion" },
      { tipo: "boldo-lado-foco" },
      ...["F6", "nuevaPestana", "cerrarPestana", "pestanaSiguiente", "pestanaAnterior", "paleta"].map(
        (tecla) => ({ tipo: "boldo-lado-tecla", tecla }),
      ),
    ])
      expect(filtrarMensaje(de(bueno), marco, ORIGEN)).toEqual(bueno);
    // Se copia: nada del iframe queda en la ventana.
    const extra = { tipo: "boldo-lado-foco", otra: 1 };
    expect(filtrarMensaje(de(extra), marco, ORIGEN)).toEqual({ tipo: "boldo-lado-foco" });
    for (const malo of [
      null,
      "texto",
      { tipo: "otro", ruta: "/" },
      { tipo: "boldo-lado-ruta" },
      { tipo: "boldo-lado-ruta", ruta: 3 },
      { tipo: "boldo-lado-tecla", tecla: "F5" },
      { tipo: "boldo-lado-tecla", tecla: "duplicar" },
      { tipo: "boldo-lado-ir", ruta: "/" },
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
  const nada = () => {};

  it("navegar_a_configuracion_con_foco_en_la_otra_va_al_principal", async () => {
    const p = await arrancar();
    p.enfocarPanel("lado");
    atenderMensaje({ tipo: "boldo-lado-fuera", ruta: "/configuracion" }, nada);
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe("/configuracion"));
    expect(p.conFoco).toBe("principal");
    expect(p.lado).toBe("x");
    expect(rutaDe("x")).toBe("/directorio");
  });

  it("la ruta del iframe va a quien la sigue; el foco del iframe marca el lado; F6 vuelve al principal", async () => {
    const p = await arrancar();
    const alLlegar = vi.fn();
    atenderMensaje({ tipo: "boldo-lado-ruta", ruta: "/revision" }, alLlegar);
    expect(alLlegar).toHaveBeenCalledWith("/revision");
    atenderMensaje({ tipo: "boldo-lado-foco" }, nada);
    expect(p.conFoco).toBe("lado");
    atenderMensaje({ tipo: "boldo-lado-tecla", tecla: "F6" }, nada);
    expect(p.conFoco).toBe("principal");
  });

  it("los atajos que el iframe le pasa actúan como con el foco al lado", async () => {
    const p = await arrancar();
    useOrganizaciones().lista = [org("A"), org("B")];
    atenderMensaje({ tipo: "boldo-lado-tecla", tecla: "paleta" }, nada);
    expect(paletaAbierta.value).toBe(true);
    expect(p.conFoco).toBe("lado");

    p.enfocarPanel("principal");
    atenderMensaje({ tipo: "boldo-lado-tecla", tecla: "pestanaSiguiente" }, nada);
    expect(p.lado).toBe("y");
    atenderMensaje({ tipo: "boldo-lado-tecla", tecla: "pestanaAnterior" }, nada);
    expect(p.lado).toBe("x");
    expect(p.activa).toBe("a");

    // Ctrl+T: una nueva de B, al lado; la abierta sigue siendo A.
    atenderMensaje({ tipo: "boldo-lado-tecla", tecla: "nuevaPestana" }, nada);
    expect(p.lista.find((x) => x.id === p.lado)).toMatchObject({ org: "B", ruta: "/" });
    expect(p.lista).toHaveLength(4);
    expect(p.activa).toBe("a");

    // Ctrl+W: cierra la de al lado, y con ella la vista dividida.
    const nueva = p.lado;
    atenderMensaje({ tipo: "boldo-lado-tecla", tecla: "cerrarPestana" }, nada);
    expect(p.lista.some((x) => x.id === nueva)).toBe(false);
    expect(p.lado).toBeNull();
    expect(p.activa).toBe("a");
  });
});

describe("useLadoOtra", () => {
  beforeEach(() => vi.useFakeTimers());

  it("copia la otra, arma el iframe en la ruta de la pestaña y al irse la suelta", async () => {
    const p = await arrancar();
    const { lado, app } = montar();
    expect(lado.estado.value).toBe("copiando");
    await esperar();
    expect(cliente.ladoAbrir).toHaveBeenCalledWith("B");
    expect(lado.estado.value).toBe("listo");
    expect(lado.src.value).toBe("/index.html?lado=B#/directorio");
    expect(lado.nombre.value).toBe("Org B");

    // Lo que el iframe dice, solo si viene de él; y no se le vuelve a pedir.
    delIframe({ tipo: "boldo-lado-ruta", ruta: "/revision" }, {});
    await vi.advanceTimersByTimeAsync(0);
    expect(rutaDe("x")).toBe("/directorio");
    delIframe({ tipo: "boldo-lado-ruta", ruta: "/revision" });
    await vi.advanceTimersByTimeAsync(0);
    expect(rutaDe("x")).toBe("/revision");
    expect(marco.postMessage).not.toHaveBeenCalled();
    expect(p.activa).toBe("a");

    app.unmount();
    expect(cliente.ladoCerrar).toHaveBeenCalledTimes(1);
    expect(escuchas).toHaveLength(0);
    expect(routerDel("lado")).toBe(router); // sin el suyo, el principal
  });

  it("menu_lateral_y_paleta_con_foco_en_la_otra_navegan_en_el_iframe", async () => {
    const p = await arrancar();
    montar();
    await esperar();
    p.enfocarPanel("lado");
    // El menú lateral marca la vista que muestra el iframe.
    expect(esRutaConFoco("/directorio")).toBe(true);
    expect(esRutaConFoco("/")).toBe(false);

    await irConFoco("/revision");
    expect(marco.postMessage).toHaveBeenCalledWith({ tipo: "boldo-lado-ir", ruta: "/revision" }, ORIGEN);
    expect(rutaDe("x")).toBe("/revision");
    expect(esRutaConFoco("/revision")).toBe(true);
    expect(router.currentRoute.value.fullPath).toBe("/");
    expect(p.conFoco).toBe("lado");
    // Cuando el iframe dice que llegó, no se le pide de nuevo.
    delIframe({ tipo: "boldo-lado-ruta", ruta: "/revision" });
    await vi.advanceTimersByTimeAsync(0);
    expect(marco.postMessage).toHaveBeenCalledTimes(1);

    // Lo que no se ve al lado se abre en el principal, que pasa a tener el foco.
    for (const ruta of ["/importar-exportar", "/configuracion"]) {
      p.enfocarPanel("lado");
      await irConFoco(ruta);
      await vi.advanceTimersByTimeAsync(0);
      expect(router.currentRoute.value.fullPath).toBe(ruta);
      expect(p.conFoco).toBe("principal");
    }
    expect(marco.postMessage).toHaveBeenCalledTimes(1);
    expect(rutaDe("x")).toBe("/revision");
  });

  it("al pasar rápido por varias pestañas de otra organización, solo copia la última", async () => {
    await arrancar();
    for (const id of ["x", "y"]) {
      const { app } = montar(id);
      await vi.advanceTimersByTimeAsync(ESPERA_COPIA / 3);
      app.unmount();
    }
    await esperar();
    expect(cliente.ladoAbrir).not.toHaveBeenCalled();
    montar("x");
    await vi.advanceTimersByTimeAsync(ESPERA_COPIA - 1);
    expect(cliente.ladoAbrir).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(cliente.ladoAbrir).toHaveBeenCalledTimes(1);
  });

  it("desde Configuración abre la vista a la que vuelve; sin ella, el Árbol", async () => {
    await arrancar({ ruta: "/configuracion", volver: "/revision" });
    const { lado } = montar();
    await esperar();
    expect(lado.src.value).toBe("/index.html?lado=B#/revision");
  });

  it("sin memoria pregunta: «Abrir igual» la muestra aunque el diálogo se cierre antes de su clic", async () => {
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
      // El orden de reka: AlertDialogAction cierra el diálogo y después corre su @click.
      lado.alCerrarPregunta();
      lado.abrirIgual();
      await vi.advanceTimersByTimeAsync(0);
      expect(p.lado).toBe("x");
      expect(lado.estado.value).toBe("listo");
      expect(lado.src.value).toBe("/index.html?lado=B#/directorio");

      // «No» o Esc: el diálogo se cierra sin elegir, y la vista dividida también.
      ({ lado } = montar());
      await esperar();
      lado.alCerrarPregunta();
      await vi.advanceTimersByTimeAsync(0);
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
