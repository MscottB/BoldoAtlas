import { describe, expect, it } from "vitest";
import { createSSRApp } from "vue";
import { renderToString } from "vue/server-renderer";
import type { FilaCaso } from "@/db/cliente";
import { i18n } from "@/i18n";
import FilaCasoVue from "./FilaCaso.vue";

const fila = (restaurable: boolean): FilaCaso => ({
  tabla: "trabajadores",
  id: "t1",
  nombre: "Persona suprimida",
  tipo: "borrado_vs_editado",
  columnas: [],
  eleccion: { que: "borrar" },
  preseleccionada: { que: "borrar" },
  dudosa: false,
  masReciente: "igual",
  borradoAqui: true,
  restaurable,
});

async function html(f: FilaCaso): Promise<string> {
  const app = createSSRApp(FilaCasoVue, { trabajo: "x", fila: f });
  app.use(i18n);
  return renderToString(app);
}

describe("fila de la revisión", () => {
  it("la de una suprimida no ofrece restaurar y dice por qué", async () => {
    const s = await html(fila(false));
    expect(s).not.toContain('type="radio"');
    expect(s).toContain(i18n.global.t("intercambio.revisar.suprimida"));
  });

  it("la restaurable sigue con sus opciones", async () => {
    const s = await html(fila(true));
    expect(s).toContain('type="radio"');
    expect(s).not.toContain(i18n.global.t("intercambio.revisar.suprimida"));
  });
});
