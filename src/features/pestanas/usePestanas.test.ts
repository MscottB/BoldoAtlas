import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { createRenderer } from "vue";
import { createMemoryHistory, createRouter, routeLocationKey, type Router } from "vue-router";
import type { Unidad } from "@/db/tipos";
import { i18n } from "@/i18n";
import { fijarBase } from "@/lib/baseActiva";
import { useOrganizacion } from "@/stores/organizacion";
import { useOrganizaciones } from "@/stores/organizaciones";
import { PANEL, usePanel } from "./panel";
import { MAX_PESTANAS } from "./pestanas";
import { GRUPOS_MENU, irAEntrada } from "@/features/proyecto/menuApp";
import { esRutaConFoco, irConFoco, registrarRouter, routerConFoco } from "./routerConFoco";
import { MARCA_DIVIDIR, useEstadoPestana, usePestanas } from "./usePestanas";

// Sin DOM: un renderer que no dibuja nada, para que un componente se monte y desmonte (onMounted, onBeforeUnmount).
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
// `lenta`: las vistas se cargan con demora, como las importadas en diferido del router real.
const nuevoRouter = (lenta = false) => {
  const vista = lenta ? () => new Promise<typeof vacio>((r) => setTimeout(() => r(vacio), 20)) : vacio;
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", name: "arbol", component: vacio },
      { path: "/directorio", name: "directorio", component: vista },
      { path: "/revision", name: "revision", component: vista },
      { path: "/configuracion", name: "configuracion", component: vacio },
      { path: "/ayuda/:pagina?", name: "ayuda", component: vacio },
      { path: "/acerca", name: "acerca", component: vacio },
      { path: "/importar-exportar", name: "importarExportar", component: vacio },
      { path: "/bienvenida", name: "bienvenida", component: vacio, meta: { sinMarco: true } },
    ],
  });
};

const CLAVE = "boldo:pestanas:C:/datos";
const ANTIGUA = "boldo:pestanas:C:/datos/boldo.db";
let datos: Map<string, string>;
let router: Router;
const guardadas = () => JSON.parse(datos.get(CLAVE) ?? "null");
const rutas = () => usePestanas().lista.map((p) => p.ruta);

beforeEach(async () => {
  datos = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => datos.set(k, v),
  });
  vi.stubGlobal("document", { activeElement: null, body: {}, getElementById: () => null });
  fijarBase("A");
  setActivePinia(createPinia());
  useOrganizacion().unidades = [{ id: "u1", nombre: "Finanzas", parent_id: null } as Unidad];
  useOrganizacion().cargado = true;
  router = nuevoRouter();
});
// Los routers que una prueba registra para `routerConFoco`: se quitan al terminar, para no pasar a la siguiente.
const registrados: (() => void)[] = [];
const registrar = (...args: Parameters<typeof registrarRouter>) => {
  const quitar = registrarRouter(...args);
  registrados.push(quitar);
  return quitar;
};
afterEach(() => {
  registrados.splice(0).forEach((quitar) => quitar());
  vi.unstubAllGlobals();
});

async function arrancar(guardado?: unknown) {
  if (guardado) datos.set(CLAVE, JSON.stringify(guardado));
  const p = usePestanas();
  p.conectar(router, "C:/datos", "C:/datos/boldo.db");
  await router.replace(p.entrar());
  return p;
}
const esperar = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const rutaActual = () => router.currentRoute.value.fullPath;

describe("usePestanas", () => {
  it("volver con Ctrl+Tab no toca la ruta de la pestaña", async () => {
    const p = await arrancar();
    p.abrirNueva("/importar-exportar");
    await esperar();
    p.abrirNueva("/?raiz=u1");
    await esperar();
    useOrganizacion().unidades = []; // se eliminó, y Ctrl+Z aún la puede recuperar
    expect(rutaActual()).toBe("/?raiz=u1");
    p.siguiente(-1);
    await esperar();
    expect(rutaActual()).toBe("/importar-exportar");
    p.siguiente(1);
    await esperar();
    expect(rutaActual()).toBe("/?raiz=u1");
    expect(rutas()).toEqual(["/", "/importar-exportar", "/?raiz=u1"]);
  });

  it("al entrar descarta lo que ya no existe y abre en la activa guardada", async () => {
    const p = await arrancar({
      lista: [
        { id: "a", ruta: "/" },
        { id: "b", ruta: "/?raiz=borrada" },
        { id: "c", ruta: "/directorio" },
        { id: "d", ruta: "/bienvenida" },
      ],
      activa: "c",
    });
    expect(rutas()).toEqual(["/", "/directorio"]);
    expect(p.activa).toBe("c");
    expect(router.currentRoute.value.fullPath).toBe("/directorio");
  });

  it("navegar dentro de la pestaña cambia su ruta, y se guarda", async () => {
    const p = await arrancar();
    await router.push("/revision");
    expect(rutas()).toEqual(["/revision"]);
    expect(guardadas()).toMatchObject({ lista: [{ ruta: "/revision" }], activa: p.activa });
  });

  it("abrir en pestaña nueva la deja activa en su ruta; con el tope no abre", async () => {
    const p = await arrancar();
    const primera = p.activa;
    expect(p.abrirNueva({ name: "arbol", query: { raiz: "u1" } }).ok).toBe(true);
    await esperar();
    expect(rutas()).toEqual(["/", "/?raiz=u1"]);
    expect(p.activa).not.toBe(primera);
    expect(router.currentRoute.value.fullPath).toBe("/?raiz=u1");
    expect(p.titulo(p.lista[1]!)).toBe("Finanzas");

    for (let i = 2; i < MAX_PESTANAS; i++) p.abrirNueva("/");
    await esperar();
    expect(p.lista).toHaveLength(MAX_PESTANAS);
    expect(p.abrirNueva("/").ok).toBe(false);
    expect(p.lista).toHaveLength(MAX_PESTANAS);
  });

  it("«Volver» desde la Bienvenida va al Árbol sin cambiar sus pestañas", async () => {
    const guardado = {
      lista: [
        { id: "a", ruta: "/" },
        { id: "b", ruta: "/directorio" },
      ],
      activa: "b",
    };
    datos.set(CLAVE, JSON.stringify(guardado));
    const p = usePestanas();
    p.conectar(router, "C:/datos", "C:/datos/boldo.db");
    await router.replace("/bienvenida"); // al abrir en Inicio aún no se leyeron las pestañas
    await p.volverAlProyecto();
    expect(rutaActual()).toBe("/");
    expect(p.activa).toBe("a");
    expect(rutas()).toEqual(["/", "/directorio"]);
  });

  it("«Volver» con dos pestañas en la misma ruta se queda en la activa", async () => {
    datos.set(
      CLAVE,
      JSON.stringify({
        lista: [
          { id: "a", ruta: "/" },
          { id: "b", ruta: "/" },
        ],
        activa: "b",
      }),
    );
    const p = usePestanas();
    p.conectar(router, "C:/datos", "C:/datos/boldo.db");
    await router.replace("/bienvenida");
    await p.volverAlProyecto();
    expect(p.activa).toBe("b");
    expect(rutaActual()).toBe("/");
  });

  it("Configuración abierta desde la Bienvenida no le quita su ruta a la pestaña: «Cerrar» vuelve a ella", async () => {
    datos.set(CLAVE, JSON.stringify({ lista: [{ id: "b", ruta: "/directorio" }], activa: "b" }));
    const p = usePestanas();
    p.conectar(router, "C:/datos", "C:/datos/boldo.db");
    await router.replace("/bienvenida");
    await router.push("/configuracion");
    await p.cerrarVista();
    expect(rutaActual()).toBe("/directorio");
    expect(rutas()).toEqual(["/directorio"]);
  });

  it("Acerca de abierto desde Inicio: «Cerrar» vuelve a Inicio, solo esa vez", async () => {
    datos.set(CLAVE, JSON.stringify({ lista: [{ id: "b", ruta: "/directorio" }], activa: "b" }));
    const p = usePestanas();
    p.conectar(router, "C:/datos", "C:/datos/boldo.db");
    await router.replace("/bienvenida");
    await router.push("/acerca");
    await p.cerrarVista();
    expect(rutaActual()).toBe("/bienvenida");

    await router.push("/configuracion");
    await p.cerrarVista();
    expect(rutaActual()).toBe("/directorio");
    expect(rutas()).toEqual(["/directorio"]);
  });

  it("la Bienvenida no se abre en una pestaña", async () => {
    const p = await arrancar();
    expect(p.abrirNueva("/bienvenida").ok).toBe(false);
    expect(p.lista).toHaveLength(1);
  });

  it("cambiar a otra pestaña con la misma ruta igual la activa", async () => {
    const p = await arrancar();
    const primera = p.activa;
    p.abrirNueva("/");
    await esperar();
    const segunda = p.activa;
    expect(segunda).not.toBe(primera);
    p.activar(primera);
    await esperar();
    expect(p.activa).toBe(primera);
    p.siguiente(1);
    await esperar();
    expect(p.activa).toBe(segunda);
  });

  it("cerrar la activa pasa a la vecina y navega a su ruta; la última no se cierra", async () => {
    const p = await arrancar();
    await router.push("/directorio");
    p.abrirNueva("/revision");
    await esperar();
    expect(p.cerrar(p.activa).ok).toBe(true);
    await esperar();
    expect(rutas()).toEqual(["/directorio"]);
    expect(router.currentRoute.value.fullPath).toBe("/directorio");
    expect(p.activa).toBe(p.lista[0]!.id);
    expect(p.cerrar(p.activa).ok).toBe(false);
    expect(p.lista).toHaveLength(1);
  });

  it("el estado de la vista se guarda por pestaña y ruta", async () => {
    const p = await arrancar();
    p.guardarEstado(p.activa, "/", { colapsados: ["u1"] });
    expect(p.estadoDe(p.activa, "/")).toEqual({ colapsados: ["u1"] });
    expect(p.estadoDe(p.activa, "/directorio")).toBeUndefined();
    expect(guardadas().lista[0].estado).toEqual({ ruta: "/", datos: { colapsados: ["u1"] } });
  });

  it("al volver de la Bienvenida recarga y valida las pestañas, y activa la que muestra el destino", async () => {
    const p = await arrancar();
    p.abrirNueva({ name: "arbol", query: { raiz: "u1" } });
    await esperar();
    p.abrirNueva("/directorio");
    await esperar();
    await router.push("/bienvenida");
    useOrganizacion().unidades = []; // p. ej. se reemplazó la organización
    await router.replace("/");
    expect(rutas()).toEqual(["/", "/directorio"]);
    expect(p.activa).toBe(p.lista[0]!.id);
  });

  it("volver al proyecto con una vista de paso abierta va al Árbol y no cierra la de paso", async () => {
    const p = await arrancar();
    await router.push("/directorio");
    await router.push("/ayuda");
    await router.push("/bienvenida");
    await p.volverAlProyecto();
    expect(rutaActual()).toBe("/");
    expect(rutas()).toEqual(["/ayuda", "/"]);

    p.abrirNueva("/ayuda"); // sin vista anterior en esa pestaña
    await esperar();
    await router.push("/bienvenida");
    await p.volverAlProyecto();
    expect(rutaActual()).toBe("/"); // ya hay una del Árbol: no abre otra
    expect(rutas()).toEqual(["/ayuda", "/", "/ayuda"]);
  });

  it("cerrar Ayuda abierta en una pestaña nueva vuelve al inicio de esa pestaña, nunca a una ruta de otra", async () => {
    const p = await arrancar();
    const a = p.activa;
    await router.push("/directorio"); // la historia de A: / → /directorio
    p.abrirNueva("/ayuda"); // Ctrl+clic en «Ayuda»
    await esperar();
    const b = p.activa;
    expect(b).not.toBe(a);
    await p.cerrarVista();
    expect(rutaActual()).toBe("/");
    expect(p.activa).toBe(b);
    expect(rutas()).toEqual(["/directorio", "/"]);
  });

  it("cerrar una vista abierta dentro de la pestaña vuelve a donde estaba, también tras pasar por otras pestañas", async () => {
    const p = await arrancar();
    const a = p.activa;
    await router.push("/directorio");
    await router.push("/configuracion");
    p.abrirNueva("/revision");
    await esperar();
    await router.push("/ayuda"); // en B
    p.activar(a);
    await esperar();
    expect(rutaActual()).toBe("/configuracion");
    await router.push("/ayuda/atajos"); // de una cerrable a otra: se conserva la vuelta
    await p.cerrarVista();
    expect(rutaActual()).toBe("/directorio");
    expect(p.activa).toBe(a);
    p.siguiente(1);
    await esperar();
    await p.cerrarVista();
    expect(rutaActual()).toBe("/revision");
  });

  it("dos Ctrl+Tab seguidos con vistas que aún cargan: cada pestaña conserva su ruta", async () => {
    router = nuevoRouter(true);
    const p = await arrancar({
      lista: [
        { id: "a", ruta: "/" },
        { id: "b", ruta: "/directorio" },
        { id: "c", ruta: "/revision" },
      ],
      activa: "a",
    });
    p.siguiente(1);
    p.siguiente(1); // la primera navegación queda cancelada por esta
    await esperar(80);
    expect(p.activa).toBe("c");
    expect(rutaActual()).toBe("/revision");
    expect(rutas()).toEqual(["/", "/directorio", "/revision"]);
  });
});

describe("usePestanas con varias organizaciones", () => {
  it("una pestaña guardada sin `org` queda de la organización actual", async () => {
    const p = await arrancar({ lista: [{ id: "a", ruta: "/" }], activa: "a" });
    expect(p.lista[0]!.org).toBe("A");
    expect(guardadas().lista[0].org).toBe("A");
  });

  it("las pestañas de otra organización no se descartan por unidades que aquí no existen", async () => {
    const p = await arrancar({
      lista: [
        { id: "a", org: "A", ruta: "/" },
        { id: "b", org: "B", ruta: "/?raiz=x" },
        { id: "c", org: "A", ruta: "/?raiz=x" },
        { id: "d", org: "B", ruta: "/bienvenida" }, // la vista sí se mira
      ],
      activa: "a",
    });
    expect(p.lista.map((x) => x.id)).toEqual(["a", "b"]);
    expect(p.valida("/?raiz=x")).toBe(false);
    expect(p.valida("/?raiz=x", "B")).toBe(true);
    expect(p.valida("/?raiz=u1")).toBe(true);
  });

  it("lee la clave antigua si no hay nueva, le pone `org` y no borra la antigua", async () => {
    const antigua = JSON.stringify({
      lista: [
        { id: "a", ruta: "/" },
        { id: "b", ruta: "/directorio" },
      ],
      activa: "b",
    });
    datos.set(ANTIGUA, antigua);
    const p = await arrancar();
    expect(p.activa).toBe("b");
    expect(rutas()).toEqual(["/", "/directorio"]);
    expect(guardadas().lista.map((x: { org: string }) => x.org)).toEqual(["A", "A"]);
    await router.push("/revision");
    expect(guardadas().lista[1].ruta).toBe("/revision");
    expect(datos.get(ANTIGUA)).toBe(antigua);
  });

  it("la migración ocurre al conectar, sin validar, y no depende de qué organización se abra después", async () => {
    const antigua = JSON.stringify({
      lista: [
        { id: "a", ruta: "/?raiz=otra" },
        { id: "b", ruta: "/directorio" },
      ],
      activa: "a",
    });
    datos.set(ANTIGUA, antigua);
    const p = usePestanas();
    p.conectar(router, "C:/datos", "C:/datos/boldo.db");
    const migradas = datos.get(CLAVE);
    expect(guardadas().lista).toMatchObject([
      { id: "a", org: "A", ruta: "/?raiz=otra" },
      { id: "b", org: "A", ruta: "/directorio" },
    ]);
    fijarBase("B");
    expect(datos.get(CLAVE)).toBe(migradas);
    await router.replace(p.entrar());
    expect(p.lista.filter((x) => x.org === "A").map((x) => x.id)).toEqual(["a", "b"]);
    expect(p.lista.find((x) => x.id === p.activa)!.org).toBe("B");
    expect(datos.get(ANTIGUA)).toBe(antigua);
  });

  it("JSON roto en la clave nueva cae a la antigua", async () => {
    datos.set(CLAVE, "{roto");
    datos.set(ANTIGUA, JSON.stringify({ lista: [{ id: "x", ruta: "/revision" }], activa: "x" }));
    const p = await arrancar();
    expect(p.lista).toMatchObject([{ id: "x", org: "A", ruta: "/revision" }]);
    expect(guardadas().activa).toBe("x");
  });

  it("con la clave nueva, la antigua no se mira", async () => {
    datos.set(ANTIGUA, JSON.stringify({ lista: [{ id: "x", ruta: "/revision" }], activa: "x" }));
    const p = await arrancar({ lista: [{ id: "a", org: "A", ruta: "/directorio" }], activa: "a" });
    expect(p.lista.map((x) => x.id)).toEqual(["a"]);
    expect(rutas()).toEqual(["/directorio"]);
  });

  it("si la activa guardada es de otra organización, `entrar` pasa a una de la abierta", async () => {
    const p = await arrancar({
      lista: [
        { id: "a", org: "B", ruta: "/directorio" },
        { id: "b", org: "A", ruta: "/revision" },
      ],
      activa: "a",
    });
    expect(p.activa).toBe("b");
    expect(rutaActual()).toBe("/revision");
    expect(p.lista).toHaveLength(2);
  });

  it("si la activa guardada es de otra organización y no hay de la abierta, `entrar` abre una en `/`", async () => {
    const p = await arrancar({ lista: [{ id: "a", org: "B", ruta: "/directorio" }], activa: "a" });
    expect(p.activa).not.toBe("a");
    expect(p.lista.find((x) => x.id === p.activa)).toMatchObject({ org: "A", ruta: "/" });
    expect(p.lista.find((x) => x.id === "a")).toMatchObject({ org: "B", ruta: "/directorio" });
    expect(rutaActual()).toBe("/");
  });

  it("con el tope lleno de otra organización, `entrar` igual abre una de la abierta sin perder ninguna", async () => {
    const lista = Array.from({ length: MAX_PESTANAS }, (_, i) => ({ id: `p${i}`, org: "B", ruta: "/" }));
    const p = await arrancar({ lista, activa: "p0" });
    expect(p.lista).toHaveLength(MAX_PESTANAS + 1);
    expect(p.lista.find((x) => x.id === p.activa)!.org).toBe("A");
    expect(p.lista.filter((x) => x.org === "B")).toHaveLength(MAX_PESTANAS);
  });

  it("la 13.ª se relee sin perder ninguna, aunque esté al frente o haya navegado", async () => {
    const lista = Array.from({ length: MAX_PESTANAS }, (_, i) => ({ id: `p${i}`, org: "B", ruta: "/" }));
    const ultima = { ...lista[MAX_PESTANAS - 1]!, estado: { ruta: "/", datos: { x: 1 } } };
    const p = await arrancar({ lista: [...lista.slice(0, -1), ultima], activa: "p0" });
    const nueva = p.activa;
    p.mover(nueva, 0);
    await router.push("/directorio");
    await router.push("/bienvenida");
    await p.volverAlProyecto();
    expect(p.activa).toBe(nueva);
    expect(p.lista[0]).toMatchObject({ id: nueva, org: "A", ruta: "/directorio" });
    expect(p.lista.filter((x) => x.org === "B")).toHaveLength(MAX_PESTANAS);
    expect(p.estadoDe(`p${MAX_PESTANAS - 1}`, "/")).toEqual({ x: 1 });
    expect(p.abrirNueva("/").ok).toBe(false);
  });

  it("«Volver» con solo pestañas de otra organización deja una sola de la abierta", async () => {
    datos.set(CLAVE, JSON.stringify({ lista: [{ id: "a", org: "B", ruta: "/directorio" }], activa: "a" }));
    const p = usePestanas();
    p.conectar(router, "C:/datos", "C:/datos/boldo.db");
    await router.replace("/bienvenida");
    await p.volverAlProyecto();
    expect(p.lista.filter((x) => x.org === "A")).toHaveLength(1);
    expect(p.lista).toHaveLength(2);
    expect(rutaActual()).toBe("/");
  });

  it("al volver de la Bienvenida no activa una pestaña de otra organización con la misma ruta", async () => {
    datos.set(
      CLAVE,
      JSON.stringify({
        lista: [
          { id: "a", org: "B", ruta: "/" },
          { id: "b", org: "A", ruta: "/directorio" },
        ],
        activa: "b",
      }),
    );
    const p = usePestanas();
    p.conectar(router, "C:/datos", "C:/datos/boldo.db");
    await router.replace("/bienvenida");
    await router.replace("/");
    expect(p.activa).toBe("b");
    expect(p.lista.find((x) => x.id === "a")).toMatchObject({ org: "B", ruta: "/" });
    expect(p.lista.find((x) => x.id === "b")).toMatchObject({ org: "A", ruta: "/" });
  });

  it("el título de una pestaña de otra organización no muestra datos de la abierta", async () => {
    const p = await arrancar();
    const t = i18n.global.t;
    expect(p.titulo({ ruta: "/?raiz=u1", org: "B" })).toBe(t("nav.arbol"));
    expect(p.titulo({ ruta: "/?ver=u1", org: "B" })).toBe(t("nav.arbol"));
    expect(p.titulo({ ruta: "/directorio?unidad=u1", org: "B" })).toBe(t("nav.directorio"));
    expect(p.titulo({ ruta: "/?raiz=u1", org: "A" })).toBe("Finanzas");
    expect(p.titulo({ ruta: "/?raiz=u1" })).toBe("Finanzas");
  });

  it("abrir en pestaña nueva la deja de la organización abierta", async () => {
    const p = await arrancar();
    fijarBase("B");
    p.abrirNueva("/revision");
    await esperar();
    expect(p.lista.map((x) => x.org)).toEqual(["A", "B"]);
  });
});

describe("usePestanas con la vista dividida", () => {
  const tres = (activa: string, lado: string | null) => ({
    lista: [
      { id: "a", org: "A", ruta: "/" },
      { id: "b", org: "A", ruta: "/directorio" },
      { id: "c", org: "A", ruta: "/revision" },
    ],
    activa,
    lado,
  });

  it("dividir abre la misma ruta al lado y otra vez la cierra", async () => {
    const p = await arrancar();
    await router.push("/directorio");
    const activa = p.activa;
    expect(p.dividir().ok).toBe(true);
    expect(p.activa).toBe(activa);
    expect(p.lado).not.toBeNull();
    expect(p.lado).not.toBe(activa);
    expect(rutas()).toEqual(["/directorio", "/directorio"]);
    expect(rutaActual()).toBe("/directorio");

    expect(p.dividir().ok).toBe(true);
    expect(p.lado).toBeNull();
    expect(p.lista).toHaveLength(2); // la de al lado queda en la barra como una más

    for (let i = 2; i < MAX_PESTANAS; i++) p.abrirNueva("/");
    await esperar();
    expect(p.dividir()).toEqual({
      ok: false,
      mensaje: i18n.global.t("pestanas.limite", { n: MAX_PESTANAS }),
    });
    expect(p.lado).toBeNull();
  });

  it("dividir deja la marca desde la que se mide abrir al lado; cerrar o no poder dividir, no", async () => {
    const p = await arrancar();
    const marcas = () => performance.getEntriesByName(MARCA_DIVIDIR, "mark").length;
    performance.clearMarks(MARCA_DIVIDIR);
    expect(p.dividir().ok).toBe(true);
    expect(marcas()).toBe(1);
    performance.clearMarks(MARCA_DIVIDIR);
    expect(p.dividir().ok).toBe(true); // la cierra
    expect(marcas()).toBe(0);
    for (let i = 2; i < MAX_PESTANAS; i++) p.abrirNueva("/");
    await esperar();
    expect(p.dividir().ok).toBe(false);
    expect(marcas()).toBe(0);
  });

  it("con foco al lado, activar cambia solo ese panel: el router principal no navega", async () => {
    const p = await arrancar(tres("a", "b"));
    const replace = vi.spyOn(router, "replace");
    p.enfocarPanel("lado");
    p.activar("c");
    await esperar();
    expect(p.lado).toBe("c");
    expect(p.activa).toBe("a");
    expect(replace).not.toHaveBeenCalled();
    expect(rutaActual()).toBe("/");
  });

  it("con foco al lado, activar la del principal las intercambia y el principal navega a la otra", async () => {
    const p = await arrancar(tres("a", "b"));
    p.enfocarPanel("lado");
    p.activar("a");
    await esperar();
    expect(p.activa).toBe("b");
    expect(p.lado).toBe("a");
    expect(rutaActual()).toBe("/directorio");
  });

  it("Ctrl+W con foco al lado cierra esa y la división", async () => {
    const p = await arrancar(tres("a", "b"));
    const replace = vi.spyOn(router, "replace");
    p.enfocarPanel("lado");
    expect(p.cerrar().ok).toBe(true);
    await esperar();
    expect(p.lista.map((x) => x.id)).toEqual(["a", "c"]);
    expect(p.lado).toBeNull();
    expect(p.activa).toBe("a");
    expect(p.conFoco).toBe("principal");
    expect(replace).not.toHaveBeenCalled();
  });

  it("la X de la activa con foco al lado cierra la activa, no la de al lado", async () => {
    const p = await arrancar(tres("a", "c"));
    p.enfocarPanel("lado");
    expect(p.cerrar("a").ok).toBe(true);
    await esperar();
    expect(p.activa).toBe("b");
    expect(p.lado).toBe("c");
    expect(rutaActual()).toBe("/directorio");
  });

  it("Ctrl+Tab con foco al lado salta la activa", async () => {
    const p = await arrancar(tres("b", "a"));
    p.enfocarPanel("lado");
    p.siguiente(1);
    await esperar();
    expect(p.lado).toBe("c");
    expect(p.activa).toBe("b");
    expect(rutaActual()).toBe("/directorio");
  });

  it("Ctrl+T con foco al lado abre la nueva al lado", async () => {
    const p = await arrancar(tres("a", "b"));
    p.enfocarPanel("lado");
    expect(p.abrirNueva("/revision").ok).toBe(true);
    await esperar();
    expect(p.activa).toBe("a");
    expect(p.lista.find((x) => x.id === p.lado)).toMatchObject({ ruta: "/revision", org: "A" });
    expect(p.lista).toHaveLength(4);
    expect(rutaActual()).toBe("/");
  });

  it("la división se guarda y se lee con las pestañas; el foco no", async () => {
    const p = await arrancar(tres("a", null));
    expect(p.abrirAlLado("b").ok).toBe(true);
    p.orientar("vertical");
    p.proporcion(0.3);
    p.enfocarPanel("lado");
    expect(guardadas()).toMatchObject({
      activa: "a",
      lado: "b",
      division: { orientacion: "vertical", proporcion: 0.3 },
    });
    expect(guardadas()).not.toHaveProperty("conFoco");

    setActivePinia(createPinia());
    router = nuevoRouter();
    const otra = await arrancar();
    expect(otra.lado).toBe("b");
    expect(otra.division).toEqual({ orientacion: "vertical", proporcion: 0.3 });
    expect(otra.conFoco).toBe("principal");
  });

  it("sin vista dividida el foco vuelve al principal y no pasa al lado", async () => {
    const p = await arrancar(tres("a", "b"));
    p.enfocarPanel("lado");
    p.cerrarDivision();
    expect(p.lado).toBeNull();
    expect(p.lista).toHaveLength(3);
    expect(p.conFoco).toBe("principal");
    p.enfocarPanel("lado");
    expect(p.conFoco).toBe("principal");
  });

  it("rutaDelLado cambia la ruta de la pestaña de al lado y no la de la activa", async () => {
    const p = await arrancar(tres("a", "b"));
    p.rutaDelLado("/revision");
    expect(rutas()).toEqual(["/", "/revision", "/revision"]);
  });

  it("abrir al lado la activa: el principal pasa a otra y la activa queda al lado", async () => {
    const p = await arrancar(tres("a", null));
    expect(p.abrirAlLado("a").ok).toBe(true);
    await esperar();
    expect(p.activa).toBe("b");
    expect(p.lado).toBe("a");
    expect(rutaActual()).toBe("/directorio");
  });

  it("una pestaña de otra organización no va al lado", async () => {
    const p = await arrancar({
      lista: [
        { id: "a", org: "A", ruta: "/" },
        { id: "b", org: "A", ruta: "/directorio" },
        { id: "x", org: "B", ruta: "/" },
      ],
      activa: "a",
      lado: "b",
    });
    const activarPestana = vi
      .spyOn(useOrganizaciones(), "activarPestana")
      .mockResolvedValue({ ok: false, mensaje: "" });
    expect(p.abrirAlLado("x")).toEqual({ ok: false, mensaje: i18n.global.t("pestanas.noAbre") });
    expect(p.lado).toBe("b");

    p.enfocarPanel("lado");
    p.activar("x");
    await esperar();
    expect(p.lado).toBe("b");
    expect(p.conFoco).toBe("principal");
    expect(activarPestana).toHaveBeenCalledWith("x"); // como hoy: cambia de organización en el principal
  });

  it("activar sin navegar la de al lado las intercambia: la activa nunca es la de al lado", async () => {
    const p = await arrancar(tres("a", "b"));
    p.marcarActiva("b");
    expect(p.activa).toBe("b");
    expect(p.lado).toBe("a");
  });

  const noAbre = () => ({ ok: false, mensaje: i18n.global.t("pestanas.noAbre") });
  const motivo = { codigo: "fallo", mensaje: "no cargó", detalle: "" };

  it("dividir desde Configuración, Ayuda o Acerca de abre al lado la vista a la que vuelve su «Cerrar»", async () => {
    const p = await arrancar();
    await router.push("/directorio");
    await router.push("/configuracion");
    expect(p.dividir().ok).toBe(true);
    expect(p.lista.find((x) => x.id === p.lado)!.ruta).toBe("/directorio");
    p.cerrarDivision();

    p.abrirNueva("/ayuda"); // sin vista a la que volver
    await esperar();
    expect(p.dividir().ok).toBe(true);
    expect(p.lista.find((x) => x.id === p.lado)!.ruta).toBe("/");
  });

  it("dividir con la activa sin abrir, de otra organización o a medio cambio no abre", async () => {
    const p = await arrancar({
      lista: [...tres("a", null).lista, { id: "x", org: "B", ruta: "/" }],
      activa: "a",
    });
    const organizaciones = useOrganizaciones();
    organizaciones.sinAbrir.set("a", motivo);
    expect(p.dividir()).toEqual(noAbre());
    organizaciones.sinAbrir.delete("a");

    organizaciones.enCurso = true;
    expect(p.dividir()).toEqual(noAbre());
    organizaciones.enCurso = false;

    p.marcarActiva("x");
    expect(p.dividir()).toEqual(noAbre());
    expect(p.lado).toBeNull();
    expect(p.lista).toHaveLength(4);
  });

  it("una pestaña de la abierta con motivo no va al lado", async () => {
    const p = await arrancar(tres("a", null));
    useOrganizaciones().sinAbrir.set("b", motivo);
    expect(p.abrirAlLado("b")).toEqual(noAbre());
    expect(p.lado).toBeNull();
  });

  it("Ctrl+Tab con foco al lado salta las de otra organización y las sin abrir, y sin ninguna no hace nada", async () => {
    const p = await arrancar({
      lista: [
        { id: "a", org: "A", ruta: "/" },
        { id: "b", org: "A", ruta: "/directorio" },
        { id: "x", org: "B", ruta: "/" },
        { id: "m", org: "A", ruta: "/revision" },
        { id: "c", org: "A", ruta: "/revision" },
      ],
      activa: "a",
      lado: "b",
    });
    const activarPestana = vi.spyOn(useOrganizaciones(), "activarPestana");
    useOrganizaciones().sinAbrir.set("m", motivo);
    p.enfocarPanel("lado");
    p.siguiente(1);
    expect(p.lado).toBe("c");
    p.siguiente(1); // da la vuelta saltando la activa
    expect(p.lado).toBe("b");
    p.siguiente(-1);
    expect(p.lado).toBe("c");

    useOrganizaciones().sinAbrir.set("b", motivo); // ya no queda otra que pueda ir al lado
    p.siguiente(1);
    p.siguiente(-1);
    await esperar();
    expect(p.lado).toBe("c");
    expect(p.activa).toBe("a");
    expect(p.conFoco).toBe("lado");
    expect(activarPestana).not.toHaveBeenCalled();
  });

  it("Ctrl+T con foco al lado pone la nueva justo después de la de al lado", async () => {
    const p = await arrancar(tres("a", "c"));
    p.mover("c", 0); // c, a, b
    p.enfocarPanel("lado");
    p.abrirNueva("/revision");
    expect(p.lista.map((x) => x.id).indexOf(p.lado!)).toBe(1);
    expect(p.lista[0]!.id).toBe("c");
    expect(p.lista.slice(2).map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("al entrar con la activa de otra organización, prefiere una de la abierta que no esté al lado", async () => {
    const p = await arrancar({
      lista: [
        { id: "x", org: "B", ruta: "/" },
        { id: "a", org: "A", ruta: "/" },
        { id: "b", org: "A", ruta: "/directorio" },
      ],
      activa: "x",
      lado: "a",
    });
    expect(p.activa).toBe("b");
    expect(p.lado).toBe("a");
  });

  it("al entrar con la activa de otra organización y solo la de al lado de la abierta, esa pasa al principal", async () => {
    const p = await arrancar({
      lista: [
        { id: "x", org: "B", ruta: "/" },
        { id: "a", org: "A", ruta: "/directorio" },
      ],
      activa: "x",
      lado: "a",
    });
    expect(p.activa).toBe("a");
    expect(p.lado).toBeNull();
    expect(rutaActual()).toBe("/directorio");
  });

  it("cerrar la activa cuya vecina es de otra organización y no abre: vuelve a la cerrada y la de al lado sigue", async () => {
    const p = await arrancar({
      lista: [...tres("a", "b").lista.slice(0, 2), { id: "x", org: "B", ruta: "/" }],
      activa: "a",
      lado: "b",
    });
    const organizaciones = useOrganizaciones();
    // Como el cambio real cuando el archivo de la vecina no está: deja el motivo en ella y la marca activa.
    vi.spyOn(organizaciones, "activarPestana").mockImplementation(async (v) => {
      organizaciones.sinAbrir.set(v, { codigo: "no_encontrado", mensaje: "no está", detalle: "" });
      p.marcarActiva(v);
      return { ok: true };
    });
    expect(p.cerrar("a").ok).toBe(true);
    await esperar();
    expect(p.activa).toBe("a");
    expect(p.lado).toBe("b");
    expect(p.lista.map((x) => x.id)).toEqual(["a", "b", "x"]);
  });

  it("paleta_y_menu_lateral_navegan_en_el_panel_con_foco", async () => {
    const p = await arrancar(tres("a", "b"));
    const lado = nuevoRouter();
    registrar("principal", router);
    const quitarLado = registrar("lado", lado);
    expect(routerConFoco()).toBe(router);
    // Fuera de los paneles (la paleta, la ficha, los atajos), el panel es el que tiene el foco.
    expect(usePanel().panel).toBe("principal");
    expect(usePanel().pestana()).toBe("a");

    p.enfocarPanel("lado");
    expect(usePanel().panel).toBe("lado");
    expect(usePanel().pestana()).toBe("b");
    expect(routerConFoco()).toBe(lado);
    expect(routerConFoco("/directorio")).toBe(lado);
    expect(p.conFoco).toBe("lado");

    // Configuración, Ayuda, Acerca de y la Bienvenida no van al lado: al principal, que pasa a tener el foco.
    for (const destino of ["/configuracion", "/ayuda", { name: "acerca" }, "/bienvenida"]) {
      p.enfocarPanel("lado");
      expect(routerConFoco(destino)).toBe(router);
      expect(p.conFoco).toBe("principal");
    }

    // Sin el panel de al lado montado, el principal.
    p.enfocarPanel("lado");
    quitarLado();
    expect(routerConFoco()).toBe(router);
    // Quitar uno que ya no es el registrado no quita el nuevo.
    const otro = nuevoRouter();
    registrar("lado", otro);
    quitarLado();
    expect(routerConFoco()).toBe(otro);
  });

  it("el menú lateral marca la entrada de la vista del panel con foco", async () => {
    const p = await arrancar(tres("a", "b"));
    const lado = nuevoRouter();
    await lado.push("/directorio");
    registrar("principal", router);
    registrar("lado", lado);
    expect(esRutaConFoco("/")).toBe(true);
    expect(esRutaConFoco("/directorio")).toBe(false);
    p.enfocarPanel("lado");
    expect(esRutaConFoco("/directorio")).toBe(true);
    expect(esRutaConFoco("/")).toBe(false);
  });

  it("el menú de la app y la bandeja navegan en el panel con foco; Configuración y Ayuda, en el principal", async () => {
    const p = await arrancar(tres("a", "b"));
    const lado = nuevoRouter();
    await lado.push("/revision");
    registrar("principal", router);
    registrar("lado", lado);
    const entrada = (id: string) => GRUPOS_MENU.flat().find((e) => e.id === id)!;

    p.enfocarPanel("lado");
    await irAEntrada(entrada("boldo"), routerConFoco(entrada("boldo").destino));
    expect(lado.currentRoute.value.fullPath).toBe("/importar-exportar?accion=importar");
    expect(rutaActual()).toBe("/");
    expect(p.conFoco).toBe("lado");

    await irAEntrada(entrada("configuracion"), routerConFoco(entrada("configuracion").destino));
    expect(rutaActual()).toBe("/configuracion");
    expect(p.conFoco).toBe("principal");

    await router.push("/");
    p.enfocarPanel("lado");
    await irConFoco("/ayuda"); // la bandeja
    expect(rutaActual()).toBe("/ayuda");
    expect(p.conFoco).toBe("principal");
  });

  it("el principal en Configuración, Ayuda, Acerca de o la Bienvenida se queda con el foco, llegue por donde llegue", async () => {
    const p = await arrancar(tres("a", "b"));
    for (const ruta of ["/configuracion", "/ayuda", "/acerca"]) {
      await router.push("/");
      p.enfocarPanel("lado");
      await router.push(ruta);
      expect(p.conFoco).toBe("principal");
    }
    await router.push("/");
    p.enfocarPanel("lado");
    await router.push("/directorio");
    expect(p.conFoco).toBe("lado");
  });

  it("menu_de_pestana_abrir_y_quitar_de_al_lado", async () => {
    const p = await arrancar({
      lista: [...tres("a", null).lista, { id: "x", org: "B", ruta: "/" }],
      activa: "a",
    });
    useOrganizaciones().sinAbrir.set("c", motivo);
    // «Abrir al lado» solo en las que pueden ir: de la abierta y sin motivo.
    expect(["a", "b", "c", "x"].map(p.entradaMenu)).toEqual(["abrirAlLado", "abrirAlLado", null, null]);

    expect(p.alternarLado("b").ok).toBe(true);
    expect(p.lado).toBe("b");
    expect(p.entradaMenu("b")).toBe("quitarDeAlLado");
    // «Quitar de al lado»: la pestaña sigue en la barra como una más.
    expect(p.alternarLado("b").ok).toBe(true);
    expect(p.lado).toBeNull();
    expect(p.lista.map((x) => x.id)).toEqual(["a", "b", "c", "x"]);
    expect(p.activa).toBe("a");
  });

  it("el menú no ofrece abrir al lado la activa si el principal no tiene otra de la abierta para mostrar", async () => {
    const p = await arrancar({
      lista: [
        { id: "a", org: "A", ruta: "/" },
        { id: "x", org: "B", ruta: "/" },
      ],
      activa: "a",
    });
    expect(p.entradaMenu("a")).toBeNull();
    expect(p.alternarLado("a")).toEqual(noAbre());
  });

  it("useEstadoPestana guarda en la pestaña de su panel", async () => {
    vi.stubGlobal("window", { addEventListener: () => {}, removeEventListener: () => {} });
    const p = await arrancar(tres("a", "b"));
    const app = sinDom.createApp({
      setup() {
        useEstadoPestana(() => ({ x: 1 }));
        return () => null;
      },
    });
    app.provide(PANEL, { panel: "lado", pestana: () => "b" });
    app.provide(routeLocationKey, router.currentRoute.value);
    app.mount({});
    app.unmount();
    expect(p.estadoDe("b", "/")).toEqual({ x: 1 });
    expect(p.estadoDe("a", "/")).toBeUndefined();
  });
});
