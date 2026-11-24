import type { JSX } from "react";

/**
 * Wordmark mark: a lens/ring, i.e. what a telescope is for.
 * Inline SVG on purpose — no extra asset request, and it inherits crisp edges
 * at every size (favicon reuses the same geometry).
 */
export default function BrandMark({
  size = 30,
}: {
  readonly size?: number;
}): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
      style={{ display: "block", flex: "none" }}
    >
      <defs>
        <linearGradient id="ct-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4f6bff" />
          <stop offset="100%" stopColor="#2f49d8" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#ct-mark)" />
      <circle
        cx="16"
        cy="16"
        r="8.25"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.92"
        strokeWidth="1.9"
      />
      <circle cx="16" cy="16" r="2.75" fill="#ffffff" />
      <path
        d="M16 4.9v3.1M16 24v3.1M4.9 16h3.1M24 16h3.1"
        stroke="#ffffff"
        strokeOpacity="0.5"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}
