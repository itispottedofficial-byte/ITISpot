import Link from "next/link";
import { UserRound } from "lucide-react";
import { currentAccount } from "@/lib/account";
import { LogoutButton } from "./AccountForm";

export function Avatar({
  username,
  large = false,
}: {
  username: string;
  large?: boolean;
}) {
  return (
    <span
      className={`account-avatar ${large ? "is-large" : ""}`}
      role="img"
      aria-label={`Avatar di ${username}`}
    >
      {username.slice(0, 2).toUpperCase()}
      <i aria-hidden="true">✦</i>
    </span>
  );
}
export async function AccountNav() {
  try {
    const profile = await currentAccount();
    if (profile)
      return (
        <div className="sidebar-account">
          <Link
            href="/profilo"
            className="sidebar-item sidebar-profile"
            title={`Profilo di @${profile.username}`}
          >
            <Avatar username={profile.username} />
            <span>
              @{profile.username}
              <small>Profilo</small>
            </span>
          </Link>
          <LogoutButton compact />
        </div>
      );
  } catch {
    return (
      <Link href="/profilo" className="sidebar-item sidebar-profile">
        <UserRound size={21} aria-hidden="true" />
        <span>
          Profilo<small>Riprova la connessione</small>
        </span>
      </Link>
    );
  }
  return (
    <Link
      className="sidebar-item sidebar-profile"
      href="/login"
      title="Login / Profilo"
    >
      <UserRound size={21} aria-hidden="true" />
      <span>Login / Profilo</span>
    </Link>
  );
}
