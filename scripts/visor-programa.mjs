import { fileURLToPath } from "node:url";
import { build } from "vite";
import { constantesVersion } from "./constantes-version.mjs";

const ID = "virtual:visor-programa";
const raiz = fileURLToPath(new URL("..", import.meta.url));

/**
 * Empaqueta el programa del visor HTML (`src/features/visor/programa/main.ts`, con elk y el dibujo, sin Vue) en un solo
 * texto JS: `import programa from "virtual:visor-programa"`. Solo entra al bundle de quien lo importa.
 * @returns {import("vite").Plugin}
 */
export function visorPrograma() {
  /** @type {Promise<{ codigo: string; modulos: string[] }> | null} */
  let hecho = null;
  const empaquetar = async () => {
    const salida = await build({
      configFile: false,
      root: raiz,
      logLevel: "silent",
      publicDir: false,
      define: constantesVersion(),
      resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
      build: {
        write: false,
        minify: true,
        lib: {
          entry: fileURLToPath(new URL("../src/features/visor/programa/main.ts", import.meta.url)),
          formats: ["iife"],
          name: "VisorBoldo",
        },
      },
    });
    const chunk = [salida]
      .flat()
      .flatMap((s) => ("output" in s ? s.output : []))
      .find((x) => x.type === "chunk");
    if (!chunk) throw new Error("El programa del visor no generó código");
    return { codigo: chunk.code, modulos: chunk.moduleIds.filter((m) => !m.startsWith("\0")) };
  };
  return {
    name: "visor-programa",
    resolveId: (id) => (id === ID ? `\0${ID}` : null),
    async load(id) {
      if (id !== `\0${ID}`) return null;
      hecho ??= empaquetar().catch((e) => {
        hecho = null; // que la próxima carga reintente
        throw e;
      });
      const { codigo, modulos } = await hecho;
      for (const m of modulos) this.addWatchFile(m);
      return `export default ${JSON.stringify(codigo)}`;
    },
    watchChange() {
      hecho = null;
    },
  };
}
