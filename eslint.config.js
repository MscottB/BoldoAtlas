import pluginVue from "eslint-plugin-vue";
import { defineConfigWithVueTs, vueTsConfigs } from "@vue/eslint-config-typescript";
import skipFormatting from "@vue/eslint-config-prettier/skip-formatting";

export default defineConfigWithVueTs(
  { ignores: ["dist/**", "src-tauri/**", "src/components/ui/**", ".superpowers/**"] },
  pluginVue.configs["flat/recommended"],
  vueTsConfigs.recommended,
  skipFormatting,
);
