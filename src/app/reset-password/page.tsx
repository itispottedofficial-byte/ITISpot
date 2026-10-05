import { redirect } from "next/navigation";
import { serverAccountClient } from "@/lib/account";
import { AccountShell } from "@/components/AccountShell";
import { AccountForm } from "@/components/AccountForm";
export const metadata = { title: "Nuova password — ITISpot" };
export const dynamic = "force-dynamic";
export default async function Reset() {
  let allowed = false;
  try {
    const { data } = await (await serverAccountClient()).auth.getUser();
    allowed = !!data.user?.email_confirmed_at;
  } catch {
    /* No valid session. */
  }
  if (!allowed) redirect("/password-dimenticata");
  return (
    <AccountShell
      title="NUOVA PASSWORD"
      description="Un nuovo inizio, stesso nickname."
    >
      <div className="account-window-content">
        <h2>Scegli una nuova password.</h2>
        <AccountForm action="reset" />
      </div>
    </AccountShell>
  );
}
