import { AccountShell } from "@/components/AccountShell";
import { AccountForm } from "@/components/AccountForm";
export const metadata = { title: "Registrati — ITISpot" };
export const dynamic = "force-dynamic";
export default function Signup() {
  return (
    <AccountShell
      title="REGISTRATI"
      description="Un nickname. Un piccolo spazio tutto tuo."
    >
      <div className="account-window-content">
        <span className="account-window-kicker">nuovo utente / vol. 01</span>
        <h2>Scegli come farti chiamare.</h2>
        <p>Ti basta un nickname. La tua email resta privata.</p>
        <AccountForm action="signup" />
      </div>
    </AccountShell>
  );
}
