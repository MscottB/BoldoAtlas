import { ref, watch } from "vue";
import { guardarPreferencia, leerPreferencia } from "@/lib/preferencias";
import { leerVista } from "./vista";

// Estado compartido por la barra, el lienzo y la leyenda: hay un solo lienzo en la app.
const config = ref(leerVista(leerPreferencia<unknown>("vista", null)));
watch(config, (c) => guardarPreferencia("vista", c), { deep: true });

export const useVista = () => ({ config });
