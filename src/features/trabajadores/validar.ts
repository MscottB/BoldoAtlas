import type { Trabajador } from "@/db/tipos";
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

export type DatosFicha = Omit<Trabajador, "id">;

/** Lo que se guarda: textos recortados y en blanco como null. */
export const normalizarFicha = (f: DatosFicha): DatosFicha => ({
  ...f,
  nombre: f.nombre?.trim() || null,
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

// Campo del formulario → clave de su error en `validarFicha`.
const CLAVE_ERROR: Partial<Record<keyof DatosFicha, string>> = {
  nombre: "nombre",
  cargo_id: "cargo",
  correo: "correo",
};

/**
 * De los cambios de una ficha ya creada, los que se pueden guardar ahora: cada campo vale por sí solo.
 * El estado exige que el nombre (Persona) o el cargo (Vacante) ya estén; la base lo rechaza si no.
 */
export function camposGuardables(
  cambios: Partial<DatosFicha>,
  errores: Record<string, string>,
): Partial<DatosFicha> {
  return Object.fromEntries(
    Object.entries(cambios).filter(([k]) =>
      k === "estado" ? !errores.nombre && !errores.cargo : !errores[CLAVE_ERROR[k as keyof DatosFicha] ?? ""],
    ),
  );
}
