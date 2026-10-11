# Sondaggi V1

Migration: `20261010000200_polls.sql`, dopo likes e tutte le migration precedenti. Non applicata al remoto automaticamente. Verificare con `verify.sql` dopo applicazione manuale.

Tabelle private: `polls`, `poll_options`, `poll_votes`. Nessun account/profile/email/IP/user-agent nei voti. RLS restrittiva e zero grants client; RPC di lettura aggregata, gestione e voto riservate service_role. Le API admin riusano requireAdmin/ADMIN_USER_IDS, Origin, body limit e schema strict. Nessuna nuova env: usa RATE_LIMIT_SECRET già configurata (>=32 caratteri), APP_ORIGIN, TRUSTED_IP_HEADER, credenziali Supabase server esistenti.

Stati: DRAFT → PUBLISHED → CLOSED. Data fine verificata con l'orologio PostgreSQL, estremità esclusa. La pubblicazione porta in evidenza il sondaggio; indice parziale UNIQUE e lock globale garantiscono al massimo uno in Home. È possibile cambiare quello in evidenza. La scadenza lo rimuove logicamente dalla Home senza cron. Solo le bozze sono modificabili/eliminabili; opzioni congelate alla pubblicazione, anche prima del primo voto. Niente cancellazione di sondaggi pubblicati e risultati. Le opzioni 2–6 sono distinte anche ignorando maiuscole/spazi; voto e modifiche prendono lock sulla stessa riga padre.

Voto: POST same-origin /api/polls/voter prepara un cookie casuale firmato, HttpOnly, SameSite=Lax, Secure in produzione, durata un anno. Votare richiede quel cookie: il POST non lo inventa durante il voto (evita retry concorrenti senza cookie). Il database riceve solo HMAC specifico per sondaggio, non il cookie o l'identità account. PK(poll_id,voter_hash) e FK composta impediscono doppio voto e opzione di altro sondaggio. Cancellare cookie/cambiare browser permette nuovi voti: non è garanzia di una persona/un voto. Nessun fingerprinting. RATE_LIMIT_SECRET va mantenuta stabile: ruotarla invalida cookie e identificatori precedenti.

Rate limit separato `poll-vote`: 30 tentativi/10 minuti, tramite il limiter HMAC esistente. Include errori di voto duplicato. Non viene aggiunto Turnstile in V1: combinazione cookie firmato, limite per rete e vincolo univoco; valutare un challenge se emerge abuso reale. Nessuna modifica a /invia.

Risultati restituiscono solo opzioni, conteggi, percentuali e flag voted del browser. Disponibili in lettura pubblica; la UI li mostra dopo il voto o a sondaggio chiuso. Percentuali arrotondate col metodo dei resti maggiori per sommare 100, o tutte zero se nessun voto. Le pagine pubbliche/admin sono paginate (12). Cookie e risposte sono private/no-store. Conservazione voti per i risultati; non associati al profilo neppure con account connesso.

Collaudo remoto necessario: applicare le due migration manualmente, verify.sql, verificare cookie Secure su Worker e flussi admin/voto con dati test e cleanup. Nessun deploy eseguito in questo step.
