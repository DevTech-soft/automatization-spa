import type { CSSProperties } from "react";

/**
 * Tiñe el portal con el color primario del negocio (pestaña Marca). Reemplaza
 * los tokens de acento del tema; el texto encima se elige blanco o casi negro
 * según la luminancia, para que un color claro de marca no quede ilegible.
 */
export function brandStyle(colorPrimary: string | null): CSSProperties | undefined {
  if (!colorPrimary || !/^#[0-9a-f]{6}$/i.test(colorPrimary)) {
    return undefined;
  }

  const channel = (offset: number) => {
    const value = parseInt(colorPrimary.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);

  return {
    "--color-primary": colorPrimary,
    "--color-ring": colorPrimary,
    "--color-primary-fg": luminance > 0.45 ? "hsl(240 10% 12%)" : "hsl(0 0% 100%)",
  } as CSSProperties;
}
