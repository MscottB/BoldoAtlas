<script setup lang="ts">
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { ChevronDown } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import icono from "../../../assets/brand/icono.png";
import { GRUPOS_MENU, irAEntrada } from "./menuApp";

// Menú de la app: el logo en la barra superior. Cada entrada es una ruta; las de fases futuras salen deshabilitadas.
const { t } = useI18n();
const router = useRouter();
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" size="sm" class="px-1.5" :aria-label="t('menu.abrir')" :title="t('menu.abrir')">
        <img :src="icono" alt="" class="size-5" />
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
    </DropdownMenuContent>
  </DropdownMenu>
</template>
