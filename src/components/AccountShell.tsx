import Link from "next/link";
import { Disc3, ShieldCheck, Star } from "lucide-react";
import { PortalShell } from "./PortalShell";
import { RetroWindow } from "./Window";
import type { ReactNode } from "react";

export function AccountShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <PortalShell active="account">
      <div className="account-layout">
        <div className="account-intro">
          <span className="account-eyebrow">ITISpot / il tuo spazio</span>
          <h1>
            {title}
            <Star aria-hidden="true" />
          </h1>
          <p>{description}</p>
          <div className="account-sticker" aria-hidden="true">
            <Disc3 />
            <span>
              stay
              <br />
              yourself.
            </span>
            <i>✦</i>
          </div>
          <div className="account-optional">
            <ShieldCheck aria-hidden="true" />
            <div>
              <strong>Creare un account è facoltativo.</strong>
              <p>
                In futuro servirà per commenti, badge e progressi. Gli Spot
                restano anonimi e separati dal profilo, anche quando sei
                loggato.
              </p>
              <Link href="/invia">Puoi già inviare uno Spot →</Link>
            </div>
          </div>
        </div>
        <RetroWindow title={`ITISpot / ${title}`} className="account-window">
          {children}
        </RetroWindow>
      </div>
    </PortalShell>
  );
}
