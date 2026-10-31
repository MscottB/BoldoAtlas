import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type DefaultTheme } from "vitepress";

// El manual es el de la app (ayuda/<idioma>/*.md); scripts/sync.mjs lo copia a manual/ y en/manual/.
// Mismo orden que en la app: «inicio» primero, el resto por orden alfabético del archivo.
const ayuda = fileURLToPath(new URL("../../ayuda/", import.meta.url));
// Primer encabezado «# ...» fuera de los bloques de código.
const primerTitulo = (md: string) => /^# +(.+)$/m.exec(md.replace(/^(```|~~~)[\s\S]*?^\1/gm, ""))?.[1];
function barraManual(idioma: "es" | "en", prefijo: string, titulo: string): DefaultTheme.SidebarItem[] {
  const paginas = readdirSync(`${ayuda}${idioma}`)
    .filter((f) => f.endsWith(".md"))
    .map((f) => ({
      slug: f.slice(0, -3),
      text: primerTitulo(readFileSync(`${ayuda}${idioma}/${f}`, "utf8")) ?? f,
    }))
    .sort((a, b) => Number(b.slug === "inicio") - Number(a.slug === "inicio") || a.slug.localeCompare(b.slug));
  return [{ text: titulo, items: paginas.map((p) => ({ text: p.text, link: `${prefijo}/manual/${p.slug}` })) }];
}

const REPO = "https://github.com/MscottB/BoldoAtlas";
const BASE = "/BoldoAtlas/";

export default defineConfig({
  title: "BoldoAtlas",
  base: BASE,
  cleanUrls: true,
  srcExclude: ["README.md"],
  sitemap: { hostname: "https://mscottb.github.io/BoldoAtlas/" },
  head: [
    ["link", { rel: "icon", type: "image/png", href: `${BASE}icono.png` }],
    ["meta", { name: "theme-color", content: "#c8743f" }],
  ],
  locales: {
    root: {
      label: "Español",
      lang: "es",
      description:
        "Organigramas gigantes, fichas de personas y vacantes. App de escritorio local y portable para Windows, Linux y macOS.",
      themeConfig: {
        nav: [
          { text: "Descargas", link: "/descargas" },
          { text: "Manual", link: "/manual/inicio", activeMatch: "/manual/" },
          { text: "Acerca de", link: "/acerca" },
        ],
        sidebar: { "/manual/": barraManual("es", "", "Manual de usuario") },
        footer: { message: "Licencia AGPL-3.0", copyright: "© Michael Jim Scott Bravo" },
        docFooter: { prev: "Anterior", next: "Siguiente" },
        outline: { label: "En esta página" },
        returnToTopLabel: "Volver arriba",
        sidebarMenuLabel: "Menú",
        darkModeSwitchLabel: "Apariencia",
        lightModeSwitchTitle: "Cambiar a tema claro",
        darkModeSwitchTitle: "Cambiar a tema oscuro",
        langMenuLabel: "Cambiar idioma",
        skipToContentLabel: "Saltar al contenido",
      },
    },
    en: {
      label: "English",
      lang: "en",
      link: "/en/",
      description:
        "Giant org charts, people records and vacancies. A local, portable desktop app for Windows, Linux and macOS.",
      themeConfig: {
        nav: [
          { text: "Downloads", link: "/en/descargas" },
          { text: "Manual", link: "/en/manual/inicio", activeMatch: "/en/manual/" },
          { text: "About", link: "/en/acerca" },
        ],
        sidebar: { "/en/manual/": barraManual("en", "/en", "User manual") },
        footer: { message: "AGPL-3.0 license", copyright: "© Michael Jim Scott Bravo" },
      },
    },
  },
  themeConfig: {
    logo: "/icono.png",
    socialLinks: [{ icon: "github", link: REPO }],
    search: {
      provider: "local",
      options: {
        locales: {
          root: {
            translations: {
              button: { buttonText: "Buscar", buttonAriaLabel: "Buscar" },
              modal: {
                displayDetails: "Mostrar detalles",
                resetButtonTitle: "Limpiar búsqueda",
                backButtonTitle: "Cerrar búsqueda",
                noResultsText: "Sin resultados para",
                footer: {
                  selectText: "seleccionar",
                  selectKeyAriaLabel: "Intro",
                  navigateText: "navegar",
                  navigateUpKeyAriaLabel: "flecha arriba",
                  navigateDownKeyAriaLabel: "flecha abajo",
                  closeText: "cerrar",
                  closeKeyAriaLabel: "Esc",
                },
              },
            },
          },
        },
      },
    },
  },
});
