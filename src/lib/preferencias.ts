const PREFIJO = "boldo:";

// localStorage puede estar bloqueado o corrupto: una preferencia nunca debe romper la app.
export function leerPreferencia<T>(clave: string, porDefecto: T): T {
  try {
    const crudo = localStorage.getItem(PREFIJO + clave);
    return crudo === null ? porDefecto : (JSON.parse(crudo) as T);
  } catch {
    return porDefecto;
  }
}

export function guardarPreferencia(clave: string, valor: unknown): void {
  try {
    localStorage.setItem(PREFIJO + clave, JSON.stringify(valor));
  } catch {
    // sin persistencia: la preferencia vale solo para esta sesión
  }
}
