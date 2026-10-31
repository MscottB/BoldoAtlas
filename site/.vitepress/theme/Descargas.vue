<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { masReciente } from "./masReciente";

const props = defineProps<{ lang: "es" | "en" }>();

const REPO = "MscottB/BoldoAtlas";
const textos = {
  es: {
    ultima: "última versión",
    version: "Versión",
    pre: "prelanzamiento",
    portable: "Portable (recomendado)",
    portableTxt:
      "Un zip que extraes en cualquier carpeta o pendrive y guarda todo en la carpeta datos/, junto al programa. No instala nada.",
    instaladores: "Instaladores",
    instaladoresTxt: "Instalan BoldoAtlas en el sistema y guardan los datos en la carpeta de tu usuario.",
    sumas: "Sumas de verificación (SHA256SUMS.txt)",
    descargar: "Descargar",
    sinJs: "Descargas en GitHub (Releases)",
  },
  en: {
    ultima: "latest version",
    version: "Version",
    pre: "pre-release",
    portable: "Portable (recommended)",
    portableTxt:
      "A zip you extract into any folder or USB drive; it keeps everything in the datos/ folder next to the program. Installs nothing.",
    instaladores: "Installers",
    instaladoresTxt: "They install BoldoAtlas on the system and keep the data in your user folder.",
    sumas: "Checksums (SHA256SUMS.txt)",
    descargar: "Download",
    sinJs: "Downloads on GitHub (Releases)",
  },
};
const t = computed(() => textos[props.lang]);

// Nombres sin número de versión: el enlace «latest/download» nunca cambia.
const sistemas = [
  {
    nombre: "Windows 10 / 11 (x64)",
    portable: "BoldoAtlas_windows_x64_portable.zip",
    instaladores: ["BoldoAtlas_windows_x64_setup.exe"],
  },
  {
    nombre: "Linux (x64)",
    portable: "BoldoAtlas_linux_x64_portable.zip",
    instaladores: ["BoldoAtlas_linux_x64.AppImage", "BoldoAtlas_linux_x64.deb", "BoldoAtlas_linux_x64.rpm"],
  },
  {
    nombre: "macOS 11+ (Intel / Apple Silicon)",
    portable: "BoldoAtlas_macos_universal_portable.zip",
    instaladores: ["BoldoAtlas_macos_universal.dmg"],
  },
];

// Hasta que la API confirme una release, todo apunta a la página de releases (nunca a un enlace que pueda dar 404).
const RELEASES = `https://github.com/${REPO}/releases`;
interface Release {
  tag: string;
  url: string;
  prerelease: boolean;
  archivos: Set<string>;
}
const release = ref<Release | null>(null);

// Enlace directo solo si el archivo está en esa release; si no, la página de la release.
function enlace(archivo: string) {
  const r = release.value;
  if (!r) return RELEASES;
  return r.archivos.has(archivo) ? `${RELEASES}/download/${encodeURIComponent(r.tag)}/${archivo}` : r.url;
}

async function pedir(ruta: string) {
  const r = await fetch(`https://api.github.com/repos/${REPO}/${ruta}`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

onMounted(async () => {
  // /releases/latest ignora las prereleases y falla con 404 (o 403 por límite de la API): ante cualquier error
  // se toma la más reciente por fecha de publicación (el orden de la lista no es fiable). Si tampoco hay, se queda en la página de releases.
  let datos;
  try {
    datos = await pedir("releases/latest");
  } catch {
    try {
      datos = masReciente(await pedir("releases?per_page=30"));
    } catch {
      return;
    }
  }
  if (!datos?.tag_name) return;
  release.value = {
    tag: datos.tag_name,
    url: datos.html_url,
    prerelease: Boolean(datos.prerelease),
    archivos: new Set((datos.assets ?? []).map((x: { name: string }) => x.name)),
  };
});
</script>

<template>
  <div class="descargas">
    <p class="version" aria-live="polite">
      <template v-if="release">
        {{ t.version }} <strong>{{ release.tag }}</strong>
        <span v-if="release.prerelease" class="insignia">{{ t.pre }}</span>
      </template>
      <template v-else>{{ t.ultima }}</template>
    </p>
    <noscript>
      <p>
        <a :href="RELEASES">{{ t.sinJs }}</a>
      </p>
    </noscript>

    <h2 id="portable" tabindex="-1">{{ t.portable }}</h2>
    <p>{{ t.portableTxt }}</p>
    <ul class="lista principal">
      <li v-for="s in sistemas" :key="s.portable">
        <span>{{ s.nombre }}</span>
        <a class="boton" :href="enlace(s.portable)">{{ t.descargar }} <code>{{ s.portable }}</code></a>
      </li>
    </ul>

    <h2 id="instaladores" tabindex="-1">{{ t.instaladores }}</h2>
    <p>{{ t.instaladoresTxt }}</p>
    <ul class="lista">
      <li v-for="s in sistemas" :key="s.nombre">
        <span>{{ s.nombre }}</span>
        <span class="archivos">
          <a v-for="f in s.instaladores" :key="f" :href="enlace(f)"><code>{{ f }}</code></a>
        </span>
      </li>
    </ul>
    <p>
      <a :href="enlace('SHA256SUMS.txt')">{{ t.sumas }}</a>
    </p>
  </div>
</template>

<style scoped>
.version {
  margin: 0 0 8px;
  color: var(--vp-c-text-2);
}
.insignia {
  margin-left: 8px;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
  font-size: 0.8125rem;
}
.lista {
  list-style: none;
  margin: 12px 0 !important;
  padding: 0 !important;
}
.lista li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
  margin: 0 !important;
  padding: 12px 0;
  border-bottom: 1px solid var(--vp-c-divider);
}
.archivos {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
}
.boton {
  padding: 8px 16px;
  border-radius: 20px;
  background: var(--vp-button-brand-bg);
  color: var(--vp-button-brand-text);
  font-weight: 600;
  text-decoration: none;
}
.boton:hover {
  background: var(--vp-button-brand-hover-bg);
  color: var(--vp-button-brand-hover-text);
}
.boton code {
  background: transparent;
  color: inherit;
  font-size: 0.8125rem;
}
</style>
