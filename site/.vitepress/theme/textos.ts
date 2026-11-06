import comunesEn from "../../textos/en/comunes.json";
import comunesEs from "../../textos/es/comunes.json";
import funcionesEn from "../../textos/en/funciones.json";
import funcionesEs from "../../textos/es/funciones.json";
import inicioEn from "../../textos/en/inicio.json";
import inicioEs from "../../textos/es/inicio.json";
import type { Funcion, Lang } from "./tipos";

// Los textos de cada página, desde site/textos/<idioma>/*.json (la prueba textos.test.mjs los revisa).
const TEXTOS = {
  es: {
    comunes: comunesEs,
    inicio: inicioEs,
    funciones: { ...funcionesEs, items: funcionesEs.items as Funcion[] },
  },
  en: {
    comunes: comunesEn,
    inicio: inicioEn,
    funciones: { ...funcionesEn, items: funcionesEn.items as Funcion[] },
  },
};

export const textos = (lang: Lang) => TEXTOS[lang];
