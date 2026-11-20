"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";

export type MenuItem = {
  label: string;
  onSelect: () => void;
  /** Listed, but cannot be chosen, such as "Move up" on the first row. */
  disabled?: boolean;
  /** Archive, Delete: listed last, after a thin rule. */
  destructive?: boolean;
};

/** What has focus once the menu opens. */
type Focus = "first" | "last" | "menu";

/** An open menu: what gets focus, and, after a right-click, where the pointer was. */
type Opened = { focus: Focus; at?: { x: number; y: number } };

/** Space kept between the menu and the edge of the window, and between it and its button. */
const MARGIN = 8;
const GAP = 4;

/**
 * Whether one `Menu` is open. Held by the row, so a right-click anywhere
 * on the row opens the same menu.
 */
export function useMenu() {
  const [opened, setOpened] = useState<Opened | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  return {
    opened,
    setOpened,
    /** The menu's button, for giving it the focus back after an action. */
    button,

    /**
     * For the row's `onContextMenu`: opens the menu where the pointer is.
     * Fields and links keep the browser's own menu, for copy, paste and
     * opening in a new tab.
     */
    openAtPointer(e: React.MouseEvent) {
      if (e.target instanceof Element && e.target.closest("input, select, a, [role=menu]")) return;
      e.preventDefault();
      setOpened({ focus: "menu", at: { x: e.clientX, y: e.clientY } });
    },
  };
}

/** The items that can be chosen, in the order they are shown. */
const choosable = (menu: HTMLElement) =>
  Array.from(menu.querySelectorAll<HTMLElement>("[role=menuitem]:not([aria-disabled=true])"));

/**
 * A button that opens a short list of actions. It works like a menu in the
 * operating system: Enter, Space or the arrow keys open it, the arrow keys,
 * Home and End move through it, Enter chooses, and Escape closes it and
 * goes back to the button. Clicking elsewhere or tabbing away closes it.
 * It opens upwards when there is no room below it in the window.
 */
export function Menu({
  label,
  items,
  state,
  buttonClassName,
  children,
}: {
  /** Accessible name of the button and the menu, e.g. "Actions for Groceries". */
  label: string;
  items: MenuItem[];
  state: ReturnType<typeof useMenu>;
  /** The button's look; it is shown as long as its menu is open. */
  buttonClassName: string;
  /** What the button shows. */
  children: React.ReactNode;
}) {
  const { opened, setOpened, button } = state;
  const list = useRef<HTMLDivElement>(null);
  const id = useId();

  // Place the menu before it is first painted, then hand it the focus.
  // The position is set on the element itself: it depends on the size the
  // menu turns out to have, which is only known once it is drawn.
  useLayoutEffect(() => {
    const menu = list.current;
    const anchor = menu?.offsetParent;
    if (!opened || !menu || !anchor) return;

    const box = anchor.getBoundingClientRect();
    const { offsetWidth: width, offsetHeight: height } = menu;
    const fitsBelow = (top: number) => top + height <= window.innerHeight - MARGIN;
    let left: number;
    let top: number;
    if (opened.at) {
      ({ x: left, y: top } = opened.at);
      if (!fitsBelow(top)) top = Math.max(MARGIN, top - height);
      if (left + width > window.innerWidth - MARGIN) left -= width;
    } else {
      left = box.left;
      top = box.bottom + GAP;
      if (!fitsBelow(top) && box.top - GAP - height >= MARGIN) top = box.top - GAP - height;
      if (left + width > window.innerWidth - MARGIN) left = box.right - width;
    }
    menu.style.left = `${left - box.left}px`;
    menu.style.top = `${top - box.top}px`;

    const items = choosable(menu);
    (opened.focus === "menu" ? menu : items.at(opened.focus === "first" ? 0 : -1))?.focus();
  }, [opened]);

  function open(focus: Focus) {
    setOpened({ focus });
  }

  /**
   * Closes the menu. From the keyboard, the focus goes back to its button,
   * so it is not lost with the menu; after a click it goes where clicking
   * anywhere else leaves it.
   */
  function close(byKeyboard: boolean) {
    setOpened(null);
    if (byKeyboard) button.current?.focus();
  }

  function moveFocus(e: React.KeyboardEvent<HTMLDivElement>) {
    const options = choosable(e.currentTarget);
    const at = options.indexOf(document.activeElement as HTMLElement);
    const next = {
      ArrowDown: options[(at + 1) % options.length],
      ArrowUp: options.at(at === -1 ? -1 : at - 1),
      Home: options[0],
      End: options.at(-1),
    }[e.key];
    if (next) {
      e.preventDefault();
      next.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      close(true);
    }
  }

  const regular = items.filter((item) => !item.destructive);
  const destructive = items.filter((item) => item.destructive);
  // The item with focus is marked by its background alone: the page's
  // focus ring would crowd the card.
  const item = ({ label: text, onSelect, disabled }: MenuItem) => (
    <button
      key={text}
      type="button"
      role="menuitem"
      tabIndex={-1}
      aria-disabled={disabled || undefined}
      onPointerMove={(e) => {
        // Only a pointer that really moves takes the focus, not one resting
        // where the menu happens to open. On an item that cannot be chosen,
        // nothing is marked.
        if (e.movementX === 0 && e.movementY === 0) return;
        const target = disabled ? e.currentTarget.parentElement : e.currentTarget;
        if (document.activeElement !== target) target?.focus();
      }}
      onClick={(e) => {
        if (disabled) return;
        close(e.detail === 0);
        onSelect();
      }}
      className="block w-full truncate rounded-md px-2.5 py-1.5 text-left outline-none! focus:bg-hover aria-disabled:cursor-default aria-disabled:text-muted/60"
    >
      {text}
    </button>
  );

  return (
    <span className="relative flex shrink-0">
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={opened !== null}
        aria-controls={opened ? id : undefined}
        // Focus stays where it is until the menu takes it, so a second click
        // closes the menu instead of reopening it.
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          if (opened) close(false);
          // A click from the keyboard (Enter or Space) has no pointer details.
          else open(e.detail === 0 ? "first" : "menu");
        }}
        onKeyDown={(e) => {
          if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
          e.preventDefault();
          open(e.key === "ArrowDown" ? "first" : "last");
        }}
        className={`${buttonClassName} aria-expanded:bg-hover aria-expanded:text-ink aria-expanded:opacity-100`}
      >
        {children}
      </button>
      {opened && (
        <div
          ref={list}
          id={id}
          role="menu"
          aria-label={label}
          tabIndex={-1}
          onKeyDown={moveFocus}
          // Clicking the menu's edge or its rule leaves the focus where it is.
          onMouseDown={(e) => e.preventDefault()}
          onBlur={(e) => {
            const menu = e.currentTarget;
            if (menu.contains(e.relatedTarget)) return;
            // When the whole window loses focus, the focus stays in the menu.
            if (menu.contains(document.activeElement)) return;
            setOpened(null);
          }}
          className="absolute top-full left-0 z-20 w-max max-w-80 min-w-44 rounded-xl border border-line bg-surface p-1 text-left text-[15px] font-normal tracking-normal text-ink normal-case shadow-[0_6px_24px_-4px_rgb(22_24_29/0.16)] outline-none!"
        >
          {regular.map(item)}
          {regular.length > 0 && destructive.length > 0 && (
            <div role="separator" className="mx-1 my-1 border-t border-line" />
          )}
          {destructive.map(item)}
        </div>
      )}
    </span>
  );
}
