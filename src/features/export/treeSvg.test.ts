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

  it("presentacion_sin_encabezado_no_se_rellena_a_16_9", async () => {
    const { ancho, alto } = await armarSvg("presentacion", { dibujo: { sinEncabezado: true } });
    expect(ancho / alto).not.toBe(16 / 9);
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

  it("sin_encabezado_para_el_pdf", async () => {
    const con = await armarSvg("estructura", { encabezado: { logo: LOGO } });
    const sin = await armarSvg("estructura", { encabezado: { logo: LOGO }, dibujo: { sinEncabezado: true } });
    expect(sin.svg).not.toContain("<image");
    expect(sin.svg).not.toContain(">Atlas SA</text>");
    expect(sin.svg).not.toContain("· 20-11-2026</text>");
    expect(sin.svg).toContain(">Gerencia General</text>");
    // Sin el alto del encabezado ni el aire bajo él (48 + 24), y sin su ancho.
    expect(con.alto - sin.alto).toBe(72);
    expect(sin.ancho).toBeLessThanOrEqual(con.ancho);
  });

  // Dónde quedó el texto de una tarjeta (centrado en Estructura): x es el centro de la tarjeta.
  const lugar = (svg: string, nombre: string) => {
    const m = new RegExp(`<text x="([\\d.]+)" y="([\\d.]+)"[^>]*>${nombre}</text>`).exec(svg);
    expect(m).not.toBeNull();
    return { x: Number(m![1]), y: Number(m![2]) };
  };

  it("recorte_deja_fuera_lo_que_no_toca", async () => {
    const entero = await armarSvg("estructura", { dibujo: { sinEncabezado: true } });
    const g = lugar(entero.svg, "Gerencia General");
    const recorte = { x: g.x - 10, y: g.y - 10, ancho: 20, alto: 20 };
    const { svg, ancho, alto } = await armarSvg("estructura", { dibujo: { sinEncabezado: true, recorte } });
    expect(svg).toContain(">Gerencia General</text>");
    for (const fuera of ["Finanzas", "Operaciones", "Coordina", "Zona Norte"])
      expect(svg).not.toContain(fuera);
    // La hoja mide lo que el recorte, y el dibujo de afuera queda donde estaba.
    expect(svg).toContain(`viewBox="${recorte.x} ${recorte.y} ${recorte.ancho} ${recorte.alto}"`);
    expect([ancho, alto]).toEqual([entero.ancho, entero.alto]);
  });

  it("recorte_lo_que_cruza_el_borde_va_en_las_dos_hojas", async () => {
    const entero = await armarSvg("estructura", { dibujo: { sinEncabezado: true } });
    const f = lugar(entero.svg, "Finanzas");
    const o = lugar(entero.svg, "Operaciones");
    expect(o.x - f.x).toBeGreaterThan(110); // hermanas lado a lado: Operaciones, entera a la derecha del corte
    const izquierda = { x: 0, y: 0, ancho: f.x, alto: entero.alto };
    const derecha = { x: f.x, y: 0, ancho: entero.ancho - f.x, alto: entero.alto };
    const a = await armarSvg("estructura", { dibujo: { sinEncabezado: true, recorte: izquierda } });
    const b = await armarSvg("estructura", { dibujo: { sinEncabezado: true, recorte: derecha } });
    expect(a.svg).toContain(">Finanzas</text>");
    expect(b.svg).toContain(">Finanzas</text>");
    expect(a.svg).not.toContain(">Operaciones</text>");
    expect(b.svg).toContain(">Operaciones</text>");
  });

  it("interactivo_marca_tarjetas_y_botones", async () => {
    const interactivo = { conRamas: new Set(["g", "a2"]), plegadas: new Set(["a2"]) };
    const { svg, tarjetas } = await armarSvg("estructura", { dibujo: { interactivo } });
    const ids = [...svg.matchAll(/ data-id="([^"]*)"/g)].map((m) => m[1]);
    expect(ids.sort()).toEqual(tarjetas.map((t) => t.id).sort());
    expect(svg).toContain('tabindex="0" role="button" aria-label="Gerencia General"');
    const botones = [...svg.matchAll(/<g data-plegar="([^"]*)"[^>]*aria-label="([^"]*)">(.*?)<\/g>/g)];
    expect(botones.map((m) => m[1]).sort()).toEqual(["a2", "g"]);
    // a2 está plegada: «+» y «Desplegar»; g está abierta: «−» y «Plegar».
    const a2 = botones.find((m) => m[1] === "a2")!;
    const g = botones.find((m) => m[1] === "g")!;
    expect(a2[2]).toBe("Desplegar la rama");
    expect(a2[3]).toContain(">+</text>");
    expect(g[2]).toBe("Plegar la rama");
    expect(g[3]).toContain(">−</text>");
  });

  it("interactivo_pone_el_boton_al_borde_derecho_si_es_horizontal", async () => {
    const interactivo = { conRamas: new Set(["g"]), plegadas: new Set<string>() };
    const config = { ...VISTA_POR_DEFECTO, direccion: "horizontal" as const };
    const { svg } = await armarSvg("estructura", { config, dibujo: { interactivo } });
    const caja = /<rect x="([\d.]+)" y="([\d.]+)" width="220" height="68" rx="8"/.exec(svg)!;
    const circulo = /<g data-plegar="g"[^>]*><circle cx="([\d.]+)" cy="([\d.]+)"/.exec(svg)!;
    expect(Number(circulo[1])).toBeCloseTo(Number(caja[1]) + 220, 0);
    expect(Number(circulo[2])).toBeCloseTo(Number(caja[2]) + 34, 0);
  });

  it("sin_interactivo_igual_que_antes", async () => {
    const { svg } = await armarSvg("pantalla");
    expect(svg).not.toMatch(/data-id|data-plegar|tabindex/);
    const con = await armarSvg("pantalla", {
      dibujo: { interactivo: { conRamas: new Set(), plegadas: new Set() } },
    });
    // Con la opción pero sin ramas, solo suma el grupo de cada tarjeta.
    expect(con.svg.replace(/<g data-id="[^>]*>|<\/g>/g, "")).toBe(svg);
  });
});
