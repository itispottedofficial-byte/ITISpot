import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { AccountNav } from "./AccountNav";
import { feedHref, type PreviewState } from "@/lib/presented-feed";
import {
  ArrowUpRight,
  BarChart3,
  Gamepad2,
  Home,
  Lightbulb,
  Send,
  Search,
  Star,
  Trophy,
  Disc3,
} from "lucide-react";

export function SearchBar({
  query = "",
  preview,
}: {
  query?: string;
  preview?: PreviewState;
}) {
  return (
    <form action="/novita" method="get" role="search" className="portal-search">
      <label className="sr-only" htmlFor="explore">
        Cerca negli Spot approvati
      </label>
      {preview && (
        <>
          <input type="hidden" name="preview" value={preview.mode} />
          <input type="hidden" name="featured" value={preview.featured} />
        </>
      )}
      <Search size={18} aria-hidden="true" />
      <input
        key={query}
        id="explore"
        type="search"
        name="q"
        defaultValue={query}
        maxLength={500}
        placeholder="Cerca / esplora gli Spot..."
      />
      <button type="submit" aria-label="Cerca">
        <ArrowUpRight size={20} />
      </button>
    </form>
  );
}
export function PortalHeader({
  query,
  preview,
}: {
  query?: string;
  preview?: PreviewState;
}) {
  return (
    <header className="portal-header">
      <Link
        href={feedHref("/", preview)}
        aria-label="ITISpot, home"
        className="portal-logo"
      >
        <img
          src="/itispot-chrome.png"
          alt="ITISpot"
          width={2172}
          height={724}
        />
      </Link>
      <SearchBar query={query} preview={preview} />
      <span className="portal-header-star" aria-hidden="true">
        ✳
      </span>
    </header>
  );
}
const futureSections = [
  { label: "Curiosità", icon: Lightbulb },
  { label: "Classifiche", icon: Trophy },
  { label: "Sondaggi", icon: BarChart3 },
  { label: "Arcade", icon: Gamepad2 },
];
export function Sidebar({
  active,
  preview,
}: {
  active: "home" | "novita" | "account";
  preview?: PreviewState;
}) {
  return (
    <aside className="portal-sidebar">
      <div className="sidebar-caption">
        <span aria-hidden="true">✦</span> il tuo spazio
      </div>
      <nav aria-label="Esplora ITISpot" className="portal-navigation">
        <Link
          href={feedHref("/", preview)}
          className={`sidebar-item sidebar-home ${active === "home" ? "is-active" : ""}`}
          aria-current={active === "home" ? "page" : undefined}
          title="Home"
        >
          <Home size={21} aria-hidden="true" />
          <span>Home</span>
        </Link>
        {futureSections.map(({ label, icon: Icon }) => (
          <button
            key={label}
            disabled
            className="sidebar-item"
            title={`${label} · in arrivo`}
          >
            <Icon size={21} aria-hidden="true" />
            <span>
              {label}
              <small>in arrivo</small>
            </span>
          </button>
        ))}
        <Link
          href="/invia"
          className="sidebar-item sidebar-send"
          title="Invia Spot"
        >
          <Send size={21} aria-hidden="true" />
          <span>Invia Spot</span>
          <ArrowUpRight
            className="sidebar-arrow"
            size={16}
            aria-hidden="true"
          />
        </Link>
      </nav>
      <div className="sidebar-bottom">
        <span className="sidebar-graffiti" aria-hidden="true">
          say it!
        </span>
        <Suspense
          fallback={
            <Link className="sidebar-item sidebar-profile" href="/login">
              Login / Profilo
            </Link>
          }
        >
          <AccountNav />
        </Suspense>
      </div>
    </aside>
  );
}
export function SectionTitle({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="portal-section-heading">
      <div>
        <h1>
          {title}
          <Star className="title-star" size={40} aria-hidden="true" />
        </h1>
        <p>{description}</p>
      </div>
      <span className="portal-tagline">
        Say it.
        <br />
        Stay anonymous.
      </span>
    </div>
  );
}
export function PortalShell({
  active,
  query,
  preview,
  children,
}: {
  active: "home" | "novita" | "account";
  query?: string;
  preview?: PreviewState;
  children: ReactNode;
}) {
  return (
    <div className="portal-shell">
      <PortalHeader query={query} preview={preview} />
      <div className="portal-layout">
        <Sidebar active={active} preview={preview} />
        <main id="main" className="portal-main">
          {children}
        </main>
      </div>
      <footer className="portal-footer">
        <span>
          <Disc3 size={16} aria-hidden="true" /> ITISpot · Say it. Stay
          anonymous.
        </span>
        <nav aria-label="Link utili">
          <Link href="/invia#regole">Regole</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/admin">Area admin</Link>
        </nav>
      </footer>
    </div>
  );
}
