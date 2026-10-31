import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ApiError, disconnectStrava, fetchCourse, fetchCustomPlans, fetchPlans, fetchStravaActivities, fetchStravaStatus, loadSnapshot, saveSnapshot,
  type Snapshot,
} from './api/client';
import {
  loadCrew, loadGear, loadNutrition, loadReferences, loadTrainingOptions, saveCrew, saveNutrition, saveReferences,
  saveTrainingOptions,
  loadFix, loadRunnerName, loadRunnerProfile, loadStravaCheck, saveGear, saveRunnerName, saveRunnerProfile, saveStravaCheck, NO_RUNNER_PROFILE,
  type StoredRunnerProfile,
} from './api/storage';
import type { ElevationSource, Reference } from './api/types';
import { CompareTable } from './components/CompareTable';
import { CourseMap } from './components/CourseMap';
import { PlacementEditor } from './components/PlacementEditor';
import { RunnerProfileCard } from './components/RunnerProfileCard';
import { RaceReviewCard } from './components/RaceReviewCard';
import { ElevationProfile } from './components/ElevationProfile';
import { Legend } from './components/Legend';
import { GearCard } from './components/GearCard';
import type { NutritionProfile } from './lib/nutrition';
import { PassageTable } from './components/PassageTable';
import { RaceEditor } from './components/RaceEditor';
import { ReferenceForm } from './components/ReferenceForm';
import { WelcomePage } from './components/WelcomePage';
import { MobileNav, type Section } from './components/MobileNav';
import { BackBar, ScreenTitle } from './components/AppScreen';

import { HomeDashboard } from './components/HomeDashboard';
import { MePage } from './components/MePage';
import { Onboarding } from './components/Onboarding';
import { connectStrava } from './api/native';
import { ListGroup, ListRow } from './components/AppScreen';
import { FlagIcon, RouteIcon } from './components/Icons';
import { PrivacyPage } from './components/PrivacyPage';
import { AccountPage } from './components/AccountPage';
import type { User } from '@supabase/supabase-js';
import { currentUser, deleteAccount, hasStoredSession, onAccountChange, signOut } from './api/account';
import { forgetSyncState, syncNow, type SettingsDoc, type SyncHost } from './api/sync';
import { checkStrava, holdsStravaData, purgeStrava, reconcileNotice } from './lib/stravaData';
import {
  deleteRaceFiles, loadRaceBook, loadRaceGpx, loadRacePlan, newRace, saveRaceBook, saveRaceGpx, saveRacePlan, scrubRacePlans,
  updateDraft,
} from './api/races';
import { defaultRaceId, isPast, raceName, summarize, type RaceBook } from './lib/races';
import { RacesSheet, RacePicker, RaceDashboard, type PrepItem, type RaceListProps } from './components/Races';
import { isExampleReference, withoutExample } from './lib/strava';
import { playPageIn, useSlidingPill } from './components/Motion';
import { RaceView } from './components/RaceView';
import { isRaceWindow, nowMinutes, type Fix } from './lib/race';
import { shareWithCrew, type ShareResult } from './lib/crewShare';
import { ReferenceInsights } from './components/ReferenceInsights';
import { TrainingCard } from './components/TrainingCard';
import { AlgorithmPage } from './components/AlgorithmPage';
import { PlanHero } from './components/PlanHero';
import { Roadbook } from './components/Roadbook';
import { GarminExport } from './components/GarminExport';
import { RavitosView } from './components/RavitosView';
import { TrainingLine } from './components/TrainingLine';
import { draftSignature, draftToRace, emptyDraft, withoutTrackPositions, withTrackPositions, type RaceDraft } from './lib/draft';
import { placementWarnings } from './lib/placement';
import { appliedProfile } from './lib/runner';
import { formatClock, formatKm, formatMeters } from './lib/format';
import { defaultServices } from './lib/services';

// Course d'exemple embarquée (src/main/resources/samples/bogomiles).
const SAMPLE_ID = 'bogomiles';
const CUSTOM_ID = 'custom';
type Tab = 'accueil' | 'plan' | 'course' | 'ravitos' | 'sac' | 'analyse' | 'algo' | 'moi' | 'references' | 'profil' | 'retour'
  | 'confidentialite' | 'compte';
const TABS: [Tab, string][] = [['accueil', 'Accueil'], ['plan', 'Mon plan'], ['course', 'En course'], ['ravitos', 'Ravitos'],
  ['sac', 'Sac'], ['analyse', 'Analyse'], ['algo', 'Comment ça marche']];
const TAB_HASH: Record<Tab, string> = {
  accueil: '#accueil', plan: '#plan', course: '#course', ravitos: '#ravitos', sac: '#sac', analyse: '#analyse', algo: '#algorithme',
  moi: '#moi', references: '#references', profil: '#profil', retour: '#retour', confidentialite: '#confidentialite', compte: '#compte',
};
/** Sur téléphone, la section de la barre d'onglets qui contient chaque page. */
const SECTION_OF: Record<Tab, Section> = {
  accueil: 'accueil', course: 'accueil', plan: 'plan', ravitos: 'ravitos', sac: 'ravitos',
  moi: 'moi', references: 'moi', profil: 'moi', retour: 'moi', analyse: 'moi', algo: 'moi', confidentialite: 'moi', compte: 'moi',
};
/** Largeur de la mise en page téléphone (barre d'onglets en bas, voir styles.css). */
const PHONE = '(max-width: 860px)';
const WELCOME_SEEN = 'trail-planner:accueil-vu';

/**
 * Onglet de départ : sur ordinateur, l'accueil à la première visite, ensuite le plan ; sur téléphone, toujours
 * l'accueil (le tableau de bord de la course). Sauf lien vers un onglet.
 */
function initialTab(): Tab {
  const fromHash = window.location.hash ? tabFromHash(window.location.hash) : null;
  if (fromHash) return fromHash;
  const phone = window.matchMedia(PHONE).matches;
  // Retour de la connexion Strava : la fenêtre d'import s'ouvre là où sont les références.
  if (new URLSearchParams(window.location.search).has('strava')) return phone ? 'references' : 'plan';
  if (phone) return 'accueil';
  try {
    return localStorage.getItem(WELCOME_SEEN) ? 'plan' : 'accueil';
  } catch {
    return 'accueil';
  }
}

/** Onglet d'une adresse ; null pour une ancre interne (#source-…) qui ne change pas d'onglet. */
function tabFromHash(hash: string): Tab | null {
  if (hash === '' || hash === '#') return 'plan';
  if (hash.startsWith('#algo')) return 'algo';
  const found = (Object.keys(TAB_HASH) as Tab[]).find((id) => TAB_HASH[id] === hash);
  return found ?? null;
}

const DEFAULT_REFERENCES: Reference[] = [{ label: '', date: null, kind: 'RACE', km: 60, gainM: 3200, time: 'PT8H48M' }];

const DISCONNECTED_NOTICE = 'Strava est déconnecté. Tout ce qui en venait (références importées, profil de coureur, retours de '
  + 'course) a été effacé de Ravitime.';
const REVOKED_NOTICE = 'Strava n\'est plus connecté à Ravitime (accès révoqué ou déconnecté). Tout ce qui en venait '
  + '(références importées, profil de coureur, retours de course) a été effacé de Ravitime.';

type Mode = 'demo' | 'custom';

type Status =
  | { kind: 'loading' }
  | { kind: 'ready' }
  /** Pas de réseau ou API arrêtée. */
  | { kind: 'unreachable'; error: string }
  /** L'API a répondu mais refuse le calcul (roadbook incohérent...). */
  | { kind: 'rejected'; error: string };

export function App({ feedbackUrl = null }: { feedbackUrl?: string | null } = {}) {
  // Mes courses (api/races) : lue avant le dernier plan, qu'elle relie à sa course la première fois.
  const [book, setBookState] = useState<RaceBook>(loadRaceBook);
  const bookRef = useRef(book);
  const activeRef = useRef(book.active);
  const changeBook = useCallback((update: (b: RaceBook) => RaceBook) => {
    const next = update(bookRef.current);
    bookRef.current = next;
    activeRef.current = next.active;
    saveRaceBook(next);
    setBookState(next);
  }, []);
  const activeRace = book.races.find((r) => r.id === book.active) ?? null;
  const initial = useMemo(loadSnapshot, []);
  const [data, setData] = useState<Snapshot | null>(initial);
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [scenarioIndex, setScenarioIndex] = useState(1); // Réaliste
  const [hoverKm, setHoverKm] = useState<number | null>(null);
  // Sur petit écran, la carte se replie sous le profil : on ne la charge qu'à la demande.
  const [mapOpen, setMapOpen] = useState(false);
  const narrow = useMediaQuery('(max-width: 1100px)');
  const showMap = !narrow || mapOpen;
  // Téléphone (site ou appli) : barre d'onglets, tableau de bord, Moi ; l'ordinateur garde ses onglets en haut.
  const phone = useMediaQuery(PHONE);
  // Premier lancement sur téléphone : bienvenue, puis ton rythme (Strava d'abord).
  const [onboarding, setOnboarding] = useState(() => {
    if (!window.matchMedia(PHONE).matches || window.location.hash || new URLSearchParams(window.location.search).has('strava')) return false;
    try {
      return !localStorage.getItem(WELCOME_SEEN);
    } catch {
      return false;
    }
  });
  // « Importer depuis Strava » depuis l'accueil : la page des références s'ouvre sur l'import.
  const [stravaRequested, setStravaRequested] = useState(false);

  const [mode, setMode] = useState<Mode>(initial?.sampleId === CUSTOM_ID ? 'custom' : 'demo');
  const [draft, setDraft] = useState<RaceDraft>(() => activeRace?.draft ?? emptyDraft());
  const [gpx, setGpx] = useState<File | null>(null);
  const [draftErrors, setDraftErrors] = useState<string[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  // Saisie qui a donné le plan affiché : s'il ne correspond plus à la saisie, il est périmé.
  const [computedSignature, setComputedSignature] = useState<string | null>(null);

  // Dernière référence demandée : l'éditeur de course relance le calcul avec elle.
  // Tes références servent à toutes tes courses (gardées à part ; les premières versions les gardaient avec le plan).
  const storedReferences = useMemo(() => {
    const stored = loadReferences();
    if (stored) {
      // Course d'exemple gardée à côté de vraies références par une version précédente : retirée.
      const references = withoutExample(stored.references);
      if (references.length < stored.references.length) saveReferences(references, stored.source);
      return { ...stored, references };
    }
    return { references: initial?.references.length ? initial.references : DEFAULT_REFERENCES, source: initial?.source ?? 'AUTO' as ElevationSource };
  }, [initial]);
  const [references, setReferences] = useState<Reference[]>(
    storedReferences.references.length ? withoutExample(storedReferences.references) : DEFAULT_REFERENCES);
  const [source, setSource] = useState<ElevationSource>(storedReferences.source);
  const hasData = useRef(initial !== null);
  // Onglet affiché, avec sa propre adresse (#ravitos, #algorithme…) pour pouvoir partager le lien.
  // Le jour de la course, l'appli s'ouvre sur « En course » (sauf lien vers un autre onglet).
  const [tab, setTab] = useState<Tab>(() => {
    const plan = initial?.plans[Math.min(1, initial.plans.length - 1)];
    const hashless = !window.location.hash && !new URLSearchParams(window.location.search).has('strava');
    return hashless && plan && isRaceWindow(plan, nowMinutes()) ? 'course' : initialTab();
  });
  useEffect(() => {
    if (tab !== 'accueil' || onboarding) return;
    try {
      localStorage.setItem(WELCOME_SEEN, '1');
    } catch {
      // Stockage indisponible : l'accueil reviendra à la prochaine visite.
    }
  }, [tab, onboarding]);
  useEffect(() => {
    const onHash = () => {
      const next = tabFromHash(window.location.hash);
      if (next) setTab(next);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const goTab = (next: Tab) => { window.location.hash = TAB_HASH[next]; };
  useEffect(() => { if (tab !== 'references') setStravaRequested(false); }, [tab]);
  // Sur téléphone, une page ouverte depuis Moi arrive de la droite ; en revenant à Moi, Moi revient de la gauche.
  const previousTab = useRef(tab);
  useLayoutEffect(() => {
    const from = previousTab.current;
    previousTab.current = tab;
    if (!window.matchMedia(PHONE).matches || from === tab) return;
    const sub = (t: Tab) => SECTION_OF[t] === 'moi' && t !== 'moi';
    const direction = from === 'moi' && sub(tab) ? 'forward' : sub(from) && tab === 'moi' ? 'back' : null;
    if (direction) playPageIn(document.querySelector<HTMLElement>('.app > main:not([hidden]), .app > .algo-page'), direction);
  }, [tab]);
  // Ravitos / Sac : la pastille glisse d'un choix à l'autre.
  const partsBar = useRef<HTMLElement>(null);
  useSlidingPill(partsBar, tab);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab]);
  // Tenir compte de l'entraînement Strava : lu au moment de chaque calcul.
  const [training, setTraining] = useState(loadTrainingOptions);
  const trainingRef = useRef(training);
  // Profil personnel (pente et fatigue, mesuré sur Strava) : envoyé avec chaque calcul de sa course s'il l'utilise.
  const [runner, setRunner] = useState<StoredRunnerProfile>(loadRunnerProfile);
  const runnerRef = useRef(runner);

  // Calcul d'un plan : celui de l'exemple (raceId null) ou d'une de tes courses, gardé avec elle. Si une autre course est
  // affichée entre-temps, le plan est gardé sans être montré.
  const run = useCallback(async (sampleId: string, load: () => Promise<Pick<Snapshot, 'course' | 'plans'>>,
    refs: Reference[], src: ElevationSource, raceId: string | null = null, signature?: string) => {
    const current = () => raceId === null || activeRef.current === raceId;
    setStatus({ kind: 'loading' });
    try {
      const { course, plans } = await load();
      const snapshot: Snapshot = {
        sampleId, references: refs, source: src, course, plans, savedAt: new Date().toISOString(),
        ...(raceId ? { raceId, signature } : {}),
      };
      if (raceId) {
        void saveRacePlan(raceId, snapshot);
        const summary = summarize(snapshot);
        changeBook((b) => ({ ...b, races: b.races.map((r) => (r.id === raceId ? { ...r, summary } : r)) }));
      }
      if (current()) {
        setData(snapshot);
        saveSnapshot(snapshot);
        hasData.current = true;
        setStatus({ kind: 'ready' });
      }
      return true;
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      if (current()) setStatus(e instanceof ApiError ? { kind: 'rejected', error } : { kind: 'unreachable', error });
      return false;
    }
  }, [changeBook]);

  const computeDemo = useCallback((refs: Reference[], src: ElevationSource) =>
    run(SAMPLE_ID, async () => {
      const [course, plans] = await Promise.all([fetchCourse(SAMPLE_ID), fetchPlans(SAMPLE_ID, refs, src, trainingRef.current)]);
      return { course, plans };
    }, refs, src), [run]);

  const computeCustom = useCallback(async (refs: Reference[], src: ElevationSource, d: RaceDraft, file: File | null) => {
    const result = draftToRace(d, file !== null);
    if (!result.ok) {
      setDraftErrors(result.errors);
      setEditorOpen(true);
      return false;
    }
    setDraftErrors([]);
    const raceId = activeRef.current;
    if (!raceId) return false;
    const signature = draftSignature(d, file);
    const ok = await run(CUSTOM_ID, () => fetchCustomPlans(result.race, result.night, file, refs, src, trainingRef.current,
      appliedProfile(runnerRef.current)), refs, src, raceId, signature);
    if (ok && activeRef.current === raceId) setComputedSignature(signature);
    return ok;
  }, [run]);

  function changeRunner(next: StoredRunnerProfile) {
    const changed = JSON.stringify(appliedProfile(next)) !== JSON.stringify(appliedProfile(runnerRef.current));
    setRunner(next);
    runnerRef.current = next;
    saveRunnerProfile(next);
    if (changed && mode === 'custom') void compute(references, source);
  }

  function changeTraining(next: typeof training) {
    setTraining(next);
    trainingRef.current = next;
    saveTrainingOptions(next);
    void compute(references, source);
  }

  const compute = (all: Reference[], src: ElevationSource) => {
    // Jamais la course d'exemple à côté de tes vraies références.
    const refs = withoutExample(all);
    setReferences(refs);
    setSource(src);
    saveReferences(refs, src);
    return mode === 'demo' ? computeDemo(refs, src) : computeCustom(refs, src, draft, gpx);
  };

  // Données venues de Strava (lib/stravaData) : vérifiées une fois par jour, effacées quand Strava est déconnecté.
  // Les vérifications sont asynchrones : elles lisent l'état du moment par cette référence.
  const [stravaNotice, setStravaNotice] = useState<string | null>(null);
  const latest = useRef({ references, runner, data, compute, source });
  latest.current = { references, runner, data, compute, source };

  /** Remplace ce qui vient de Strava ; `scrub` retire aussi du dernier plan gardé ce qui en était tiré. */
  function keepStrava(refs: Reference[], nextRunner: StoredRunnerProfile, scrub: boolean, notice: string | null) {
    const { data: snap, compute: recompute, source: src } = latest.current;
    const nextRefs = refs.length ? refs : DEFAULT_REFERENCES;
    saveReferences(nextRefs, src);
    setRunner(nextRunner);
    runnerRef.current = nextRunner;
    saveRunnerProfile(nextRunner);
    if (snap) {
      const cleaned: Snapshot = {
        ...snap, references: nextRefs,
        plans: scrub ? snap.plans.map((p) => ({ ...p, references: [], training: null, runner: null })) : snap.plans,
      };
      setData(cleaned);
      saveSnapshot(cleaned);
    }
    if (notice) setStravaNotice(notice);
    // Les plans gardés de tes autres courses perdent aussi ce qu'ils tiraient de Strava.
    void (scrub ? scrubRacePlans(bookRef.current.races.map((r) => r.id)) : Promise.resolve()).then(() => recompute(nextRefs, src));
  }

  /** Strava déconnecté ou accès révoqué : tout ce qui en vient est effacé, et le coureur en est averti (§7.4, §2.5). */
  function purgeStravaData(notice: string) {
    const { references: refs } = latest.current;
    saveStravaCheck(null);
    keepStrava(purgeStrava(refs), NO_RUNNER_PROFILE, true, notice);
  }

  async function disconnectAndPurge() {
    await disconnectStrava();
    purgeStravaData(DISCONNECTED_NOTICE);
  }

  const checking = useRef(false);
  async function verifyStrava() {
    if (checking.current) return;
    checking.current = true;
    try {
      const held = { references: latest.current.references, runner: latest.current.runner };
      const now = new Date();
      const result = await checkStrava(held, loadStravaCheck(), { status: fetchStravaStatus, activities: fetchStravaActivities }, now);
      // Le coureur a changé ses références pendant la vérification : on refera la vérification plus tard.
      if (result.kind === 'skip' || latest.current.references !== held.references || latest.current.runner !== held.runner) return;
      if (result.kind === 'purge') {
        if (holdsStravaData(held)) purgeStravaData(REVOKED_NOTICE);
        else saveStravaCheck(null);
      } else if (result.kind === 'expired') {
        if (result.removed) {
          keepStrava(result.references, held.runner, true, `Strava n'a pas pu être vérifié depuis plus de 7 jours : ${result.removed > 1
            ? `${result.removed} références importées ont été effacées` : 'une référence importée a été effacée'}. Reconnecte-toi pour les réimporter.`);
        }
      } else {
        saveStravaCheck(now.toISOString());
        const r = result.result;
        const removed = r.removedReferences > 0 || r.profileRemoved || r.removedRaces > 0;
        if (removed || r.changed) keepStrava(r.references, r.runner, removed, reconcileNotice(r));
        else {
          // Rien n'a changé sur Strava : seule la date de vérification des références avance.
          setReferences(r.references);
          saveReferences(r.references, latest.current.source);
          const snap = latest.current.data;
          if (snap) saveSnapshot({ ...snap, references: r.references });
        }
      }
    } finally {
      checking.current = false;
    }
  }

  // Seul un calcul lancé depuis l'éditeur le referme : un calcul encore en cours au moment où
  // le coureur rouvre l'éditeur ne doit pas le lui fermer sous les doigts.
  async function submitEditor() {
    if (await computeCustom(references, source, draft, gpx)) setEditorOpen(false);
  }

  // Roadbook importé ou lu par l'IA : on recalcule aussitôt. La trace GPX d'une autre course ne
  // correspond plus, on la retire. Si la saisie est incomplète, on montre ce qui manque.
  async function loadedRoadbook(d: RaceDraft) {
    let file = gpx;
    const previous = data?.sampleId === CUSTOM_ID ? data.course.race.name : draft.name.trim();
    if (file && previous && d.name.trim() && d.name.trim() !== previous) {
      file = null;
      setGpx(null);
      if (activeRef.current) void saveRaceGpx(activeRef.current, null);
    }
    if (!(await computeCustom(references, source, d, file))) {
      requestAnimationFrame(() => document.querySelector('.editor-errors')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    }
  }

  // Premier chargement : on recalcule ce qui était affiché la dernière fois (la trace GPX est relue
  // depuis IndexedDB). Hors ligne, le dernier plan reste affiché.
  // Une course passée garde le plan qu'elle avait : il n'est recalculé que si sa saisie a changé.
  const startup = useRef(false);
  useEffect(() => {
    if (startup.current) return;
    startup.current = true;
    const { references: refs, source: src } = latest.current;
    if (initial?.sampleId === CUSTOM_ID && bookRef.current.active) {
      const pick = defaultRaceId(bookRef.current);
      if (pick && pick !== bookRef.current.active) {
        void openRaceRef.current(pick).then(() => setBooted(true));
        return;
      }
      void openRaceRef.current(bookRef.current.active, initial.raceId === bookRef.current.active ? initial : null).then(() => setBooted(true));
    } else {
      void computeDemo(refs, src).then(() => setBooted(true));
    }
  }, [initial, computeDemo]);
  // Une fois le premier plan affiché (le serveur est réveillé), puis à chaque retour dans l'appli : vérification Strava.
  const [booted, setBooted] = useState(false);
  const verifyRef = useRef(verifyStrava);
  verifyRef.current = verifyStrava;
  useEffect(() => {
    if (!booted) return;
    void verifyRef.current();
    const onVisible = () => { if (document.visibilityState === 'visible') void verifyRef.current(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [booted]);

  /**
   * Affiche une de tes courses : sa saisie, sa trace et son plan gardé, puis recalcule le plan (tes références ont pu
   * changer). Une course passée garde son plan tel quel, sauf si sa saisie a changé. Course pas encore complète : place
   * à la saisie. `shown` : son plan, déjà affiché à l'ouverture de l'appli.
   */
  async function openRace(id: string, shownPlan: Snapshot | null = null) {
    const entry = bookRef.current.races.find((r) => r.id === id);
    if (!entry) return;
    changeBook((b) => ({ ...b, active: id }));
    setMode('custom');
    setScenarioIndex(1);
    setDraftErrors([]);
    setEditorOpen(false);
    setDraft(entry.draft);
    const [file, stored] = await Promise.all([loadRaceGpx(bookRef.current, id), shownPlan ? Promise.resolve(shownPlan) : loadRacePlan(id)]);
    if (activeRef.current !== id) return;
    setGpx(file);
    const signature = draftSignature(entry.draft, file);
    if (stored) {
      setData(stored);
      saveSnapshot(stored);
      hasData.current = true;
      setComputedSignature(stored.signature ?? signature);
    } else {
      setComputedSignature(null);
    }
    if (stored && isPast(entry) && (stored.signature ?? signature) === signature) {
      setStatus({ kind: 'ready' });
      return;
    }
    const { references: refs, source: src } = latest.current;
    if (draftToRace(entry.draft, file !== null).ok) await computeCustom(refs, src, entry.draft, file);
    else {
      setStatus({ kind: 'ready' });
      setEditorOpen(true);
    }
  }
  const openRaceRef = useRef(openRace);
  openRaceRef.current = openRace;

  /** Nouvelle course : vide, ouverte dans la saisie (roadbook lu par l'IA, trace GPX ou à la main). */
  function createRace() {
    const entry = newRace();
    changeBook((b) => ({ ...b, races: [...b.races, entry] }));
    void openRace(entry.id);
    setEditorOpen(true);
    goTab('plan');
  }

  /** Supprime une course et tout ce qui lui appartient ; on passe à la suivante, ou à l'exemple s'il n'en reste pas. */
  function deleteRace(id: string) {
    const wasActive = bookRef.current.active === id;
    changeBook((b) => ({
      ...b, races: b.races.filter((r) => r.id !== id), active: b.active === id ? null : b.active,
      // Connecté : la suppression partira aussi dans le compte.
      ...(userRef.current ? { deleted: [...(b.deleted ?? []), id] } : {}),
    }));
    void deleteRaceFiles(id);
    if (!wasActive) return;
    const next = defaultRaceId(bookRef.current);
    if (next) void openRace(next);
    else switchMode('demo');
  }

  function switchMode(next: Mode) {
    if (next === mode) return;
    if (next === 'demo') {
      setMode('demo');
      setScenarioIndex(1);
      setEditorOpen(false);
      void computeDemo(references, source);
      return;
    }
    // Ta course : celle d'avant (ou la prochaine à venir), sinon une nouvelle.
    const id = defaultRaceId(bookRef.current);
    if (id) void openRace(id);
    else createRace();
  }

  // Une fois des erreurs affichées, elles suivent la saisie : chaque correction en fait disparaître une.
  function revalidate(d: RaceDraft, file: File | null) {
    if (draftErrors.length === 0) return;
    const result = draftToRace(d, file !== null);
    setDraftErrors(result.ok ? [] : result.errors);
  }

  function storeDraft(next: RaceDraft) {
    const id = activeRef.current;
    if (id) changeBook((b) => updateDraft(b, id, next));
  }

  function changeDraft(next: RaceDraft) {
    setDraft(next);
    storeDraft(next);
    revalidate(next, gpx);
  }

  function changeGpx(file: File | null) {
    setGpx(file);
    const id = activeRef.current;
    if (id) {
      void saveRaceGpx(id, file);
      const trace = file ? { name: file.name, size: file.size } : null;
      changeBook((b) => ({ ...b, races: b.races.map((r) => (r.id === id ? { ...r, trace, updatedAt: new Date().toISOString() } : r)) }));
    }
    // Les ravitos placés à la main l'étaient sur l'ancienne trace.
    const next = withoutTrackPositions(draft);
    if (next !== draft) {
      setDraft(next);
      storeDraft(next);
    }
    revalidate(next, file);
  }

  // En mode "ma course", on n'affiche pas le plan de l'exemple (et inversement).
  // Et pour ta course, seulement le plan de la course affichée (pas celui d'une autre de tes courses).
  const shown = data && (data.sampleId === CUSTOM_ID) === (mode === 'custom')
    && (mode === 'demo' || !data.raceId || data.raceId === book.active) ? data : null;
  const plans = shown?.plans ?? [];
  const plan = plans[Math.min(scenarioIndex, plans.length - 1)];
  const course = shown?.course;
  const stale = mode === 'custom' && shown !== null && computedSignature !== null
    && computedSignature !== draftSignature(draft, gpx);
  // Saisie d'une autre course (nouveau roadbook pas encore calculable) : l'ancien plan n'a plus
  // rien à faire à l'écran, même grisé.
  const otherRace = stale && !!course && draft.name.trim() !== course.race.name;
  const draftName = draft.name.trim() || 'Ta nouvelle course';
  // Ravitos à placer sur la trace : seulement pour sa course, avec une trace, et un plan à jour de la saisie
  // (les points de la course calculée sont alors ceux du brouillon, dans le même ordre).
  const canPlace = mode === 'custom' && !!course?.track && !stale && !otherRace;
  const [placing, setPlacing] = useState(false);
  const [savingPlaces, setSavingPlaces] = useState(false);
  const toPlace = useMemo(() => (canPlace && course ? placementWarnings(course) : []), [canPlace, course]);
  useEffect(() => { if (!canPlace) setPlacing(false); }, [canPlace]);
  async function savePlaces(positions: (number | null)[]) {
    const next = withTrackPositions(draft, positions);
    changeDraft(next);
    setSavingPlaces(true);
    try {
      if (await computeCustom(references, source, next, gpx)) setPlacing(false);
    } finally {
      setSavingPlaces(false);
    }
  }
  function openPlacing() {
    setPlacing(true);
    requestAnimationFrame(() => document.querySelector('.placement')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
  // Services de chaque point (déduits du type d'arrêt pour un plan gardé par une ancienne version).
  const services = useMemo(
    () => course?.race.checkpoints.map((c) => c.services ?? defaultServices(c.aid)) ?? [],
    [course],
  );

  // Profil nutrition : partagé par la nutrition et la checklist du matériel (eau obligatoire / flasques).
  const [nutritionProfile, setNutritionProfile] = useState<NutritionProfile>(loadNutrition);
  const nutritionRef = useRef(nutritionProfile);
  nutritionRef.current = nutritionProfile;
  const changeNutritionProfile = (next: NutritionProfile) => {
    setNutritionProfile(next);
    saveNutrition(next);
  };

  // Matériel, assistance et pointages : gardés course par course (l'exemple, sous son nom).
  const raceKey = mode === 'custom' && book.active ? book.active : shown?.course.race.name ?? '';
  // Points où l'assistance attend le coureur.
  const crewRace = shown ? raceKey : '';
  const [crew, setCrew] = useState<string[]>([]);
  useEffect(() => { setCrew(crewRace ? loadCrew(crewRace) : []); }, [crewRace]);
  const changeCrew = (codes: string[]) => {
    setCrew(codes);
    if (crewRace) saveCrew(crewRace, codes);
  };

  // Lien de suivi pour l'assistance : le plan (les trois scénarios) voyage dans le lien.
  const shareCrew = (fix: Fix | null, runner: string | null, update?: string): Promise<ShareResult> =>
    !course ? Promise.resolve('failed')
      : shareWithCrew({ plans, likely: Math.min(1, plans.length - 1), course, services, profile: nutritionProfile, crew, fix,
        runner: runner ?? loadRunnerName(), update });

  const [savingPdf, setSavingPdf] = useState(false);
  // Pourquoi le PDF n'est pas disponible, dit au coureur plutôt qu'un bouton grisé muet.
  const pdfBlocked = !plan
    ? "Le PDF se télécharge une fois le plan calculé : complète ta course et clique sur « Calculer mon plan »."
    : stale ? "Ta course a changé depuis le dernier calcul : clique sur « Calculer mon plan » pour un PDF à jour." : null;
  const [pdfMenu, setPdfMenu] = useState(false);
  const [garminOpen, setGarminOpen] = useState(false);
  useEffect(() => {
    if (!pdfMenu) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !(e.target as Element).closest('.pdf-menu')) setPdfMenu(false);
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', close);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', close); };
  }, [pdfMenu]);

  async function savePdf(variant: 'summary' | 'full') {
    if (!course || plans.length === 0) return;
    setPdfMenu(false);
    setSavingPdf(true);
    try {
      const { downloadPlanPdf } = await import('./lib/pdf');
      await downloadPlanPdf({
        course, plans, selected: Math.min(scenarioIndex, plans.length - 1),
        services, nutrition: nutritionProfile, gear: loadGear(raceKey), crew, variant,
      });
    } finally {
      setSavingPdf(false);
    }
  }

  // Références : seulement dans Mon plan, à droite du roadbook (en haut sur mobile).
  const side = (
    <>
      <ReferenceForm
        initialReferences={references}
        initialSource={source}
        loading={status.kind === 'loading'}
        onSubmit={(refs, src) => void compute(refs, src)}
        target={plan && !otherRace ? { km: plan.totalDistanceKm, gainM: plan.totalGainM, date: course?.race.start?.slice(0, 10) ?? null } : null}
        training={training}
        onTrainingChange={changeTraining}
        openStrava={stravaRequested}
        onStravaDisconnected={() => purgeStravaData(DISCONNECTED_NOTICE)}
      />
      {plan && <SourceNote source={plan.elevationSource} hasTrack={!!course?.track} />}
      {plan?.runner && (
        <p className="note">Ton profil de coureur : {runnerNote(plan.runner.activities, runner.races.filter((r) => r.use && r.fatigueExponent !== null).length)},
          {' '}<a href={TAB_HASH.analyse}>voir dans Analyse</a>.</p>
      )}
    </>
  );
  const planReady = !!plan && !!course && !otherRace;
  const exampleReferences = references.some(isExampleReference);

  // Mes courses : la liste (feuille sur téléphone, menu et colonne sur ordinateur) et ce qui reste à préparer.
  const [racesOpen, setRacesOpen] = useState(false);
  const reviewed = useMemo(() => new Set(runner.races.flatMap((r) => (r.raceId ? [r.raceId] : []))), [runner]);
  const raceList: RaceListProps = {
    book, shownId: mode === 'custom' ? book.active : null, reviewed,
    onOpen: (id) => { if (id !== book.active || mode !== 'custom') void openRace(id); },
    onNew: createRace,
    onExample: () => switchMode('demo'),
    onDelete: deleteRace,
  };
  const gear = raceKey ? loadGear(raceKey) : [];
  const packed = gear.filter((g) => g.packed).length;
  const runnerUsed = runner.use && (runner.profile !== null || runner.races.some((r) => r.use && r.fatigueExponent !== null));
  const prep: PrepItem[] = [
    {
      title: 'Roadbook et trace',
      state: mode === 'demo' || (gpx && planReady) ? 'ok' : 'todo',
      detail: !planReady ? 'Course à saisir' : mode === 'demo' || gpx
        ? `${plan!.checkpoints.length} points, trace GPX` : `${plan!.checkpoints.length} points · trace GPX à ajouter`,
      onClick: () => { if (mode === 'demo') goTab('plan'); else { setEditorOpen(true); goTab('plan'); } },
    },
    {
      title: 'Tes références', state: exampleReferences ? 'todo' : 'ok', href: TAB_HASH.references,
      detail: exampleReferences ? "Course d'exemple : mets les tiennes" : `${references.length} course${references.length > 1 ? 's' : ''}`,
    },
    {
      title: 'Ton profil de coureur', state: runnerUsed ? 'ok' : 'optional', href: TAB_HASH.profil,
      detail: runnerUsed ? 'Utilisé dans le plan' : 'Facultatif : ta pente, ta fatigue',
    },
    {
      title: 'Ton sac', state: gear.length > 0 && packed === gear.length ? 'ok' : 'todo', href: TAB_HASH.sac,
      detail: gear.length === 0 ? 'Liste du matériel à faire' : packed === gear.length ? 'Tout est prêt' : `${packed} / ${gear.length} cochés`,
    },
    {
      title: 'Ton assistance', state: crew.length > 0 ? 'ok' : 'optional', href: TAB_HASH.ravitos,
      detail: crew.length > 0 ? `L'attend à ${crew.length} point${crew.length > 1 ? 's' : ''}` : "Facultatif : où elle t'attend",
    },
  ];
  const pickerTitle = otherRace ? draftName : course?.race.name ?? (activeRace && mode === 'custom' ? raceName(activeRace) : 'Ta course');
  const pickerSubtitle = mode === 'demo' ? 'Exemple · choisir une de tes courses' : plan && course && !otherRace
    ? `${formatClock(course.race.start)} · ${formatKm(plan.totalDistanceKm)} km · ${formatMeters(plan.totalGainM)} D+`
    : 'Plan à calculer';
  // Compte (facultatif) : sauvegarde de Mes courses et des réglages, retrouvés sur tous les appareils (api/sync).
  const [user, setUser] = useState<User | null>(null);
  const userRef = useRef(user);
  userRef.current = user;
  const [sync, setSync] = useState<{ state: 'idle' | 'busy' | 'error'; at: string | null; error?: string }>({ state: 'idle', at: null });
  useEffect(() => { if (hasStoredSession()) void currentUser().then(setUser).catch(() => undefined); }, []);
  useEffect(() => {
    if (!user) return;
    let live = true;
    let off = () => undefined as void;
    void onAccountChange((u) => setUser((prev) => (prev?.id === u?.id ? prev : u))).then((o) => { if (live) off = o; else o(); });
    return () => { live = false; off(); };
  }, [user]);

  const syncHost: SyncHost = {
    races: () => bookRef.current.races.map((r) => ({
      id: r.id, updatedAt: r.updatedAt ?? r.createdAt,
      doc: { draft: r.draft, createdAt: r.createdAt, summary: r.summary, gear: loadGear(r.id), crew: loadCrew(r.id), gpx: r.trace ?? null },
    })),
    deletedHere: () => bookRef.current.deleted ?? [],
    settings: (): SettingsDoc => ({
      references: latest.current.references.filter((r) => !r.strava && !isExampleReference(r)),
      source: latest.current.source, nutrition: nutritionRef.current, training: trainingRef.current, runnerName: loadRunnerName(),
    }),
    localGpx: (id) => loadRaceGpx(bookRef.current, id),
    applyRaces: (take, remove) => {
      const hadRaces = bookRef.current.races.length > 0;
      const active = bookRef.current.active;
      for (const t of take) {
        saveGear(t.id, t.doc.gear);
        saveCrew(t.id, t.doc.crew);
      }
      const traces = Promise.all(take.filter((t) => t.gpx !== undefined).map((t) => saveRaceGpx(t.id, t.gpx ?? null)));
      changeBook((b) => {
        const kept = b.races.filter((r) => !remove.includes(r.id));
        const races = [...kept.filter((r) => !take.some((t) => t.id === r.id)), ...take.map((t) => ({
          id: t.id, draft: t.doc.draft, createdAt: t.doc.createdAt, updatedAt: t.updatedAt, summary: t.doc.summary, trace: t.doc.gpx,
        }))];
        return { ...b, races, active: b.active && remove.includes(b.active) ? null : b.active };
      });
      for (const id of remove) void deleteRaceFiles(id);
      // La course affichée a changé ailleurs, ou n'existe plus ; premier appareil connecté : on montre ses courses.
      void traces.then(() => {
        if (mode !== 'custom' && hadRaces) return;
        const next = active && !remove.includes(active) ? active : defaultRaceId(bookRef.current);
        if (next && (next !== active || take.some((t) => t.id === active) || !hadRaces)) void openRace(next);
        else if (!next && mode === 'custom') switchMode('demo');
      });
    },
    applySettings: (doc, first) => {
      const strava = latest.current.references.filter((r) => r.strava);
      const mine = latest.current.references.filter((r) => !r.strava && !isExampleReference(r));
      // Première connexion de cet appareil : ses références saisies à la main s'ajoutent à celles du compte.
      const manual = first ? [...doc.references, ...mine.filter((m) => !doc.references.some((d) => JSON.stringify(d) === JSON.stringify(m)))] : doc.references;
      const refs = [...manual, ...strava];
      setNutritionProfile(doc.nutrition);
      saveNutrition(doc.nutrition);
      setTraining(doc.training);
      trainingRef.current = doc.training;
      saveTrainingOptions(doc.training);
      if (doc.runnerName) saveRunnerName(doc.runnerName);
      void latest.current.compute(refs.length ? refs : DEFAULT_REFERENCES, doc.source);
    },
    clearDeleted: (ids) => {
      if (ids.length) changeBook((b) => ({ ...b, deleted: (b.deleted ?? []).filter((id) => !ids.includes(id)) }));
    },
  };
  const syncHostRef = useRef(syncHost);
  syncHostRef.current = syncHost;
  const syncing = useRef(false);
  const lastSync = useRef(0);
  const runSync = useCallback(async (force = false) => {
    const u = userRef.current;
    if (!u || syncing.current || (!force && Date.now() - lastSync.current < 15_000)) return;
    syncing.current = true;
    setSync((s) => ({ ...s, state: 'busy' }));
    try {
      // Trace des courses enregistrées avant cette version : son nom et sa taille, pour savoir si elle a changé.
      for (const r of bookRef.current.races.filter((x) => x.trace === undefined)) {
        const file = await loadRaceGpx(bookRef.current, r.id);
        const trace = file ? { name: file.name, size: file.size } : null;
        changeBook((b) => ({ ...b, races: b.races.map((x) => (x.id === r.id ? { ...x, trace } : x)) }));
      }
      await syncNow(u.id, syncHostRef.current);
      lastSync.current = Date.now();
      setSync({ state: 'idle', at: new Date().toISOString() });
    } catch (e) {
      setSync((s) => ({ ...s, state: 'error', error: e instanceof Error ? e.message : String(e) }));
    } finally {
      syncing.current = false;
    }
  }, [changeBook]);
  // À la connexion, au retour dans l'appli, en changeant de page, et peu après chaque modification.
  useEffect(() => { if (user && booted) void runSync(true); }, [user, booted, runSync]);
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') void runSync(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [runSync]);
  useEffect(() => { void runSync(); }, [tab, runSync]);
  useEffect(() => {
    if (!user) return;
    const timer = window.setTimeout(() => void runSync(true), 4000);
    return () => window.clearTimeout(timer);
  }, [book, references, nutritionProfile, training, crew, user, runSync]);

  async function leaveAccount(remove: boolean) {
    if (remove) await deleteAccount();
    else await signOut();
    forgetSyncState();
    setUser(null);
    setSync({ state: 'idle', at: null });
  }

  // Sur téléphone, les références sont dans Moi : le plan y renvoie par une ligne « Ton rythme ».
  const rhythmRow = (
      <ListRow icon={<RouteIcon size={18} />} tone={exampleReferences ? 'warm' : 'accent'}
        title={exampleReferences ? 'Ton rythme : course d\'exemple' : 'Ton rythme'}
        detail={exampleReferences ? 'Importe tes courses depuis Strava'
          : `${references.length} référence${references.length > 1 ? 's' : ''}${plan?.runner ? ' · profil de coureur' : ''}`}
        href={TAB_HASH.references} />
  );
  const finishOnboarding = () => {
    try {
      localStorage.setItem(WELCOME_SEEN, '1');
    } catch {
      // Stockage indisponible : la bienvenue reviendra à la prochaine visite.
    }
    setOnboarding(false);
  };
  const subPage = (title: string) => phone && <BackBar href={TAB_HASH.moi} back="Moi" title={title} />;

  if (onboarding) {
    return (
      <div className="app">
        <Onboarding
          onExample={() => { finishOnboarding(); goTab('accueil'); }}
          onStrava={() => { finishOnboarding(); goTab('references'); connectStrava(); }}
          onManual={() => { finishOnboarding(); goTab('references'); }}
          onLater={() => { finishOnboarding(); switchMode('custom'); goTab('plan'); }} />
      </div>
    );
  }
  // Les barrières serrées ou dépassées sont déjà dans le bandeau et le roadbook : on ne les répète pas en avertissement.
  const planWarnings = (plan?.warnings ?? []).filter((w) => !/^(Barrière horaire dépassée|Marge de moins d'1 h)/.test(w));

  return (
    <div className="app">
      {!phone && <header className="topbar">
        <a className="brand" href={TAB_HASH.accueil} aria-label="Ravitime : accueil">
          <img src="/icon.svg" alt="" width={28} height={28} />
          <span>Ravitime</span>
        </a>
        {book.races.length > 0 ? <RacePicker title={pickerTitle} subtitle={pickerSubtitle} {...raceList} />
          : tab === 'accueil' ? <div className="race-title" /> : otherRace ? (
          <div className="race-title">
            <h1>{draftName}</h1>
            <p>Plan à calculer</p>
          </div>
        ) : course && (
          <div className="race-title">
            <h1>{course.race.name}</h1>
            <p>
              Départ {formatClock(course.race.start)}
              {plan && <> · {formatKm(plan.totalDistanceKm)} km · {formatMeters(plan.totalGainM)} D+</>}
            </p>
          </div>
        )}
        {feedbackUrl && (
          <a className="feedback no-print" href={feedbackUrl} target="_blank" rel="noreferrer"
            title="Une idée, un bug, une remarque : dis-le-nous">
            💬 <span className="long">Donner mon avis</span>
          </a>
        )}
        <a className="account-link no-print" href={TAB_HASH.compte} aria-current={tab === 'compte' ? 'page' : undefined}
          title={user ? `Ton compte : ${user.email}` : 'Sauvegarde tes courses et retrouve-les partout'}>
          {user ? <><span className="account-avatar" aria-hidden>{(user.email ?? '?').charAt(0).toUpperCase()}</span>
            <span className="long">Ton compte</span></> : 'Se connecter'}
        </a>
        <div className="pdf-menu no-print" hidden={tab === 'accueil'}>
          <button type="button" className="ghost" onClick={() => setPdfMenu((m) => !m)} disabled={savingPdf}
            aria-disabled={pdfBlocked ? true : undefined} aria-expanded={pdfMenu} aria-haspopup="menu"
            title="Télécharger le plan en PDF, ou le parcours pour ta montre">
            {savingPdf ? 'PDF…' : 'Télécharger ▾'}
          </button>
          {pdfMenu && (pdfBlocked ? (
            <div className="pdf-menu-list" role="status">
              <p className="pdf-blocked">{pdfBlocked}</p>
            </div>
          ) : (
            <div className="pdf-menu-list" role="menu">
              <button type="button" role="menuitem" onClick={() => void savePdf('summary')}>
                <strong>Résumé · 1 page</strong>
                <span className="muted small">Passages, barrières et ravitos, à garder sur soi</span>
              </button>
              <button type="button" role="menuitem" onClick={() => void savePdf('full')}>
                <strong>Complet</strong>
                <span className="muted small">Tout le plan : profil, références, préparation, nutrition, matériel</span>
              </button>
              <hr />
              <button type="button" role="menuitem" onClick={() => { setPdfMenu(false); setGarminOpen(true); }}>
                <strong>Parcours pour ma montre</strong>
                <span className="muted small">Garmin (.fit et champ Prochain Ravito) ou autres marques (.gpx)</span>
              </button>
            </div>
          ))}
        </div>
      </header>}

      <nav className="tabs no-print" aria-label="Pages">
        {TABS.map(([id, label]) => (
          <a key={id} href={TAB_HASH[id]} aria-current={tab === id ? 'page' : undefined}>{label}</a>
        ))}
      </nav>

      {status.kind === 'unreachable' && hasData.current && (
        <div className="banner warn no-print" role="status">
          Pas de connexion : voici ton dernier plan calculé
          {data && <> (le {new Date(data.savedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })})</>}.
          Il se mettra à jour dès que le réseau revient.{' '}
          <button type="button" className="link-btn" onClick={() => void compute(references, source)}>Réessayer</button>
        </div>
      )}
      {status.kind === 'unreachable' && !hasData.current && (
        <div className="banner error" role="alert">
          Le serveur ne répond pas. Vérifie ta connexion ; s'il dormait, il met environ une minute à se réveiller.{' '}
          <button type="button" className="link-btn" onClick={() => void compute(references, source)}>Réessayer</button>
        </div>
      )}
      {stravaNotice && (
        <div className="banner info no-print" role="status">
          {stravaNotice}{' '}
          <button type="button" className="link-btn" onClick={() => setStravaNotice(null)}>OK</button>
        </div>
      )}
      {status.kind === 'rejected' && (
        <div className="banner error" role="alert">
          Le plan n'a pas pu être calculé : {status.error.charAt(0).toLowerCase() + status.error.slice(1)}{' '}
          <button type="button" className="link-btn" onClick={() => void compute(references, source)}>Réessayer</button>
        </div>
      )}

      {tab === 'algo' && (
        <div className="algo-page">
          {phone && <div className="back-wrap">{subPage('Comment c\'est calculé')}</div>}
          <AlgorithmPage plan={plan} />
        </div>
      )}
      {tab === 'accueil' && phone && (
        <main className="layout single phone-page">
          <HomeDashboard mode={mode} course={planReady ? course! : null} plan={planReady ? plan! : null}
            exampleReferences={exampleReferences} loading={status.kind === 'loading'}
            hrefs={{ plan: TAB_HASH.plan, course: TAB_HASH.course, sac: TAB_HASH.sac, ravitos: TAB_HASH.ravitos,
              references: TAB_HASH.references, retour: TAB_HASH.retour }}
            onMyRace={() => { switchMode('custom'); goTab('plan'); }}
            onEditRace={() => { if (mode === 'demo') switchMode('custom'); else setEditorOpen(true); goTab('plan'); }}
            onStrava={() => { setStravaRequested(true); goTab('references'); }}
            onWatch={() => setGarminOpen(true)}
            onPdf={() => void savePdf('summary')}
            exportBlocked={pdfBlocked}
            onRaces={() => setRacesOpen(true)} draftName={draftName} prep={prep} raceKey={raceKey} />
        </main>
      )}
      {racesOpen && <RacesSheet {...raceList} onClose={() => setRacesOpen(false)} />}
      {tab === 'accueil' && !phone && book.races.length > 0 && (
        <main className="layout single">
          <RaceDashboard plan={planReady ? plan! : null} course={planReady ? course! : null} isExample={mode === 'demo'}
            loading={status.kind === 'loading'} list={raceList}
            prep={[...prep, { title: 'Ta montre', state: 'optional', detail: pdfBlocked ? 'Après le calcul du plan' : 'Parcours et champ Prochain Ravito',
              onClick: () => { if (!pdfBlocked) setGarminOpen(true); } }]}
            onEditRace={() => { if (mode === 'demo') switchMode('custom'); else setEditorOpen(true); goTab('plan'); }} />
        </main>
      )}
      {tab === 'accueil' && !phone && book.races.length === 0 && (
        <WelcomePage plan={plan} isExample={mode === 'demo'} feedbackUrl={feedbackUrl}
          onOpenPlan={() => goTab('plan')}
          onMyRace={() => { switchMode('custom'); goTab('plan'); }}
          onAlgorithm={() => goTab('algo')} />
      )}

      {tab === 'course' && (plan && course
        ? <RaceView raceKey={raceKey} plan={plan} course={course} services={services} profile={nutritionProfile} crew={crew}
          onShareCrew={crew.length > 0 ? (fix, message) => shareCrew(fix, null, message) : undefined} />
        : <p className="muted race-empty">Calcule d'abord le plan de ta course dans « Mon plan » : cette page te guidera point
          par point le jour J.</p>)}

      <main className="layout single" hidden={tab === 'algo' || tab === 'accueil' || tab === 'course'}>

        <section className="content">
          {phone && tab === 'plan' && !(mode === 'custom' && (editorOpen || !shown)) && (
            <ScreenTitle title="Plan" subtitle={course && !otherRace ? `${course.race.name} · ${formatClock(course.race.start)}` : undefined} />
          )}
          {phone && (tab === 'ravitos' || tab === 'sac') && <>
            <ScreenTitle title={tab === 'sac' ? 'Ton sac' : 'Ravitos'} subtitle={course && !otherRace ? course.race.name : undefined} />
            <nav className="segmented no-print" aria-label="Ravitos ou sac" ref={partsBar}>
              <span className="t-tabs-pill" aria-hidden />
              <a href={TAB_HASH.ravitos} aria-current={tab === 'ravitos' ? 'page' : undefined}>Ravitos et nutrition</a>
              <a href={TAB_HASH.sac} aria-current={tab === 'sac' ? 'page' : undefined}>Sac et matériel</a>
            </nav>
          </>}
          {tab === 'moi' && (
            <MePage referenceCount={references.length} exampleReferences={exampleReferences} runner={runner}
              hrefs={{ references: TAB_HASH.references, profil: TAB_HASH.profil, retour: TAB_HASH.retour, analyse: TAB_HASH.analyse,
                algo: TAB_HASH.algo, confidentialite: TAB_HASH.confidentialite }}
              feedbackUrl={feedbackUrl} onPdf={(v) => void savePdf(v)} onWatch={() => setGarminOpen(true)} exportBlocked={pdfBlocked}
              onStrava={() => { setStravaRequested(true); goTab('references'); }} onDisconnectStrava={disconnectAndPurge}
              account={user ? { email: user.email ?? '', syncedAt: sync.at, error: sync.state === 'error' } : null} accountHref={TAB_HASH.compte} />
          )}
          {tab === 'compte' && <>
            {subPage('Ton compte')}
            <AccountPage user={user} sync={sync} onSignedIn={setUser} onSyncNow={() => void runSync(true)}
              onSignOut={() => leaveAccount(false)} onDelete={() => leaveAccount(true)} raceCount={book.races.length} />
          </>}
          {tab === 'confidentialite' && <>
            {subPage('Confidentialité')}
            <PrivacyPage onDisconnectStrava={disconnectAndPurge} feedbackUrl={feedbackUrl} />
          </>}
          {tab === 'references' && <>
            {subPage('Tes références')}
            <div className="references-page">{side}</div>
          </>}
          {tab === 'profil' && <>
            {subPage('Profil de coureur')}
            <RunnerProfileCard stored={runner} onChange={changeRunner} isExample={mode === 'demo'} />
          </>}
          {tab === 'retour' && <>
            {subPage('Retours de course')}
            {mode === 'custom' && plan && course && !otherRace
              ? <RaceReviewCard plan={plan} course={course} stored={runner} onChange={changeRunner} raceId={book.active} />
              : <p className="muted">Le retour de course compare ton activité Strava au plan de ta course : prépare d'abord ta
                course (Accueil, « Préparer ma course »).</p>}
          </>}
          {tab === 'analyse' && subPage('Analyse détaillée')}
          {tab === 'plan' && mode === 'demo' && !phone && (
            <div className="example-banner no-print" role="note">
              <span>Tu regardes <strong>un exemple</strong> : {course?.race.name ?? 'une course type'}, avec des références types.</span>
              <button type="button" onClick={() => switchMode('custom')}>Préparer ma course</button>
            </div>
          )}
          {tab !== 'plan' ? null : mode === 'custom' && (editorOpen || !shown) ? (
            <RaceEditor
              draft={draft}
              onChange={changeDraft}
              gpx={gpx}
              onGpxChange={changeGpx}
              errors={draftErrors}
              loading={status.kind === 'loading'}
              onSubmit={() => void submitEditor()}
              onCancel={shown ? () => setEditorOpen(false) : null}
              onLoaded={(d) => void loadedRoadbook(d)}
            />
          ) : phone ? (
            <ListGroup>
              {mode === 'demo' && (
                <ListRow icon={<FlagIcon size={18} />} title="Course d'exemple"
                  detail="Saisis la tienne pour ton propre plan"
                  value={<span className="row-action-accent">Préparer</span>} onClick={() => switchMode('custom')} />
              )}
              {mode === 'custom' && (
                <ListRow icon={<FlagIcon size={18} />} title="Ta course"
                  detail={gpx ? `Roadbook et trace GPX (${gpx.name})` : 'Sans trace GPX : ajoute-la pour la carte et le profil'}
                  value={<span className="row-action-accent">Modifier</span>} onClick={() => setEditorOpen(true)} />
              )}
              {rhythmRow}
            </ListGroup>
          ) : mode === 'custom' && (
            <div className="editor-summary no-print">
              <span className="muted small">
                {gpx ? `Trace : ${gpx.name}` : 'Sans trace GPX : calcul sur le D+ du roadbook.'}
              </span>
              <button type="button" className="ghost" onClick={() => setEditorOpen(true)}>Modifier ma course</button>
            </div>
          )}


          {tab === 'plan' && !planReady && !phone && <div className="plan-refs plan-refs-alone no-print">{side}</div>}

          {!['plan', 'ravitos', 'sac', 'analyse'].includes(tab) ? null : otherRace ? (
            <div className="banner warn stale-banner" role="status">
              Le plan de « {draftName} » n'est pas encore calculé :
              {' '}{draftErrors.length ? 'complète la saisie ci-dessus (voir les erreurs)' : 'clique sur « Calculer mon plan »'}.
            </div>
          ) : stale && course && (
            <div className="banner warn stale-banner" role="status">
              Le plan ci-dessous est celui de « {course.race.name} » avant tes changements :
              {' '}{draftErrors.length ? 'complète la saisie' : 'clique sur « Calculer mon plan »'} pour le mettre à jour.
            </div>
          )}

          {!otherRace && <div className={stale ? 'results stale' : 'results'} aria-hidden={stale || undefined}>
          {tab === 'plan' && plan && course && (
            <div className="plan-page">
              {plans.length > 0 && <PlanHero plans={plans} selected={scenarioIndex} onSelect={setScenarioIndex} />}

              <div className="plan-notes">
                {plan.training && <TrainingLine plan={plan} onDetails={() => goTab('analyse')} />}
                {planWarnings.length > 0 && (
                  <ul className="warnings">
                    {planWarnings.map((w) => <li key={w}>{w}</li>)}
                  </ul>
                )}
                {toPlace.length > 0 && !placing && (
                  <div className="placement-banner no-print" role="status">
                    <span>
                      <strong>{toPlace.length === 1 ? '1 ravito à vérifier sur la trace' : `${toPlace.length} ravitos à vérifier sur la trace`} :</strong>{' '}
                      {toPlace.map((i) => course.markers[i].name).join(', ')}. Le D+ du roadbook ou le waypoint du GPX ne
                      colle pas avec leur position : la montre t'annoncerait le ravito au mauvais endroit.
                    </span>
                    <button type="button" onClick={openPlacing}>Les placer sur la carte</button>
                  </div>
                )}
                {placing && canPlace && (
                  <PlacementEditor course={course} plan={plan} saving={savingPlaces} hoverKm={hoverKm} onHover={setHoverKm}
                    onSave={(positions) => void savePlaces(positions)} onCancel={() => setPlacing(false)} />
                )}
              </div>

              {course.track && (
                <section className="plan-profile plan-rule" aria-label="Profil">
                  <ElevationProfile track={course.track} markers={course.markers} plan={plan} hoverKm={hoverKm} onHover={setHoverKm} />
                </section>
              )}

              <Roadbook plan={plan} markers={course.markers} services={services} crew={crew} onHover={setHoverKm}
                onDetails={() => goTab('analyse')} />

              {course.track && !placing && (
                <section className="plan-map plan-rule no-print" aria-label="Carte">
                  <div className="roadbook-head">
                    <span className="overline">Carte</span>
                    {canPlace && <button type="button" className="link-btn" onClick={openPlacing}
                      title="Déplacer les ravitos le long de la trace, là où ils sont vraiment">Ajuster les ravitos</button>}
                    <button type="button" className="link-btn plan-map-toggle" aria-expanded={showMap}
                      onClick={() => setMapOpen(!mapOpen)}>{mapOpen ? 'Masquer la carte' : 'Voir la carte'}</button>
                  </div>
                  {showMap && <CourseMap track={course.track} markers={course.markers} plan={plan} hoverKm={hoverKm} onHover={setHoverKm} />}
                </section>
              )}

              {!phone && <div className="plan-refs no-print">{side}</div>}
            </div>
          )}

          {tab === 'ravitos' && plan && course && !phone && <div className="tab-tools"><Legend /></div>}
          {tab === 'ravitos' && plan && course && (
            <RavitosView plan={plan} services={services} profile={nutritionProfile} onProfileChange={changeNutritionProfile}
              onShareCrew={(runner) => shareCrew(loadFix(raceKey, plan.start), runner)}
              crew={crew} onCrewChange={changeCrew} />
          )}

          {tab === 'sac' && course && <GearCard raceKey={raceKey} raceName={course.race.name} plan={plan} profile={nutritionProfile} />}

          {tab === 'analyse' && <>
            <div className="tab-tools"><Legend /></div>
            <p className="muted tab-intro">Ce que le plan résume : le poids de chaque référence, ta préparation, le tableau
              complet (tronçons, allures, arrêts) et les trois scénarios côte à côte.</p>
            {plan && <ReferenceInsights plan={plan} />}
            {plan?.training && <TrainingCard plan={plan} />}
            {/* Sur téléphone, le profil et les retours de course ont leur page dans Moi. */}
            {!phone && <RunnerProfileCard stored={runner} onChange={changeRunner} isExample={mode === 'demo'} />}
            {!phone && mode === 'custom' && plan && course && !otherRace && (
              <RaceReviewCard plan={plan} course={course} stored={runner} onChange={changeRunner} raceId={book.active} />
            )}
            {plans.length > 1 && (
              <div className="plan-hero-scenarios analyse-scenario" role="group" aria-label="Scénario du tableau détaillé">
                {plans.map((p, i) => (
                  <button key={p.scenario.name} type="button" aria-pressed={i === scenarioIndex}
                    className={i === scenarioIndex ? 'active' : ''} onClick={() => setScenarioIndex(i)}>{p.scenario.name}</button>
                ))}
              </div>
            )}
            {plan && course && <PassageTable plan={plan} markers={course.markers} services={services} onHover={setHoverKm} />}
            {plans.length > 1 && <CompareTable plans={plans} />}
          </>}

          {['ravitos', 'sac', 'analyse'].includes(tab) && !plan && status.kind !== 'loading' && (
            <p className="muted">Calcule d'abord ton plan dans l'onglet « {phone ? 'Plan' : 'Mon plan'} ».</p>
          )}
          </div>}

          {status.kind === 'loading' && !shown && mode === 'demo' && <p className="muted">Calcul en cours…</p>}
        </section>
      </main>
      {garminOpen && course && plans.length > 0 && (
        <GarminExport course={course} plans={plans} selected={scenarioIndex} services={services} onClose={() => setGarminOpen(false)} />
      )}
      <MobileNav section={SECTION_OF[tab]} hrefs={{ accueil: TAB_HASH.accueil, plan: TAB_HASH.plan, ravitos: TAB_HASH.ravitos, moi: TAB_HASH.moi }} />
    </div>
  );
}

/** « pente mesurée sur 15 sorties Strava, fatigue de 1 course » */
function runnerNote(activities: number, races: number): string {
  const parts = [];
  if (activities > 0) parts.push(`pente mesurée sur ${activities} sortie${activities > 1 ? 's' : ''} Strava`);
  parts.push(races > 0 ? `fatigue de ${races} course${races > 1 ? 's' : ''} analysée${races > 1 ? 's' : ''}` : 'fatigue du coureur moyen');
  return parts.join(', ');
}

function SourceNote({ source, hasTrack }: { source: ElevationSource; hasTrack: boolean }) {
  return (
    <p className="note">
      {source === 'ROADBOOK'
        ? 'Distances et D+ : roadbook officiel.' + (hasTrack ? ' La trace GPX sert à la carte et au profil.' : '')
        : 'Distances et D+ : mesurés sur la trace GPX.'}
    </p>
  );
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, [query]);
  return matches;
}
