import { describe, expect, it, vi } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";
import type { Organizacion } from "@/db/cliente";
import { entradasAbrirOtra, entradasComparar, entradasVerAlLado, rutaComparar } from "./menuApp";

// localStorage simulado desde antes de importar: hay módulos que leen sus preferencias al cargarse.
vi.hoisted(() =>
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} }),
);

const org = (id: string, existe = true): Organizacion =>
  ({ id, nombre: `Org ${id}`, color: "#112233", abierta: "2026-11-03", existe }) as Organizacion;

describe("entradasAbrirOtra", () => {
  it("no ofrece la abierta y respeta el orden", () => {
    expect(entradasAbrirOtra([org("C"), org("A"), org("B")], "A")).toEqual([
      { id: "C", nombre: "Org C" },
      { id: "B", nombre: "Org B" },
    ]);
  });

  it("con solo la abierta no ofrece nada", () => {
    expect(entradasAbrirOtra([org("A")], "A")).toEqual([]);
  });
});

describe("entradasVerAlLado", () => {
  it("deja fuera la abierta y las que perdieron su archivo, y conserva el orden de la lista", () => {
    expect(entradasVerAlLado([org("C"), org("A"), org("D", false), org("B")], "A")).toEqual([
      { id: "C", nombre: "Org C" },
      { id: "B", nombre: "Org B" },
    ]);
  });
});

describe("entradasComparar", () => {
  it("deja fuera la abierta y conserva el orden de la lista", () => {
    expect(entradasComparar([org("C"), org("A"), org("B")], "A")).toEqual([
      { id: "C", nombre: "Org C" },
      { id: "B", nombre: "Org B" },
    ]);
  });

  it("no ofrece las que perdieron su archivo", () => {
    expect(entradasComparar([org("A"), org("B", false), org("C")], "A")).toEqual([
      { id: "C", nombre: "Org C" },
    ]);
  });

  it("lleva a la vista Comparar con la otra en `con` y la abierta en `de`", () => {
    expect(rutaComparar("B", "A")).toMatchObject({ name: "comparar", query: { con: "B", de: "A" } });
  });

  it("pedir la misma comparación que se está viendo vuelve a navegar, para comparar de nuevo", async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/comparar", name: "comparar", component: { render: () => null } }],
    });
    const vistas: unknown[] = [];
    router.afterEach((to, _de, fallo) => void (fallo ? null : vistas.push(to.query)));
    await router.push(rutaComparar("B", "A"));
    expect(await router.push(rutaComparar("B", "A"))).toBeUndefined();
    expect(vistas).toHaveLength(2);
    expect(vistas[1]).not.toBe(vistas[0]); // la vista mira la `query`: llega una nueva
  });
});
