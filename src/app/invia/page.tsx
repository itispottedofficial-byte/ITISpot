import { Header, Footer } from "@/components/Shell";
import { SpotForm } from "@/components/SpotForm";
import { Info } from "@/components/Info";
import { mode, turnstileSiteKey, configurationIssues } from "@/lib/config";
export const dynamic = "force-dynamic";
export const metadata = { title: "Invia Spot — ITISpot" };
export default function Invia() {
  const demo = mode() === "demo";
  return (
    <div className="site-shell">
      <Header />
      <main id="main" className="home-main">
        <section className="hero" aria-label="ITISpot">
          <h1>
            <img
              src="/itispot-chrome.png"
              alt="ITISpot"
              width={2172}
              height={724}
              fetchPriority="high"
            />
          </h1>
          <p>Say it. Stay anonymous.</p>
        </section>
        <div id="invia">
          <SpotForm
            demo={demo}
            siteKey={turnstileSiteKey()}
            available={configurationIssues().length === 0}
          />
        </div>
        <Info />
      </main>
      <Footer demo={demo} />
    </div>
  );
}
