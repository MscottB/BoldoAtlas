import type { CamposTrabajador } from "@/db/repos/trabajadores";
import { i18n } from "@/i18n";
import { normalizarTexto } from "@/lib/texto";

const t = i18n.global.t;

/** Lo que se guarda: la foto ya optimizada y el logo. */
export const FOTO_MAX_BYTES = 1024 * 1024;
/** Lo que se acepta elegir: la foto se reduce al elegirla, y una de teléfono pesa varios MB. */
export const FOTO_ENTRADA_MAX_BYTES = 30 * 1024 * 1024;
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
  if (archivo.size > FOTO_ENTRADA_MAX_BYTES) return t("ficha.error.fotoPeso");
  return null;
}

/** ¿Ya hay un valor igual al texto, sin importar mayúsculas, tildes ni espacios? (decide si se ofrece "Agregar"). */
export const hayCoincidenciaExacta = (valores: { nombre: string }[], texto: string): boolean =>
  valores.some((v) => normalizarTexto(v.nombre) === normalizarTexto(texto));

/**
 * Lo que edita la ficha. Foto y notas no vienen en la lista: `notas` undefined en lo guardado es que aún no se cargaron, y
 * `foto_png` undefined en el formulario es que no se tocó (null la quita). En ninguno de los dos casos se escribe.
 */
export type DatosFicha = CamposTrabajador;

const CAMPOS_FICHA: (keyof DatosFicha)[] = [
  "nombre",
  "correo",
  "telefono",
  "tipo_contrato_id",
  "sede_id",
  "jornada_id",
  "foto_png",
  "notas",
];

/** Lo que se guarda: textos recortados y en blanco como null (el nombre es obligatorio: solo se recorta). */
export const normalizarFicha = (f: DatosFicha): DatosFicha => ({
  ...f,
  nombre: f.nombre.trim(),
  correo: f.correo?.trim() || null,
  telefono: f.telefono?.trim() || null,
  // Unas notas sin cargar no son unas notas vacías: convertirlas en null las borraría al guardar.
  ...(f.notas === undefined ? {} : { notas: f.notas?.trim() || null }),
});

/** Campos del formulario que difieren de lo guardado (o de la ficha vacía si es nueva), ya normalizados. */
export function cambiosFicha(form: DatosFicha, base: DatosFicha): Partial<DatosFicha> {
  const f = normalizarFicha(form);
  const b = normalizarFicha(base);
  return Object.fromEntries(
    CAMPOS_FICHA.filter(
      (k) => f[k] !== undefined && f[k] !== b[k] && !(k === "notas" && b.notas === undefined),
    ).map((k) => [k, f[k]]),
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
