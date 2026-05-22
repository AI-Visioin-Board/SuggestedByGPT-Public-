/**
 * AnimatedNumber — Counts up from 0 to value with easing.
 * Ported from PortalMockup.tsx.
 */
import { useState, useEffect } from "react";
import { useInView } from "./FadeIn";

interface AnimatedNumberProps {
  value: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
}

export function AnimatedNumber({ value, duration = 1200, prefix = "", suffix = "" }: AnimatedNumberProps) {
  const [display, setDisplay] = useState(0);
  const { ref, isVisible } = useInView();

  useEffect(() => {
    if (!isVisible) return;
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      setDisplay(Math.round((1 - Math.pow(1 - progress, 3)) * value));
      if (progress < 1) requestAnimationFrame(tick);
    };
    tick();
  }, [isVisible, value, duration]);

  return <span ref={ref}>{prefix}{display.toLocaleString()}{suffix}</span>;
}
