import type { SupabaseClient, User } from '@supabase/supabase-js';
import { fetchAppInfo } from './client';
import type { RemoteRace } from '../lib/sync';

/**
 * Compte Ravitime (facultatif) : connexion par un code reçu par e-mail, puis sauvegarde de « Mes courses » et des
 * réglages dans Supabase. L'appli parle directement à Supabase, avec la clé publique du projet : chaque coureur n'a
 * accès qu'à ses propres lignes (règles de la base, voir supabase/schema.sql).
 *
 * Le module Supabase n'est chargé que si l'on se sert du compte.
 */

const CONFIG_KEY = 'trail-planner:comptes';
const SESSION_KEY = 'trail-planner:session';
const TRACES = 'traces';

interface AccountConfig {
  url: string;
  key: string;
}

let client: Promise<SupabaseClient | null> | null = null;

/** Pourquoi les comptes ne sont pas disponibles : serveur injoignable, ou comptes pas activés sur le serveur. */
export type AccountUnavailable = 'offline' | 'disabled';
let lastProblem: AccountUnavailable = 'offline';
export const accountProblem = (): AccountUnavailable => lastProblem;

/** Adresse et clé publique du projet, données par le serveur (gardées pour l'ouverture hors ligne). */
async function config(): Promise<AccountConfig | null> {
  try {
    const cached = JSON.parse(localStorage.getItem(CONFIG_KEY) ?? 'null') as AccountConfig | null;
    if (cached?.url && cached.key) {
      // Rafraîchie en arrière-plan : le projet peut changer de clé.
      void fetchAppInfo().then(remember).catch(() => undefined);
      return cached;
    }
  } catch {
    // stockage indisponible
  }
  try {
    const value = remember(await fetchAppInfo());
    if (!value) lastProblem = 'disabled';
    return value;
  } catch {
    lastProblem = 'offline';
    return null;
  }
}

function remember(info: { supabaseUrl?: string | null; supabaseKey?: string | null }): AccountConfig | null {
  if (!info.supabaseUrl || !info.supabaseKey) return null;
  const value = { url: info.supabaseUrl, key: info.supabaseKey };
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(value));
  } catch {
    // stockage indisponible
  }
  return value;
}

export function accountClient(): Promise<SupabaseClient | null> {
  client ??= (async () => {
    const c = await config();
    if (!c) return null;
    const { createClient } = await import('@supabase/supabase-js');
    return createClient(c.url, c.key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: SESSION_KEY },
    });
  })().catch(() => null);
  const pending = client;
  // Pas de configuration (hors ligne au premier lancement) : on réessaiera la prochaine fois.
  void pending.then((c) => { if (!c && client === pending) client = null; });
  return pending;
}

/** Un compte a-t-il déjà été ouvert sur cet appareil ? (sans charger Supabase) */
export function hasStoredSession(): boolean {
  try {
    return localStorage.getItem(SESSION_KEY) !== null;
  } catch {
    return false;
  }
}

export async function currentUser(): Promise<User | null> {
  const c = await accountClient();
  if (!c) return null;
  const { data } = await c.auth.getSession();
  return data.session?.user ?? null;
}

export async function onAccountChange(callback: (user: User | null) => void): Promise<() => void> {
  const c = await accountClient();
  if (!c) return () => undefined;
  const { data } = c.auth.onAuthStateChange((_event, session) => callback(session?.user ?? null));
  return () => data.subscription.unsubscribe();
}

class AccountError extends Error {}

function frenchError(message: string): string {
  if (/rate limit|too many|security purposes/i.test(message)) return 'Trop de demandes : réessaie dans une minute.';
  if (/expired|invalid|otp/i.test(message)) return 'Code incorrect ou expiré : vérifie-le, ou demande un nouveau code.';
  if (/email/i.test(message) && /valid/i.test(message)) return 'Cette adresse e-mail ne semble pas valide.';
  return `Le compte ne répond pas (${message}). Réessaie dans un instant.`;
}

async function ready(): Promise<SupabaseClient> {
  const c = await accountClient();
  if (!c) throw new AccountError('Les comptes ne sont pas disponibles pour le moment : vérifie ta connexion.');
  return c;
}

/** Envoie un code de connexion à cette adresse (le compte est créé à la première connexion). */
export async function sendCode(email: string): Promise<void> {
  const c = await ready();
  const { error } = await c.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
  if (error) throw new AccountError(frenchError(error.message));
}

export async function verifyCode(email: string, code: string): Promise<User> {
  const c = await ready();
  const { data, error } = await c.auth.verifyOtp({ email: email.trim(), token: code.replace(/\s/g, ''), type: 'email' });
  if (error || !data.user) throw new AccountError(frenchError(error?.message ?? 'otp'));
  return data.user;
}

export async function signOut(): Promise<void> {
  const c = await accountClient();
  await c?.auth.signOut({ scope: 'local' });
}

/** Supprime le compte : ses traces, puis le compte lui-même (ses courses et réglages partent avec). */
export async function deleteAccount(): Promise<void> {
  const c = await ready();
  const user = (await c.auth.getUser()).data.user;
  if (!user) return;
  const { data: files } = await c.storage.from(TRACES).list(user.id, { limit: 1000 });
  if (files?.length) await c.storage.from(TRACES).remove(files.map((f) => `${user.id}/${f.name}`));
  const { error } = await c.rpc('delete_my_account');
  if (error) throw new AccountError(frenchError(error.message));
  await c.auth.signOut({ scope: 'local' });
}

// ---- Données du compte ----

export async function fetchRemote(): Promise<{ races: RemoteRace[]; settings: { data: unknown; updated_at: string } | null }> {
  const c = await ready();
  const [races, settings] = await Promise.all([
    c.from('races').select('id, data, updated_at, deleted_at'),
    c.from('settings').select('data, updated_at').maybeSingle(),
  ]);
  if (races.error) throw new AccountError(frenchError(races.error.message));
  if (settings.error) throw new AccountError(frenchError(settings.error.message));
  return { races: (races.data ?? []) as RemoteRace[], settings: settings.data as { data: unknown; updated_at: string } | null };
}

/** Envoie des courses (ou leur suppression) ; rend leur date d'enregistrement. */
export async function pushRaces(rows: { id: string; data: unknown; deleted: boolean }[]): Promise<Map<string, string>> {
  const c = await ready();
  const now = new Date().toISOString();
  const { data, error } = await c.from('races')
    .upsert(rows.map((r) => ({ id: r.id, data: r.data, updated_at: now, deleted_at: r.deleted ? now : null })), { onConflict: 'user_id,id' })
    .select('id, updated_at');
  if (error) throw new AccountError(frenchError(error.message));
  return new Map((data ?? []).map((r: { id: string; updated_at: string }) => [r.id, r.updated_at]));
}

export async function pushSettings(data: unknown): Promise<string> {
  const c = await ready();
  const { data: row, error } = await c.from('settings')
    .upsert({ data, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }).select('updated_at').single();
  if (error) throw new AccountError(frenchError(error.message));
  return (row as { updated_at: string }).updated_at;
}

const tracePath = (userId: string, raceId: string) => `${userId}/${raceId}.gpx`;

export async function uploadTrace(userId: string, raceId: string, file: File | null): Promise<void> {
  const c = await ready();
  if (!file) {
    await c.storage.from(TRACES).remove([tracePath(userId, raceId)]);
    return;
  }
  const { error } = await c.storage.from(TRACES).upload(tracePath(userId, raceId), file, {
    upsert: true, contentType: 'application/gpx+xml',
  });
  if (error) throw new AccountError(frenchError(error.message));
}

export async function downloadTrace(userId: string, raceId: string, name: string): Promise<File | null> {
  const c = await ready();
  const { data, error } = await c.storage.from(TRACES).download(tracePath(userId, raceId));
  if (error || !data) return null;
  return new File([await data.arrayBuffer()], name || 'trace.gpx', { type: 'application/gpx+xml' });
}
