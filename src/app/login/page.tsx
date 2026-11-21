import type { Metadata } from "next";
import { LogoMark } from "@/components/icons";
import { getT } from "@/i18n/server";
import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("login.title") };
}

export default function LoginPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-6 rounded-2xl border border-line bg-surface p-8">
        <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight">
          <LogoMark />
          LarchBudget
        </h1>
        <LoginForm />
      </div>
    </main>
  );
}
