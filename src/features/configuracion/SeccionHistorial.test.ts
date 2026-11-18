import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { i18n } from "@/i18n";
import { useOrganizacion } from "@/stores/organizacion";
import SeccionHistorial from "./SeccionHistorial.vue";

let pinia: Pinia;
beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
});

const html = () =>
  renderToString(
    createSSRApp({ render: () => h(SeccionHistorial) })
      .use(pinia)
      .use(i18n),
  );
const opciones = (s: string) =>
  [...s.matchAll(/<option value="(\d+)"[^>]*>([^<]*)</g)].map((m) => [m[1], m[2]]);

describe("SeccionHistorial", () => {
  it("ofrece los cuatro plazos, con 1 año por defecto", async () => {
    const s = await html();
    expect(opciones(s)).toEqual([
      ["30", "30 días"],
      ["90", "90 días"],
      ["365", "1 año"],
      ["0", "Sin límite"],
    ]);
    expect(s).toMatch(/<option value="365" selected/);
  });

  it("un plazo guardado fuera de las opciones se ve, con sus días", async () => {
    useOrganizacion().plazoHistorial = "180";
    const s = await html();
    expect(opciones(s)).toContainEqual(["180", "180 días"]);
    expect(s).toMatch(/<option value="180" selected/);
  });
});
