import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";

// Deliberately outside the Next dependency graph and public assets.
// Generated files live in a temporary directory, never in Supabase or Git.
export async function preparePreviewData() {
  if (process.env.NODE_ENV === "production")
    throw new Error("Preview disabled in production");
  const directory = await mkdtemp(path.join(tmpdir(), "itispot-ui-preview-"));
  async function illustration(width, height, label) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 600 600" preserveAspectRatio="none"><defs><linearGradient id="b" x2="1" y2="1"><stop stop-color="#06112c"/><stop offset="1" stop-color="#0655ff"/></linearGradient><pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#6acfff" stroke-opacity=".3"/></pattern></defs><rect width="600" height="600" fill="url(#b)"/><rect width="600" height="600" fill="url(#grid)"/><circle cx="300" cy="265" r="145" fill="#bbc7e8" stroke="#eff5ff" stroke-width="5"/><circle cx="300" cy="265" r="52" fill="#112b70"/><circle cx="300" cy="265" r="22" fill="#ddeaff"/><path d="m95 120 13 28 32 4-24 23 5 32-26-16-29 16 7-32-25-23 34-4z" fill="#f1f7ff"/><path d="m500 380 12 28 32 4-24 23 5 32-26-16-29 16 7-32-25-23 34-4z" fill="#f1f7ff"/><rect x="80" y="465" width="440" height="70" fill="#03122f" stroke="#d3e5ff" stroke-width="3"/><text x="300" y="510" text-anchor="middle" font-family="monospace" font-weight="bold" font-size="27" fill="#fff">${label}</text></svg>`;
    return (
      "data:image/png;base64," +
      (await sharp(Buffer.from(svg)).png().toBuffer()).toString("base64")
    );
  }
  const longText =
    "Oggi in laboratorio abbiamo scoperto che il vero lavoro di squadra è cercare per dieci minuti il cavo che avevamo già davanti. Tra una risata e un progetto che finalmente parte, questa scuola sa regalare momenti da ricordare. Un saluto a chi presta gli appunti, a chi spiega ancora una volta un esercizio e a chi dice «dai, ce la facciamo» quando manca poco alla consegna. Non servono nomi: se ti riconosci, questo Spot è per te. Ci vediamo domani, con la stessa energia e un banco più ordinato!";
  const spots = [
    {
      text: "A chi ha lasciato un biglietto gentile sul banco: hai migliorato la giornata a qualcuno. ✦",
      imageUrl: null,
    },
    {
      text: "La playlist del viaggio in bus merita un CD tutto suo. Tra canzoni improbabili e ritornelli cantati piano, anche il lunedì inizia meglio. Questo è il nostro piccolo ricordo blu.",
      imageUrl: await illustration(800, 800, "BUS PLAYLIST / VOL. 01"),
      imageAlt: "Illustrazione di esempio: CD argentato su una griglia blu",
    },
    { text: longText.slice(0, 500), imageUrl: null },
    {
      text: "Un poster immaginario per tutte le idee che ci portiamo nello zaino.",
      imageUrl: await illustration(600, 1000, "IDEAS / AFTER SCHOOL"),
      imageAlt: "Poster verticale di esempio con CD e stelle su sfondo blu",
    },
    {
      text: "L’orizzonte dopo l’ultima campanella: progetti da finire, amici da incontrare e un pomeriggio ancora tutto da scrivere. Una cartolina digitale, senza nomi e senza fretta.",
      imageUrl: await illustration(1200, 675, "AFTER SCHOOL / WIDE"),
      imageAlt:
        "Cartolina orizzontale di esempio con CD e stelle su sfondo blu",
    },
  ].map((spot, index) => ({
    ...spot,
    id: `itispot-ui-mock-${"abcde"[index]}`,
    created_at: `2026-10-03T${String(14 - index).padStart(2, "0")}:00:00Z`,
  }));
  await writeFile(path.join(directory, "spots.json"), JSON.stringify(spots), {
    mode: 0o600,
  });
  return directory;
}
