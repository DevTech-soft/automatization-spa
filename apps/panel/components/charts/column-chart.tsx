"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Columnas de una sola serie (p. ej. citas por día). Sigue la guía de dataviz:
 * columnas de máximo 24 px con la punta redondeada y la base recta, 2 px de aire
 * entre columnas vecinas, cuadrícula de 1 px recesiva, eje Y con números
 * redondos, etiquetas X solo en algunos puntos y tooltip por columna al pasar el
 * mouse o enfocar con teclado. Una serie no lleva leyenda: el título la nombra.
 *
 * Los textos del tooltip llegan ya formateados (`tooltip`) porque el server
 * component no le puede pasar funciones de formato a un componente de cliente.
 */

export interface ColumnPoint {
  key: string;
  /** Etiqueta corta del eje X (`3 oct`). */
  label: string;
  value: number;
  /** Líneas del tooltip; la primera va en negrita. */
  tooltip: string[];
}

/** Máximo "redondo" y paso del eje para ~4 marcas (0 / 5 / 10 / 15 / 20). */
function niceScale(max: number): { top: number; step: number } {
  if (max <= 0) return { top: 4, step: 1 };
  const rough = max / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? 10 * magnitude;
  const roundedStep = Math.max(1, Math.round(step));
  return { top: Math.ceil(max / roundedStep) * roundedStep, step: roundedStep };
}

export function ColumnChart({
  points,
  height = 220,
  emptyText = "Sin datos en el rango.",
  tableCaption,
}: {
  points: ColumnPoint[];
  height?: number;
  emptyText?: string;
  /** Título de la tabla accesible equivalente (debajo, plegada). */
  tableCaption: string;
}) {
  const [hover, setHover] = useState<number | null>(null);

  if (points.length === 0) {
    return <p className="py-10 text-center text-sm text-[var(--color-fg-muted)]">{emptyText}</p>;
  }

  const { top, step } = niceScale(Math.max(...points.map((p) => p.value)));
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  // Etiquetas X: primera, última y unas pocas intermedias para no amontonar.
  const labelEvery = Math.max(1, Math.ceil(points.length / 7));

  return (
    <div>
      <div className="flex gap-3">
        <div className="relative w-8 shrink-0 text-right text-[11px] text-[var(--color-fg-muted)]" style={{ height }}>
          {ticks.map((tick) => (
            <span
              key={tick}
              className="absolute right-0 -translate-y-1/2 tabular-nums"
              style={{ top: `${100 - (tick / top) * 100}%` }}
            >
              {new Intl.NumberFormat("es-CO", { notation: "compact" }).format(tick)}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div className="relative" style={{ height }} onMouseLeave={() => setHover(null)}>
            {ticks.map((tick) => (
              <div
                key={tick}
                aria-hidden
                className="absolute inset-x-0 h-px bg-[var(--color-grid)]"
                style={{ top: `${100 - (tick / top) * 100}%` }}
              />
            ))}

            <div className="absolute inset-0 flex items-end">
              {points.map((point, i) => (
                <div
                  key={point.key}
                  // El slot completo es el área de hover: más grande que la columna.
                  className="relative flex h-full flex-1 cursor-default items-end justify-center px-px outline-none"
                  tabIndex={0}
                  aria-label={point.tooltip.join(", ")}
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                >
                  <div
                    className={cn(
                      "w-full max-w-6 rounded-t bg-[var(--color-primary)] transition-opacity",
                      hover !== null && hover !== i && "opacity-40",
                    )}
                    style={{ height: `${(point.value / top) * 100}%`, minHeight: point.value > 0 ? 2 : 0 }}
                  />
                  {hover === i ? (
                    <div
                      role="tooltip"
                      className={cn(
                        "pointer-events-none absolute z-10 whitespace-nowrap rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-xs shadow-lg",
                        i < points.length / 3 ? "left-0" : i > (points.length * 2) / 3 ? "right-0" : "left-1/2 -translate-x-1/2",
                      )}
                      style={{ bottom: `calc(${(point.value / top) * 100}% + 8px)` }}
                    >
                      {point.tooltip.map((line, n) => (
                        <p key={n} className={n === 0 ? "font-semibold" : "text-[var(--color-fg-muted)]"}>
                          {line}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-2 flex h-4 text-[11px] text-[var(--color-fg-muted)]" aria-hidden>
            {points.map((point, i) => (
              // Etiqueta centrada bajo su columna y libre de desbordar el slot.
              <span key={point.key} className="relative flex-1">
                {i % labelEvery === 0 || i === points.length - 1 ? (
                  <span
                    className={cn(
                      "absolute whitespace-nowrap",
                      i === 0 ? "left-0" : i === points.length - 1 ? "right-0" : "left-1/2 -translate-x-1/2",
                    )}
                  >
                    {point.label}
                  </span>
                ) : null}
              </span>
            ))}
          </div>
        </div>
      </div>

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-xs text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">
          Ver como tabla
        </summary>
        <table className="mt-2 w-full text-xs">
          <caption className="sr-only">{tableCaption}</caption>
          <tbody>
            {points.map((point) => (
              <tr key={point.key} className="border-b border-[var(--color-border)] last:border-0">
                <td className="py-1">{point.tooltip[0]}</td>
                <td className="py-1 text-right text-[var(--color-fg-muted)]">{point.tooltip.slice(1).join(" · ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
