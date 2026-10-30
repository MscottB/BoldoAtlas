import { ref, watch } from "vue";
import { guardarPreferencia, leerPreferencia } from "../../lib/preferencias";
import { ACENTOS, textoSobre, type Acento, type Escala, type Tema } from "./tema";

export const TEMAS: Tema[] = ["claro", "oscuro", "sistema"];
export const ESCALAS: Escala[] = [90, 100, 110, 125];

// Estado a nivel de módulo: una sola fuente de verdad para main.ts y Configuración.
// Se valida lo leído: una preferencia corrupta no debe dejar la interfaz rota.
const leerValido = <T>(clave: string, validos: readonly T[], porDefecto: T): T => {
  const v = leerPreferencia<T>(clave, porDefecto);
  return validos.includes(v) ? v : porDefecto;
};

const tema = ref<Tema>(leerValido("tema", TEMAS, "sistema"));
const acento = ref<Acento>(leerValido("acento", Object.keys(ACENTOS) as Acento[], "cobre"));
const escala = ref<Escala>(leerValido("escala", ESCALAS, 100));

let mediaOscuro: MediaQueryList | undefined; // se crea en iniciar(): importar el módulo no debe tocar window

export function aplicar(): void {
  const raiz = document.documentElement;
  const oscuro = tema.value === "oscuro" || (tema.value === "sistema" && !!mediaOscuro?.matches);
  raiz.classList.toggle("dark", oscuro);
  raiz.style.colorScheme = oscuro ? "dark" : "light";
  const color = ACENTOS[acento.value];
  raiz.style.setProperty("--marca", color);
  raiz.style.setProperty("--marca-foreground", textoSobre(color));
  raiz.style.fontSize = `${escala.value}%`;
}

let iniciado = false;
function iniciar(): void {
  if (iniciado) return;
  iniciado = true;
  if (typeof window !== "undefined") {
    mediaOscuro = window.matchMedia("(prefers-color-scheme: dark)");
    mediaOscuro.addEventListener("change", () => {
      if (tema.value === "sistema") aplicar();
    });
  }
  watch(tema, (v) => (guardarPreferencia("tema", v), aplicar()));
  watch(acento, (v) => (guardarPreferencia("acento", v), aplicar()));
  watch(escala, (v) => (guardarPreferencia("escala", v), aplicar()));
}

export function useTema() {
  iniciar();
  return { tema, acento, escala, aplicar };
}
