import type { Snapshot } from '../api/client';
import type { RaceDraft } from './draft';

/**
 * « Mes courses » : chaque course préparée garde sa saisie, sa trace, son plan, son sac, son assistance et ses
 * pointages (api/races). Ici, ce qui se calcule sans stockage : résumé pour les listes, à venir ou passée, tri.
 */

/** Ce que montrent les listes de courses, tiré du dernier plan calculé. */
export interface RaceSummary {
  km: number;
  gainM: number;
  points: number;
  /** Arrivée prévue (scénario réaliste), « 2027-03-13T15:48 ». */
  finish: string;
  /** Altitudes (ou altitude relative sans trace), de quoi dessiner un mini profil. */
  profile: number[];
}

export interface RaceEntry {
  id: string;
  draft: RaceDraft;
  createdAt: string;
  /** Dernière modification de la saisie (synchronisation avec le compte). */
  updatedAt?: string;
  summary: RaceSummary | null;
  /** Nom et taille de sa trace GPX (null sans trace ; absent pour une course enregistrée avant les comptes). */
  trace?: { name: string; size: number } | null;
}

export interface RaceBook {
  /** Course affichée quand on n'est pas sur l'exemple. */
  active: string | null;
  races: RaceEntry[];
  /** Course à qui revient la trace GPX gardée par une version à course unique (déplacée à la première lecture). */
  legacyGpx?: string;
  /** Courses supprimées ici, à supprimer aussi dans le compte à la prochaine synchronisation. */
  deleted?: string[];
}

export const EMPTY_BOOK: RaceBook = { active: null, races: [] };

const PROFILE_POINTS = 48;
const DAY = 24 * 3600 * 1000;

export function newRaceId(): string {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** Résumé d'un plan calculé (scénario réaliste) pour les listes. */
export function summarize(snapshot: Pick<Snapshot, 'course' | 'plans'>): RaceSummary | null {
  const plan = snapshot.plans[Math.min(1, snapshot.plans.length - 1)];
  if (!plan) return null;
  const track = snapshot.course.track?.profile ?? [];
  let altitudes: number[];
  if (track.length > 1) {
    altitudes = Array.from({ length: PROFILE_POINTS }, (_, i) => track[Math.round((i / (PROFILE_POINTS - 1)) * (track.length - 1))].elevationM);
  } else {
    let alt = 0;
    altitudes = plan.checkpoints.map((c, i) => (i === 0 ? 0 : (alt += c.legGainM - c.legLossM)));
  }
  return {
    km: plan.totalDistanceKm,
    gainM: plan.totalGainM,
    points: plan.checkpoints.length,
    finish: plan.finish.slice(0, 16),
    profile: altitudes.map((a) => Math.round(a)),
  };
}

/** Nom affiché d'une course. */
export const raceName = (r: RaceEntry): string => r.draft.name.trim() || 'Nouvelle course';

/** Jour de la course (« 2027-03-13 »), null tant que la date n'est pas saisie. */
export const raceDay = (r: RaceEntry): string | null => /^\d{4}-\d{2}-\d{2}/.exec(r.draft.start)?.[0] ?? null;

/** Heure « locale » d'une date-heure sans fuseau, comparable à `now` (fuseau de l'appareil). */
function localTime(iso: string): number {
  return new Date(iso.length <= 10 ? `${iso}T00:00` : iso).getTime();
}

/**
 * Course passée : six heures après l'arrivée prévue (le temps de rentrer avant le retour de course), ou le lendemain
 * de sa date sans plan. Une course sans date reste « à venir ».
 */
export function isPast(r: RaceEntry, now = new Date()): boolean {
  if (r.summary) return now.getTime() > localTime(r.summary.finish) + 6 * 3600 * 1000;
  const day = raceDay(r);
  return day !== null && now.getTime() > localTime(day) + DAY;
}

/** À venir (la plus proche d'abord, puis sans date) et passées (la plus récente d'abord). */
export function sortRaces(races: RaceEntry[], now = new Date()): { upcoming: RaceEntry[]; past: RaceEntry[] } {
  const when = (r: RaceEntry) => raceDay(r) ?? '9999';
  const upcoming = races.filter((r) => !isPast(r, now)).sort((a, b) => when(a).localeCompare(when(b)) || a.createdAt.localeCompare(b.createdAt));
  const past = races.filter((r) => isPast(r, now)).sort((a, b) => when(b).localeCompare(when(a)));
  return { upcoming, past };
}

/**
 * Course à afficher à l'ouverture : celle d'avant, sauf si elle est passée et qu'une autre est à venir (la plus proche).
 */
export function defaultRaceId(book: RaceBook, now = new Date()): string | null {
  const active = book.races.find((r) => r.id === book.active);
  const { upcoming, past } = sortRaces(book.races, now);
  if (active && !isPast(active, now)) return active.id;
  return upcoming[0]?.id ?? active?.id ?? past[0]?.id ?? null;
}

/** « dans 4 mois », « dans 12 jours », « demain », « aujourd'hui » ; null sans date ou pour une course passée. */
export function countdown(r: RaceEntry, now = new Date()): { value: string; label: string } | null {
  const day = raceDay(r);
  if (!day) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const days = Math.round((localTime(day) - today) / DAY);
  if (days < 0) return null;
  if (days === 0) return { value: "aujourd'hui", label: "C'est aujourd'hui" };
  if (days === 1) return { value: 'demain', label: "C'est demain" };
  if (days < 45) return { value: `${days} jours`, label: `dans ${days} jours` };
  const months = Math.round(days / 30.4);
  return { value: `${months} mois`, label: `dans ${months} mois` };
}

/** « 13 mars 2027 » (avec l'année si `year`) */
export function frDay(day: string, year = true): string {
  return new Date(`${day}T12:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}) });
}

/** Durée prévue de la course en minutes (scénario réaliste), d'après son résumé. */
export function plannedMinutes(r: RaceEntry): number | null {
  if (!r.summary || !r.draft.start) return null;
  return Math.round((localTime(r.summary.finish) - localTime(r.draft.start)) / 60000);
}
