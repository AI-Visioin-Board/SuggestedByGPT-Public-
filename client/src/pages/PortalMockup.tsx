/**
 * Portal V3 Mockup — Premium Dark Glass UI with Completed Showcase
 *
 * Two-panel layout:
 * LEFT: "What We've Done" — glowing green showcase of completed deliverables
 * RIGHT: Journey nodes with active/pending items
 */
import { useState, useEffect, useRef } from 'react';

// ── Scroll Animation Hook ──────────────────────────────────────────
function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setIsVisible(true); }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, isVisible };
}

function AnimatedNumber({ value, duration = 1200 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const { ref, isVisible } = useInView();
  useEffect(() => {
    if (!isVisible) return;
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      setDisplay(Math.round((1 - Math.pow(1 - progress, 3)) * value));
      if (progress < 1) requestAnimationFrame(tick);
    };
    tick();
  }, [isVisible, value, duration]);
  return <span ref={ref}>{display}</span>;
}

function FadeIn({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const { ref, isVisible } = useInView(0.1);
  return (
    <div ref={ref} style={{
      opacity: isVisible ? 1 : 0,
      transform: isVisible ? 'translateY(0)' : 'translateY(24px)',
      transition: `opacity 0.7s cubic-bezier(0.4,0,0.2,1) ${delay}s, transform 0.7s cubic-bezier(0.4,0,0.2,1) ${delay}s`,
    }}>{children}</div>
  );
}

// ── Types ──────────────────────────────────────────────────────────
type Status = 'complete' | 'in_progress' | 'blocked' | 'needs_action' | 'pending';
interface Deliverable { name: string; status: Status; note?: string; hasPdf?: boolean; hasAction?: boolean; actionLabel?: string; category?: string; }
interface JourneyNode { id: string; title: string; icon: string; status: Status; progress: number; deliverables: Deliverable[]; }

const S: Record<Status, { color: string; glow: string; label: string }> = {
  complete:     { color: '#34D399', glow: 'rgba(52,211,153,0.3)', label: 'Complete' },
  in_progress:  { color: '#60A5FA', glow: 'rgba(96,165,250,0.3)', label: 'In Progress' },
  blocked:      { color: '#FBBF24', glow: 'rgba(251,191,36,0.3)', label: 'Blocked' },
  needs_action: { color: '#F87171', glow: 'rgba(248,113,113,0.3)', label: 'Action Required' },
  pending:      { color: '#6B7280', glow: 'rgba(107,114,128,0.2)', label: 'Upcoming' },
};

const NODES: JourneyNode[] = [
  {
    id: 'website', title: 'Website Optimization', icon: '🌐', status: 'in_progress', progress: 50,
    deliverables: [
      { name: 'Schema Markup', status: 'blocked', note: 'Waiting for your CMS credentials', hasAction: true, actionLabel: 'Upload Now', category: 'Website' },
      { name: 'FAQ Page Installation', status: 'in_progress', note: 'Awaiting your review & approval', category: 'Website' },
      { name: 'robots.txt Optimization', status: 'complete', note: 'Installed on your website', category: 'Website' },
      { name: 'llms.txt Creation', status: 'complete', note: 'Installed on your website', category: 'Website' },
    ],
  },
  {
    id: 'presence', title: 'Online Presence', icon: '📍', status: 'needs_action', progress: 25,
    deliverables: [
      { name: 'Google Business Profile', status: 'needs_action', note: 'Create your GBP & add us as Manager', hasPdf: true, hasAction: true, actionLabel: 'View Guide', category: 'Presence' },
      { name: 'Automated Directories', status: 'complete', note: 'Brownbook, Manta + 2 more submitted', category: 'Presence' },
      { name: 'VA-Assisted Directories', status: 'in_progress', note: 'Our team is submitting these', category: 'Presence' },
      { name: 'Client Directories', status: 'needs_action', note: '3 need your account login', hasPdf: true, hasAction: true, actionLabel: 'View Guides', category: 'Presence' },
    ],
  },
  {
    id: 'content', title: 'Content & Authority', icon: '✍️', status: 'in_progress', progress: 66,
    deliverables: [
      { name: 'Guest Post Article', status: 'in_progress', note: 'Being placed on authority site', category: 'Content' },
      { name: 'Review Response Strategy', status: 'complete', note: 'Strategy document delivered', hasPdf: true, category: 'Content' },
      { name: 'AI Visibility Audit', status: 'complete', note: 'Full audit report delivered', hasPdf: true, category: 'Content' },
    ],
  },
  {
    id: 'gbp', title: 'GBP Optimization', icon: 'google', status: 'blocked', progress: 0,
    deliverables: [
      { name: 'Profile Optimization', status: 'blocked', note: 'Unlocks after Manager access', category: 'GBP' },
      { name: 'Q&A Setup (20 pairs)', status: 'pending', note: 'Queued', category: 'GBP' },
      { name: 'Google Post Templates', status: 'pending', note: 'Queued', category: 'GBP' },
    ],
  },
  {
    id: 'reddit', title: 'Community Visibility', icon: 'reddit', status: 'in_progress', progress: 40,
    deliverables: [
      { name: 'Batch 1 — 5 Posts', status: 'in_progress', note: '3 of 5 responses posted', category: 'Reddit' },
      { name: 'Batch 2 — 5 Posts', status: 'pending', note: 'Starts at Day 30', category: 'Reddit' },
      { name: 'Batch 3 — 5 Posts', status: 'pending', note: 'Starts at Day 60', category: 'Reddit' },
    ],
  },
];

function ProgressRing({ progress, status, size = 56 }: { progress: number; status: Status; size?: number }) {
  const { color, glow } = S[status];
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (progress / 100) * circ;
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3.5" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="3.5"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1.5s cubic-bezier(0.4,0,0.2,1)', filter: `drop-shadow(0 0 6px ${glow})` }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.22, fontWeight: 800, color: 'white' }}>{progress}%</div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────
export default function PortalMockup() {
  const [expandedNode, setExpandedNode] = useState<string | null>(null);

  const allDels = NODES.flatMap(n => n.deliverables);
  const completed = allDels.filter(d => d.status === 'complete');
  const totalDel = allDels.length;
  const overallPct = Math.round((completed.length / totalDel) * 100);
  const nextAction = allDels.find(d => d.status === 'needs_action' || d.status === 'blocked');

  return (
    <div style={{
      background: 'linear-gradient(160deg, #0A0A1A 0%, #111827 40%, #0F172A 100%)',
      minHeight: '100vh',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif',
      color: 'white',
    }}>
      {/* Particles */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} style={{
            position: 'absolute', width: 2 + Math.random() * 2, height: 2 + Math.random() * 2,
            borderRadius: '50%', background: `rgba(217,123,106,${0.08 + Math.random() * 0.15})`,
            left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%`,
            animation: `fp ${15 + Math.random() * 20}s linear infinite`,
            animationDelay: `${-Math.random() * 20}s`,
          }} />
        ))}
        <style>{`@keyframes fp { 0% { transform: translateY(0); opacity: 0; } 10% { opacity: 1; } 90% { opacity: 1; } 100% { transform: translateY(-100vh); opacity: 0; } }`}</style>
      </div>

      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{ position: 'relative', zIndex: 1, padding: '48px 40px 32px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ opacity: 0.4, fontSize: 12, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 8 }}>
          Welcome back, Francis
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <h1 style={{ fontSize: 32, fontWeight: 800, margin: 0, letterSpacing: -0.5,
            background: 'linear-gradient(135deg, #FFFFFF 0%, #D97B6A 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Your AI Visibility Journey
          </h1>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 48, fontWeight: 900, letterSpacing: -2, lineHeight: 1,
              background: 'linear-gradient(135deg, #D97B6A, #E8A99A)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              <AnimatedNumber value={overallPct} />%
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>
              {completed.length} of {totalDel} deliverables complete
            </div>
          </div>
        </div>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>YourSTRManagement · Dominator Package</div>

        {/* Progress bar */}
        <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, marginTop: 20, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${overallPct}%`, borderRadius: 2,
            background: 'linear-gradient(90deg, #D97B6A, #E8A99A)',
            boxShadow: '0 0 20px rgba(217,123,106,0.4)',
            transition: 'width 1.5s cubic-bezier(0.4,0,0.2,1)',
          }} />
        </div>
      </div>

      {/* ── Two Column Layout ──────────────────────────────── */}
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 1200, margin: '0 auto', padding: '0 40px 80px',
        display: 'grid', gridTemplateColumns: '320px 1fr', gap: 32, alignItems: 'start' }}>

        {/* ══════════ LEFT PANEL: Completed Showcase ══════════ */}
        <div style={{ position: 'sticky', top: 24 }}>
          <FadeIn>
            <div style={{
              padding: '24px',
              borderRadius: 20,
              background: 'rgba(52,211,153,0.04)',
              border: '1px solid rgba(52,211,153,0.15)',
              backdropFilter: 'blur(20px)',
            }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
                }}>✓</div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#34D399' }}>Delivered</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{completed.length} items completed</div>
                </div>
              </div>

              {/* Completed items */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {completed.map((d, i) => (
                  <FadeIn key={i} delay={0.3 + i * 0.08}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                      borderRadius: 12, background: 'rgba(52,211,153,0.06)',
                      transition: 'background 0.2s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(52,211,153,0.1)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(52,211,153,0.06)'}>
                      {/* Green glow checkmark */}
                      <div style={{
                        width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                        background: 'linear-gradient(135deg, #34D399, #10B981)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 900, color: '#0A0A1A',
                        boxShadow: '0 0 10px rgba(52,211,153,0.4)',
                      }}>✓</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>{d.name}</div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>{d.note}</div>
                      </div>
                      {d.hasPdf && (
                        <button style={{
                          padding: '4px 10px', fontSize: 10, fontWeight: 600, borderRadius: 6,
                          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                          color: 'rgba(255,255,255,0.5)', cursor: 'pointer',
                        }}>📄</button>
                      )}
                    </div>
                  </FadeIn>
                ))}
              </div>

              {/* Value footer */}
              <div style={{
                marginTop: 16, padding: '12px 14px', borderRadius: 12,
                background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.12)',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#34D399' }}>
                  <AnimatedNumber value={completed.length * 350} />
                </div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: 1, textTransform: 'uppercase', marginTop: 2 }}>
                  Estimated value delivered
                </div>
              </div>
            </div>
          </FadeIn>
        </div>

        {/* ══════════ RIGHT PANEL: Journey ══════════ */}
        <div>
          {/* Next Step */}
          {nextAction && (
            <FadeIn>
              <div style={{
                padding: '22px 26px', marginBottom: 24, borderRadius: 18,
                background: 'linear-gradient(135deg, rgba(217,123,106,0.12), rgba(232,169,154,0.06))',
                border: '1px solid rgba(217,123,106,0.2)',
                backdropFilter: 'blur(20px)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20,
              }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: '#D97B6A', textTransform: 'uppercase', marginBottom: 4 }}>
                    ⚡ Your Next Step
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'white' }}>{nextAction.note || nextAction.name}</div>
                </div>
                <button style={{
                  padding: '10px 22px', fontSize: 13, fontWeight: 700, borderRadius: 10,
                  background: 'linear-gradient(135deg, #D97B6A, #C96B5A)', border: 'none',
                  color: 'white', cursor: 'pointer', whiteSpace: 'nowrap',
                  boxShadow: '0 4px 20px rgba(217,123,106,0.3)',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 30px rgba(217,123,106,0.5)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(217,123,106,0.3)'; }}>
                  Do It Now →
                </button>
              </div>
            </FadeIn>
          )}

          {/* Journey Nodes */}
          {NODES.map((node, i) => {
            const isExpanded = expandedNode === node.id;
            const cfg = S[node.status];
            const actionCount = node.deliverables.filter(d => d.status === 'needs_action').length;
            const activeItems = node.deliverables.filter(d => d.status !== 'complete');

            return (
              <FadeIn key={node.id} delay={i * 0.08}>
                <div style={{ marginBottom: 16 }}>
                  {/* Node card */}
                  <div
                    onClick={() => setExpandedNode(isExpanded ? null : node.id)}
                    style={{
                      padding: '20px 24px',
                      borderRadius: isExpanded ? '18px 18px 0 0' : 18,
                      background: 'rgba(255,255,255,0.03)',
                      backdropFilter: 'blur(20px)',
                      border: `1px solid ${actionCount > 0 ? 'rgba(248,113,113,0.25)' : 'rgba(255,255,255,0.06)'}`,
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 16,
                      transition: 'all 0.3s ease',
                      boxShadow: isExpanded ? `0 0 25px ${cfg.glow}` : 'none',
                    }}
                    onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                    onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                  >
                    <div style={{
                      width: 44, height: 44, borderRadius: 13,
                      background: node.icon === 'reddit' ? 'rgba(255,69,0,0.12)' : node.icon === 'google' ? 'rgba(66,133,244,0.12)' : `${cfg.color}15`,
                      border: node.icon === 'reddit' ? '1px solid rgba(255,69,0,0.3)' : node.icon === 'google' ? '1px solid rgba(66,133,244,0.3)' : `1px solid ${cfg.color}30`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 20, flexShrink: 0,
                    }}>
                      {node.icon === 'reddit' ? (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="#FF4500">
                          <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/>
                        </svg>
                      ) : node.icon === 'google' ? (
                        <svg width="20" height="20" viewBox="0 0 24 24">
                          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                        </svg>
                      ) : node.icon}
                    </div>

                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'white', marginBottom: 3 }}>{node.title}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{
                          fontSize: 9, fontWeight: 700, letterSpacing: 1, padding: '2px 8px',
                          borderRadius: 99, textTransform: 'uppercase',
                          background: `${cfg.color}18`, color: cfg.color,
                        }}>{cfg.label}</span>
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
                          {node.deliverables.filter(d => d.status === 'complete').length}/{node.deliverables.length}
                        </span>
                        {actionCount > 0 && (
                          <span style={{
                            fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
                            background: 'rgba(248,113,113,0.12)', color: '#F87171',
                          }}>{actionCount} need{actionCount > 1 ? '' : 's'} you</span>
                        )}
                      </div>
                    </div>

                    <ProgressRing progress={node.progress} status={node.status} />

                    <div style={{
                      fontSize: 13, color: 'rgba(255,255,255,0.25)',
                      transition: 'transform 0.3s',
                      transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    }}>▾</div>
                  </div>

                  {/* Expanded — only show non-complete items (complete ones are on the left) */}
                  {isExpanded && (
                    <div style={{
                      padding: '4px 24px 16px',
                      borderRadius: '0 0 18px 18px',
                      background: 'rgba(255,255,255,0.02)',
                      borderLeft: '1px solid rgba(255,255,255,0.06)',
                      borderRight: '1px solid rgba(255,255,255,0.06)',
                      borderBottom: '1px solid rgba(255,255,255,0.06)',
                      backdropFilter: 'blur(20px)',
                    }}>
                      {activeItems.length === 0 ? (
                        <div style={{ padding: '16px 0', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
                          All items in this category are complete! 🎉
                        </div>
                      ) : activeItems.map((d, di) => {
                        const dc = S[d.status];
                        return (
                          <div key={di} style={{
                            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0',
                            borderBottom: di < activeItems.length - 1 ? '1px solid rgba(255,255,255,0.04)' : undefined,
                          }}>
                            <div style={{
                              width: 9, height: 9, borderRadius: '50%', flexShrink: 0,
                              background: dc.color, boxShadow: `0 0 8px ${dc.glow}`,
                            }} />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>{d.name}</div>
                              {d.note && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>{d.note}</div>}
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                              {d.hasPdf && (
                                <button style={{
                                  padding: '5px 12px', fontSize: 10, fontWeight: 600, borderRadius: 7,
                                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
                                  color: 'rgba(255,255,255,0.6)', cursor: 'pointer',
                                }}>📄 PDF</button>
                              )}
                              {d.hasAction && (
                                <button style={{
                                  padding: '5px 12px', fontSize: 10, fontWeight: 700, borderRadius: 7,
                                  background: 'linear-gradient(135deg, #D97B6A, #C96B5A)', border: 'none',
                                  color: 'white', cursor: 'pointer',
                                  boxShadow: '0 2px 8px rgba(217,123,106,0.3)',
                                }}>{d.actionLabel || 'Take Action'}</button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </FadeIn>
            );
          })}
          {/* ── Book AI Voice Meeting ───────────────────────── */}
          <FadeIn delay={0.5}>
            <div style={{
              marginTop: 32, padding: '28px 28px 24px', borderRadius: 20,
              background: 'linear-gradient(135deg, rgba(217,123,106,0.08), rgba(139,92,246,0.06))',
              border: '1px solid rgba(217,123,106,0.18)',
              backdropFilter: 'blur(20px)',
              position: 'relative', overflow: 'hidden',
            }}>
              {/* Subtle glow */}
              <div style={{
                position: 'absolute', top: -40, right: -40, width: 120, height: 120,
                borderRadius: '50%', background: 'rgba(217,123,106,0.08)', filter: 'blur(40px)',
              }} />

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, position: 'relative' }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 14, flexShrink: 0,
                  background: 'linear-gradient(135deg, #D97B6A, #C96B5A)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 4px 20px rgba(217,123,106,0.3)',
                }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                    <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                    <line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: '#D97B6A', textTransform: 'uppercase', marginBottom: 4 }}>
                    24/7 AI Assistant
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'white', lineHeight: 1.4, marginBottom: 6 }}>
                    Book a meeting with our AI Voice Assistant
                  </div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5, marginBottom: 16 }}>
                    Need help checking things off your list? Our AI agent knows your project inside and out — available anytime, even 5 minutes from now.
                  </div>

                  {/* Quick time slots */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                    {['In 5 min', 'In 30 min', 'In 1 hour', 'Pick a time'].map((slot, si) => (
                      <button key={si} style={{
                        padding: '8px 16px', fontSize: 12, fontWeight: 600, borderRadius: 10,
                        background: si === 0 ? 'linear-gradient(135deg, #D97B6A, #C96B5A)' : 'rgba(255,255,255,0.05)',
                        border: si === 0 ? 'none' : '1px solid rgba(255,255,255,0.08)',
                        color: si === 0 ? 'white' : 'rgba(255,255,255,0.6)',
                        cursor: 'pointer',
                        boxShadow: si === 0 ? '0 4px 15px rgba(217,123,106,0.3)' : 'none',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={e => { if (si > 0) e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
                      onMouseLeave={e => { if (si > 0) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}>
                        {si === 0 && '🎙️ '}{slot}
                      </button>
                    ))}
                  </div>

                  {/* What it can help with */}
                  <div style={{ display: 'flex', gap: 16 }}>
                    {[
                      { icon: '🔓', label: 'Unblock tasks' },
                      { icon: '❓', label: 'Answer questions' },
                      { icon: '📋', label: 'Walk you through steps' },
                    ].map((item, ii) => (
                      <div key={ii} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 14 }}>{item.icon}</span>
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </FadeIn>

          {/* ── Messages ──────────────────────────────────────── */}
          <FadeIn delay={0.6}>
            <div style={{
              marginTop: 20, padding: '24px 28px', borderRadius: 20,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
              backdropFilter: 'blur(20px)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: 'rgba(96,165,250,0.12)', border: '1px solid rgba(96,165,250,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#60A5FA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'white' }}>Messages</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>Chat with our team</div>
                  </div>
                </div>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #60A5FA, #3B82F6)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 800, color: 'white',
                  boxShadow: '0 0 10px rgba(96,165,250,0.4)',
                }}>2</div>
              </div>

              {/* Recent messages preview */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { from: 'SuggestedByGPT', time: '2h ago', msg: 'Great news! Your robots.txt has been installed and is live on your site.', isTeam: true },
                  { from: 'You', time: '1h ago', msg: 'Thanks! When will the FAQ page be ready for review?', isTeam: false },
                  { from: 'SuggestedByGPT', time: '45m ago', msg: 'The FAQ draft is almost ready — we\'ll send it over for your approval within 24 hours.', isTeam: true },
                ].map((m, mi) => (
                  <div key={mi} style={{
                    display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 12,
                    background: m.isTeam ? 'rgba(96,165,250,0.04)' : 'rgba(255,255,255,0.02)',
                    border: m.isTeam ? '1px solid rgba(96,165,250,0.08)' : '1px solid rgba(255,255,255,0.04)',
                  }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                      background: m.isTeam ? 'linear-gradient(135deg, #D97B6A, #C96B5A)' : 'rgba(255,255,255,0.08)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 700, color: 'white',
                    }}>{m.isTeam ? 'S' : 'F'}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: m.isTeam ? '#60A5FA' : 'rgba(255,255,255,0.7)' }}>{m.from}</span>
                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>{m.time}</span>
                      </div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.4 }}>{m.msg}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Message input */}
              <div style={{
                marginTop: 14, display: 'flex', gap: 8,
              }}>
                <div style={{
                  flex: 1, padding: '10px 14px', borderRadius: 12,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  fontSize: 13, color: 'rgba(255,255,255,0.25)',
                }}>Type a message...</div>
                <button style={{
                  padding: '10px 18px', borderRadius: 12,
                  background: 'linear-gradient(135deg, #60A5FA, #3B82F6)', border: 'none',
                  color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  boxShadow: '0 4px 15px rgba(96,165,250,0.3)',
                }}>Send</button>
              </div>
            </div>
          </FadeIn>
        </div>
      </div>

      {/* ── Floating Voice Button ───────────────────────────── */}
      <div style={{
        position: 'fixed', bottom: 28, right: 28, zIndex: 100,
        width: 56, height: 56, borderRadius: '50%',
        background: 'linear-gradient(135deg, #D97B6A, #C96B5A)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22, cursor: 'pointer',
        boxShadow: '0 4px 30px rgba(217,123,106,0.4)',
        animation: 'pg 3s ease-in-out infinite',
        transition: 'transform 0.2s',
      }}
      onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
      onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
        🎙️
        <style>{`@keyframes pg { 0%,100% { box-shadow: 0 4px 30px rgba(217,123,106,0.4); } 50% { box-shadow: 0 4px 40px rgba(217,123,106,0.6), 0 0 60px rgba(217,123,106,0.2); } }`}</style>
      </div>
    </div>
  );
}
