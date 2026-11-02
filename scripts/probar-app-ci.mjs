// Entrada de la prueba de humo, en su propio archivo: no hay condición que deje salir con 0 sin haberla corrido.
import { principal } from "./probar-app.mjs";

// process.exit: los hijos de WebView2 pueden seguir teniendo abiertas las tuberías un momento
principal().then(
  () => process.exit(0),
  () => process.exit(1),
);
