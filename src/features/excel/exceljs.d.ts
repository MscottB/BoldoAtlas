// La versión sin polyfills (core-js, regenerator): la completa cambia globales de toda la ventana al cargarse. Es la
// misma ExcelJS; los tipos son los del paquete.
declare module "exceljs/dist/exceljs.bare.min.js" {
  import * as ExcelJS from "exceljs";
  export default ExcelJS;
}
