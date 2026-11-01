import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter, type Router } from "vue-router";
import type { Trabajador, Unidad } from "@/db/tipos";
import { usePestanas } from "@/features/pestanas/usePestanas";
import { useOrganizacion } from "@/stores/organizacion";
import { useRecientes } from "./useRecientes";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(() => Promise.resolve()) }));
const { importarReemplazar } = await import("@/db/cliente");

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
      { path: "/ayuda/:pagina?", name: "ayuda", component: vacio },
      { path: "/acerca", name: "acerca", component: vacio },
      { path: "/bienvenida", name: "bienvenida", component: vacio, meta: { sinMarco: true } },
    ],
  });

const PROYECTO = "C:/datos/boldo.db";
const CLAVE = `boldo:recientes:${PROYECTO}`;
let datos: Map<string, string>;
let router: Router;
const guardadas = () => JSON.parse(datos.get(CLAVE) ?? "null") as { ruta: string }[] | null;

beforeEach(() => {
  datos = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => datos.set(k, v),
  });
  vi.stubGlobal("document", { activeElement: null, body: {}, getElementById: () => null });
  setActivePinia(createPinia());
  const org = useOrganizacion();
  org.unidades = [{ id: "u1", nombre: "Finanzas", parent_id: null } as Unidad];
  org.trabajadores = [{ id: "t1", nombre: "Ana" } as Trabajador];
  router = nuevoRouter();
});
afterEach(() => vi.unstubAllGlobals());

function conectar() {
  const pestanas = usePestanas();
  pestanas.conectar(router, PROYECTO);
  const r = useRecientes();
  r.conectar(router, PROYECTO, pestanas.valida);
  return { pestanas, r };
}
const rutas = () => useRecientes().visibles.map((x) => x.ruta);

describe("useRecientes", () => {
  it("registra al navegar, lo último primero y sin repetidos, y lo guarda por proyecto", async () => {
    conectar();
    await router.push("/directorio");
    await router.push("/?raiz=u1");
    await router.push("/directorio");
    expect(rutas()).toEqual(["/directorio", "/?raiz=u1"]);
    expect(guardadas()?.map((x) => x.ruta)).toEqual(["/directorio", "/?raiz=u1"]);
  });

  it("no registra Inicio, Configuración, Ayuda, Acerca de ni Importar/Exportar", async () => {
    conectar();
    for (const ruta of ["/bienvenida", "/configuracion", "/ayuda", "/acerca", "/importar-exportar"])
      await router.push(ruta);
    expect(rutas()).toEqual([]);
    await router.push("/revision");
    expect(rutas()).toEqual(["/revision"]);
  });

  it("no registra una unidad o persona que no existe", async () => {
    conectar();
    await router.push("/?raiz=borrada");
    await router.push("/directorio?persona=nadie");
    expect(rutas()).toEqual([]);
    await router.push("/directorio?persona=t1");
    expect(rutas()).toEqual(["/directorio?persona=t1"]);
  });

  it("guarda a lo más 8", async () => {
    conectar();
    useOrganizacion().unidades = Array.from(
      { length: 10 },
      (_, i) => ({ id: `u${i}`, parent_id: null }) as Unidad,
    );
    for (let i = 0; i < 10; i++) await router.push(`/?raiz=u${i}`);
    expect(rutas()).toHaveLength(8);
    expect(rutas()[0]).toBe("/?raiz=u9");
  });

  it("al leer descarta lo que ya no existe, y una unidad eliminada después deja de ofrecerse", async () => {
    datos.set(
      CLAVE,
      JSON.stringify([
        { ruta: "/?raiz=borrada", en: 3 },
        { ruta: "/?raiz=u1", en: 2 },
        { ruta: "/directorio?persona=t1", en: 1 },
      ]),
    );
    conectar();
    expect(rutas()).toEqual(["/?raiz=u1", "/directorio?persona=t1"]);
    expect(guardadas()).toHaveLength(2);
    useOrganizacion().unidades = []; // se elimina la unidad
    expect(rutas()).toEqual(["/directorio?persona=t1"]);
    useRecientes().depurar();
    expect(guardadas()?.map((x) => x.ruta)).toEqual(["/directorio?persona=t1"]);
  });

  it("«Borrar lista» la vacía, también en lo guardado", async () => {
    const { r } = conectar();
    await router.push("/revision");
    r.vaciar();
    expect(rutas()).toEqual([]);
    expect(guardadas()).toEqual([]);
  });

  it("reemplazar la base al importar la vacía", async () => {
    conectar();
    await router.push("/revision");
    await importarReemplazar("trabajo");
    expect(rutas()).toEqual([]);
  });

  it("abrir uno desde Inicio activa la pestaña que ya lo muestra y «Volver» sigue en ella", async () => {
    datos.set(
      `boldo:pestanas:${PROYECTO}`,
      JSON.stringify({
        lista: [
          { id: "a", ruta: "/" },
          { id: "b", ruta: "/directorio" },
        ],
        activa: "b",
      }),
    );
    const { pestanas } = conectar();
    await router.replace("/bienvenida");
    await router.push("/"); // un reciente que la pestaña «a» ya muestra
    expect(pestanas.activa).toBe("a");
    expect(pestanas.lista.map((p) => p.ruta)).toEqual(["/", "/directorio"]);
    await router.push("/bienvenida");
    await pestanas.volverAlProyecto();
    expect(pestanas.activa).toBe("a");
    expect(router.currentRoute.value.fullPath).toBe("/");
  });

  it("abrir uno que ninguna pestaña muestra lo deja en la activa, sin crear otra", async () => {
    datos.set(
      `boldo:pestanas:${PROYECTO}`,
      JSON.stringify({
        lista: [
          { id: "a", ruta: "/" },
          { id: "b", ruta: "/directorio" },
        ],
        activa: "b",
      }),
    );
    const { pestanas } = conectar();
    await router.replace("/bienvenida");
    await router.push("/revision");
    expect(pestanas.activa).toBe("b");
    expect(pestanas.lista.map((p) => p.ruta)).toEqual(["/", "/revision"]);
  });
});
