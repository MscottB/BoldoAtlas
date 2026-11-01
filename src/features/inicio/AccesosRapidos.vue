<script setup lang="ts">
import { useRouter, type RouteLocationRaw } from "vue-router";
import { useI18n } from "vue-i18n";
import { ArrowLeftRight, DatabaseBackup, Search } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { buscarPersona } from "@/features/atajos/buscarPersona";

// Pocos accesos directos de Inicio. «Buscar persona» abre la paleta de comandos, que no existe en esta pantalla.
const { t } = useI18n();
const router = useRouter();
const ir = (destino: RouteLocationRaw) => router.push(destino);
</script>

<template>
  <section aria-labelledby="inicio-accesos" class="flex flex-col gap-2">
    <h2 id="inicio-accesos" class="text-base font-semibold">{{ t("inicio.accesos") }}</h2>
    <div class="flex flex-wrap gap-2">
      <Button type="button" variant="outline" @click="buscarPersona(router)">
        <Search aria-hidden="true" />
        {{ t("inicio.buscarPersona") }}
      </Button>
      <Button type="button" variant="outline" @click="ir('/importar-exportar')">
        <ArrowLeftRight aria-hidden="true" />
        {{ t("nav.importarExportar") }}
      </Button>
      <Button type="button" variant="outline" @click="ir({ path: '/configuracion', hash: '#cfg-respaldos' })">
        <DatabaseBackup aria-hidden="true" />
        {{ t("menu.respaldos") }}
      </Button>
    </div>
  </section>
</template>
