import { createI18n } from "vue-i18n";
import { guardarPreferencia, leerPreferencia } from "@/lib/preferencias";
import es from "./es.json";
import en from "./en.json";

export type Idioma = "es" | "en";
export const IDIOMAS: Idioma[] = ["es", "en"];

/** `es*` → español; cualquier otro idioma del sistema → inglés. */
export const idiomaInicial = (navegador: string): Idioma =>
  navegador.toLowerCase().startsWith("es") ? "es" : "en";

function elegirInicial(): Idioma {
  // Sin ventana (tests en node) no hay preferencia ni idioma del sistema: se usa español.
  if (typeof window === "undefined") return "es";
  const guardado = leerPreferencia<string>("idioma", "");
  return IDIOMAS.includes(guardado as Idioma) ? (guardado as Idioma) : idiomaInicial(navigator.language);
}
const inicial = elegirInicial();

export const i18n = createI18n({
  legacy: false,
  locale: inicial,
  fallbackLocale: "es",
  messages: { es, en },
});

function aplicarLang(idioma: Idioma): void {
  if (typeof document !== "undefined") document.documentElement.lang = idioma;
}
aplicarLang(inicial);

export function cambiarIdioma(idioma: Idioma): void {
  i18n.global.locale.value = idioma;
  guardarPreferencia("idioma", idioma);
  aplicarLang(idioma);
}
