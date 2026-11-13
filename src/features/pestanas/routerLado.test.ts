import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter, type Router } from "vue-router";
import type { Unidad } from "@/db/tipos";
import { fijarBase } from "@/lib/baseActiva";
import { useOrganizacion } from "@/stores/organizacion";
import { rutas } from "@/router";
import { registrarRouter } from "./routerConFoco";
import { crearRouterLado } from "./routerLado";
import { usePestanas } from "./usePestanas";

// Sin `window`: el router principal se crea al importar `@/router`, y con historia en memoria se puede.
vi.mock("vue-router", async (original) => {
  const vr = await original<typeof import("vue-router")>();
  return { ...vr, createWebHashHistory: vr.createMemoryHistory };
});
// Las vistas reales no se montan aquí: solo importa a qué ruta llega cada router.
const vacia = vi.hoisted(() => ({ default: { render: () => null } }));
vi.mock("@/features/arbol/VistaArbol.vue", () => vacia);
vi.mock("@/features/directorio/VistaDirectorio.vue", () => vacia);
vi.mock("@/features/revision/VistaRevision.vue", () => vacia);
vi.mock("@/vistas/VistaConfiguracion.vue", () => vacia);
vi.mock("@/vistas/VistaAyuda.vue", () => vacia);
vi.mock("@/vistas/VistaAcerca.vue", () => vacia);
vi.mock("@/vistas/VistaBienvenida.vue", () => vacia);

const CLAVE = "boldo:pestanas:C:/datos";
let datos: Map<string, string>;
let router: Router;
let quitarPrincipal = () => {};

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
  router = createRouter({ history: createMemoryHistory(), routes: rutas });
  datos.set(
    CLAVE,
    JSON.stringify({
      lista: [
        { id: "a", org: "A", ruta: "/" },
        { id: "b", org: "A", ruta: "/revision" },
        { id: "c", org: "A", ruta: "/arboles" },
      ],
      activa: "a",
      lado: "b",
    }),
  );
  const p = usePestanas();
  p.conectar(router, "C:/datos", "C:/datos/boldo.db");
  await router.replace(p.entrar());
  quitarPrincipal = registrarRouter("principal", router);
});
afterEach(() => {
  quitarPrincipal();
  vi.unstubAllGlobals();
});

const esperar = () => new Promise((r) => setTimeout(r));
const rutaDe = (id: string) => usePestanas().lista.find((x) => x.id === id)?.ruta;
async function lado() {
  const r = crearRouterLado("/revision");
  await r.isReady();
  return r;
}

describe("crearRouterLado", () => {
  it("navegar_en_el_lado_no_cambia_el_router_principal", async () => {
    const r = await lado();
    expect(r.currentRoute.value.fullPath).toBe("/revision");
    await r.push("/directorio?persona=x");
    expect(r.currentRoute.value.fullPath).toBe("/directorio?persona=x");
    expect(router.currentRoute.value.fullPath).toBe("/");
    expect(rutaDe("b")).toBe("/directorio?persona=x");
    expect(rutaDe("a")).toBe("/");
  });

  it("el_lado_no_abre_la_bienvenida: la abre el principal", async () => {
    const r = await lado();
    usePestanas().enfocarPanel("lado");
    await r.push("/bienvenida");
    await esperar();
    expect(r.currentRoute.value.fullPath).toBe("/revision");
    expect(rutaDe("b")).toBe("/revision");
    expect(router.currentRoute.value.fullPath).toBe("/bienvenida");
    expect(usePestanas().conFoco).toBe("principal");
  });

  it("un enlace del lado a Configuración, Ayuda o Acerca de las abre en el principal, que pasa a tener el foco", async () => {
    const r = await lado();
    for (const ruta of ["/configuracion", "/ayuda/pestanas", "/acerca"]) {
      await router.push("/");
      usePestanas().enfocarPanel("lado");
      await r.push(ruta);
      await esperar();
      expect(r.currentRoute.value.fullPath).toBe("/revision");
      expect(router.currentRoute.value.fullPath).toBe(ruta);
      expect(usePestanas().conFoco).toBe("principal");
    }
    expect(rutaDe("b")).toBe("/revision");
  });

  it("si su pestaña dejó de estar al lado, su router ya no escribe en la que llegó", async () => {
    const r = await lado();
    expect(usePestanas().abrirAlLado("c").ok).toBe(true);
    await r.push("/directorio");
    expect(rutaDe("c")).toBe("/arboles");
    expect(rutaDe("b")).toBe("/revision");
  });
});
