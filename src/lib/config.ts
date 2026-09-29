export function mode(): 'demo' | 'supabase' {
  const value = process.env.ITISPOT_MODE || 'demo';
  if (!['demo','supabase'].includes(value)) throw new Error('ITISPOT_MODE non valido');
  return value as 'demo' | 'supabase';
}
export function assertConfigured() {
  if (mode() === 'demo') {
    if (process.env.NODE_ENV === 'production') throw new Error('Demo disponibile solo con npm run dev. Configura Supabase per la produzione.');
    return;
  }
  for (const key of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','ADMIN_USER_IDS','APP_ORIGIN','RATE_LIMIT_SECRET','NEXT_PUBLIC_TURNSTILE_SITE_KEY','TURNSTILE_SECRET_KEY','TURNSTILE_HOSTNAME']) {
    if (!process.env[key]) throw new Error(`Configurazione mancante: ${key}`);
  }
  if (process.env.RATE_LIMIT_SECRET!.length < 32) throw new Error('RATE_LIMIT_SECRET deve avere almeno 32 caratteri');
}
