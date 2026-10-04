import Link from "next/link";
import { ArrowUpRight, Inbox, type LucideIcon } from "lucide-react";

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  link,
}: {
  title: string;
  description: string;
  icon?: LucideIcon;
  link?: { href: string; label: string };
}) {
  return (
    <div className="portal-empty-state">
      <span className="empty-state-icon">
        <Icon size={32} aria-hidden="true" />
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
      {link && (
        <Link className="retro-button" href={link.href}>
          {link.label}
          <ArrowUpRight size={17} aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
