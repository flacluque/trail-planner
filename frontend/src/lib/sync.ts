import type { GearItem } from './gear';
import type { RaceDraft } from './draft';
import type { RaceSummary } from './races';

/**
 * Synchronisation de « Mes courses » avec le compte (Supabase) : ce qui part et ce qui arrive, décidé ici sans réseau.
 *
 * Chaque appareil retient, course par course, l'empreinte de ce qu'il a envoyé ou reçu la dernière fois et la date de
 * la version distante d'alors. À la synchronisation suivante :
 * - modifiée ici seulement : elle part ;
 * - modifiée ailleurs seulement : elle arrive ;
 * - modifiée des deux côtés : celle de cet appareil l'emporte (c'est celui qu'on a en main) ;
 * - supprimée ailleurs et pas modifiée ici : elle est supprimée ici ;
 * - supprimée ici : la suppression part.
 */

/** Ce qu'une course garde dans le compte. Rien qui vienne de Strava. */
export interface RaceDoc {
  draft: RaceDraft;
  createdAt: string;
  summary: RaceSummary | null;
  gear: GearItem[];
  crew: string[];
  /** Trace GPX de la course (le fichier est à part, dans le stockage du compte). */
  gpx: { name: string; size: number } | null;
}

export interface RemoteRace {
  id: string;
  data: RaceDoc;
  updated_at: string;
  deleted_at: string | null;
}

export interface LocalRace {
  id: string;
  doc: RaceDoc;
  /** Dernière modification de la saisie ici (sa création à défaut). */
  updatedAt: string;
}

export interface SyncMark {
  hash: string;
  remoteAt: string;
}

export interface SyncState {
  /** Compte auquel se rapporte cet état : un autre compte repart de zéro. */
  userId: string;
  races: Record<string, SyncMark>;
  settings: SyncMark | null;
}

export interface SyncPlan {
  /** Versions distantes à prendre ici (nouvelles ou plus récentes). */
  take: RemoteRace[];
  /** Courses supprimées sur un autre appareil. */
  remove: string[];
  /** Courses à envoyer. */
  push: LocalRace[];
  /** Suppressions faites ici, à envoyer. */
  pushDeleted: string[];
}

/** Empreinte courte d'une valeur JSON (djb2). */
export function hashOf(value: unknown): string {
  const text = JSON.stringify(value);
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function planSync(local: LocalRace[], remote: RemoteRace[], deletedHere: string[], state: SyncState): SyncPlan {
  const plan: SyncPlan = { take: [], remove: [], push: [], pushDeleted: [] };
  const localById = new Map(local.map((r) => [r.id, r]));
  const remoteById = new Map(remote.map((r) => [r.id, r]));
  const deleted = new Set(deletedHere);

  for (const r of remote) {
    const l = localById.get(r.id);
    const mark = state.races[r.id];
    if (!l) {
      if (deleted.has(r.id)) {
        if (!r.deleted_at) plan.pushDeleted.push(r.id);
      } else if (!r.deleted_at) {
        plan.take.push(r);
      }
      continue;
    }
    const localChanged = !mark || hashOf(l.doc) !== mark.hash;
    const remoteChanged = !mark || r.updated_at !== mark.remoteAt;
    if (r.deleted_at) {
      // Supprimée ailleurs : on suit, sauf si elle a été modifiée ici depuis (elle repart alors).
      if (mark && !localChanged) plan.remove.push(r.id);
      else plan.push.push(l);
      continue;
    }
    if (!mark) {
      // Jamais rapprochées (première connexion de cet appareil) : la plus récente l'emporte.
      if (hashOf(l.doc) === hashOf(r.data)) continue;
      if (r.updated_at > l.updatedAt) plan.take.push(r);
      else plan.push.push(l);
      continue;
    }
    if (localChanged) plan.push.push(l);
    else if (remoteChanged) plan.take.push(r);
  }
  for (const l of local) {
    if (!remoteById.has(l.id)) plan.push.push(l);
  }
  for (const id of deleted) {
    if (!remoteById.has(id) && state.races[id]) plan.pushDeleted.push(id);
  }
  return plan;
}

/** Réglages : même règle pour un seul document. */
export function planSettings(localHash: string, remote: { updated_at: string; hash: string } | null, mark: SyncMark | null):
  'push' | 'take' | 'none' {
  if (!remote) return 'push';
  if (!mark) return remote.hash === localHash ? 'none' : 'take';
  if (localHash !== mark.hash) return 'push';
  if (remote.updated_at !== mark.remoteAt) return 'take';
  return 'none';
}
