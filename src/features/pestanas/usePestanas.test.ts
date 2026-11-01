import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter, type Router } from "vue-router";
import type { Unidad } from "@/db/tipos";
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
      { path: "/bienvenida", name: "bienvenida", component: vacio, meta: { sinMarco: true } },
    ],
  });
};

let datos: Map<string, string>;
let router: Router;
const guardadas = () => JSON.parse(datos.get("boldo:pestanas:C:/datos/boldo.db") ?? "null");
const rutas = () => usePestanas().lista.map((p) => p.ruta);

beforeEach(async () => {
  datos = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => datos.set(k, v),
  });
  vi.stubGlobal("document", { activeElement: null, body: {}, getElementById: () => null });
  setActivePinia(createPinia());
  useOrganizacion().unidades = [{ id: "u1", nombre: "Finanzas", parent_id: null } as Unidad];
  router = nuevoRouter();
});
afterEach(() => vi.unstubAllGlobals());

async function arrancar(guardado?: unknown) {
  if (guardado) datos.set("boldo:pestanas:C:/datos/boldo.db", JSON.stringify(guardado));
  const p = usePestanas();
  p.conectar(router, "C:/datos/boldo.db");
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
    datos.set("boldo:pestanas:C:/datos/boldo.db", JSON.stringify(guardado));
    const p = usePestanas();
    p.conectar(router, "C:/datos/boldo.db");
    await router.replace("/bienvenida"); // al abrir en Inicio aún no se leyeron las pestañas
    await p.volverAlProyecto();
    expect(rutaActual()).toBe("/directorio");
    expect(p.activa).toBe("b");
    expect(rutas()).toEqual(["/", "/directorio"]);
  });

  it("«Volver» con dos pestañas en la misma ruta se queda en la activa", async () => {
    datos.set(
      "boldo:pestanas:C:/datos/boldo.db",
      JSON.stringify({
        lista: [
          { id: "a", ruta: "/" },
          { id: "b", ruta: "/" },
        ],
        activa: "b",
      }),
    );
    const p = usePestanas();
    p.conectar(router, "C:/datos/boldo.db");
    await router.replace("/bienvenida");
    await p.volverAlProyecto();
    expect(p.activa).toBe("b");
    expect(rutaActual()).toBe("/");
  });

  it("Configuración abierta desde la Bienvenida no le quita su ruta a la pestaña: «Cerrar» vuelve a ella", async () => {
    datos.set(
      "boldo:pestanas:C:/datos/boldo.db",
      JSON.stringify({ lista: [{ id: "b", ruta: "/directorio" }], activa: "b" }),
    );
    const p = usePestanas();
    p.conectar(router, "C:/datos/boldo.db");
    await router.replace("/bienvenida");
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
