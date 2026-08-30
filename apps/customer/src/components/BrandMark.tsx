// Stand-in for the real VaiPizza badge (circular green/red rings + pizza
// mascot) until we have an exportable logo file to drop in directly —
// see the note left for the team about swapping this out.
export default function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="19" fill="#F7E8C8" stroke="#0B4D2B" strokeWidth="2" />
      <circle cx="20" cy="20" r="15.5" fill="none" stroke="#A51F10" strokeWidth="1.2" />
      <path
        d="M20 10 L28.5 27 A11 11 0 0 1 11.5 27 Z"
        fill="#F5A000"
        stroke="#A51F10"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <circle cx="20" cy="17.5" r="1.5" fill="#A51F10" />
      <circle cx="17" cy="22" r="1.5" fill="#A51F10" />
      <circle cx="23" cy="22" r="1.5" fill="#A51F10" />
    </svg>
  );
}
