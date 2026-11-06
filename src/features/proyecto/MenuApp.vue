<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { ChevronDown, FolderOpen, LogOut } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import icono from "../../../assets/brand/icono.png";
import { ORGANIZACIONES_VISIBLES } from "@/app/proximamente";
import { pedirSalir } from "@/app/ventana";
import { IDIOMAS, cambiarIdioma, type Idioma } from "@/i18n";
import { baseActual } from "@/lib/baseActiva";
import { useOrganizaciones } from "@/stores/organizaciones";
import { GRUPOS_MENU, abrirOtra, entradasAbrirOtra, irAEntrada } from "./menuApp";

// Menú de la app: el logo en la barra superior. Cada entrada lleva a una ruta o hace una acción (p. ej. buscar
// actualizaciones); las de fases futuras solo salen (deshabilitadas) con MOSTRAR_PROXIMAMENTE.
const { t, locale } = useI18n();
const router = useRouter();
const organizaciones = useOrganizaciones();
const otras = computed(() => entradasAbrirOtra(organizaciones.recientes, baseActual()));
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" size="sm" class="px-1.5" :aria-label="t('menu.abrir')" :title="t('menu.abrir')">
        <img :src="icono" alt="" class="size-5 dark:rounded-md dark:bg-primary dark:p-0.5" />
        <ChevronDown aria-hidden="true" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" class="w-64">
      <template v-for="(grupo, i) in GRUPOS_MENU" :key="i">
        <DropdownMenuSeparator v-if="i" />
        <DropdownMenuItem v-for="e in grupo" :key="e.id" :disabled="!!e.fase" @select="irAEntrada(e, router)">
          <component :is="e.icono" aria-hidden="true" />
          {{ t(`menu.${e.id}`) }}
          <span v-if="e.fase" class="ml-auto text-xs">{{ t(e.fase) }}</span>
        </DropdownMenuItem>
      </template>
      <template v-if="ORGANIZACIONES_VISIBLES && otras.length">
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <FolderOpen aria-hidden="true" />
            {{ t("menu.abrirOtra") }}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem v-for="o in otras" :key="o.id" @select="abrirOtra(o.id)">
              {{ o.nombre || t("barra.sinNombre") }}
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </template>
      <DropdownMenuSeparator />
      <DropdownMenuLabel id="menu-idioma">{{ t("idioma.etiqueta") }}</DropdownMenuLabel>
      <DropdownMenuRadioGroup
        :model-value="locale"
        aria-labelledby="menu-idioma"
        @update:model-value="cambiarIdioma($event as Idioma)"
      >
        <DropdownMenuRadioItem v-for="i in IDIOMAS" :key="i" :value="i" :lang="i">
          {{ t(`idioma.${i}`) }}
        </DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem @select="pedirSalir">
        <LogOut aria-hidden="true" />
        {{ t("bandeja.salir") }}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
