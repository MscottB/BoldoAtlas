import { describe, expect, it } from "vitest";
import { VISTA_POR_DEFECTO } from "@/features/arbol/vista";
import { armarSvg } from "./fixture";

const NIVELES = ["estructura", "presentacion", "pantalla"] as const;
const LOGO = "data:image/png;base64,iVBORw0KGgo=";

describe("dibujarSvg", () => {
  it("escapa_los_textos", async () => {
    const raro = `A & <B> "C"`;
    const { svg } = await armarSvg("pantalla", {
      ajustar: (d) => (d.unidades[1]!.nombre = raro),
      encabezado: { organizacion: raro },
    });
    expect(svg).toContain("A &amp; &lt;B&gt; &quot;C&quot;");
    expect(svg).not.toContain("<B>");
    expect(svg).not.toContain('"C"');
  });

  it("encabezado_con_la_fecha_elegida", async () => {
    const { svg } = await armarSvg("estructura", {
      encabezado: { organizacion: "Atlas SA", alcance: "Finanzas", fecha: "15-03-2025" },
    });
    expect(svg).toContain("Atlas SA");
    expect(svg).toContain("Finanzas · 15-03-2025");
  });

  it("presentacion_es_16_9", async () => {
    for (const config of [VISTA_POR_DEFECTO, { ...VISTA_POR_DEFECTO, direccion: "horizontal" as const }]) {
      const { svg, ancho, alto } = await armarSvg("presentacion", { config });
      expect(ancho / alto).toBe(16 / 9);
      expect(svg).toContain(`viewBox="0 0 ${ancho} ${alto}"`);
    }
  });

  it("sin_foreign_object", async () => {
    for (const nivel of NIVELES) {
      const { svg } = await armarSvg(nivel, {
        config: { ...VISTA_POR_DEFECTO, verPuestos: true },
        encabezado: { logo: LOGO },
      });
      expect(svg).not.toMatch(/foreignObject|<style|style=|class=/);
      const etiquetas = new Set([...svg.matchAll(/<([a-zA-Z]+)/g)].map((m) => m[1]));
      expect([...etiquetas].sort()).toEqual(["image", "path", "rect", "svg", "text", "title"]);
    }
  });

  it("logo_solo_como_data_url", async () => {
    expect((await armarSvg("estructura", { encabezado: { logo: LOGO } })).svg).toContain(`href="${LOGO}"`);
    for (const logo of ["https://ejemplo.cl/logo.png", "javascript:alert(1)", 'data:image/png;base64,a"b'])
      expect((await armarSvg("estructura", { encabezado: { logo } })).svg).not.toContain("<image");
  });

  it("fondo_claro_siempre", async () => {
    for (const nivel of NIVELES) {
      const { svg, ancho, alto } = await armarSvg(nivel);
      expect(svg).toContain(
        `<rect id="fondo" x="0" y="0" width="${ancho}" height="${alto}" fill="#ffffff"/>`,
      );
      expect(svg).not.toMatch(/var\(|oklch|currentColor|#171717/);
    }
  });
});
