/**
 * ParticleBackground — Floating particle animation overlay.
 * Ported from PortalMockup.tsx.
 */

const PARTICLES = Array.from({ length: 20 }).map((_, i) => ({
  id: i,
  w: 2 + Math.random() * 2,
  opacity: 0.08 + Math.random() * 0.15,
  left: `${Math.random() * 100}%`,
  top: `${Math.random() * 100}%`,
  duration: 15 + Math.random() * 20,
  delay: -Math.random() * 20,
}));

export function ParticleBackground() {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 0, overflow: "hidden", pointerEvents: "none" }}>
      {PARTICLES.map((p) => (
        <div
          key={p.id}
          style={{
            position: "absolute",
            width: p.w,
            height: p.w,
            borderRadius: "50%",
            background: `rgba(217,123,106,${p.opacity})`,
            left: p.left,
            top: p.top,
            animation: `portalParticle ${p.duration}s linear infinite`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
      <style>{`@keyframes portalParticle { 0% { transform: translateY(0); opacity: 0; } 10% { opacity: 1; } 90% { opacity: 1; } 100% { transform: translateY(-100vh); opacity: 0; } }`}</style>
    </div>
  );
}
