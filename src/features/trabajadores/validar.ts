import { i18n } from "@/i18n";
import { normalizarTexto } from "@/lib/texto";

const t = i18n.global.t;

export const FOTO_MAX_BYTES = 1024 * 1024;
export const FOTO_TIPOS = ["image/png", "image/jpeg", "image/webp"];

// Forma mínima de correo (algo@dominio.ext); la unicidad la impone la base.
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Errores por campo (clave = campo del formulario); `{}` si la ficha es válida. */
export function validarFicha(f: {
  estado: "activo" | "vacante";
  nombre: string | null;
  cargo_id: string | null;
  correo: string | null;
}): Record<string, string> {
  const errores: Record<string, string> = {};
  if (f.estado === "activo" && !f.nombre?.trim()) errores.nombre = t("ficha.error.nombre");
  if (f.estado === "vacante" && !f.cargo_id) errores.cargo = t("ficha.error.cargo");
  const correo = f.correo?.trim();
  if (correo && !CORREO.test(correo)) errores.correo = t("ficha.error.correo");
  return errores;
}

/** Mensaje de error de la foto elegida, o null si sirve. */
export function validarFoto(archivo: { type: string; size: number }): string | null {
  if (!FOTO_TIPOS.includes(archivo.type)) return t("ficha.error.fotoTipo");
  if (archivo.size > FOTO_MAX_BYTES) return t("ficha.error.fotoPeso");
  return null;
}

/** ¿Ya hay un valor igual al texto, sin importar mayúsculas, tildes ni espacios? (decide si se ofrece "Agregar"). */
export const hayCoincidenciaExacta = (valores: { nombre: string }[], texto: string): boolean =>
  valores.some((v) => normalizarTexto(v.nombre) === normalizarTexto(texto));
