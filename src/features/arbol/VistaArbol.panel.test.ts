import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter, type Router } from "vue-router";
import { useAtajos } from "@/features/atajos/useAtajos";
import { registrarRouter } from "@/features/pestanas/routerConFoco";
import { usePestanas } from "@/features/pestanas/usePestanas";
import { fijarBase } from "@/lib/baseActiva";
import { useOrganizacion } from "@/stores/organizacion";
import { puestos, unidades } from "./fixture";
import { idLienzo, nodoEn, useLienzo } from "./useLienzo";
import { useUbicar } from "./useUbicar";

// Sin DOM (Review Focus 1): el mismo árbol en los dos paneles. Lo que se prueba aquí es lo que decide en cuál de los
// dos lienzos actúa cada cosa; el foco y el dibujo reales los comprueba el arnés en CI.
const h = vi.hoisted(() => ({ manejador: null as ((e: unknown) => void) | null }));
vi.mock("@vueuse/core", async (original) => ({
  ...(await original<object>()),
  useEventListener: (_d: unknown, _e: unknown, f: (e: unknown) => void) => void (h.manejador = f),
}));

const vacio = { render: () => null };
const nuevoRouter = () =>
  createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", name: "arbol", component: vacio },
      { path: "/directorio", name: "directorio", component: vacio },
    ],
  });
const CLAVE = "boldo:pestanas:C:/datos";
let datos: Map<string, string>;
let principal: Router;
let lado: Router;
const quitar: (() => void)[] = [];

const tecla = (key: string) =>
  h.manejador!({
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    isComposing: false,
    target: null,
    preventDefault: () => {},
  });

beforeEach(async () => {
  datos = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => datos.set(k, v),
  });
  vi.stubGlobal("window", {});
  vi.stubGlobal("Element", class {});
  vi.stubGlobal("document", {
    activeElement: null,
    body: {},
    getElementById: () => null,
    querySelector: () => null,
  });
  vi.stubGlobal("CSS", { escape: (s: string) => s });
  fijarBase("A");
  setActivePinia(createPinia());
  useOrganizacion().$patch({ unidades: unidades.filter((u) => !u.deleted_at), puestos, cargado: true });
  // Las dos pestañas en el Árbol completo: «a» en el principal y «b» al lado.
  datos.set(
    CLAVE,
    JSON.stringify({
      lista: [
        { id: "a", org: "A", ruta: "/" },
        { id: "b", org: "A", ruta: "/" },
      ],
      activa: "a",
      lado: "b",
    }),
  );
  principal = nuevoRouter();
  lado = nuevoRouter();
  const p = usePestanas();
  p.conectar(principal, "C:/datos", "C:/datos/boldo.db");
  await principal.replace(p.entrar());
  await lado.replace("/");
  quitar.push(registrarRouter("principal", principal), registrarRouter("lado", lado));
  for (const panel of ["principal", "lado"] as const) {
    useLienzo(panel).seleccion.value = null;
    useLienzo(panel).editando.value = null;
    useLienzo(panel).centrarEn.value = null;
  }
});
afterEach(() => {
  quitar.splice(0).forEach((f) => f());
  vi.unstubAllGlobals();
});

describe("el mismo árbol en los dos paneles", () => {
  it("mismo_arbol_en_dos_paneles_f2_y_ubicar_solo_en_el_suyo", () => {
    // Cada lienzo busca sus tarjetas dentro de su vista y tiene su propio Vue Flow.
    const tarjeta = (panel: string) => ({ panel });
    const raiz = (panel: string) => ({
      querySelector: (s: string) => (s === '.vue-flow__node[data-id="mecanica"]' ? tarjeta(panel) : null),
    });
    expect(nodoEn(raiz("principal") as unknown as ParentNode, "mecanica")).toEqual({ panel: "principal" });
    expect(nodoEn(raiz("lado") as unknown as ParentNode, "mecanica")).toEqual({ panel: "lado" });
    expect(idLienzo("principal", "a")).not.toBe(idLienzo("lado", "b"));
    // La misma pestaña al pasar de un panel al otro: el Vue Flow del que se desmonta no es el del que se monta.
    expect(idLienzo("principal", "b")).not.toBe(idLienzo("lado", "b"));

    const enPrincipal = useLienzo("principal");
    const alLado = useLienzo("lado");
    enPrincipal.seleccion.value = "mecanica";
    alLado.seleccion.value = "mecanica";
    useAtajos();

    // F2 con foco al lado: se edita la tarjeta de al lado; la del principal no cambia.
    usePestanas().enfocarPanel("lado");
    tecla("F2");
    expect(alLado.editando.value).toBe("mecanica");
    expect(enPrincipal.editando.value).toBeNull();

    // Las flechas también: mueven solo la selección de al lado.
    alLado.editando.value = null;
    tecla("ArrowUp");
    expect(alLado.seleccion.value).toBe("mantencion");
    expect(alLado.centrarEn.value).toBe("mantencion");
    expect(enPrincipal.seleccion.value).toBe("mecanica");
    expect(enPrincipal.centrarEn.value).toBeNull();

    // Ubicar desde fuera de los paneles (la paleta o la ficha): encuadra solo el lienzo de al lado.
    alLado.centrarEn.value = null;
    expect(useUbicar().ubicar("p4")).toEqual({ ok: true });
    expect(alLado.seleccion.value).toBe("mecanica");
    expect(alLado.centrarEn.value).not.toBeNull();
    expect(enPrincipal.centrarEn.value).toBeNull();

    // Con foco en el principal, F2 edita ahí y no al lado.
    usePestanas().enfocarPanel("principal");
    tecla("F2");
    expect(enPrincipal.editando.value).toBe("mecanica");
    expect(alLado.editando.value).toBeNull();
  });
});
