import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";
import { constantesVersion } from "./scripts/constantes-version.mjs";

export default defineConfig({
  define: constantesVersion(),
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
  },
});
