"use client";

import { createGroupAction } from "@/app/actions";
import { EmptyToken } from "../icons";
import { AddByNameField, useAddByName } from "./add-by-name";

/** The "new group" field under the budget table. */
export function NewGroup({ placeholder }: { placeholder: string }) {
  const adder = useAddByName(createGroupAction);

  return (
    <form onSubmit={adder.submit} className="flex h-[42px] items-center gap-3.5 pl-3.5">
      <EmptyToken />
      <AddByNameField state={adder} label="New group name" placeholder={placeholder} />
    </form>
  );
}
