import { useEffect, useState, type FormEvent } from 'react';
import type { User } from '@supabase/supabase-js';
import { accountClient, sendCode, verifyCode } from '../api/account';

interface Props {
  user: User | null;
  sync: { state: 'idle' | 'busy' | 'error'; at: string | null; error?: string };
  raceCount: number;
  onSignedIn: (user: User) => void;
  onSyncNow: () => void;
  onSignOut: () => Promise<void>;
  onDelete: () => Promise<void>;
}

const time = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

/**
 * Ton compte (facultatif) : connexion par un code reçu par e-mail, sans mot de passe. Il sauvegarde tes courses et tes
 * réglages pour les retrouver sur tous tes appareils ; l'appli marche aussi bien sans.
 */
export function AccountPage({ user, sync, raceCount, onSignedIn, onSyncNow, onSignOut, onDelete }: Props) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void accountClient().then((c) => setAvailable(c !== null)); }, []);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function askCode(e?: FormEvent) {
    e?.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Saisis ton adresse e-mail.');
      return;
    }
    void run(async () => {
      await sendCode(email);
      setCode('');
      setStep('code');
    });
  }

  function checkCode(e: FormEvent) {
    e.preventDefault();
    void run(async () => onSignedIn(await verifyCode(email, code)));
  }

  if (user) {
    return (
      <section className="card account">
        <h2>Ton compte</h2>
        <p>Connecté avec <strong>{user.email}</strong>.</p>
        <p className="muted small" role="status">
          {sync.state === 'busy' ? 'Synchronisation…'
            : sync.state === 'error' ? `La synchronisation a échoué : ${sync.error ?? 'réessaie'}`
              : sync.at ? `${raceCount === 0 ? 'Tes réglages sont sauvegardés' : raceCount === 1 ? 'Ta course et tes réglages sont sauvegardés'
                : `Tes ${raceCount} courses et tes réglages sont sauvegardés`} (synchronisé à ${time(sync.at)}).`
                : 'Tes courses et tes réglages sont sauvegardés dans ton compte.'}
        </p>
        <div className="account-actions">
          <button type="button" className="ghost" onClick={onSyncNow} disabled={sync.state === 'busy'}>Synchroniser maintenant</button>
          <button type="button" className="ghost" disabled={busy} onClick={() => void run(onSignOut)}>Se déconnecter</button>
        </div>
        <p className="muted small">
          En te déconnectant, tes courses restent sur cet appareil. Tes données Strava ne sont jamais envoyées dans ton
          compte : connecte Strava sur chaque appareil.
        </p>
        <details className="account-danger">
          <summary>Supprimer mon compte</summary>
          <p className="small">Ton compte, tes courses et tes réglages sauvegardés sont effacés définitivement. Ce qui est
            sur cet appareil y reste.</p>
          <button type="button" className="danger" disabled={busy}
            onClick={() => { if (window.confirm('Supprimer définitivement ton compte Ravitime ?')) void run(onDelete); }}>
            Supprimer définitivement
          </button>
        </details>
        {error && <p className="field-error" role="alert">{error}</p>}
      </section>
    );
  }

  return (
    <section className="card account">
      <h2>Ton compte</h2>
      <p>Facultatif : il sauvegarde tes courses et tes réglages, et tu les retrouves sur ton téléphone comme sur
        ordinateur. Pas de mot de passe : tu reçois un code par e-mail.</p>
      {available === false ? (
        <p className="muted">Les comptes ne sont pas disponibles pour le moment. Vérifie ta connexion et réessaie.</p>
      ) : step === 'email' ? (
        <form className="account-form" onSubmit={askCode} noValidate>
          <label>
            <span>Ton adresse e-mail</span>
            <input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="prenom@exemple.fr" autoFocus />
          </label>
          <button type="submit" disabled={busy || available === null}>{busy ? 'Envoi…' : 'Recevoir un code'}</button>
        </form>
      ) : (
        <form className="account-form" onSubmit={checkCode} noValidate>
          <p className="small">Code envoyé à <strong>{email}</strong>. Il arrive en général en moins d'une minute (pense aux
            indésirables).</p>
          <label>
            <span>Code reçu</span>
            <input inputMode="numeric" autoComplete="one-time-code" value={code} maxLength={10}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="123456" autoFocus className="account-code" />
          </label>
          <button type="submit" disabled={busy || code.length < 6}>{busy ? 'Vérification…' : 'Me connecter'}</button>
          <p className="small">
            <button type="button" className="link-btn" disabled={busy} onClick={() => askCode()}>Renvoyer un code</button>
            {' · '}
            <button type="button" className="link-btn" onClick={() => { setStep('email'); setError(null); }}>Changer d'adresse</button>
          </p>
        </form>
      )}
      {error && <p className="field-error" role="alert">{error}</p>}
      <p className="muted small">Tes données Strava ne sont jamais envoyées dans ton compte. Détails dans{' '}
        <a href="#confidentialite">Confidentialité</a>.</p>
    </section>
  );
}
