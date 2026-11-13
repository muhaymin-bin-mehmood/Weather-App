import { useId } from 'react';
import type { ConditionKind } from '../types';

/*
 * Line-art weather glyphs in the sun-orbit style: thin ink strokes, the sun
 * (and lightning) in the ember accent. Every glyph is drawn on a 64×64 grid so
 * the same paths serve the 28px forecast icons and the large hero illustration.
 */

const CLOUD = 'M21 46h24a10 10 0 0 0 0-20 14 14 0 0 0-26.6 4.4A8 8 0 0 0 21 46z';
const SMALL_CLOUD = 'M25 49h21a9 9 0 0 0 0-18 12 12 0 0 0-23 3.8A7 7 0 0 0 25 49z';

interface GlyphProps {
  condition: ConditionKind;
  isDay?: boolean;
  /** Stroke width in 64-grid units; the hero passes a thinner one because it is scaled up. */
  stroke?: number;
}

function Sun({ cx, cy, r, stroke }: { cx: number; cy: number; r: number; stroke: number }) {
  return (
    <g stroke="var(--ember)" strokeWidth={stroke} strokeLinecap="round" fill="none">
      <circle cx={cx} cy={cy} r={r} style={{ fill: 'color-mix(in srgb, var(--ember) 24%, transparent)' }} />
      {Array.from({ length: 8 }, (_, i) => i * 45).map((deg) => (
        <line
          key={deg}
          x1={cx}
          y1={cy - r - 5}
          x2={cx}
          y2={cy - r - 10}
          transform={`rotate(${deg} ${cx} ${cy})`}
        />
      ))}
    </g>
  );
}

function Moon({ cx, cy, stroke }: { cx: number; cy: number; stroke: number }) {
  return (
    <path
      d={`M${cx + 6} ${cy - 15}a15 15 0 1 0 11 24 13 13 0 0 1-11-24z`}
      fill="var(--moon-tint)"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinejoin="round"
    />
  );
}

export function Glyph({ condition, isDay = true, stroke = 2.4 }: GlyphProps) {
  const line = { stroke: 'currentColor', strokeWidth: stroke, strokeLinecap: 'round' as const, fill: 'none' };
  // Clouds are filled with the surface colour so they sit in front of the sun's rays.
  const cloud = (d: string, transform?: string) => (
    <path d={d} transform={transform} fill="var(--icon-fill)" stroke="currentColor" strokeWidth={stroke} strokeLinejoin="round" />
  );
  const sky = (small: boolean) =>
    isDay ? (
      <Sun cx={small ? 24 : 32} cy={small ? 24 : 32} r={small ? 8 : 10} stroke={stroke} />
    ) : (
      <Moon cx={small ? 20 : 28} cy={small ? 24 : 32} stroke={stroke} />
    );

  switch (condition) {
    case 'clear':
      return sky(false);
    case 'partly-cloudy':
      return (
        <>
          {sky(true)}
          {cloud(SMALL_CLOUD)}
        </>
      );
    case 'cloudy':
      return (
        <>
          {cloud(CLOUD, 'translate(-8 -7) scale(0.72)')}
          {cloud(CLOUD)}
        </>
      );
    case 'fog':
      return (
        <>
          {cloud(CLOUD, 'translate(0 -8)')}
          {[46, 52, 58].map((y, i) => (
            <line key={y} x1={14 + i * 4} x2={50 - i * 4} y1={y} y2={y} {...line} />
          ))}
        </>
      );
    case 'drizzle':
    case 'rain':
    case 'thunder': {
      const drops = condition === 'drizzle' ? [26, 38] : [22, 32, 42];
      return (
        <>
          {cloud(CLOUD, 'translate(0 -9)')}
          {condition === 'thunder' ? (
            <path
              d="M34 40l-7 11h7l-4 10 11-14h-7l4-7z"
              fill="none"
              stroke="var(--ember)"
              strokeWidth={stroke}
              strokeLinejoin="round"
            />
          ) : (
            drops.map((x) => (
              <line key={x} x1={x} x2={x - 3} y1={44} y2={condition === 'drizzle' ? 49 : 54} {...line} stroke="var(--rain)" />
            ))
          )}
        </>
      );
    }
    case 'snow':
      return (
        <>
          {cloud(CLOUD, 'translate(0 -9)')}
          {[22, 32, 42].map((x, i) => (
            <g key={x} {...line}>
              <line x1={x} y1={46 + (i % 2) * 5} x2={x} y2={52 + (i % 2) * 5} />
              <line x1={x - 3} y1={49 + (i % 2) * 5} x2={x + 3} y2={49 + (i % 2) * 5} />
            </g>
          ))}
        </>
      );
  }
}

interface Props {
  condition: ConditionKind;
  isDay?: boolean;
  size?: number;
  /** Decorative by default: the description is always rendered as text next to it. */
  label?: string;
}

export function WeatherIcon({ condition, isDay = true, size = 32, label }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className="weather-icon"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <Glyph condition={condition} isDay={isDay} stroke={size < 40 ? 3 : 2.4} />
    </svg>
  );
}

/* ---------- Hero illustration ----------
 * Drawn on a 240 grid around (120, 112). Layers, back to front: tinted disc,
 * back half of the orbit, the weather scene, front half of the orbit, and
 * the ember dot travelling along it. Motion is CSS (plus one SMIL path for
 * the dot), and all of it stops under prefers-reduced-motion. */

const HERO_CLOUD = 'M78 150h86a26 26 0 0 0 2-52 36 36 0 0 0-68-8 24 24 0 0 0-20 60z';
const HERO_CLOUD_SMALL = 'M108 132h62a19 19 0 0 0 1-38 26 26 0 0 0-49-6 17 17 0 0 0-14 44z';
// The orbit ellipse as a path, so the dot can follow it.
const ORBIT_PATH = 'M8 128a112 30 0 1 0 224 0a112 30 0 1 0-224 0';

function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function HeroSun({ cx, cy, r, ids }: { cx: number; cy: number; r: number; ids: string }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r * 1.9} fill={`url(#${ids}-glow)`} />
      <g className="ha-spin" style={{ transformOrigin: `${cx}px ${cy}px` }}>
        {Array.from({ length: 12 }, (_, i) => i * 30).map((deg) => (
          <line
            key={deg}
            x1={cx}
            y1={cy - r - 9}
            x2={cx}
            y2={cy - r - (deg % 60 === 0 ? 20 : 15)}
            transform={`rotate(${deg} ${cx} ${cy})`}
            stroke="var(--ember)"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
        ))}
      </g>
      <circle cx={cx} cy={cy} r={r} fill={`url(#${ids}-sun)`} />
    </g>
  );
}

const STARS: Array<[dx: number, dy: number, delay: number]> = [
  [46, -30, 0],
  [30, 34, 1.2],
  [-40, -40, 2.1],
];

function HeroMoon({ cx, cy, stars, ids }: { cx: number; cy: number; stars: boolean; ids: string }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={46} fill={`url(#${ids}-moonglow)`} />
      <path
        d={`M${cx + 10} ${cy - 34}a36 36 0 1 0 26 56 30 30 0 0 1-26-56z`}
        fill="var(--moon-fill)"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx={cx - 8} cy={cy + 10} r="3.5" fill="var(--moon-crater)" />
      <circle cx={cx - 18} cy={cy - 6} r="2.2" fill="var(--moon-crater)" />
      {stars
        ? STARS.map(([dx, dy, delay]) => {
            const x = cx + dx;
            const y = cy + dy;
            return (
              <path
                key={`${dx}-${dy}`}
                className="ha-twinkle"
                style={{ animationDelay: `${delay}s`, transformOrigin: `${x}px ${y}px` }}
                d={`M${x} ${y - 6}l1.6 4.4 4.4 1.6-4.4 1.6-1.6 4.4-1.6-4.4-4.4-1.6 4.4-1.6z`}
                fill="var(--ember)"
              />
            );
          })
        : null}
    </g>
  );
}

function HeroCloud({ storm = false }: { storm?: boolean }) {
  return (
    <g className="ha-drift">
      <path d={HERO_CLOUD_SMALL} transform="translate(-46 -6)" fill="var(--cloud-back)" />
      <path
        d={HERO_CLOUD}
        fill={storm ? 'var(--cloud-storm)' : 'var(--cloud-fill)'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M86 145h74" stroke="var(--cloud-shade)" strokeWidth="3" strokeLinecap="round" />
    </g>
  );
}

function Drops({ n, len }: { n: number; len: number }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const x = 92 + i * (56 / Math.max(1, n - 1));
        const y = 134 + (i % 2) * 6; // staggered rows read as falling rain
        return (
          <line
            key={i}
            className="ha-drop"
            style={{ animationDelay: `${i * 0.27}s` }}
            x1={x}
            y1={y}
            x2={x - 6}
            y2={y + len}
            stroke="var(--rain)"
            strokeWidth="4.5"
            strokeLinecap="round"
          />
        );
      })}
    </>
  );
}

function HeroScene({ condition, isDay, ids }: { condition: ConditionKind; isDay: boolean; ids: string }) {
  const sky = (small: boolean) =>
    isDay ? (
      <HeroSun ids={ids} cx={small ? 94 : 120} cy={small ? 84 : 112} r={small ? 22 : 30} />
    ) : (
      <HeroMoon ids={ids} cx={small ? 94 : 116} cy={small ? 86 : 112} stars={!small} />
    );

  switch (condition) {
    case 'clear':
      return sky(false);
    case 'partly-cloudy':
      return (
        <>
          {sky(true)}
          <g transform="translate(16 20)">
            <HeroCloud />
          </g>
        </>
      );
    case 'cloudy':
      return <HeroCloud />;
    case 'fog':
      return (
        <>
          <g transform="translate(0 -10)">
            <HeroCloud />
          </g>
          {[154, 166, 178].map((y, i) => (
            <line
              key={y}
              className="ha-fog"
              style={{ animationDelay: `${i * 0.7}s` }}
              x1={80 + i * 8}
              x2={164 - i * 6}
              y1={y}
              y2={y}
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              opacity={0.75 - i * 0.15}
            />
          ))}
        </>
      );
    case 'drizzle':
    case 'rain':
      return (
        <>
          <Drops n={condition === 'rain' ? 5 : 3} len={condition === 'rain' ? 18 : 9} />
          <g transform="translate(0 -24)">
            <HeroCloud />
          </g>
        </>
      );
    case 'thunder':
      return (
        <>
          <g transform="translate(0 -16)">
            <HeroCloud storm />
          </g>
          <path
            className="ha-flash"
            d="M128 132l-18 28h15l-8 24 26-34h-15l10-18z"
            fill="var(--ember)"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </>
      );
    case 'snow':
      return (
        <>
          <g transform="translate(0 -24)">
            <HeroCloud />
          </g>
          {[
            [94, 138],
            [114, 148],
            [134, 138],
            [154, 148],
          ].map(([x, y], i) => (
            <path
              key={x}
              className="ha-flake"
              style={{ animationDelay: `${i * 0.6}s` }}
              d={`M${x} ${y - 7}v14M${x - 6} ${y - 3.5}l12 7M${x - 6} ${y + 3.5}l12-7`}
              stroke="var(--rain)"
              strokeWidth="3"
              strokeLinecap="round"
            />
          ))}
        </>
      );
  }
}

/** Large illustration for the current conditions. */
export function HeroArt({ condition, isDay }: { condition: ConditionKind; isDay: boolean }) {
  const still = reducedMotion();
  // Unique ids so two illustrations on one page never share gradients.
  const ids = `ha${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <svg className="hero-art" viewBox="0 0 240 240" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={`${ids}-disc`} cx="45%" cy="38%" r="70%">
          <stop offset="0%" style={{ stopColor: 'var(--hero-in)' }} />
          <stop offset="100%" style={{ stopColor: 'var(--hero-out)' }} />
        </radialGradient>
        <radialGradient id={`${ids}-sun`} cx="38%" cy="34%" r="72%">
          <stop offset="0%" stopColor="#f7b867" />
          <stop offset="100%" style={{ stopColor: 'var(--ember)' }} />
        </radialGradient>
        <radialGradient id={`${ids}-glow`}>
          <stop offset="0%" style={{ stopColor: 'var(--ember)', stopOpacity: 0.35 }} />
          <stop offset="100%" style={{ stopColor: 'var(--ember)', stopOpacity: 0 }} />
        </radialGradient>
        <radialGradient id={`${ids}-moonglow`}>
          <stop offset="0%" style={{ stopColor: 'var(--moon-fill)', stopOpacity: 0.4 }} />
          <stop offset="100%" style={{ stopColor: 'var(--moon-fill)', stopOpacity: 0 }} />
        </radialGradient>
        <clipPath id={`${ids}-back`}>
          <rect x="-40" y="-40" width="320" height="168" />
        </clipPath>
        <clipPath id={`${ids}-front`}>
          <rect x="-40" y="128" width="320" height="160" />
        </clipPath>
      </defs>

      <circle cx="120" cy="120" r="92" fill={`url(#${ids}-disc)`} />

      {/* The orbit is drawn in two halves so it passes behind, then in front of, the scene. */}
      <g transform="rotate(-18 120 128)">
        <path d={ORBIT_PATH} clipPath={`url(#${ids}-back)`} fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.35" />
      </g>

      <HeroScene ids={ids} condition={condition} isDay={isDay} />

      <g transform="rotate(-18 120 128)">
        <path d={ORBIT_PATH} clipPath={`url(#${ids}-front)`} fill="none" stroke="currentColor" strokeWidth="1.75" />
        {still ? (
          <circle r="5.5" cx="230" cy="122" fill="var(--ember)" />
        ) : (
          <circle r="5.5" fill="var(--ember)">
            <animateMotion dur="18s" repeatCount="indefinite" path={ORBIT_PATH} />
          </circle>
        )}
      </g>
    </svg>
  );
}

/** The sun-orbit mark. Ink follows `currentColor`; the sun is always ember. */
export function LogoMark({ width = 56, className }: { width?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={width}
      height={(width * 32) / 64}
      viewBox="0 0 64 32"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M19 18a11 11 0 0 1 22 0z" fill="var(--ember)" />
      <ellipse
        cx="32"
        cy="19"
        rx="29"
        ry="7.5"
        transform="rotate(-10 32 19)"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx="56" cy="11" r="2.2" fill="var(--ember)" />
    </svg>
  );
}
