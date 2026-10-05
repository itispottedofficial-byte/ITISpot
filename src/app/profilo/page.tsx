import { redirect } from "next/navigation";
import Link from "next/link";
import { currentAccount } from "@/lib/account";
import { AccountShell } from "@/components/AccountShell";
import { AccountForm, LogoutButton } from "@/components/AccountForm";
import { Avatar } from "@/components/AccountNav";
export const metadata = { title: "Il tuo profilo — ITISpot" };
export const dynamic = "force-dynamic";
export default async function Profile() {
  let profile;
  try {
    profile = await currentAccount();
  } catch {
    return (
      <AccountShell title="PROFILO" description="Il tuo spazio personale.">
        <div className="account-window-content">
          <h2>Ci ricolleghiamo tra poco.</h2>
          <p role="alert">
            Non riusciamo a caricare il profilo. Riprova tra poco.
          </p>
          <Link className="retro-button" href="/profilo">
            Riprova
          </Link>
        </div>
      </AccountShell>
    );
  }
  if (!profile) redirect("/login");
  return (
    <AccountShell
      title="PROFILO"
      description="Questo nickname è il tuo. La voce degli Spot resta anonima."
    >
      <div className="account-window-content">
        <div className="profile-identity">
          <Avatar username={profile.username} large />
          <div>
            <span className="account-window-kicker">connesso a ITISpot</span>
            <h2>@{profile.username}</h2>
            <p>
              Iscritto il{" "}
              <time dateTime={profile.created_at}>
                {new Intl.DateTimeFormat("it-IT", {
                  dateStyle: "long",
                  timeZone: "Europe/Rome",
                }).format(new Date(profile.created_at))}
              </time>
            </p>
          </div>
        </div>
        <AccountForm action="profile" username={profile.username} />
        <div className="profile-future">
          <section>
            <h3>✦ Badge</h3>
            <p>
              Il tuo spazio per i badge.
              <br />
              <span>In arrivo</span>
            </p>
          </section>
          <section>
            <h3>↗ Statistiche</h3>
            <p>
              Le prossime avventure.
              <br />
              <span>In arrivo</span>
            </p>
          </section>
        </div>
        <LogoutButton />
      </div>
    </AccountShell>
  );
}
