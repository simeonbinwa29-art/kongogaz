import * as React from "react";

import { cn } from "@/lib/utils";

type GlassCardProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Halo lumineux qui suit la souris (bordure interne). */
  glow?: boolean;
  /** Effet d'inclinaison 3D subtile sur desktop. */
  tilt?: boolean;
  /** Version plus opaque, pour les couches supérieures (modals, menus). */
  strong?: boolean;
  /** Réactivité micro-interactions (lift au survol, enfoncement au toucher). */
  interactive?: boolean;
};

function GlassCard({
  className,
  glow = false,
  tilt = false,
  strong = false,
  interactive = false,
  onPointerMove,
  onPointerLeave,
  ...props
}: GlassCardProps) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const rafRef = React.useRef(0);

  const track = React.useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      el.style.setProperty("--mx", `${x}px`);
      el.style.setProperty("--my", `${y}px`);
      if (!tilt) return;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const rx = (y / rect.height - 0.5) * -6;
        const ry = (x / rect.width - 0.5) * 8;
        el.style.transform = `perspective(900px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) translateY(-3px) scale(1.02)`;
      });
    },
    [tilt],
  );

  const leave = React.useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const el = ref.current;
      if (el) el.style.transform = "";
      onPointerLeave?.(e);
    },
    [onPointerLeave],
  );

  React.useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div
      ref={ref}
      onPointerMove={
        glow || tilt
          ? (e) => {
              track(e);
              onPointerMove?.(e);
            }
          : onPointerMove
      }
      onPointerLeave={glow || tilt ? leave : onPointerLeave}
      className={cn(
        strong ? "glass-strong" : "glass",
        "t-liquid rounded-2xl",
        glow && "glow-cursor",
        interactive && "glass-hover glass-press",
        className,
      )}
      {...props}
    />
  );
}
GlassCard.displayName = "GlassCard";

export { GlassCard };
