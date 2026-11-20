import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { computed, createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { createMemoryHistory, createRouter } from "vue-router";
import { TIPO_AREA, type Trabajador } from "@/db/tipos";
import { i18n } from "@/i18n";
import { fijarBase } from "@/lib/baseActiva";
import { CONTEXTO_LIENZO, type ContextoLienzo } from "./contexto";
import { u } from "./fixture";
import { useVista } from "./useVista";
import NodoUnidad, { type DatosNodo } from "./NodoUnidad.vue";

vi.hoisted(() =>
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} }),
);
// Sin el lienzo de Vue Flow: los puntos de conexión no importan aquí.
vi.mock("@vue-flow/core", async (original) => ({
  ...(await original<object>()),
  Handle: { render: () => null },
}));

const w = (id: string, nombre: string): Trabajador => ({
  id,
  nombre,
  correo: null,
  telefono: null,
  tipo_contrato_id: null,
  sede_id: null,
  jornada_id: null,
  updated_at: "",
});

let pinia: Pinia;
beforeEach(() => {
  fijarBase("A");
  pinia = createPinia();
  setActivePinia(pinia);
});

async function html() {
  const nada = computed(() => null);
  const contexto = {
    marcas: nada,
    rutas: nada,
    leyendas: nada,
    escala: nada,
    zonas: nada,
    ligera: computed(() => false),
    tarjetaActiva: nada,
    tarjetaEnfocada: nada,
  } as unknown as ContextoLienzo;
  const data: DatosNodo = {
    unidad: u("a", TIPO_AREA, "Finanzas", null),
    jefe: w("t1", "Ana Pérez"),
    jefeReemplazo: false,
    total: 3,
    vacantes: 0,
    etiquetas: [],
    hijos: 0,
    cargoJefe: "Jefa",
    equipo: [w("t2", "Beto Ruiz"), w("t3", "Carla Muñoz")],
    personas: 3,
    resto: 0,
  };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/", component: { render: () => null } }],
  });
  const app = createSSRApp({ render: () => h(NodoUnidad, { id: "a", data }) });
  app.use(pinia).use(router).use(i18n).provide(CONTEXTO_LIENZO, contexto);
  return renderToString(app);
}

describe("La tarjeta de una unidad", () => {
  it("muestra las iniciales de la jefatura y del equipo, y ninguna imagen de persona", async () => {
    useVista().config.value.personasEnTarjetas = true;
    const s = await html();
    for (const x of ["AP", "BR", "CM"]) expect(s).toMatch(new RegExp(`>\\s*${x}\\s*<`));
    expect(s).not.toContain("<img");
  });
});
