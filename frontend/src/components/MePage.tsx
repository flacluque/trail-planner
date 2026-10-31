import { useEffect, useState } from 'react';
import { fetchStravaStatus, humanError } from '../api/client';
import type { StoredRunnerProfile } from '../api/storage';
import { ListGroup, ListRow, ScreenTitle } from './AppScreen';
import { ChartIcon, ChatIcon, DocIcon, InfoIcon, LinkIcon, PersonIcon, RouteIcon, ShieldIcon, StopwatchIcon, WatchIcon } from './Icons';

interface Props {
  referenceCount: number;
  exampleReferences: boolean;
  runner: StoredRunnerProfile;
  hrefs: { references: string; profil: string; retour: string; analyse: string; algo: string; confidentialite: string };
  /** Connecter Strava : la page des références s'ouvre sur l'import (et son bouton officiel). */
  onStrava: () => void;
  /** Déconnecte Strava et efface ce qui en venait. */
  onDisconnectStrava: () => Promise<void>;
  feedbackUrl: string | null;
  onPdf: (variant: 'summary' | 'full') => void;
  onWatch: () => void;
  exportBlocked: string | null;
  /** Compte connecté (null : pas connecté). */
  account: { email: string; syncedAt: string | null; error: boolean } | null;
  accountHref: string;
}

/**
 * « Moi » : tout ce qui te concerne (Strava, tes références, ton profil de coureur, tes retours de course), puis le
 * détail du plan et l'explication du calcul. Ce qui était caché derrière « Plus ».
 */
export function MePage({ referenceCount, exampleReferences, runner, hrefs, feedbackUrl, onPdf, onWatch, exportBlocked, onStrava,
  onDisconnectStrava, account, accountHref }: Props) {
  const [strava, setStrava] = useState<{ configured: boolean; connected: boolean } | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetchStravaStatus().then((s) => setStrava({ configured: s.configured, connected: s.connected })).catch(() => setStrava(null));
  }, []);
  async function disconnect() {
    if (!window.confirm('Déconnecter Strava ? Tout ce qui vient de Strava (références importées, profil de coureur, retours '
      + 'de course) sera effacé de Ravitime.')) return;
    setDisconnecting(true);
    setError(null);
    try {
      await onDisconnectStrava();
      setStrava((s) => s && { ...s, connected: false });
    } catch (e) {
      setError(humanError(e));
    } finally {
      setDisconnecting(false);
    }
  }
  const races = runner.races.length;
  const counted = runner.races.filter((r) => r.use && r.fatigueExponent !== null).length;

  return (
    <div className="me">
      <ScreenTitle title="Moi" />

      <ListGroup>
        <ListRow icon={<PersonIcon size={18} />} title={account ? account.email : 'Ton compte'}
          detail={!account ? 'Facultatif : sauvegarde tes courses et retrouve-les sur tous tes appareils'
            : account.error ? 'Synchronisation en échec : touche pour réessayer'
              : account.syncedAt ? `Synchronisé à ${new Date(account.syncedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : 'Connecté'}
          value={account ? undefined : <span className="row-action">Se connecter</span>} href={accountHref} />
      </ListGroup>

      <ListGroup header="Ton rythme" footer={error ?? 'Ton plan part de tes courses : plus elles sont récentes et proches de ta course, plus il est juste.'}>
        {strava?.configured !== false && (
          <ListRow icon={<LinkIcon size={18} />} tone="neutral" title="Strava"
            detail={strava === null ? 'Connexion…' : strava.connected ? 'Connecté : importe tes courses dans Tes références' : 'Tes courses importées en un geste'}
            value={strava?.connected ? 'Connecté' : <span className="row-action">Connecter</span>}
            href={strava?.connected ? hrefs.references : undefined}
            onClick={strava && !strava.connected ? onStrava : undefined} />
        )}
        {strava?.connected && (
          <ListRow icon={<LinkIcon size={18} />} tone="neutral" title={disconnecting ? 'Déconnexion…' : 'Déconnecter Strava'}
            detail="Efface tout ce qui vient de Strava" onClick={() => void disconnect()} disabled={disconnecting} />
        )}
        <ListRow icon={<RouteIcon size={18} />} title="Tes références"
          detail={exampleReferences ? 'Course d\'exemple : remplace-la par les tiennes' : `${referenceCount} course${referenceCount > 1 ? 's' : ''}`}
          value={exampleReferences ? <span className="row-badge">Exemple</span> : undefined} href={hrefs.references} />
        <ListRow icon={<PersonIcon size={18} />} title="Ton profil de coureur"
          detail={runner.profile ? `Pente mesurée sur ${runner.profile.activities} sortie${runner.profile.activities > 1 ? 's' : ''}` : 'Ton rythme en montée et en descente'}
          value={runner.profile || counted ? (runner.use ? 'Utilisé' : 'Pas utilisé') : undefined} href={hrefs.profil} />
        <ListRow icon={<StopwatchIcon size={18} />} title="Retours de course"
          detail={races ? `${races} course${races > 1 ? 's' : ''} analysée${races > 1 ? 's' : ''}` : 'Après ta course : prévu contre réel'}
          href={hrefs.retour} />
      </ListGroup>

      <ListGroup header="Ton plan" footer={exportBlocked ?? undefined}>
        <ListRow icon={<ChartIcon size={18} />} tone="neutral" title="Analyse détaillée" detail="Poids des références, entraînement, tableau complet, scénarios" href={hrefs.analyse} />
        <ListRow icon={<WatchIcon size={18} />} tone="warm" title="Parcours pour ma montre" detail="Garmin (.fit) ou autres marques (.gpx)" onClick={onWatch} disabled={!!exportBlocked} />
        <ListRow icon={<DocIcon size={18} />} tone="neutral" title="PDF résumé" detail="Une page : passages, barrières, ravitos" onClick={() => onPdf('summary')} disabled={!!exportBlocked} />
        <ListRow icon={<DocIcon size={18} />} tone="neutral" title="PDF complet" detail="Tout le plan" onClick={() => onPdf('full')} disabled={!!exportBlocked} />
      </ListGroup>

      <ListGroup header="Ravitime">
        <ListRow icon={<InfoIcon size={18} />} tone="neutral" title="Comment c'est calculé" detail="Le modèle, ses sources, ses limites" href={hrefs.algo} />
        <ListRow icon={<ShieldIcon size={18} />} tone="neutral" title="Confidentialité" detail="Tes données, Strava, comment tout effacer" href={hrefs.confidentialite} />
        {feedbackUrl && <ListRow icon={<ChatIcon size={18} />} tone="neutral" title="Donner mon avis" detail="Un bug, une idée, un plan qui s'est trompé" href={feedbackUrl} external />}
      </ListGroup>
    </div>
  );
}
