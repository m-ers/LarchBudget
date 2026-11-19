import type { SVGProps } from "react";

function Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  );
}

export const EnvelopeIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <path d="m3.5 7.5 8.5 6 8.5-6" />
  </Icon>
);

/**
 * The LarchBudget mark: four lines that widen downward over a short one for
 * the trunk, a larch and a budget at once, on a tile in the accent colour.
 * Keep `app/icon.svg` the same.
 */
export const LogoMark = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
    <rect width="24" height="24" rx="6" fill="var(--accent)" />
    <path
      d="M10.9 5.4h2.2M9.2 8.7h5.6M7.5 12h9M5.8 15.3h12.4M10.9 18.6h2.2"
      fill="none"
      stroke="var(--rail)"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);
