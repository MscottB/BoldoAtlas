import MarkdownIt from "markdown-it";
import { describe, expect, it } from "vitest";
import { reglasAyuda, type OpcionesAyuda } from "./markdownAyuda";

const render = (texto: string, opciones: OpcionesAyuda = {}) => {
  const md = new MarkdownIt({ html: false });
  reglasAyuda(md, { avisos: true, ...opciones });
  return md.render(texto);
};

describe("avisos", () => {
  it("dibuja el título y el contenido del aviso", () => {
    const html = render("::: tip Consejo\nUsa **Ctrl** + `K`.\n\n- uno\n:::\n\nDespués.");
    expect(html).toContain('<div class="aviso aviso-tip" role="note">');
    expect(html).toContain('<p class="aviso-titulo">Consejo</p>');
    expect(html).toContain("<strong>Ctrl</strong>");
    expect(html).toContain("<li>uno</li>");
    expect(html).toMatch(/<\/div>\s*<p>Después\.<\/p>/);
  });

  it("sin cierre o sin título no es un aviso", () => {
    expect(render("::: tip Consejo\ntexto")).not.toContain("aviso");
    expect(render("::: tip\ntexto\n:::")).not.toContain("aviso");
  });

  it("no deja pasar HTML dentro del aviso", () => {
    expect(render("::: warning Ojo\n<script>x</script>\n:::")).not.toContain("<script>");
  });
});

describe("figuras", () => {
  const fig = '![La barra del lienzo](../img/es/barra.webp "Así se ve la barra"){width=640 height=320}';

  it("una imagen sola es una figura con pie, tamaño y carga diferida", () => {
    const html = render(fig);
    expect(html).toContain('<figure class="figura">');
    expect(html).toContain('alt="La barra del lienzo"');
    expect(html).toContain('width="640"');
    expect(html).toContain('height="320"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain("<figcaption>Así se ve la barra</figcaption>");
    expect(html).not.toContain('title="');
    expect(html).not.toContain("{width");
  });

  it("una imagen dentro de un texto sigue siendo una imagen en línea", () => {
    const html = render("Mira ![icono](../img/es/a.webp) aquí.");
    expect(html).not.toContain("<figure");
    expect(html).toContain('loading="lazy"');
  });

  it("solo acepta width y height", () => {
    const html = render("![x](a.webp){width=10 onerror=alert(1)}");
    expect(html).toContain('width="10"');
    expect(html).not.toContain("onerror");
  });

  it("el pie se escapa", () => {
    expect(render('![x](a.webp "<b>hola</b>")')).toContain("&lt;b&gt;hola&lt;/b&gt;");
  });

  it("resuelve la ruta de la imagen cuando se pide", () => {
    const html = render(fig, { resolverImagen: (s) => `/assets/${s.split("/").pop()}` });
    expect(html).toContain('src="/assets/barra.webp"');
  });
});

describe("enlaces y anclas", () => {
  it("enlaces a otras páginas de la ayuda", () => {
    const rutaPagina = (slug: string, ancla: string) => `#/ayuda/${slug}${ancla}`;
    const html = render("[Árbol](arbol.md) y [esa parte](arbol.md#plegar) y [web](https://example.com)", {
      rutaPagina,
    });
    expect(html).toContain('href="#/ayuda/arbol"');
    expect(html).toContain('href="#/ayuda/arbol#plegar"');
    expect(html).toContain('href="https://example.com"');
  });

  it("ids de encabezado sin tildes y sin repetirse", () => {
    const html = render("## Qué es\n\n## Qué es\n\n### Eliminar una unidad", { anclas: true });
    expect(html).toContain('<h2 id="que-es">');
    expect(html).toContain('<h2 id="que-es-2">');
    expect(html).toContain('<h3 id="eliminar-una-unidad">');
  });
});
