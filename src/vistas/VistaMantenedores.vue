<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { ArrowLeft } from "@lucide/vue";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TablaOrdenable } from "@/db/repos/catalogos";
import ListaMantenedor from "@/features/configuracion/ListaMantenedor.vue";

const TABLAS: TablaOrdenable[] = [
  "cargos",
  "tipos_contrato",
  "sedes",
  "jornadas",
  "tipos_unidad",
  "leyendas",
];
const { t } = useI18n();
const pestana = ref<TablaOrdenable>("cargos");
</script>

<template>
  <section class="mx-auto flex max-w-5xl flex-col gap-4 p-6">
    <RouterLink
      to="/configuracion"
      class="flex w-fit items-center gap-1 rounded-md text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
    >
      <ArrowLeft class="size-4" aria-hidden="true" />
      {{ t("mantenedores.volver") }}
    </RouterLink>
    <h1 class="text-lg font-semibold">{{ t("mantenedores.titulo") }}</h1>
    <Tabs v-model="pestana">
      <TabsList :aria-label="t('mantenedores.listas')">
        <TabsTrigger v-for="tabla in TABLAS" :key="tabla" :value="tabla">
          {{ t(`mantenedores.tabs.${tabla}`) }}
        </TabsTrigger>
      </TabsList>
      <TabsContent v-for="tabla in TABLAS" :key="tabla" :value="tabla" class="pt-4">
        <ListaMantenedor :tabla="tabla" />
      </TabsContent>
    </Tabs>
  </section>
</template>
