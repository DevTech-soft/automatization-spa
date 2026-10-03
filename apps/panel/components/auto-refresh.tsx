"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-pide el server component cada `seconds` mientras la pestaña está visible.
 * Es el "en vivo" de las conversaciones (F7): polling barato en vez de SSE —
 * a esta escala alcanza, y no hay conexión que mantener abierta en Vercel.
 */
export function AutoRefresh({ seconds = 15 }: { seconds?: number }) {
  const router = useRouter();

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = window.setInterval(tick, seconds * 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, seconds]);

  return null;
}
