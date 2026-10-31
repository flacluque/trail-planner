import type {
  CourseView, ElevationSource, ExtractedGear, ExtractedRoadbook, ExtractorStatus, RaceDefinition, RacePlan, Reference,
  RaceReview, RunnerProfile, StravaActivity, StravaStatus, TrainingOptions,
} from './types';
import type { NightWindow } from '../lib/draft';
import { API_BASE, apiUrl, appHeaders, isNativeApp, rememberFromResponse } from './platform';

export class ApiError extends Error {
  /** Code HTTP de la réponse (401 : Strava a refusé l'accès, la connexion est oubliée). */
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

/** Message d'erreur montrable au coureur : celui du serveur, ou une coupure réseau dite en clair. */
export function humanError(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return 'Pas de réponse du serveur : vérifie ta connexion et réessaie (s\'il dormait, il met environ une minute à se réveiller).';
}

/**
 * Appel de l'API, sur le site comme dans l'appli : dans l'appli, à l'adresse du serveur, avec la connexion Strava et le
 * code d'accès dans les en-têtes (gardés à chaque réponse).
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (!isNativeApp()) return fetch(apiUrl(path), init);
  const headers = new Headers(init.headers);
  for (const [k, v] of Object.entries(appHeaders())) headers.set(k, v);
  const res = await fetch(apiUrl(path), { ...init, headers });
  rememberFromResponse(res.headers);
  return res;
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(url, init);
  if (!res.ok) {
    // Les erreurs de l'API sont des ProblemDetail : { detail: "..." }
    const body = await res.json().catch(() => null);
    // Sans message lisible (erreur interne, requête refusée par Spring), on reste compréhensible pour le coureur.
    const detail = typeof body?.detail === 'string' && body.detail && !/^(Failed|Bad Request|Internal)/.test(body.detail) ? body.detail : null;
    // Le code de l'erreur reste affiché : c'est ce qui permet de retrouver la cause quand le coureur la signale.
    throw new ApiError(detail ?? (res.status >= 500
      ? `le serveur a rencontré un problème (erreur ${res.status}). Réessaie dans un instant.`
      : `une donnée de ta course ou de tes références n'est pas valide (erreur ${res.status}). Vérifie la saisie.`), res.status);
  }
  return res.json() as Promise<T>;
}

export function fetchCourse(sampleId: string): Promise<CourseView> {
  return getJson(`/api/demo/${encodeURIComponent(sampleId)}/course?stepKm=0.1`);
}

/** Format attendu par l'API (fr.trailplanner.model.ReferencePerformance). */
function toApi(refs: Reference[]) {
  return refs.map((r, i) => ({
    label: r.label.trim() || `Référence ${i + 1}`,
    distanceKm: r.km,
    elevationGainM: r.gainM,
    duration: r.time,
    date: r.date,
    kind: r.kind,
  }));
}

export function fetchPlans(sampleId: string, refs: Reference[], source: ElevationSource,
  training: TrainingOptions | null = null): Promise<RacePlan[]> {
  return getJson(`/api/demo/${encodeURIComponent(sampleId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ references: toApi(refs), elevationSource: source, training }),
  });
}

/**
 * Plan d'une course chargée par le coureur : roadbook saisi + trace GPX optionnelle.
 * Une seule requête, pour n'envoyer la trace (plusieurs Mo) qu'une fois.
 */
export async function fetchCustomPlans(
  race: RaceDefinition,
  night: NightWindow,
  gpx: File | null,
  refs: Reference[],
  source: ElevationSource,
  training: TrainingOptions | null = null,
  runner: RunnerProfile | null = null,
): Promise<{ course: CourseView; plans: RacePlan[] }> {
  const request = {
    race,
    night,
    elevationSource: source,
    references: toApi(refs),
    training,
    runner,
  };
  const form = new FormData();
  form.append('request', new Blob([JSON.stringify(request)], { type: 'application/json' }));
  if (gpx) form.append('gpx', await readableGpx(gpx), gpx.name);
  return getJson('/api/plans/full?stepKm=0.1', { method: 'POST', body: form });
}

/**
 * La trace relue en mémoire avant l'envoi : un fichier que le navigateur ne sait plus lire (Safari, trace gardée par
 * une ancienne version) partirait vide, avec le reste de la demande.
 */
async function readableGpx(gpx: File): Promise<Blob> {
  const bytes = await gpx.arrayBuffer().catch(() => null);
  if (bytes === null || (bytes.byteLength === 0 && gpx.size > 0)) {
    throw new ApiError('ta trace GPX n\'a pas pu être relue par le navigateur. Recharge-la dans « Modifier ma course ».');
  }
  return new Blob([bytes], { type: gpx.type || 'application/gpx+xml' });
}

export function fetchExtractorStatus(): Promise<ExtractorStatus> {
  return getJson('/api/roadbooks/extractor');
}

export function fetchStravaStatus(): Promise<StravaStatus> {
  return getJson('/api/strava/status');
}

/** Page à ouvrir pour connecter Strava : l'API renvoie vers Strava, qui revient ensuite sur l'appli. */
export function stravaConnectUrl(): string {
  // Dans l'appli, Strava revient sur le serveur, qui rouvre l'appli par son lien (ravitime://strava?…).
  if (isNativeApp()) return `${API_BASE}/api/strava/authorize?origin=app`;
  return `${API_BASE}/api/strava/authorize?origin=${encodeURIComponent(window.location.origin)}`;
}

/** Sorties de course à pied et de trail depuis une date ("2024-10-12"). */
export function fetchStravaActivities(after: string): Promise<StravaActivity[]> {
  return getJson(`/api/strava/activities?after=${encodeURIComponent(after)}`);
}

/** Profil personnel (pente et fatigue) mesuré sur les sorties Strava : une quinzaine de requêtes à Strava. */
export function fetchRunnerProfile(): Promise<{ profile: RunnerProfile; sources: number[] }> {
  return getJson('/api/strava/profile');
}

/** Retour de course : l'activité lue point par point et la fatigue mesurée dessus (coût de pente du profil). */
export function fetchRaceReview(activityId: number, runner: RunnerProfile | null): Promise<RaceReview> {
  return getJson(`/api/strava/activities/${activityId}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ runner }),
  });
}

export async function disconnectStrava(): Promise<void> {
  const res = await apiFetch('/api/strava/connection', { method: 'DELETE' });
  if (!res.ok) throw new ApiError('La déconnexion de Strava a échoué : réessaie dans un instant.');
}

/** Lecture du roadbook (image ou PDF) par l'IA configurée côté serveur. Compter 30 s à 2 min en local. */
export function extractRoadbook(file: File): Promise<ExtractedRoadbook> {
  const form = new FormData();
  form.append('file', file);
  return getJson('/api/roadbooks/extract', { method: 'POST', body: form });
}

/** Lecture de la liste du matériel dans un règlement (image ou PDF), pour la course donnée. */
export function extractGear(file: File, raceName: string): Promise<ExtractedGear> {
  const form = new FormData();
  form.append('file', file);
  return getJson(`/api/gear/extract?raceName=${encodeURIComponent(raceName)}`, { method: 'POST', body: form });
}

/**
 * Dernier plan consulté, gardé dans le navigateur pour le jour J (pas de réseau en montagne).
 * Le service worker garde aussi les réponses de l'API, mais seulement pour la même URL :
 * cette copie-ci survit à un changement de référence.
 */
export interface Snapshot {
  /** Identifiant de l'exemple embarqué, ou "custom" pour ta course. */
  sampleId: string;
  references: Reference[];
  source: ElevationSource;
  course: CourseView;
  plans: RacePlan[];
  savedAt: string;
  /** Course de « Mes courses » (api/races) dont c'est le plan ; absent pour l'exemple. */
  raceId?: string;
  /** Empreinte de la saisie qui a donné ce plan (lib/draft draftSignature) : il est périmé si elle a changé. */
  signature?: string;
}

const SNAPSHOT_KEY = 'trail-planner:dernier-plan';

export function saveSnapshot(snapshot: Snapshot): void {
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // Stockage plein ou désactivé (navigation privée) : tant pis, l'appli marche sans.
  }
}

export function loadSnapshot(): Snapshot | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    return raw ? migrateSnapshot(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** Les premières versions gardaient une seule référence, sans date ni type, et des plans sans « references ». */
export function migrateSnapshot(data: Snapshot & { reference?: Omit<Reference, 'label' | 'date' | 'kind'> }): Snapshot {
  const { reference, ...rest } = data;
  const references = rest.references ?? (reference ? [{ label: '', date: null, kind: 'RACE' as const, ...reference }] : []);
  return { ...rest, references, plans: rest.plans.map((p) => ({ ...p, references: p.references ?? [] })) };
}

/** Ce que le serveur demande avant tout (fr.trailplanner.web.AppController.AppInfo). */
export interface AppInfo {
  accessRequired: boolean;
  accessGranted: boolean;
  feedbackUrl: string | null;
  /** Comptes (Supabase) : adresse du projet et clé publique ; null tant qu'ils ne sont pas configurés. */
  supabaseUrl?: string | null;
  supabaseKey?: string | null;
}

export function fetchAppInfo(): Promise<AppInfo> {
  return getJson('/api/app');
}

/** Envoie le code d'invitation ; le serveur le retient dans un cookie. */
export async function enterAccessCode(code: string): Promise<void> {
  const res = await apiFetch('/api/app/access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(body?.detail ?? 'Code refusé : réessaie dans un instant.');
  }
}
