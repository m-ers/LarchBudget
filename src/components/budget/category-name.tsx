"use client";

import { archiveCategoryAction, renameCategoryAction } from "@/app/actions";
import { ErrorText } from "../form";
import { ArchiveIcon } from "../icons";
import { InlineName } from "../inline-name";
import { useSave } from "../use-save";
import { RowAction } from "./row-action";

type Props = { id: number; name: string; available: string; hasBalance: boolean };

/** Category name: click to rename. The archive button shows on row hover. */
export function CategoryName({ id, name, available, hasBalance }: Props) {
  const { error, pending, save } = useSave();

  function archive() {
    const message = hasBalance
      ? `Archive "${name}"? Its balance of ${available} goes back to Ready to assign.`
      : `Archive "${name}"?`;
    if (window.confirm(message)) save(() => archiveCategoryAction(id));
  }

  return (
    <div className={`flex min-w-0 items-center gap-1 ${pending ? "opacity-60" : ""}`}>
      <InlineName
        value={name}
        label="Category name"
        onSave={(text) => renameCategoryAction(id, text)}
        className="text-[15.5px] font-medium"
      />
      <RowAction label={`Archive ${name}`} title="Archive" onClick={archive} revealOn="row">
        <ArchiveIcon width={15} height={15} />
      </RowAction>
      <ErrorText error={error} as="span" className="text-xs" />
    </div>
  );
}
