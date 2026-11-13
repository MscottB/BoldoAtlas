import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { TIPO_GERENCIA } from "@/db/tipos";
import { i18n } from "@/i18n";
import { u } from "./fixture";
import NivelesLienzo from "./NivelesLienzo.vue";

vi.hoisted(() =>
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} }),
);

let pinia: Pinia;
const cadena = (n: number) =>
  Array.from({ length: n }, (_, i) => u(`n${i}`, TIPO_GERENCIA, `N${i}`, i ? `n${i - 1}` : null));
function html(n: number) {
  const app = createSSRApp({ render: () => h(NivelesLienzo, { unidades: cadena(n) }) });
  app.use(pinia).use(i18n);
  return renderToString(app);
}
const t = (clave: string, valores: Record<string, unknown> = {}) => i18n.global.t(clave, valores);

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

  it("más de 6: «−», el nivel actual, «+» y «Todo»; al estar todo abierto «+» queda inactivo", async () => {
    const s = await html(9);
    expect(s).toContain(t("arbol.niveles.menos"));
    expect(s).toContain(t("arbol.niveles.mas"));
    expect(s).toContain(t("arbol.niveles.actual", { n: 9 }));
    expect(s).not.toContain(t("arbol.niveles.ver", { n: 1 }));
    expect(s).toContain(t("arbol.niveles.verTodo"));
    expect(s).toMatch(
      new RegExp(
        `aria-label="${t("arbol.niveles.mas")}"[^>]*disabled|disabled[^>]*aria-label="${t("arbol.niveles.mas")}"`,
      ),
    );
  });
});
