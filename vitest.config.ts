import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";
import { constantesVersion } from "./scripts/constantes-version.mjs";
import { visorPrograma } from "./scripts/visor-programa.mjs";

export default defineConfig({
  // Para las pruebas que renderizan una vista en el servidor (sin DOM).
  plugins: [vue(), visorPrograma()],
  define: constantesVersion(),
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
  },
});
