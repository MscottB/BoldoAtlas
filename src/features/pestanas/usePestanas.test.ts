import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter, type Router } from "vue-router";
import type { Unidad } from "@/db/tipos";
import { useOrganizacion } from "@/stores/organizacion";
import { MAX_PESTANAS } from "./pestanas";
import { usePestanas } from "./usePestanas";

const vacio = { render: () => null };
const nuevoRouter = () =>
  createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", name: "arbol", component: vacio },
      { path: "/directorio", name: "directorio", component: vacio },
      { path: "/revision", name: "revision", component: vacio },
      { path: "/bienvenida", name: "bienvenida", component: vacio, meta: { sinMarco: true } },
    ],
  });

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
const esperar = () => new Promise((r) => setTimeout(r));

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
});
