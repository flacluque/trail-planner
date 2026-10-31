import type { ElevationSource, Reference, TrainingOptions } from './types';
import type { NutritionProfile } from '../lib/nutrition';
import { hashOf, planSettings, planSync, type LocalRace, type RaceDoc, type SyncState } from '../lib/sync';
import { downloadTrace, fetchRemote, pushRaces, pushSettings, uploadTrace } from './account';

/**
 * Synchronisation avec le compte : l'appli (App) fournit ce qu'elle a et sait appliquer ce qui arrive ; ici, l'aller et
 * le retour (voir lib/sync pour les règles). Rien de ce qui vient de Strava ne part.
 */

/** Réglages communs gardés dans le compte. */
export interface SettingsDoc {
  /** Références saisies à la main (celles importées de Strava restent sur l'appareil). */
  references: Reference[];
  source: ElevationSource;
  nutrition: NutritionProfile;
  training: TrainingOptions;
  runnerName: string;
}

export interface SyncHost {
  races: () => LocalRace[];
  /** Courses supprimées ici depuis la dernière synchronisation. */
  deletedHere: () => string[];
  settings: () => SettingsDoc;
  localGpx: (raceId: string) => Promise<File | null>;
  applyRaces: (take: { id: string; doc: RaceDoc; updatedAt: string; gpx: File | null | undefined }[], remove: string[]) => void;
  /** `first` : première synchronisation de cet appareil (ses références saisies à la main s'ajoutent). */
  applySettings: (doc: SettingsDoc, first: boolean) => void;
  clearDeleted: (ids: string[]) => void;
}

const STATE_KEY = 'trail-planner:synchro';

function loadState(userId: string): SyncState & { traces: Record<string, string> } {
  try {
    const raw = JSON.parse(localStorage.getItem(STATE_KEY) ?? 'null') as (SyncState & { traces?: Record<string, string> }) | null;
    if (raw && raw.userId === userId) return { ...raw, traces: raw.traces ?? {} };
  } catch {
    // stockage indisponible
  }
  return { userId, races: {}, settings: null, traces: {} };
}

function saveState(state: SyncState & { traces: Record<string, string> }): void {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    // stockage indisponible : tout sera comparé de nouveau la prochaine fois
  }
}

export function forgetSyncState(): void {
  try {
    localStorage.removeItem(STATE_KEY);
  } catch {
    // stockage indisponible
  }
}

const traceKey = (gpx: RaceDoc['gpx']) => (gpx ? `${gpx.name}:${gpx.size}` : '');

/** Une synchronisation complète ; rend le nombre de courses reçues et envoyées. */
export async function syncNow(userId: string, host: SyncHost): Promise<{ received: number; sent: number }> {
  const state = loadState(userId);
  const remote = await fetchRemote();

  // Courses
  const local = host.races();
  const plan = planSync(local, remote.races, host.deletedHere(), state);

  // Ce qui arrive : la trace aussi, si elle a changé.
  const take = await Promise.all(plan.take.map(async (r) => {
    const key = traceKey(r.data.gpx);
    const mine = local.find((l) => l.id === r.id);
    const gpx = key === (mine ? traceKey(mine.doc.gpx) : '') ? undefined
      : r.data.gpx ? await downloadTrace(userId, r.id, r.data.gpx.name) : null;
    return { id: r.id, doc: r.data, updatedAt: r.updated_at, gpx };
  }));
  if (take.length || plan.remove.length) host.applyRaces(take, plan.remove);
  for (const r of plan.take) {
    state.races[r.id] = { hash: hashOf(r.data), remoteAt: r.updated_at };
    state.traces[r.id] = traceKey(r.data.gpx);
  }
  for (const id of plan.remove) {
    delete state.races[id];
    delete state.traces[id];
  }

  // Ce qui part : la trace d'abord (une course qui arrive ailleurs y trouve sa trace).
  for (const l of plan.push) {
    const key = traceKey(l.doc.gpx);
    if (key !== (state.traces[l.id] ?? '')) {
      await uploadTrace(userId, l.id, l.doc.gpx ? await host.localGpx(l.id) : null);
      state.traces[l.id] = key;
    }
  }
  const rows = [
    ...plan.push.map((l) => ({ id: l.id, data: l.doc, deleted: false })),
    ...plan.pushDeleted.map((id) => ({ id, data: {}, deleted: true })),
  ];
  if (rows.length) {
    const saved = await pushRaces(rows);
    for (const l of plan.push) {
      const at = saved.get(l.id);
      if (at) state.races[l.id] = { hash: hashOf(l.doc), remoteAt: at };
    }
    for (const id of plan.pushDeleted) {
      delete state.races[id];
      if (state.traces[id]) {
        await uploadTrace(userId, id, null).catch(() => undefined);
        delete state.traces[id];
      }
    }
  }
  host.clearDeleted([...plan.pushDeleted, ...host.deletedHere().filter((id) => !remote.races.some((r) => r.id === id))]);

  // Réglages
  const settings = host.settings();
  const localHash = hashOf(settings);
  const remoteSettings = remote.settings ? { updated_at: remote.settings.updated_at, hash: hashOf(remote.settings.data) } : null;
  const decision = planSettings(localHash, remoteSettings, state.settings);
  if (decision === 'push') {
    state.settings = { hash: localHash, remoteAt: await pushSettings(settings) };
  } else if (decision === 'take' && remote.settings) {
    host.applySettings(remote.settings.data as SettingsDoc, state.settings === null);
    state.settings = { hash: remoteSettings!.hash, remoteAt: remote.settings.updated_at };
  } else if (remoteSettings) {
    state.settings = { hash: localHash, remoteAt: remoteSettings.updated_at };
  }

  saveState(state);
  return { received: take.length + plan.remove.length, sent: rows.length };
}
