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

export const WalletIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <rect x="3" y="6" width="18" height="13" rx="2.5" />
    <path d="M16 12.5h.01M3 10h18" />
  </Icon>
);

export const ListIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <path d="M8 7h12M8 12h12M8 17h12M4 7h.01M4 12h.01M4 17h.01" />
  </Icon>
);

/** Lucide's "settings" icon (lucide.dev), ISC License, Copyright (c) Lucide Icons and Contributors. */
export const GearIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);

export const UploadIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <path d="M12 16V5m0 0-4 4m4-4 4 4M5 19h14" />
  </Icon>
);

export const ChevronLeftIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <path d="m14.5 6-6 6 6 6" />
  </Icon>
);

export const ChevronRightIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <path d="m9.5 6 6 6-6 6" />
  </Icon>
);

export const ArrowRightIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <path d="M5 12h14m-6-6 6 6-6 6" />
  </Icon>
);

export const PlusIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const ArchiveIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <rect x="3" y="4.5" width="18" height="4.5" rx="1.2" />
    <path d="M5 9v8.5A1.5 1.5 0 0 0 6.5 19h11a1.5 1.5 0 0 0 1.5-1.5V9M10 13h4" />
  </Icon>
);

export const TrashIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <path d="M4 7h16M9.5 7V5h5v2M6.5 7l.8 11.2a1 1 0 0 0 1 .8h7.4a1 1 0 0 0 1-.8L17.5 7" />
  </Icon>
);

/** Three dots in a row: "more actions". */
export const MoreIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props} fill="currentColor" stroke="none">
    <circle cx="5.5" cy="12" r="1.7" />
    <circle cx="12" cy="12" r="1.7" />
    <circle cx="18.5" cy="12" r="1.7" />
  </Icon>
);

export const CheckIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Icon>
);

export const InfoIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </Icon>
);

/** Filled warning triangle. Always paired with text; never the only signal. */
export const WarningIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
    <path d="M12 3.2 22 20.5H2Z" fill="var(--bad)" />
    <path
      d="M12 10v4.6M12 17.4h.01"
      fill="none"
      stroke="#fff"
      strokeWidth="2.2"
      strokeLinecap="round"
    />
  </svg>
);

/** The small outlined envelope that starts every category row, in its group's colour. */
export const EnvelopeToken = ({ color }: { color: string }) => (
  <svg width="26" height="19" viewBox="0 0 26 19" aria-hidden="true" className="shrink-0">
    <rect x="1" y="1" width="24" height="17" rx="4" fill="#fff" stroke={color} strokeWidth="2" />
    <path
      d="M2.6 3.6 13 11l10.4-7.4"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** A dashed placeholder the size of an envelope token, for "add" rows. */
export const EmptyToken = () => (
  <span
    aria-hidden="true"
    className="flex h-[19px] w-[26px] shrink-0 items-center justify-center rounded-[4px] border-[1.5px] border-dashed border-dash text-sm leading-none text-muted"
  >
    +
  </span>
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
