<script setup lang="ts">
import { computed } from "vue";
import { withBase } from "vitepress";
import novedades from "../../novedades.json";
import { imgAyuda } from "./imagenesAyuda";
import { portada } from "./portadaNovedades";

// Las novedades, con la captura de la ayuda si la hay. La portada (`ultimas`) muestra solo las últimas;
// la página «Todas las novedades» muestra la lista completa. Las que no tienen captura van a todo el ancho.
const props = defineProps<{ lang: "es" | "en"; ultimas?: boolean }>();

const MAS = { es: "Leer más en el manual", en: "Read more in the manual" };
const RECIENTE = { es: "Lo más reciente", en: "Latest" };

const nuevas = computed(() =>
  (props.ultimas ? portada(novedades) : novedades).map((n) => {
    const x = (n as Record<string, any>)[props.lang];
    return {
      id: n.id,
      ...x,
      imagen: "imagen" in n ? imgAyuda(props.lang, n.imagen as string) : undefined,
      href: `${props.lang === "es" ? "" : "/en"}/manual/${n.pagina}${x.ancla ? "#" + x.ancla : ""}`,
    };
  }),
);
</script>

<template>
  <ul class="nuevo" role="list">
    <li v-for="(n, i) in nuevas" :key="n.id" :class="n.imagen ? 'con-imagen' : 'sin-imagen'">
      <img v-if="n.imagen" :src="n.imagen" :alt="n.alt" width="640" height="400" loading="lazy" decoding="async" />
      <div class="cuerpo">
        <div class="encabezado">
          <p v-if="i === 0" class="reciente">{{ RECIENTE[lang] }}</p>
          <!-- en la portada cuelga de un h2; en su página, del h1 -->
          <component :is="ultimas ? 'h3' : 'h2'" class="titulo">{{ n.titulo }}</component>
        </div>
        <div class="detalle">
          <p class="texto">{{ n.texto }}</p>
          <a class="mas" :href="withBase(n.href)" :aria-label="`${MAS[lang]}: ${n.titulo}`">{{ MAS[lang] }} →</a>
        </div>
      </div>
    </li>
  </ul>
</template>

<style scoped>
.nuevo {
  display: flex; /* flex y no grid: la tarjeta que queda sola en su fila ocupa el ancho, sin dejar un hueco */
  flex-wrap: wrap;
  gap: 20px;
  margin: 40px 0 0 !important; /* la portada le quita el margen a sus listas */
  padding: 0;
  list-style: none;
}
.nuevo li {
  display: flex;
  flex: 1 1 min(100%, 20rem);
  flex-direction: column;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  border: 1px solid var(--vp-c-divider);
  border-radius: 16px;
  background: var(--vp-c-bg);
}
.nuevo img {
  display: block;
  width: 100%;
  height: auto;
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
.nuevo .titulo {
  margin: 0;
  padding: 0;
  border: 0;
  font-size: 1.25rem;
  line-height: 1.3;
  letter-spacing: -0.01em;
  font-weight: 650;
  color: var(--vp-c-text-1);
}
.nuevo .reciente {
  margin: 0 0 8px;
  color: var(--vp-c-brand-1);
  font-size: 0.8125rem;
  font-weight: 700;
  letter-spacing: 0.04em;
}
.nuevo .texto {
  margin: 8px 0 0;
  color: var(--vp-c-text-2);
  line-height: 1.6;
}
.nuevo a.mas {
  display: inline-block;
  margin-top: 16px;
  color: var(--vp-c-brand-1);
  font-weight: 600;
  text-decoration: none;
}
.nuevo a.mas:hover {
  text-decoration: underline;
}
.nuevo a:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 3px;
  border-radius: 6px;
}
.nuevo .sin-imagen {
  flex-basis: 100%;
}
@media (min-width: 768px) {
  /* sin captura: una fila a todo el ancho, con el título a un lado y el texto al otro */
  .nuevo .sin-imagen .cuerpo {
    display: grid;
    grid-template-columns: 5fr 7fr;
    gap: 32px;
    align-items: start;
  }
  .nuevo .sin-imagen .texto {
    margin-top: 0;
  }
}
</style>
