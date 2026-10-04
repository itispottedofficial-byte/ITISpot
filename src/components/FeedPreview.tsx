import type { PreviewState } from "@/lib/presented-feed";

export function FeedPreview({
  preview,
  route,
}: {
  preview?: PreviewState;
  route: "/" | "/novita";
}) {
  if (!preview) return null;
  return (
    <aside className="feed-preview" aria-label="Controlli preview locale">
      <div>
        <strong>Preview locale</strong>
        <span>Dati di esempio · nessun dato reale</span>
      </div>
      <form method="get" action={route}>
        <label>
          Stato
          <select name="preview" defaultValue={preview.mode}>
            <option value="filled">Con contenuti</option>
            <option value="empty">Vuoto</option>
            <option value="error">Errore</option>
            <option value="loading">Caricamento</option>
          </select>
        </label>
        <label>
          Primo Spot
          <select name="featured" defaultValue={preview.featured}>
            <option value="a">A · breve</option>
            <option value="b">B · immagine</option>
            <option value="c">C · lungo</option>
            <option value="d">D · verticale</option>
            <option value="e">E · orizzontale</option>
          </select>
        </label>
        <button type="submit" className="retro-button">
          Applica
        </button>
      </form>
    </aside>
  );
}
