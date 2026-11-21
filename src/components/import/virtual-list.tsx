"use client";

import { useState } from "react";

const ROW_HEIGHT = 38;
const HEADER_HEIGHT = 34;
const MAX_HEIGHT = 420;
/** Rows drawn above and below the visible ones, so fast scrolling does not show gaps. */
const OVERSCAN = 8;

type Props = {
  /** What the list is, for screen readers. */
  label: string;
  /** Names of the columns, and the CSS width of each (`gridTemplateColumns`). */
  columns: { name: string; width: string; align?: "right" }[];
  count: number;
  /** The cells of one row. Give each `role="cell"`. */
  renderRow: (index: number) => React.ReactNode;
  /** Whether a row is drawn muted, e.g. because it will not be imported. */
  isMuted?: (index: number) => boolean;
};

/**
 * A table that scrolls inside the page. Every row has the same height, so
 * only the rows in view are drawn: a bank file may have 20,000 of them.
 */
export function VirtualList({ label, columns, count, renderRow, isMuted }: Props) {
  const [scrollTop, setScrollTop] = useState(0);
  const template = columns.map((column) => column.width).join(" ");
  const height = Math.min(MAX_HEIGHT, HEADER_HEIGHT + count * ROW_HEIGHT);

  const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const last = Math.min(count, Math.ceil((scrollTop + height) / ROW_HEIGHT) + OVERSCAN);

  return (
    <div
      role="table"
      aria-label={label}
      aria-rowcount={count + 1}
      tabIndex={0}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      style={{ height }}
      className="overflow-y-auto rounded-xl border border-line focus-visible:outline-2 focus-visible:outline-brand"
    >
      <div
        role="row"
        style={{ gridTemplateColumns: template, height: HEADER_HEIGHT }}
        className="sticky top-0 z-10 grid items-center border-b border-line bg-surface px-3.5 text-[12.5px] text-muted"
      >
        {columns.map((column) => (
          <div
            key={column.name}
            role="columnheader"
            className={`font-medium ${column.align === "right" ? "text-right" : ""}`}
          >
            {column.name}
          </div>
        ))}
      </div>
      <div role="rowgroup" style={{ height: count * ROW_HEIGHT }} className="relative">
        {Array.from({ length: last - first }, (_, k) => first + k).map((index) => (
          <div
            key={index}
            role="row"
            aria-rowindex={index + 2}
            style={{
              gridTemplateColumns: template,
              height: ROW_HEIGHT,
              top: index * ROW_HEIGHT,
            }}
            className={`data-row absolute inset-x-0 grid items-center px-3.5 ${
              isMuted?.(index) ? "text-muted" : ""
            }`}
          >
            {renderRow(index)}
          </div>
        ))}
      </div>
    </div>
  );
}
