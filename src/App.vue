<script setup lang="ts">
import { Info, Network } from "@lucide/vue";
import { Toaster } from "@/components/ui/sonner";
import icono from "../assets/brand/icono.png";

const navegacion = [
  { to: "/", etiqueta: "Árbol", icono: Network },
  { to: "/acerca", etiqueta: "Acerca de", icono: Info },
];
</script>

<template>
  <div class="flex h-screen bg-background text-foreground">
    <nav
      class="flex w-56 shrink-0 flex-col gap-1 border-r bg-sidebar p-3 text-sidebar-foreground"
      aria-label="Navegación principal"
    >
      <p class="flex items-center gap-2 px-2 pb-3 text-base font-semibold tracking-tight">
        <img :src="icono" alt="" class="size-6" />
        <span>Boldo<span class="text-marca">Atlas</span></span>
      </p>
      <RouterLink
        v-for="item in navegacion"
        :key="item.to"
        :to="item.to"
        class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:outline-ring"
        active-class="bg-sidebar-accent font-medium"
      >
        <component :is="item.icono" class="size-4" aria-hidden="true" />
        {{ item.etiqueta }}
      </RouterLink>
    </nav>
    <main class="min-w-0 flex-1 overflow-auto">
      <RouterView />
    </main>
    <Toaster />
  </div>
</template>
