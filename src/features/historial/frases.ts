import type { AccionBreve, FilaBreve, Traducir } from "./tipos";

// Se nombran con su sustantivo («la unidad Ventas»); los catálogos son «el valor …» y lo demás, solo su nombre.
const COSAS = new Set([
  "unidades",
  "trabajadores",
  "puestos",
  "asignaciones",
  "conexiones",
  "etiquetas",
  "zonas",
  "vistas",
  "leyendas",
  "unidad_etiquetas",
  "zona_unidades",
  "subarboles_guardados",
  "meta",
]);
const VALORES = new Set(["cargos", "sedes", "jornadas", "tipos_contrato", "tipos_unidad"]);
// Los que llevan el nombre; sin él se dice solo el sustantivo («una unidad»). Los demás nunca lo llevan.
const CON_NOMBRE = new Set([
  "unidades",
  "trabajadores",
  "puestos",
  "asignaciones",
  "etiquetas",
  "zonas",
  "vistas",
  "leyendas",
  "valor",
  "otra",
]);

function cosa(f: FilaBreve | undefined, t: Traducir): string {
  const grupo = !f ? "otra" : COSAS.has(f.tabla) ? f.tabla : VALORES.has(f.tabla) ? "valor" : "otra";
  return !f?.nombre && CON_NOMBRE.has(grupo)
    ? t(`historial.sinNombre.${grupo}`)
    : t(`historial.cosa.${grupo}`, { nombre: f?.nombre });
}

function deFila(f: FilaBreve, t: Traducir): string {
  const nombre = f.nombre ?? cosa(f, t);
  if (f.op === "insert") return t("historial.frase.crear", { cosa: cosa(f, t) });
  if (f.op === "delete" || f.elimina) return t("historial.frase.eliminar", { cosa: cosa(f, t) });
  if (f.campos.includes("deleted_at")) return t("historial.frase.restaurar", { cosa: cosa(f, t) });
  if (f.campos.includes("parent_id")) return t("historial.frase.mover", { nombre });
  if (f.nombre_antes && f.nombre_despues)
    return t("historial.frase.renombrar", { antes: f.nombre_antes, despues: f.nombre_despues });
  return t("historial.frase.cambiar", { nombre });
}

/** La frase de una acción, armada con sus filas: Rust no guarda textos. La nombra su primera fila de la muestra. */
export function frase(a: AccionBreve, t: Traducir): string {
  if (a.origen === "importar" || a.origen === "revisar")
    return t(
      "historial.frase.importar",
      { archivo: a.datos.archivo || t("historial.unArchivo"), n: a.filas },
      a.filas,
    );
  const f = a.muestra[0];
  // el nombre de antes: el de ahora es el relleno
  if (a.origen === "suprimir")
    return t("historial.frase.suprimir", { nombre: f?.nombre_antes ?? f?.nombre ?? "" });
  const una = f ? deFila(f, t) : t("historial.frase.cambiar", { nombre: cosa(f, t) });
  const mas = a.filas - 1;
  return mas > 0 ? t("historial.frase.mas", { frase: una, n: mas }, mas) : una;
}
