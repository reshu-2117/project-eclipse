import type { ReactNode } from "react";

type IconProps = { size?: number };

function Svg({ size = 24, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function EclipseMark({ size = 28 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <circle cx="14" cy="14" r="11" fill="none" stroke="#FFB547" strokeWidth="1.5" />
      <circle cx="17" cy="12" r="10" fill="#05070B" />
      <circle cx="14" cy="14" r="13.25" fill="none" stroke="#7FD4E8" strokeOpacity="0.25" strokeWidth="0.75" />
    </svg>
  );
}

export const Thermal = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 14.76V5a2 2 0 0 0-4 0v9.76a4 4 0 1 0 4 0Z" />
    <path d="M12 17v-5" />
    <path d="M18 6h3M18 10h2" />
  </Svg>
);
export const Layers = (p: IconProps) => (
  <Svg {...p}>
    <path d="m12 3 9 5-9 5-9-5 9-5Z" />
    <path d="m3 13 9 5 9-5" />
    <path d="M12 13v8" strokeDasharray="2 2" />
  </Svg>
);
export const Scan = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
    <path d="M7 12h10" />
    <circle cx="12" cy="12" r="2.5" />
  </Svg>
);
export const OrbitIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3.5" />
    <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(-20 12 12)" />
    <circle cx="20.5" cy="9" r="1" fill="currentColor" />
  </Svg>
);
export const Flyby = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="15" r="3.5" />
    <path d="M3 5c6 0 13 2 18 9" strokeDasharray="2 2.5" />
    <path d="m19 10 2 4-4 .5" />
  </Svg>
);
export const Craft = (p: IconProps) => (
  <Svg {...p}>
    <rect x="9" y="8" width="6" height="8" rx="1" />
    <path d="M9 12H3M15 12h6M3 9v6M21 9v6M12 8V4M10 4h4" />
  </Svg>
);
export const Instrument = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
  </Svg>
);
export const Power = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
  </Svg>
);
export const Mass = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3v18M5 7h14M7 7l-3 7a3 3 0 0 0 6 0L7 7ZM17 7l-3 7a3 3 0 0 0 6 0l-3-7Z" />
  </Svg>
);
export const Antenna = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.9 16.1a10 10 0 0 1 0-14.2M19.1 1.9a10 10 0 0 1 0 14.2M8.5 12.5a5 5 0 0 1 0-7M15.5 5.5a5 5 0 0 1 0 7" />
    <circle cx="12" cy="9" r="1.5" />
    <path d="m12 11-3 11M12 11l3 11M10 18h4" />
  </Svg>
);
export const Chip = (p: IconProps) => (
  <Svg {...p}>
    <rect x="6" y="6" width="12" height="12" rx="2" />
    <rect x="9.5" y="9.5" width="5" height="5" />
    <path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" />
  </Svg>
);
