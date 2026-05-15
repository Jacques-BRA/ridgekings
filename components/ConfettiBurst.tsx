"use client";
import { useEffect } from "react";
import { usePrefersReducedMotion } from "@/lib/use-reduced-motion";

export function ConfettiBurst({ trigger }: { trigger: boolean }) {
  const reduceMotion = usePrefersReducedMotion();
  useEffect(() => {
    if (!trigger || reduceMotion) return;
    let cancelled = false;
    (async () => {
      const confetti = (await import("canvas-confetti")).default;
      if (cancelled) return;
      const end = Date.now() + 600;
      const colors = ["#53FC1A", "#FFD700", "#FFFFFF"];
      (function frame() {
        confetti({ particleCount: 8, angle: 60, spread: 65, origin: { x: 0 }, colors });
        confetti({ particleCount: 8, angle: 120, spread: 65, origin: { x: 1 }, colors });
        if (Date.now() < end) requestAnimationFrame(frame);
      })();
    })();
    return () => { cancelled = true; };
  }, [trigger, reduceMotion]);
  return null;
}
