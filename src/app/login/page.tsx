import { AccountShell } from "@/components/AccountShell";
import { AccountForm } from "@/components/AccountForm";
export const metadata = { title: "Accedi — ITISpot" };
export const dynamic = "force-dynamic";
export default function Login() {
  return (
    <AccountShell
      title="ACCEDI"
      description="Bentornato nel tuo angolo di internet."
    >
      <div className="account-window-content">
        <span className="account-window-kicker">sessione / accesso</span>
        <h2>Ci si rivede qui.</h2>
        <p>Il tuo username, il tuo spazio.</p>
        <AccountForm action="login" />
      </div>
    </AccountShell>
  );
}
