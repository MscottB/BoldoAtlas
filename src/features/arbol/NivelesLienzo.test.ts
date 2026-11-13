import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { TIPO_GERENCIA } from "@/db/tipos";
import { i18n } from "@/i18n";
import { u } from "./fixture";
import NivelesLienzo from "./NivelesLienzo.vue";
import { nivelVecino, profundidad } from "./niveles";
import { useLienzo } from "./useLienzo";

vi.hoisted(() =>
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} }),
);

let pinia: Pinia;
const cadena = (n: number) =>
  Array.from({ length: n }, (_, i) => u(`n${i}`, TIPO_GERENCIA, `N${i}`, i ? `n${i - 1}` : null));
function html(n: number) {
  const unidades = cadena(n);
  const app = createSSRApp({ render: () => h(NivelesLienzo, { unidades, total: profundidad(unidades) }) });
  app.use(pinia).use(i18n);
  return renderToString(app);
}
const t = (clave: string, valores: Record<string, unknown> = {}) => i18n.global.t(clave, valores);
/** El `<button>` con ese nombre accesible, para mirar sus atributos sin depender de su orden. */
function boton(s: string, nombre: string) {
  const b = [...s.matchAll(/<button\b(?:"[^"]*"|[^>"])*>/g)]
    .map((m) => m[0])
    .find((x) => x.includes(`aria-label="${nombre}"`));
  expect(b, nombre).toBeDefined();
  return { desactivado: /\sdisabled(=|\s|>)/.test(b!) };
}

beforeEach(() => {
  i18n.global.locale.value = "es";
  pinia = createPinia();
  setActivePinia(pinia);
});

describe("NivelesLienzo", () => {
  it("un solo nivel: no hay nada que elegir", async () => {
    expect(await html(1)).not.toContain(t("arbol.niveles.titulo"));
  });

  it("hasta 6 niveles: un botón por nivel y «Todo»", async () => {
    const s = await html(4);
    expect(s).toContain(t("arbol.niveles.ver", { n: 4 }));
    expect(s).not.toContain(t("arbol.niveles.ver", { n: 5 }));
    expect(s).not.toContain(t("arbol.niveles.mas"));
    expect(s).toContain(t("arbol.niveles.verTodo"));
    expect(await html(6)).toContain(t("arbol.niveles.ver", { n: 6 }));
  });

  it("más de 6, todo abierto: el nivel actual es el último y «+» queda inactivo", async () => {
    const s = await html(9);
    expect(s).toContain(t("arbol.niveles.actual", { n: 9 }));
    expect(s).not.toContain(t("arbol.niveles.ver", { n: 1 }));
    expect(boton(s, t("arbol.niveles.mas")).desactivado).toBe(true);
    expect(boton(s, t("arbol.niveles.menos")).desactivado).toBe(false);
    expect(s).toContain(t("arbol.niveles.verTodo"));
  });

  it("con ramas plegadas, el nivel actual es el que se ve", async () => {
    useLienzo().colapsados.value = new Set(["n2"]); // se ve n0, n1 y n2: nivel 3
    const s = await html(9);
    expect(s).toContain(t("arbol.niveles.actual", { n: 3 }));
    expect(boton(s, t("arbol.niveles.mas")).desactivado).toBe(false);
    useLienzo().colapsados.value = new Set(["n0"]); // solo la raíz: nivel 1
    const uno = await html(9);
    expect(uno).toContain(t("arbol.niveles.actual", { n: 1 }));
    expect(boton(uno, t("arbol.niveles.menos")).desactivado).toBe(true);
  });

  it("«−» y «+» llevan a actual-1 y actual+1 (acotado), y el lienzo queda en ese nivel", () => {
    expect(nivelVecino(3, 9, -1)).toBe(2);
    expect(nivelVecino(3, 9, 1)).toBe(4);
    expect(nivelVecino(1, 9, -1)).toBe(1);
    expect(nivelVecino(9, 9, 1)).toBe(9);
    const unidades = cadena(9);
    const l = useLienzo();
    l.colapsados.value = new Set(["n2"]);
    const actual = profundidad(unidades, l.colapsados.value);
    l.contraerHasta(unidades, nivelVecino(actual, 9, 1));
    expect(profundidad(unidades, l.colapsados.value)).toBe(4);
    l.contraerHasta(unidades, nivelVecino(4, 9, -1));
    expect(profundidad(unidades, l.colapsados.value)).toBe(3);
  });
});
