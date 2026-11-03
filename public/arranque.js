// Corre antes del primer pintado, fuera del paquete (la CSP no admite scripts en línea): deja el tema y el idioma de
// «Iniciando…». useTema e i18n los aplican de verdad al cargar.
(function () {
  function leer(clave) {
    try {
      return JSON.parse(localStorage.getItem("boldo:" + clave));
    } catch {
      return null;
    }
  }
  var raiz = document.documentElement;
  var tema = leer("tema");
  var oscuro = tema === "oscuro" || (tema !== "claro" && matchMedia("(prefers-color-scheme: dark)").matches);
  raiz.classList.toggle("dark", oscuro);
  var idioma = leer("idioma");
  raiz.lang =
    idioma === "es" || idioma === "en"
      ? idioma
      : navigator.language.toLowerCase().startsWith("es")
        ? "es"
        : "en";
})();
