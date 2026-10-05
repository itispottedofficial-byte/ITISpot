import { AccountShell } from "@/components/AccountShell";
import { AccountForm } from "@/components/AccountForm";
export const metadata = { title: "Recupera password — ITISpot" };
export const dynamic = "force-dynamic";
export default function Forgot() {
  return (
    <AccountShell
      title="RECUPERA"
      description="Succede. Ripartiamo dalla tua email."
    >
      <div className="account-window-content">
        <h2>Password dimenticata?</h2>
        <p>Riceverai un link per sceglierne una nuova.</p>
        <AccountForm action="forgot" />
      </div>
    </AccountShell>
  );
}
