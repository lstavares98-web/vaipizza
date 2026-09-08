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

export function StarIcon(_: IconProps) {
  return (
    <svg {...common}>
      <path d="M12 3.5l2.47 5.18 5.53.68-4.03 3.98 1.02 5.66L12 16.2l-4.99 2.8 1.02-5.66-4.03-3.98 5.53-.68L12 3.5Z" />
    </svg>
  );
}

export function BikeIcon(_: IconProps) {
  return (
    <svg {...common}>
      <circle cx="5.5" cy="17.5" r="3" />
      <circle cx="18.5" cy="17.5" r="3" />
      <path d="M5.5 17.5 9 10h4l2.5 3.2M9 10 8 7h-2" />
      <path d="M12.5 13.2 15 17.5h3.5" />
    </svg>
  );
}

export function CheckIcon(_: IconProps) {
  return (
    <svg {...common} strokeWidth={2.4}>
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  );
}

export function PinIcon(_: IconProps) {
  return (
    <svg {...common}>
      <path d="M12 21s7-6.3 7-11.5A7 7 0 0 0 5 9.5C5 14.7 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.3" />
    </svg>
  );
}

export function PhoneIcon(_: IconProps) {
  return (
    <svg {...common}>
      <path d="M5.5 4h3l1.3 4.2-2 1.6a11 11 0 0 0 5.4 5.4l1.6-2 4.2 1.3v3a1.5 1.5 0 0 1-1.6 1.5A15.5 15.5 0 0 1 4 6.6 1.5 1.5 0 0 1 5.5 4Z" />
    </svg>
  );
}

// Watermark used inside product/restaurant cards that have no photo yet —
// keeps the empty state on-brand instead of a dead flat-colour box.
export function PizzaIcon(_: IconProps) {
  return (
    <svg {...common} viewBox="0 0 24 24" strokeWidth={1.4}>
      <path d="M12 3.5 3.8 19.5h16.4L12 3.5Z" />
      <circle cx="10.3" cy="13.2" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="14.1" cy="14.6" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="11.6" cy="17" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}
