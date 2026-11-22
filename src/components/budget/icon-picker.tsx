"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { setCategoryIconAction } from "@/app/actions";
import { useT } from "@/i18n/client";
import { categoryIcons, type CategoryIcon } from "@/lib/category-icons";
import { CategoryGlyph, iconDrawings } from "../category-icon";
import { focusLeft, placePopup, popupCard } from "../menu";
import type { useSave } from "../use-save";
import { useBudget } from "./budget-context";

/** Icons in a row of the picker; `grid-cols-8` below draws them so. */
const COLUMNS = 8;

/** What can be chosen, in the order shown: the envelope (null), then the set. */
const choices: (CategoryIcon | null)[] = [null, ...categoryIcons];

const items = (grid: HTMLElement) =>
  Array.from(grid.querySelectorAll<HTMLElement>("[role=menuitemradio]"));

const chosenItem = (grid: HTMLElement) =>
  grid.querySelector<HTMLElement>("[role=menuitemradio][aria-checked=true]");

/**
 * Where an arrow key, Home or End goes from item `at` of `count`, laid out
 * `COLUMNS` to a row; undefined for another key. Down from the row above a
 * short last row goes to its last item.
 */
function nextItem(key: string, at: number, count: number): number | undefined {
  const last = count - 1;
  const row = (i: number) => Math.floor(i / COLUMNS);
  switch (key) {
    case "ArrowRight":
      return Math.min(at + 1, last);
    case "ArrowLeft":
      return Math.max(at - 1, 0);
    case "ArrowDown":
      return row(at) < row(last) ? Math.min(at + COLUMNS, last) : at;
    case "ArrowUp":
      return at >= COLUMNS ? at - COLUMNS : at;
    case "Home":
      return 0;
    case "End":
      return last;
  }
}

/**
 * The icon at the start of a category's row, and the button that opens a
 * grid to choose another: the envelope first, then the set in
 * `src/lib/category-icons.ts`, with the current one marked. It works like
 * the row's menu (`Menu`): a click, Enter, Space or an arrow key opens it,
 * the arrow keys move through the grid, Enter or Space chooses, and Escape
 * closes it and goes back to the button. Clicking elsewhere or tabbing away
 * closes it. The new icon shows straight away; the save follows.
 */
export function IconPicker({
  category: { id, name, icon },
  color,
  save,
}: {
  category: { id: number; name: string; icon?: CategoryIcon };
  /** The group's colour, which the icons are drawn in. */
  color: string;
  /** Saves through the row, which reports a failure beside the name. */
  save: ReturnType<typeof useSave>["save"];
}) {
  const t = useT();
  const { show } = useBudget();
  // How the grid was opened, which decides what gets the focus; null while closed.
  const [opened, setOpened] = useState<"keyboard" | "pointer" | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const popupId = useId();
  const label = t("budget.icons.choose", { name });
  const current = icon ?? null;

  // Place the grid before it is first painted, then hand it the focus: from
  // the keyboard to the current icon, so the arrow keys start there.
  useLayoutEffect(() => {
    const popup = grid.current;
    if (!opened || !popup) return;
    placePopup(popup);
    (opened === "keyboard" ? chosenItem(popup) : popup)?.focus();
  }, [opened]);

  /** From the keyboard, the focus goes back to the button, as in `Menu`. */
  function close(byKeyboard: boolean) {
    setOpened(null);
    if (byKeyboard) button.current?.focus();
  }

  function choose(choice: CategoryIcon | null, byKeyboard: boolean) {
    close(byKeyboard);
    if (choice === current) return;
    save(
      () => setCategoryIconAction(id, choice),
      undefined,
      undefined,
      () => show({ type: "icon", categoryId: id, icon: choice }),
    );
  }

  function moveFocus(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      close(true);
      return;
    }
    const all = items(e.currentTarget);
    const at = all.indexOf(document.activeElement as HTMLElement);
    const to =
      at === -1 && e.key.startsWith("Arrow")
        ? // Opened with a click, nothing has the focus yet: start at the current icon.
          all.findIndex((item) => item.getAttribute("aria-checked") === "true")
        : nextItem(e.key, at, all.length);
    if (to === undefined) return;
    e.preventDefault();
    all[to]?.focus();
  }

  return (
    <span className="relative flex">
      <button
        ref={button}
        type="button"
        aria-label={label}
        title={t("budget.icons.chooseTitle")}
        aria-haspopup="menu"
        aria-expanded={opened !== null}
        aria-controls={opened ? popupId : undefined}
        // Focus stays where it is until the grid takes it, so a second click
        // closes the grid instead of reopening it.
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          if (opened) close(false);
          // A click from the keyboard (Enter or Space) has no pointer details.
          else setOpened(e.detail === 0 ? "keyboard" : "pointer");
        }}
        onKeyDown={(e) => {
          if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
          e.preventDefault();
          setOpened("keyboard");
        }}
        className="-m-1 rounded-md p-1 hover:bg-hover aria-expanded:bg-hover"
      >
        <CategoryGlyph icon={icon} color={color} />
      </button>
      {opened && (
        <div
          ref={grid}
          id={popupId}
          role="menu"
          aria-label={label}
          tabIndex={-1}
          onKeyDown={moveFocus}
          // Clicking between the icons leaves the focus where it is.
          onMouseDown={(e) => e.preventDefault()}
          onBlur={(e) => {
            if (focusLeft(e)) setOpened(null);
          }}
          style={{ "--tint": color } as React.CSSProperties}
          className={`${popupCard} grid w-max grid-cols-8 gap-0.5`}
        >
          {choices.map((choice) => {
            const text = choice ? t(iconDrawings[choice].name) : t("budget.icons.envelope");
            const chosen = choice === current;
            return (
              <button
                key={choice ?? "envelope"}
                type="button"
                role="menuitemradio"
                aria-checked={chosen}
                aria-label={text}
                title={text}
                tabIndex={-1}
                onPointerMove={(e) => {
                  // Only a pointer that really moves takes the focus, as in `Menu`.
                  if (e.movementX === 0 && e.movementY === 0) return;
                  if (document.activeElement !== e.currentTarget) e.currentTarget.focus();
                }}
                onClick={(e) => choose(choice, e.detail === 0)}
                // The one with the focus has a grey background, like an item
                // of `Menu`; the current one a tint of the group's colour.
                className="flex h-9 w-9 items-center justify-center rounded-md outline-none! focus:bg-hover aria-checked:bg-[color-mix(in_srgb,var(--tint)_13%,transparent)] aria-checked:focus:bg-[color-mix(in_srgb,var(--tint)_24%,transparent)]"
              >
                <CategoryGlyph icon={choice ?? undefined} color={color} />
              </button>
            );
          })}
        </div>
      )}
    </span>
  );
}
