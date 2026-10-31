import { emptyDraft, hasContent, type RaceDraft } from '../lib/draft';
import { EMPTY_BOOK, newRaceId, summarize, type RaceBook, type RaceEntry } from '../lib/races';
import { loadSnapshot, saveSnapshot, type Snapshot } from './client';
import { deleteRaceData, idbDelete, idbGet, idbPut, loadDraft, loadGpx, moveRaceData, saveGpx } from './storage';

/**
 * « Mes courses », sur l'appareil : la liste (petite) dans localStorage, lue d'un coup à l'ouverture ; la trace GPX et
 * le plan calculé de chaque course (plusieurs centaines de ko) dans IndexedDB. Le plan de la course affichée est aussi
 * dans localStorage (client.ts, saveSnapshot) pour s'afficher sans attendre.
 */

const BOOK_KEY = 'trail-planner:courses';
const LEGACY_GPX = 'ma-trace';
const CUSTOM = 'custom';

export const gpxKey = (id: string) => `trace:${id}`;
const planKey = (id: string) => `plan:${id}`;

export function saveRaceBook(book: RaceBook): void {
  try {
    localStorage.setItem(BOOK_KEY, JSON.stringify(book));
  } catch {
    // Stockage plein ou désactivé : la liste vaut pour la session.
  }
}

/** Liste des courses ; à la première ouverture de cette version, la course unique d'avant y devient la première. */
export function loadRaceBook(): RaceBook {
  try {
    const raw = localStorage.getItem(BOOK_KEY);
    if (raw) {
      const book = JSON.parse(raw) as RaceBook;
      if (Array.isArray(book.races)) return book;
    }
  } catch {
    return EMPTY_BOOK;
  }
  const book = migrate();
  saveRaceBook(book);
  return book;
}

function migrate(): RaceBook {
  const draft = loadDraft();
  const snapshot = loadSnapshot();
  const custom = snapshot?.sampleId === CUSTOM ? snapshot : null;
  if (!custom && !(draft && hasContent(draft))) return EMPTY_BOOK;
  const id = newRaceId();
  const entry: RaceEntry = { id, draft: draft ?? emptyDraft(), createdAt: new Date().toISOString(), summary: custom ? summarize(custom) : null };
  // Matériel, assistance et pointages étaient rangés au nom de la course.
  const name = custom?.course.race.name ?? draft?.name ?? '';
  if (name.trim()) moveRaceData(name, id);
  if (custom) {
    const linked: Snapshot = { ...custom, raceId: id };
    saveSnapshot(linked);
    void idbPut(planKey(id), linked).catch(() => undefined);
  }
  return { active: id, races: [entry], legacyGpx: id };
}

export function newRace(): RaceEntry {
  return { id: newRaceId(), draft: emptyDraft(), createdAt: new Date().toISOString(), summary: null };
}

/** Trace GPX d'une course (celle d'une version précédente passe à la course qui l'a reprise). */
export async function loadRaceGpx(book: RaceBook, id: string): Promise<File | null> {
  if (book.legacyGpx === id) {
    const legacy = await loadGpx(LEGACY_GPX);
    if (legacy) {
      await saveGpx(legacy, gpxKey(id));
      await saveGpx(null, LEGACY_GPX);
    }
    const { legacyGpx: _done, ...rest } = loadRaceBook();
    saveRaceBook(rest);
    if (legacy) return legacy;
  }
  return loadGpx(gpxKey(id));
}

export function saveRaceGpx(id: string, file: File | null): Promise<void> {
  return saveGpx(file, gpxKey(id));
}

export async function loadRacePlan(id: string): Promise<Snapshot | null> {
  try {
    const value = await idbGet(planKey(id));
    return value && typeof value === 'object' && Array.isArray((value as Snapshot).plans) ? (value as Snapshot) : null;
  } catch {
    return null;
  }
}

export async function saveRacePlan(id: string, snapshot: Snapshot): Promise<void> {
  try {
    await idbPut(planKey(id), snapshot);
  } catch {
    // IndexedDB indisponible : le plan sera recalculé.
  }
}

/** Efface tout ce qui appartient à une course : sa trace, son plan, son matériel, son assistance, ses pointages. */
export async function deleteRaceFiles(id: string): Promise<void> {
  deleteRaceData(id);
  await Promise.all([idbDelete(planKey(id)), idbDelete(gpxKey(id))].map((p) => p.catch(() => undefined)));
}

/** Strava déconnecté : les plans gardés perdent aussi ce qu'ils tiraient de Strava (références, préparation, profil). */
export async function scrubRacePlans(ids: string[]): Promise<void> {
  await Promise.all(ids.map(async (id) => {
    const plan = await loadRacePlan(id);
    if (plan) await saveRacePlan(id, { ...plan, plans: plan.plans.map((p) => ({ ...p, references: [], training: null, runner: null })) });
  }));
}

export function updateDraft(book: RaceBook, id: string, draft: RaceDraft): RaceBook {
  const updatedAt = new Date().toISOString();
  return { ...book, races: book.races.map((r) => (r.id === id ? { ...r, draft, updatedAt } : r)) };
}
