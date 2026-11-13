import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { createSSRApp, h, type Component } from "vue";
import { renderToString } from "vue/server-renderer";
import { createMemoryHistory, createRouter } from "vue-router";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Trabajador } from "@/db/tipos";
import BotonUbicar from "@/features/arbol/BotonUbicar.vue";
import { asignaciones, puestos, tipos, unidades } from "@/features/arbol/fixture";
import { i18n } from "@/i18n";
import { fijarBase } from "@/lib/baseActiva";
import { useOrganizacion } from "@/stores/organizacion";
import VistaDirectorio from "./VistaDirectorio.vue";

// Lo guardado en este computador: la vista y los filtros del directorio, por organización («A»).
const guardado = vi.hoisted(() => new Map<string, string>());
vi.hoisted(() => {
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => guardado.get(k) ?? null,
    setItem: () => {},
    removeItem: () => {},
  });
  vi.stubGlobal("window", { addEventListener: () => {}, removeEventListener: () => {} });
});
// En el servidor la lista virtual no mide nada y no dibuja filas: aquí las dibuja todas.
vi.mock("@vueuse/core", async (original) => {
  const { computed, ref } = await import("vue");
  return {
    ...(await original<typeof import("@vueuse/core")>()),
    useVirtualList: <T>(lista: { value: T[] }) => ({
      list: computed(() => lista.value.map((data, index) => ({ data, index }))),
      containerProps: { ref: ref(null), onScroll: () => {}, style: {} },
      wrapperProps: computed(() => ({ style: {} })),
      scrollTo: () => {},
    }),
  };
});

const w = (id: string, nombre: string): Trabajador => ({
  id,
  nombre,
  correo: null,
  telefono: null,
  tipo_contrato_id: null,
  sede_id: null,
  jornada_id: null,
  tiene_foto: 0,
  updated_at: "",
});

let pinia: Pinia;
async function html(componente: Component = VistaDirectorio, props: Record<string, unknown> = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/directorio", name: "directorio", component: { render: () => null } }],
  });
  await router.push("/directorio");
  const app = createSSRApp({ render: () => h(TooltipProvider, () => h(componente, props)) });
  app.use(pinia).use(router).use(i18n);
  return renderToString(app);
}
const t = (clave: string, valores: Record<string, unknown> = {}) => i18n.global.t(clave, valores);
const ver = (nombre: string) => t("ubicar.verEnOrganigrama", { nombre });
const filtros = (f: Record<string, unknown>) =>
  guardado.set("boldo:directorio:A", JSON.stringify({ filtros: f }));

beforeEach(() => {
  i18n.global.locale.value = "es";
  guardado.clear();
  fijarBase("A");
  pinia = createPinia();
  setActivePinia(pinia);
  const org = useOrganizacion();
  org.unidades = unidades.filter((u) => !u.deleted_at);
  org.puestos = puestos;
  org.asignaciones = asignaciones;
  org.trabajadores = [
    w("t1", "Ana Pérez"),
    w("t2", "Beto Ruiz"),
    w("t3", "Carla Muñoz"),
    w("t4", "Diego Soto"),
    w("t5", "Elena Vidal"),
    w("t7", "Gabriel Lagos"),
    w("t8", "Hugo Tapia"),
  ];
  org.catalogos = {
    ...org.catalogos,
    tipos_unidad: tipos,
    cargos: [{ id: "cargo", nombre: "Analista", orden: 0, deleted_at: null }],
  };
});

describe("El directorio en modo Lista", () => {
  it("parte en Lista; el ícono de cada fila dice a quién muestra y tiene su tooltip", async () => {
    const s = await html();
    expect(s).toMatch(/aria-pressed="true"[^>]*data-vista-directorio="lista"/);
    expect(s).toContain("<table");
    expect(s).not.toContain('role="tree"');
    expect(s).toMatch(
      new RegExp(
        `data-slot="tooltip-trigger"[^>]*aria-label="${ver("Ana Pérez")}"|aria-label="${ver("Ana Pérez")}"[^>]*data-slot="tooltip-trigger"`,
      ),
    );
  });
});

describe("El directorio en modo Árbol", () => {
  beforeEach(() => guardado.set("boldo:directorio:vista:A", JSON.stringify("arbol")));

  it("muestra quién depende de quién desde la raíz, con cargo, cifra y el ícono por persona", async () => {
    const s = await html();
    expect(s).toMatch(/aria-pressed="true"[^>]*data-vista-directorio="arbol"/);
    expect(s).toContain(`role="tree" aria-label="${t("directorio.arbol.nombre")}"`);
    expect(s).not.toContain("<table");
    // La raíz abierta: su persona y sus subunidades, en el nivel 2.
    expect(s).toContain("Gerencia General");
    expect(s).toContain("Ana Pérez");
    expect(s).toContain("Analista");
    expect(s).toContain("Operaciones");
    expect(s).toContain(i18n.global.t("personas.arbol.nPersonas", 6)); // los titulares de toda la organización
    expect(s).toContain(`aria-label="${ver("Ana Pérez")}"`);
    expect(s).not.toContain("Gabriel Lagos"); // más abajo, plegado
    // No se ordena por columnas: «Columnas» da paso a los niveles reales (4) y «Todo».
    expect(s).not.toContain(t("directorio.columnas"));
    expect(s).toContain(`aria-label="${t("arbol.niveles.titulo")}"`);
    for (const n of [1, 2, 3, 4])
      expect(s).toContain(`aria-label="${i18n.global.t("arbol.niveles.ver", { n }, n)}"`);
    expect(s).not.toContain(`aria-label="${i18n.global.t("arbol.niveles.ver", { n: 5 }, 5)}"`);
    expect(s).toContain(t("arbol.niveles.verTodo"));
    // Al abrir se ve el nivel 2 (la raíz abierta): ese botón queda marcado.
    const nivel = (n: number) =>
      s.match(
        new RegExp(`<button[^>]*aria-label="${i18n.global.t("arbol.niveles.ver", { n }, n)}"[^>]*>`),
      )![0];
    expect(nivel(2)).toContain('aria-pressed="true"');
    expect(nivel(3)).toContain('aria-pressed="false"');
    // La cifra del encabezado es la del árbol: 7 asignaciones y la vacante de Finanzas.
    expect(s).toContain(i18n.global.t("directorio.arbol.filas", 8));
    expect(s).not.toContain(i18n.global.t("directorio.filas", 9));
  });

  it("el árbol solo tiene treeitems: los íconos de ubicar van fuera de él, uno por persona", async () => {
    const s = await html();
    const arbol = s.slice(s.indexOf('role="tree"'), s.indexOf("pointer-events-none absolute"));
    expect(arbol).toContain('role="treeitem"');
    expect(arbol).not.toContain("<button");
    expect(arbol).not.toContain('role="none"');
    expect(s.slice(s.indexOf("pointer-events-none absolute"))).toContain(`aria-label="${ver("Ana Pérez")}"`);
  });

  it("con texto deja a quien coincide y la cadena hasta él, ya abierta", async () => {
    filtros({ texto: "gabriel" });
    const s = await html();
    for (const x of ["Gerencia General", "Operaciones", "Mantención", "Eléctrica", "Gabriel Lagos"])
      expect(s).toContain(x);
    for (const x of ["Ana Pérez", "Finanzas", "Mecánica", "Hugo Tapia"]) expect(s).not.toContain(x);
    expect(s).toContain(`aria-label="${ver("Gabriel Lagos")}"`);
  });

  it("los demás filtros también eligen qué se ve: con «Vacante», las vacantes y quien reemplaza en una", async () => {
    filtros({ estado: "vacante" });
    const s = await html();
    expect(s).toContain("Finanzas");
    expect(s).toContain(t("puesto.vacante"));
    expect(s).toContain("Carla Muñoz"); // reemplazo en el puesto vacante de Mecánica
    expect(s).toContain(t("puesto.tipo.reemplazo"));
    expect(s).not.toContain("Ana Pérez");
    expect(s).toContain(i18n.global.t("directorio.arbol.filas", 2));
  });

  it("con solo personas sin puesto lo dice: no están en el árbol", async () => {
    filtros({ estado: "sinPuesto" }); // Beto Ruiz: su puesto en Finanzas terminó
    const s = await html();
    expect(s).toContain(t("directorio.arbol.sinPuesto"));
    expect(s).not.toContain('role="tree"');
    expect(s).toContain(i18n.global.t("directorio.arbol.filas", 0));
    // Sin árbol a la vista, tampoco sus niveles (el árbol queda montado y oculto: conserva lo plegado).
    expect(s).toMatch(new RegExp(`<div[^>]*aria-label="${t("arbol.niveles.titulo")}"[^>]*style="display:none;"`));
    expect(s).toMatch(/<div class="contents" style="display:none;">/);
  });

  it("con una unidad elegida parte de su rama", async () => {
    filtros({ unidad: "mantencion" });
    const s = await html();
    expect(s).toContain("Mantención");
    expect(s).not.toContain("Gerencia General");
    expect(s).toContain(`aria-label="${i18n.global.t("arbol.niveles.ver", { n: 2 }, 2)}"`);
    expect(s).not.toContain(`aria-label="${i18n.global.t("arbol.niveles.ver", { n: 3 }, 3)}"`);
  });

  it("sin nada que coincida lo dice, como la lista", async () => {
    filtros({ texto: "zzz" });
    expect(await html()).toContain(t("directorio.sinResultados"));
  });
});

describe("BotonUbicar", () => {
  it("el botón con texto (ficha, vista previa) sigue igual: su texto y su ayuda en title", async () => {
    const s = await html(BotonUbicar, { personaId: "t1", puestoId: "p1", nombre: "Ana Pérez" });
    const boton = s.match(/<button[^>]*>/)?.[0] ?? "";
    expect(s).toContain(t("ubicar.ver"));
    expect(boton).toContain(`title="${t("ubicar.verAyuda")}"`);
    expect(boton).not.toContain("aria-label");
  });

  it("solo el ícono: sin nombre dice «Ver en el organigrama»; lleva al botón el tabindex que recibe", async () => {
    const s = await html(BotonUbicar, { personaId: "t1", puestoId: "p1", icono: true, tabindex: -1 });
    expect(s).toMatch(/<button[^>]*tabindex="-1"/);
    expect(s).toContain(`aria-label="${t("ubicar.ver")}"`);
    expect(s).toContain('data-slot="tooltip-trigger"');
  });

  it("con dos puestos, el ícono abre el menú para elegir y también tiene su tooltip", async () => {
    const s = await html(BotonUbicar, { personaId: "t3", icono: true, nombre: "Carla Muñoz" });
    const boton = s.match(/<button[^>]*>/)?.[0] ?? "";
    expect(boton).toContain(`aria-label="${ver("Carla Muñoz")}"`);
    expect(boton).toContain('aria-haspopup="menu"');
    expect(boton).toContain('data-slot="tooltip-trigger"');
  });
});
