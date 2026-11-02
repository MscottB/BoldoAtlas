import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter, type Router } from "vue-router";
import type { Unidad } from "@/db/tipos";
import { i18n } from "@/i18n";
import { fijarBase } from "@/lib/baseActiva";
import { useOrganizacion } from "@/stores/organizacion";
import { MAX_PESTANAS } from "./pestanas";
import { usePestanas } from "./usePestanas";

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
  router = nuevoRouter();
});
afterEach(() => vi.unstubAllGlobals());

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

  it("«Volver» desde la Bienvenida vuelve a la vista activa sin cambiar sus pestañas", async () => {
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
    expect(rutaActual()).toBe("/directorio");
    expect(p.activa).toBe("b");
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

  it("volver al proyecto con una vista de paso abierta llega a donde estaba antes de abrirla, o al árbol", async () => {
    const p = await arrancar();
    await router.push("/directorio");
    await router.push("/ayuda");
    await router.push("/bienvenida");
    await p.volverAlProyecto();
    expect(rutaActual()).toBe("/directorio");
    expect(rutas()).toEqual(["/directorio"]);

    p.abrirNueva("/ayuda"); // sin vista anterior en esa pestaña
    await esperar();
    await router.push("/bienvenida");
    await p.volverAlProyecto();
    expect(rutaActual()).toBe("/");
    expect(rutas()).toEqual(["/directorio", "/"]);
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
