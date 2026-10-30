import type { Trabajador } from "@/db/tipos";
import { i18n } from "@/i18n";
import { normalizarTexto } from "@/lib/texto";

const t = i18n.global.t;

export const FOTO_MAX_BYTES = 1024 * 1024;
export const FOTO_TIPOS = ["image/png", "image/jpeg", "image/webp"];

// Forma mínima de correo (algo@dominio.ext); la unicidad la impone la base.
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Errores por campo (clave = campo del formulario); `{}` si la ficha es válida. */
export function validarFicha(f: { nombre: string; correo: string | null }): Record<string, string> {
  const errores: Record<string, string> = {};
  if (!f.nombre.trim()) errores.nombre = t("ficha.error.nombre");
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

export type DatosFicha = Omit<Trabajador, "id">;

/** Lo que se guarda: textos recortados y en blanco como null (el nombre es obligatorio: solo se recorta). */
export const normalizarFicha = (f: DatosFicha): DatosFicha => ({
  ...f,
  nombre: f.nombre.trim(),
  correo: f.correo?.trim() || null,
  telefono: f.telefono?.trim() || null,
  notas: f.notas?.trim() || null,
});

/** Campos del formulario que difieren de lo guardado (o de la ficha vacía si es nueva), ya normalizados. */
export function cambiosFicha(form: DatosFicha, base: DatosFicha): Partial<DatosFicha> {
  const f = normalizarFicha(form);
  const b = normalizarFicha(base);
  return Object.fromEntries(
    Object.entries(f).filter(([k, v]) => k !== "id" && v !== b[k as keyof DatosFicha]),
  );
}

/** ¿Cerrar la ficha perdería algo? */
export const hayCambiosSinGuardar = (form: DatosFicha, base: DatosFicha): boolean =>
  Object.keys(cambiosFicha(form, base)).length > 0;

/** De los cambios de una ficha ya creada, los que se pueden guardar ahora: cada campo vale por sí solo. */
export function camposGuardables(
  cambios: Partial<DatosFicha>,
  errores: Record<string, string>,
): Partial<DatosFicha> {
  // Las claves de `validarFicha` son los nombres de los campos.
  return Object.fromEntries(Object.entries(cambios).filter(([k]) => !errores[k]));
}
