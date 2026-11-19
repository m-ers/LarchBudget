import { getConfig } from "@/lib/config";

/** Whether this installation asks for a password at all. */
export function passwordIsSet(): boolean {
  return getConfig().appPassword !== undefined;
}
