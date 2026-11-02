<script setup lang="ts">
import { computed } from "vue";
import { withBase } from "vitepress";
import novedades from "../../novedades.json";
import { portada } from "./portadaNovedades";

// Las tarjetas de novedades, con la captura de la ayuda si la hay. La portada (`ultimas`) muestra solo las últimas;
// la página «Todas las novedades» muestra la lista completa.
const props = defineProps<{ lang: "es" | "en"; ultimas?: boolean }>();

const MAS = { es: "Leer más en el manual", en: "Read more in the manual" };

const urls = import.meta.glob("../../img/es/*.webp", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const urlsEn = import.meta.glob("../../en/img/en/*.webp", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const imgAyuda = (nombre: string) =>
  props.lang === "es" ? urls[`../../img/es/${nombre}.webp`] : urlsEn[`../../en/img/en/${nombre}.webp`];

const nuevas = computed(() =>
  (props.ultimas ? portada(novedades) : novedades).map((n) => {
    const x = (n as Record<string, any>)[props.lang];
    return {
      id: n.id,
      ...x,
      imagen: "imagen" in n ? imgAyuda(n.imagen as string) : undefined,
      href: `${props.lang === "es" ? "" : "/en"}/manual/${n.pagina}${x.ancla ? "#" + x.ancla : ""}`,
    };
  }),
);
</script>

<template>
  <ul class="nuevo" role="list">
    <li v-for="n in nuevas" :key="n.id">
      <img v-if="n.imagen" :src="n.imagen" :alt="n.alt" width="640" height="400" loading="lazy" decoding="async" />
      <div class="cuerpo">
        <h3>{{ n.titulo }}</h3>
        <p>{{ n.texto }}</p>
        <a class="mas" :href="withBase(n.href)">{{ MAS[lang] }} →</a>
      </div>
    </li>
  </ul>
</template>

<style scoped>
.nuevo {
  --pr-radio: 16px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr));
  gap: 20px;
  margin: 40px 0 0;
  padding: 0;
  list-style: none;
}
.nuevo li {
  display: flex;
  flex-direction: column;
  margin: 0;
  overflow: hidden;
  border: 1px solid var(--vp-c-divider);
  border-radius: var(--pr-radio);
  background: var(--vp-c-bg);
}
.nuevo img {
  display: block;
  width: 100%;
  aspect-ratio: 8 / 5;
  object-fit: cover;
  object-position: top left;
  border: 0;
  border-radius: 0;
  border-bottom: 1px solid var(--vp-c-divider);
}
.nuevo .cuerpo {
  padding: 24px;
}
.nuevo h3 {
  margin: 0;
  font-size: 1.125rem;
  line-height: 1.35;
  font-weight: 650;
  color: var(--vp-c-text-1);
}
.nuevo p {
  margin: 8px 0 0;
  color: var(--vp-c-text-2);
  line-height: 1.6;
}
a.mas {
  display: inline-block;
  margin-top: 16px;
  color: var(--vp-c-brand-1);
  font-weight: 600;
  text-decoration: none;
}
a.mas:hover {
  text-decoration: underline;
}
a:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 3px;
  border-radius: 6px;
}
</style>
