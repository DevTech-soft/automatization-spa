/**
 * Better Auth responde los errores en inglés; aquí se traducen por código para
 * mostrarlos en el login y en la página de seguridad. Lo que no esté mapeado
 * cae en el mensaje genérico de quien llama.
 */
const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "Correo o contraseña incorrectos.",
  INVALID_PASSWORD: "La contraseña actual no es correcta.",
  PASSWORD_TOO_SHORT: "La contraseña nueva debe tener al menos 12 caracteres.",
  PASSWORD_TOO_LONG: "La contraseña nueva es demasiado larga.",
  INVALID_CODE: "El código no es válido. Revisa que la hora del teléfono esté bien y prueba con el siguiente.",
  INVALID_BACKUP_CODE: "Ese código de respaldo no es válido o ya se usó.",
  TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: "Demasiados intentos. Vuelve a iniciar sesión.",
  INVALID_TWO_FACTOR_COOKIE: "La verificación expiró. Vuelve a iniciar sesión.",
  TWO_FACTOR_NOT_ENABLED: "La verificación en dos pasos no está activa.",
  TOTP_NOT_ENABLED: "La verificación en dos pasos no está activa.",
};

export function authErrorMessage(
  error: { code?: string | undefined; status?: number; message?: string | undefined } | null | undefined,
  fallback: string,
): string {
  if (error?.code && MESSAGES[error.code]) return MESSAGES[error.code]!;
  if (error?.status === 429) return "Demasiados intentos. Espera un momento y vuelve a probar.";
  return fallback;
}
