<script setup lang="ts">
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { Check, ImagePlus, ListChecks, X } from "@lucide/vue";
import BotonCerrarVista from "@/components/BotonCerrarVista.vue";
import BloquePlegable from "@/components/BloquePlegable.vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { logoComoPng, validarLogo } from "@/features/configuracion/logo";
import SeccionRespaldos from "@/features/respaldos/SeccionRespaldos.vue";
import SeccionActualizaciones from "@/features/actualizaciones/SeccionActualizaciones.vue";
import SeccionInicioSistema from "@/features/configuracion/SeccionInicioSistema.vue";
import { ACENTOS, textoSobre, type Acento } from "@/features/tema/tema";
import { ESCALAS, TEMAS, useTema } from "@/features/tema/useTema";
import { abrirAlPasar, guardarAbrirAlPasar } from "@/app/barraLateral";
import { cambiarIdioma, IDIOMAS, type Idioma } from "@/i18n";
import { useOrganizacion, type Resultado } from "@/stores/organizacion";
import { claseSelect, cn } from "@/lib/utils";

const { t, locale } = useI18n();
const org = useOrganizacion();
const { tema, acento, escala } = useTema();
const avisar = (r: Resultado) => {
  if (!r.ok) toast.error(r.mensaje);
};

// El nombre se guarda al salir del campo o con Enter: no hay botón «Guardar».
const nombre = ref(org.org.nombre);
watch(
  () => org.org.nombre,
  (n) => (nombre.value = n),
);
async function guardarNombre() {
  const limpio = nombre.value.trim();
  if (limpio !== org.org.nombre) avisar(await org.guardarOrg(limpio, org.org.logo));
}

const inputLogo = ref<HTMLInputElement | null>(null);
const errorLogo = ref("");
async function elegirLogo(e: Event) {
  const input = e.target as HTMLInputElement;
  const archivo = input.files?.[0];
  input.value = ""; // permite volver a elegir el mismo archivo
  if (!archivo) return;
  const falla = validarLogo(archivo);
  errorLogo.value = falla ? t(`config.logo.error.${falla}`) : "";
  if (falla) return;
  try {
    avisar(await org.guardarOrg(org.org.nombre, await logoComoPng(archivo)));
  } catch {
    errorLogo.value = t("config.logo.error.lectura");
  }
}
const quitarLogo = async () => {
  errorLogo.value = "";
  avisar(await org.guardarOrg(org.org.nombre, null));
};
</script>

<template>
  <section class="mx-auto flex max-w-3xl flex-col gap-8 p-6">
    <header class="flex items-center justify-between gap-2">
      <h1 class="text-lg font-semibold">{{ t("nav.configuracion") }}</h1>
      <BotonCerrarVista />
    </header>

    <section class="grid gap-4" aria-labelledby="cfg-organizacion">
      <h2 id="cfg-organizacion" class="font-medium">{{ t("config.organizacion.titulo") }}</h2>
      <div class="grid gap-1.5">
        <Label for="cfg-nombre">{{ t("config.organizacion.nombre") }}</Label>
        <Input
          id="cfg-nombre"
          v-model="nombre"
          class="max-w-sm"
          autocomplete="off"
          @keydown.enter.prevent="guardarNombre"
          @blur="guardarNombre"
        />
      </div>
      <div class="grid gap-1.5">
        <p class="text-sm font-medium">{{ t("config.logo.titulo") }}</p>
        <div class="flex flex-wrap items-center gap-3">
          <img
            v-if="org.org.logo"
            :src="`data:image/png;base64,${org.org.logo}`"
            :alt="t('config.logo.alt')"
            class="max-h-16 max-w-48 rounded-md border bg-white object-contain p-1"
          />
          <span v-else class="text-sm text-muted-foreground">{{ t("config.logo.sin") }}</span>
          <input
            ref="inputLogo"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            class="hidden"
            tabindex="-1"
            @change="elegirLogo"
          />
          <Button type="button" variant="outline" size="sm" @click="inputLogo?.click()">
            <ImagePlus aria-hidden="true" />
            {{ org.org.logo ? t("config.logo.cambiar") : t("config.logo.elegir") }}
          </Button>
          <Button v-if="org.org.logo" type="button" variant="outline" size="sm" @click="quitarLogo">
            <X aria-hidden="true" />
            {{ t("config.logo.quitar") }}
          </Button>
        </div>
        <p class="text-xs text-muted-foreground">{{ t("config.logo.ayuda") }}</p>
        <p v-if="errorLogo" role="alert" class="text-sm text-destructive">{{ errorLogo }}</p>
      </div>
    </section>

    <section class="grid gap-4" aria-labelledby="cfg-apariencia">
      <div>
        <h2 id="cfg-apariencia" class="font-medium">{{ t("config.apariencia.titulo") }}</h2>
        <p class="text-sm text-muted-foreground">{{ t("config.apariencia.ayuda") }}</p>
      </div>
      <div class="flex flex-wrap gap-6">
        <div class="grid gap-1.5">
          <Label for="cfg-tema">{{ t("config.tema.etiqueta") }}</Label>
          <select id="cfg-tema" v-model="tema" :class="claseSelect">
            <option v-for="m in TEMAS" :key="m" :value="m">{{ t(`config.tema.${m}`) }}</option>
          </select>
        </div>
        <div class="grid gap-1.5">
          <Label for="cfg-idioma">{{ t("idioma.etiqueta") }}</Label>
          <select
            id="cfg-idioma"
            :value="locale"
            :class="claseSelect"
            @change="cambiarIdioma(($event.target as HTMLSelectElement).value as Idioma)"
          >
            <option v-for="i in IDIOMAS" :key="i" :value="i">{{ t(`idioma.${i}`) }}</option>
          </select>
        </div>
      </div>
      <BloquePlegable clave="configuracion.apariencia" :titulo="t('config.apariencia.mas')" class="text-sm">
        <div class="grid gap-4 pt-2 pl-5">
          <div class="grid gap-1.5">
            <Label for="cfg-escala">{{ t("config.escala.etiqueta") }}</Label>
            <select id="cfg-escala" v-model="escala" :class="cn(claseSelect, 'w-fit')">
              <option v-for="e in ESCALAS" :key="e" :value="e">{{ e }} %</option>
            </select>
          </div>
          <div role="group" aria-labelledby="cfg-acento" class="grid gap-1.5">
            <p id="cfg-acento" class="font-medium">{{ t("config.acento.etiqueta") }}</p>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="(color, a) in ACENTOS"
                :key="a"
                type="button"
                :aria-pressed="acento === a"
                class="flex items-center gap-2 rounded-lg border px-2 py-1 text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                :class="acento === a ? 'border-foreground' : 'border-border'"
                @click="acento = a as Acento"
              >
                <span
                  class="grid size-5 place-items-center rounded-full"
                  :style="{ background: color, color: textoSobre(color) }"
                  aria-hidden="true"
                >
                  <Check v-if="acento === a" class="size-3.5" />
                </span>
                {{ t(`config.acento.${a}`) }}
              </button>
            </div>
          </div>
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              class="size-4 accent-primary"
              :checked="abrirAlPasar"
              @change="guardarAbrirAlPasar(($event.target as HTMLInputElement).checked)"
            />
            {{ t("config.barra.abrirAlPasar") }}
          </label>
        </div>
      </BloquePlegable>
    </section>

    <section class="grid gap-2" aria-labelledby="cfg-mantenedores">
      <h2 id="cfg-mantenedores" class="font-medium">{{ t("mantenedores.titulo") }}</h2>
      <p class="text-sm text-muted-foreground">{{ t("config.mantenedores.texto") }}</p>
      <Button as-child variant="outline" class="w-fit">
        <RouterLink to="/configuracion/mantenedores">
          <ListChecks aria-hidden="true" />
          {{ t("config.mantenedores.abrir") }}
        </RouterLink>
      </Button>
    </section>

    <SeccionRespaldos />

    <SeccionActualizaciones />

    <SeccionInicioSistema />
  </section>
</template>
