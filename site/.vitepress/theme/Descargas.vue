<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

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

// null = enlaces «latest/download»; con etiqueta = enlaces de esa versión (ver onMounted).
const etiqueta = ref<string | null>(null);
const version = ref<string | null>(null);
const prelanzamiento = ref(false);

const base = computed(() =>
  etiqueta.value
    ? `https://github.com/${REPO}/releases/download/${etiqueta.value}`
    : `https://github.com/${REPO}/releases/latest/download`,
);

async function pedir(ruta: string) {
  const r = await fetch(`https://api.github.com/repos/${REPO}/${ruta}`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

onMounted(async () => {
  try {
    // /releases/latest ignora las prereleases (y «latest/download» con ella). Mientras todas lo sean (alfa),
    // se toma la más reciente de la lista y se enlaza por su etiqueta.
    let release = await pedir("releases/latest");
    if (!release) {
      release = (await pedir("releases?per_page=1"))?.[0];
      if (release) etiqueta.value = release.tag_name;
    }
    if (release?.tag_name) {
      version.value = release.tag_name;
      prelanzamiento.value = Boolean(release.prerelease);
    }
  } catch {
    // sin red o con límite de la API: se queda en «última versión»
  }
});
</script>

<template>
  <div class="descargas">
    <p class="version">
      <template v-if="version">
        {{ t.version }} <strong>{{ version }}</strong>
        <span v-if="prelanzamiento" class="insignia">{{ t.pre }}</span>
      </template>
      <template v-else>{{ t.ultima }}</template>
    </p>

    <h2 id="portable" tabindex="-1">{{ t.portable }}</h2>
    <p>{{ t.portableTxt }}</p>
    <ul class="lista principal">
      <li v-for="s in sistemas" :key="s.portable">
        <span>{{ s.nombre }}</span>
        <a class="boton" :href="`${base}/${s.portable}`">{{ t.descargar }} <code>{{ s.portable }}</code></a>
      </li>
    </ul>

    <h2 id="instaladores" tabindex="-1">{{ t.instaladores }}</h2>
    <p>{{ t.instaladoresTxt }}</p>
    <ul class="lista">
      <li v-for="s in sistemas" :key="s.nombre">
        <span>{{ s.nombre }}</span>
        <span class="archivos">
          <a v-for="f in s.instaladores" :key="f" :href="`${base}/${f}`"><code>{{ f }}</code></a>
        </span>
      </li>
    </ul>
    <p>
      <a :href="`${base}/SHA256SUMS.txt`">{{ t.sumas }}</a>
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
