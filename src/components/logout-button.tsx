import { connection } from "next/server";
import { logout } from "@/app/login/actions";
import { passwordIsSet } from "@/app/session";

/** Only rendered when the app is password protected. */
export async function LogoutButton() {
  await connection();
  if (!passwordIsSet()) return null;

  return (
    <form action={logout}>
      <button
        type="submit"
        className="w-full rounded-[9px] px-3 py-2 text-left text-[14.5px] text-white/60 transition-colors hover:bg-white/5 hover:text-white"
      >
        Log out
      </button>
    </form>
  );
}
