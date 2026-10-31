/** Tamaño de un archivo en KB o MB, según el idioma. */
export function tamano(bytes: number, locale: string): string {
  const mb = bytes >= 1024 * 1024;
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit: mb ? "megabyte" : "kilobyte",
    maximumFractionDigits: 1,
  }).format(bytes / (mb ? 1024 * 1024 : 1024));
}
