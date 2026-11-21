"use client";

import { createGroupAction } from "@/app/actions";
import { useT } from "@/i18n/client";
import { PlusIcon } from "../icons";
import { AddByNameField, useAddByName } from "./add-by-name";

/**
 * The "new group" field under the budget table. It is styled as a group
 * heading, so it is not mistaken for a category in the last group, and
 * what you type looks like the heading you will get.
 */
export function NewGroup({ placeholder }: { placeholder: string }) {
  const t = useT();
  const adder = useAddByName(createGroupAction);

  return (
    <form onSubmit={adder.submit} className="flex h-[38px] items-center gap-3 pt-1 pl-3.5">
      <PlusIcon width={14} height={14} className="shrink-0 text-muted" />
      <AddByNameField
        state={adder}
        label={t("budget.newGroup.label")}
        placeholder={placeholder}
        className="text-xs font-semibold tracking-[0.07em] text-muted uppercase"
      />
    </form>
  );
}
