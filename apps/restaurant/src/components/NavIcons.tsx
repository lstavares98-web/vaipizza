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

export function OrdersIcon() {
  return (
    <svg {...common}>
      <path d="M6.5 3.5h11a1 1 0 0 1 1 1V21l-2.5-1.5L13.5 21l-1.5-1.5L10.5 21 8 19.5 5.5 21V4.5a1 1 0 0 1 1-1Z" />
      <path d="M9 8h6M9 11.5h6M9 15h4" />
    </svg>
  );
}

export function MenuBookIcon() {
  return (
    <svg {...common}>
      <path d="M12 6.5c-1.5-1.4-3.8-2-6.5-2v13c2.7 0 5 .6 6.5 2 1.5-1.4 3.8-2 6.5-2v-13c-2.7 0-5 .6-6.5 2Z" />
      <path d="M12 6.5V19.5" />
    </svg>
  );
}

export function CashIcon() {
  return (
    <svg {...common}>
      <rect x="3" y="6.5" width="18" height="12" rx="2" />
      <circle cx="12" cy="12.5" r="2.6" />
      <path d="M6.5 6.5V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v1.5" />
    </svg>
  );
}

export function ReportsIcon() {
  return (
    <svg {...common}>
      <path d="M4 20V10M10 20V4M16 20v-7M20 20H4" />
    </svg>
  );
}

export function SettingsIcon() {
  return (
    <svg {...common}>
      <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h13M21 18h-3" />
      <circle cx="15" cy="6" r="2.2" />
      <circle cx="9" cy="12" r="2.2" />
      <circle cx="18" cy="18" r="2.2" />
    </svg>
  );
}

export function LogoutIcon() {
  return (
    <svg {...common}>
      <path d="M9 4H6a1.5 1.5 0 0 0-1.5 1.5v13A1.5 1.5 0 0 0 6 20h3" />
      <path d="M13 8l4.5 4L13 16" />
      <path d="M17.2 12H9.5" />
    </svg>
  );
}

export function MenuBarsIcon() {
  return (
    <svg {...common}>
      <path d="M4 6.5h16M4 12h16M4 17.5h16" />
    </svg>
  );
}
