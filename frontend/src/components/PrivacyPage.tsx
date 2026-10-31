import { useEffect, useState } from 'react';
import { fetchStravaStatus, humanError } from '../api/client';
import { STRAVA_MAX_AGE_DAYS } from '../lib/stravaData';

/** Contact pour la confidentialité (transférée par ImprovMX). */
export const CONTACT_EMAIL = 'contact@ravitime.fr';

interface Props {
  /** Déconnecte Strava et efface ce qui en venait. */
  onDisconnectStrava: () => Promise<void>;
  feedbackUrl: string | null;
}

/**
 * Confidentialité : ce que Ravitime lit, garde et pour combien de temps, en particulier pour Strava (politique API de
 * Strava : données gardées 7 jours au plus sans vérification, effacées à la déconnexion, jamais partagées ni données à
 * une IA).
 */
export function PrivacyPage({ onDisconnectStrava, feedbackUrl }: Props) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetchStravaStatus().then((s) => setConnected(s.configured && s.connected)).catch(() => setConnected(null));
  }, []);

  async function disconnect() {
    setBusy(true);
    setError(null);
    try {
      await onDisconnectStrava();
      setConnected(false);
    } catch (e) {
      setError(humanError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="privacy">
      <h1>Confidentialité</h1>
      <p className="privacy-lead">Sans compte, tout reste sur ton appareil (le navigateur, ou l'appli). Le compte est
        facultatif : il sauvegarde tes courses pour les retrouver sur tes autres appareils.</p>

      <section>
        <h2>Ce qui reste sur ton appareil</h2>
        <ul>
          <li>Tes courses (roadbook, trace GPX, plan calculé, sac, assistance, pointages), tes références, ta nutrition.</li>
          <li>Ta connexion Strava, chiffrée : un cookie sur le site, le stockage de l'appli sur téléphone.</li>
        </ul>
        <p>Le serveur calcule le plan et oublie aussitôt ce qu'il a reçu.</p>
      </section>

      <section>
        <h2>Ton compte (facultatif)</h2>
        <p>Si tu crées un compte, il garde chez Supabase, dans un centre de données en Europe :</p>
        <ul>
          <li>ton adresse e-mail (pour t'envoyer le code de connexion) ;</li>
          <li>tes courses : roadbook, trace GPX, sac, assistance, résumé du plan ;</li>
          <li>tes réglages : références saisies à la main, nutrition, préparation, prénom.</li>
        </ul>
        <p>Rien de ce qui vient de Strava n'y est envoyé : ni références importées, ni profil de coureur, ni retours de
          course. Chaque coureur n'a accès qu'à ses propres données. « Supprimer mon compte » (Moi › Ton compte) efface
          tout, définitivement.</p>
      </section>

      <section>
        <h2>Strava</h2>
        <p>Si tu connectes Strava, Ravitime lit tes activités (y compris celles qui ne sont visibles que de toi), en
          lecture seule, et seulement quand tu t'en sers :</p>
        <ul>
          <li><strong>Importer des références</strong> : la liste de tes sorties (nom, date, distance, D+, temps). Celles que
            tu choisis sont gardées sur ton appareil.</li>
          <li><strong>Profil de coureur</strong> : le détail de quelques sorties longues (distance, altitude, temps), lu le
            temps de la mesure. Seul le résultat (ton rythme selon la pente) est gardé.</li>
          <li><strong>Retour de course</strong> : le détail de l'activité choisie, lu le temps de l'analyse. Seule ta fatigue
            mesurée est gardée, avec le nom et la distance de ta course à toi.</li>
          <li><strong>Ta préparation</strong> : tes sorties des dernières semaines, relues à chaque calcul (gardées dix
            minutes au plus en mémoire sur le serveur). Seul le volume par semaine est gardé, avec ton dernier plan.</li>
        </ul>
        <p>Ce qui vient de Strava est vérifié une fois par jour quand tu ouvres l'appli : une activité supprimée sur Strava
          disparaît de Ravitime. Sans vérification possible, une référence importée est effacée
          après {STRAVA_MAX_AGE_DAYS} jours.</p>
        <p>Tes données Strava ne sont jamais montrées à quelqu'un d'autre, ni vendues, ni utilisées pour de la publicité,
          des statistiques ou pour entraîner une intelligence artificielle. Le lien de suivi pour ton assistance ne contient
          que les heures de passage de ton plan.</p>
      </section>

      <section>
        <h2>Lecture d'un roadbook par l'IA</h2>
        <p>Quand tu demandes à l'IA de lire un roadbook (PDF ou photo), ce fichier, et lui seul, est envoyé à Gemini
          (Google) le temps de la lecture. Aucune donnée Strava n'est jamais envoyée à une IA.</p>
      </section>

      <section>
        <h2>Tout effacer</h2>
        <ul>
          <li><strong>Strava</strong> : « Déconnecter Strava » (ici, dans Moi ou dans l'import) révoque l'accès chez Strava et
            efface aussitôt de Ravitime tout ce qui en venait : références importées, profil de coureur, retours de course.
            Révoquer l'accès depuis les réglages de Strava (« Mes applications ») a le même effet à la prochaine ouverture
            de Ravitime.</li>
          <li><strong>Le reste</strong> : efface les données du site dans ton navigateur, ou désinstalle l'appli.</li>
        </ul>
        {connected && (
          <button type="button" className="ghost" onClick={() => void disconnect()} disabled={busy}>
            {busy ? 'Déconnexion…' : 'Déconnecter Strava et effacer ses données'}
          </button>
        )}
        {connected === false && <p className="muted small">Strava n'est pas connecté : Ravitime n'en garde rien.</p>}
        {error && <p className="field-error" role="alert">{error}</p>}
      </section>

      <section>
        <h2>Une question</h2>
        <p>Une question sur tes données, une demande d'effacement : écris à{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          {feedbackUrl && <> Pour un bug ou une idée : <a href={feedbackUrl} target="_blank" rel="noreferrer">donner mon avis</a>.</>}</p>
      </section>
    </article>
  );
}
