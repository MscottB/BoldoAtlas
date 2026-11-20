import { describe, expect, it } from "vitest";
import { u } from "@/features/arbol/fixture";
import { VISTA_POR_DEFECTO } from "@/features/arbol/vista";
import { COLOR_MARCA, armarSvg } from "./fixture";

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

  it("quita_los_caracteres_que_xml_no_admite", async () => {
    const emoji = String.fromCodePoint(0x1f600);
    const sucio = ["Fin", "\u0001", "\ufffe", "an", "\uffff", "\ud800", "zas", "\udc00", emoji].join("");
    const { svg } = await armarSvg("estructura", { ajustar: (d) => (d.unidades[1]!.nombre = sucio) });
    expect(svg).toContain(`Finanzas${emoji}`);
    expect(svg).not.toMatch(/[\u0001\ufffe\uffff]/);
    // Sin mitades sueltas de un par sustituto: el emoji entero sí queda.
    expect(svg.replace(emoji, "")).not.toMatch(/[\ud800-\udfff]/);
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

  it("presentacion_alta_es_16_9", async () => {
    // Una cadena de 25 unidades bajo Finanzas: el dibujo es mucho más alto que ancho y se agregan márgenes a los lados.
    const { ancho, alto } = await armarSvg("presentacion", {
      ajustar: (d) => {
        for (let i = 0; i < 25; i++) d.unidades.push(u(`c${i}`, "t-s", `Nivel ${i}`, i ? `c${i - 1}` : "a1"));
      },
    });
    expect(alto).toBeGreaterThan(25 * 112);
    expect(ancho / alto).toBe(16 / 9);
  });

  it("color_en_el_borde_izquierdo", async () => {
    const { svg } = await armarSvg("pantalla");
    // Un borde de 4 px a la izquierda, con el color; la tarjeta sigue blanca y su texto, oscuro.
    const d = new RegExp(`<path d="([^"]+)" fill="${COLOR_MARCA}"/>`).exec(svg)?.[1];
    expect(d).toBeDefined();
    // M (x + 8) y Q x … : x es el borde de la tarjeta; el tramo interior va en x + 4.
    const n = d!.match(/-?[\d.]+/g)!.map(Number);
    expect(n[0]! - n[2]!).toBeCloseTo(8);
    expect(n[11]! - n[2]!).toBeCloseTo(4);
    expect(svg).not.toMatch(new RegExp(`<rect [^>]*fill="${COLOR_MARCA}"`));
    expect(svg).toMatch(/<text [^>]*fill="#0a0a0a"[^>]*>Gerencia General<\/text>/);
  });

  it("caja_sin_tarjeta_no_ocupa_lugar", async () => {
    const base = await armarSvg("estructura");
    const con = await armarSvg("estructura", {
      cambiar: (e) => ({
        ...e,
        cajas: new Map([...e.cajas, ["p-lejos", { x: 9000, y: 9000, ancho: 200, alto: 68 }]]),
        aristas: [...e.aristas, ["g", "p-lejos"]],
      }),
    });
    expect([con.ancho, con.alto]).toEqual([base.ancho, base.alto]);
    expect(con.svg).toBe(base.svg);
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
    const { svg } = await armarSvg("estructura", { encabezado: { logo: LOGO } });
    expect(svg).toContain(`href="${LOGO}" xlink:href="${LOGO}"`);
    expect(svg).toContain('xmlns:xlink="http://www.w3.org/1999/xlink"');
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

  it("sin_fondo_para_png_transparente", async () => {
    const { svg } = await armarSvg("pantalla", { cambiar: (e) => ({ ...e, fondo: false }) });
    expect(svg).not.toContain('id="fondo"');
    expect(svg).toContain("Gerencia General");
  });
});
