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
      <circle cx={cx} cy={cy} r={r} />
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
      fill="none"
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
            drops.map((x) => <line key={x} x1={x} x2={x - 3} y1={44} y2={condition === 'drizzle' ? 49 : 54} {...line} />)
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

/** Large illustration for the current conditions: glyph on a soft disc, ringed by the brand orbit. */
export function HeroArt({ condition, isDay }: { condition: ConditionKind; isDay: boolean }) {
  return (
    <svg className="hero-art" viewBox="0 0 240 240" aria-hidden="true" focusable="false">
      <circle cx="120" cy="120" r="92" fill="var(--halo)" />
      <g transform="translate(36.8 36.8) scale(2.6)">
        <Glyph condition={condition} isDay={isDay} stroke={0.95} />
      </g>
      <ellipse
        cx="120"
        cy="128"
        rx="112"
        ry="30"
        transform="rotate(-18 120 128)"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="202" cy="83" r="5" fill="var(--ember)" />
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
