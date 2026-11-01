<script setup lang="ts">
import { onMounted, type Component } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { FolderTree, ListChecks, Network, User, Users } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { usePestanas } from "@/features/pestanas/usePestanas";
import { hace } from "./recientes";
import { useRecientes } from "./useRecientes";

// «Abierto recientemente» de Inicio: lo último que se abrió en esta organización. Abrirlo usa la navegación de las
// pestañas: queda en la pestaña activa, o se activa la que ya lo muestra.
const { t, locale } = useI18n();
const router = useRouter();
const recientes = useRecientes();
const pestanas = usePestanas();

onMounted(recientes.depurar);

const ICONOS: Record<string, Component> = {
  arbol: Network,
  arboles: FolderTree,
  directorio: Users,
  revision: ListChecks,
};
function icono(ruta: string): Component {
  const r = router.resolve(ruta);
  return r.query.persona ? User : (ICONOS[String(r.name)] ?? Network);
}

const ahora = Date.now();
const relativo = new Intl.RelativeTimeFormat(locale.value, { numeric: "auto" });
function cuando(en: number): string {
  const h = hace(en, ahora);
  return h ? relativo.format(h.valor, h.unidad) : t("inicio.ahora");
}

function borrar() {
  recientes.vaciar();
  toast.success(t("inicio.recientesBorrada"));
  // La sección desaparece: el foco pasa al botón principal de la página, no se pierde.
  document.getElementById("inicio-volver")?.focus();
}
</script>

<template>
  <section v-if="recientes.visibles.length" aria-labelledby="inicio-recientes" class="flex flex-col gap-2">
    <div class="flex items-center justify-between gap-2">
      <h2 id="inicio-recientes" class="text-base font-semibold">{{ t("inicio.recientes") }}</h2>
      <Button type="button" variant="ghost" size="sm" @click="borrar">{{
        t("inicio.borrarRecientes")
      }}</Button>
    </div>
    <ul class="flex flex-col rounded-lg border bg-card">
      <li v-for="r in recientes.visibles" :key="r.ruta" class="border-b last:border-b-0">
        <RouterLink
          :to="r.ruta"
          class="flex items-center gap-3 px-3 py-2 text-sm hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        >
          <component :is="icono(r.ruta)" class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span class="min-w-0 flex-1 truncate" :title="pestanas.titulo(r)">{{ pestanas.titulo(r) }}</span>
          <span class="shrink-0 text-xs text-muted-foreground">{{ cuando(r.en) }}</span>
        </RouterLink>
      </li>
    </ul>
  </section>
</template>
