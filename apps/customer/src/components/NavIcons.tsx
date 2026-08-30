// Thin-stroke line icons for the bottom nav — swapped in for the default
// emoji set, which rendered at wildly inconsistent sizes/styles across
// operating systems and clashed with the rest of the editorial design.
type IconProps = { active?: boolean };

const common = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function HomeIcon(_: IconProps) {
  return (
    <svg {...common}>
      <path d="M3.5 10.5 12 3l8.5 7.5" />
      <path d="M5.5 9.5V20a1 1 0 0 0 1 1H10v-5.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V21h3.5a1 1 0 0 0 1-1V9.5" />
    </svg>
  );
}

export function BagIcon(_: IconProps) {
  return (
    <svg {...common}>
      <path d="M6.5 8.5h11l.9 11a1.5 1.5 0 0 1-1.5 1.6H7.1a1.5 1.5 0 0 1-1.5-1.6l.9-11Z" />
      <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
    </svg>
  );
}

export function ReceiptIcon(_: IconProps) {
  return (
    <svg {...common}>
      <path d="M6.5 3.5h11a1 1 0 0 1 1 1V21l-2.5-1.5L13.5 21l-1.5-1.5L10.5 21 8 19.5 5.5 21V4.5a1 1 0 0 1 1-1Z" />
      <path d="M9 8h6M9 11.5h6M9 15h4" />
    </svg>
  );
}

export function UserIcon(_: IconProps) {
  return (
    <svg {...common}>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5 20c1-3.6 4-5.5 7-5.5s6 1.9 7 5.5" />
    </svg>
  );
}

export function LogoutIcon(_: IconProps) {
  return (
    <svg {...common}>
      <path d="M9 4H6a1.5 1.5 0 0 0-1.5 1.5v13A1.5 1.5 0 0 0 6 20h3" />
      <path d="M13 8l4.5 4L13 16" />
      <path d="M17.2 12H9.5" />
    </svg>
  );
}
