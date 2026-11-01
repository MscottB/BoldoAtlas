<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { Button } from "@/components/ui/button";
import { listarRespaldos } from "@/db/cliente";
import { useAvisos } from "@/features/revision/useAvisos";
import { ultimoRespaldo } from "@/features/respaldos/programa";
import { usePestanas } from "@/features/pestanas/usePestanas";
import { useOrganizacion } from "@/stores/organizacion";
import { totalesInicio } from "./totales";

// «Tu organización» de Inicio (solo con datos): nombre, totales que llevan a su vista, último respaldo y la vuelta al trabajo.
const { t, locale } = useI18n();
const org = useOrganizacion();
const pestanas = usePestanas();

// Los totales y los avisos se calculan tras el primer pintado: con una organización muy grande no retrasan la pantalla.
const listo = ref(false);
const totales = computed(() => (listo.value ? totalesInicio(org) : null));
const avisos = computed(() => (listo.value ? useAvisos().value.total : null));
const respaldo = ref<Date | null | undefined>(undefined); // undefined: aún no se sabe; null: no hay
onMounted(() => {
  setTimeout(() => (listo.value = true), 0);
  // Fuera de la app de escritorio, o si la carpeta no se puede leer, simplemente no se muestra la fecha.
  listarRespaldos().then(
    (l) => (respaldo.value = ultimoRespaldo(l)),
    () => (respaldo.value = undefined),
  );
});

const fecha = computed(() =>
  respaldo.value
    ? new Intl.DateTimeFormat(locale.value, { dateStyle: "medium", timeStyle: "short" }).format(
        respaldo.value,
      )
    : "",
);

const cifras = computed(() => [
  { id: "unidades", n: totales.value?.unidades, to: "/" },
  { id: "personas", n: totales.value?.personas, to: "/directorio" },
  { id: "vacantes", n: totales.value?.vacantes, to: "/revision" },
  { id: "avisos", n: avisos.value, to: "/revision" },
]);
</script>

<template>
  <section aria-labelledby="inicio-organizacion" class="flex flex-col gap-4 rounded-lg border bg-card p-4">
    <h2 id="inicio-organizacion" class="text-base font-semibold break-words">
      <span class="block text-sm font-normal text-muted-foreground">{{ t("inicio.organizacion") }}</span>
      {{ org.org.nombre || t("barra.sinNombre") }}
    </h2>

    <ul class="grid grid-cols-2 gap-2 sm:grid-cols-4" :aria-busy="!listo">
      <li v-for="c in cifras" :key="c.id">
        <RouterLink
          :to="c.to"
          class="flex h-full flex-col rounded-md border p-3 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
        >
          <span class="text-2xl font-semibold tabular-nums">{{ c.n ?? "…" }}</span>
          <span class="text-sm text-muted-foreground">{{ t(`inicio.${c.id}`) }}</span>
        </RouterLink>
      </li>
    </ul>

    <p v-if="respaldo !== undefined" class="text-sm text-muted-foreground">
      {{ respaldo ? t("inicio.ultimoRespaldo", { fecha }) : t("inicio.sinRespaldo") }}
    </p>

    <div>
      <Button id="inicio-volver" type="button" @click="pestanas.volverAlProyecto()">
        {{ t("bienvenida.volver") }}
      </Button>
    </div>
  </section>
</template>
