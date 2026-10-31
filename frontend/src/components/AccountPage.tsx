import { useEffect, useState, type FormEvent } from 'react';
import type { User } from '@supabase/supabase-js';
import { accountClient, accountProblem, sendCode, verifyCode, type AccountUnavailable } from '../api/account';
import { CloudIcon, DevicesIcon, KeyIcon } from './Icons';

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
  const [problem, setProblem] = useState<AccountUnavailable>('offline');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const check = () => {
    setAvailable(null);
    void accountClient().then((c) => { setAvailable(c !== null); setProblem(accountProblem()); });
  };
  useEffect(check, []);

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
    const status = sync.state === 'busy' ? { tone: 'busy', text: 'Synchronisation…' }
      : sync.state === 'error' ? { tone: 'error', text: 'Synchronisation en échec' }
        : { tone: 'ok', text: sync.at ? `Synchronisé à ${time(sync.at)}` : 'Connecté' };
    return (
      <div className="account-shell">
        <section className="account-card">
          <div className="account-who">
            <span className="account-avatar big" aria-hidden>{(user.email ?? '?').charAt(0).toUpperCase()}</span>
            <div>
              <h1>Ton compte</h1>
              <p>{user.email}</p>
            </div>
          </div>
          <p className={`account-status ${status.tone}`} role="status"><span aria-hidden />{status.text}</p>
          {sync.state === 'error' && <p className="field-error">{sync.error}</p>}
          <ul className="account-facts">
            <li><strong>{raceCount}</strong><span>course{raceCount > 1 ? 's' : ''} sauvegardée{raceCount > 1 ? 's' : ''}</span></li>
            <li><strong>✓</strong><span>réglages et références sauvegardés</span></li>
          </ul>
          <div className="account-actions">
            <button type="button" onClick={onSyncNow} disabled={sync.state === 'busy'}>Synchroniser maintenant</button>
            <button type="button" className="ghost" disabled={busy} onClick={() => void run(onSignOut)}>Se déconnecter</button>
          </div>
          <p className="account-note">En te déconnectant, tes courses restent sur cet appareil. Tes données Strava ne
            partent jamais dans ton compte : connecte Strava sur chaque appareil.</p>
          {error && <p className="field-error" role="alert">{error}</p>}
        </section>
        <details className="account-danger">
          <summary>Supprimer mon compte</summary>
          <p>Ton compte, tes courses et tes réglages sauvegardés sont effacés définitivement. Ce qui est sur cet appareil
            y reste.</p>
          <button type="button" className="danger" disabled={busy}
            onClick={() => { if (window.confirm('Supprimer définitivement ton compte Ravitime ?')) void run(onDelete); }}>
            Supprimer définitivement
          </button>
        </details>
      </div>
    );
  }

  return (
    <div className="account-shell">
      <section className="account-card">
        <img className="account-logo" src="/icon.svg" alt="" width={56} height={56} />
        <h1>{step === 'email' ? 'Ton compte Ravitime' : 'Vérifie tes e-mails'}</h1>
        <p className="account-lead">
          {step === 'email' ? 'Retrouve tes courses sur ton téléphone comme sur ordinateur.'
            : <>Code envoyé à <strong>{email.trim()}</strong>. Il arrive en général en moins d'une minute.</>}
        </p>

        {available === false ? (
          <div className="account-off">
            <p>{problem === 'disabled' ? 'Les comptes ne sont pas encore activés sur Ravitime.'
              : 'Le serveur ne répond pas : vérifie ta connexion. S\'il dormait, il met environ une minute à se réveiller.'}</p>
            <button type="button" className="ghost" onClick={check}>Réessayer</button>
          </div>
        ) : step === 'email' ? (
          <form className="account-form" onSubmit={askCode} noValidate>
            <label>
              <span>Adresse e-mail</span>
              <input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="prenom@exemple.fr" autoFocus />
            </label>
            <button type="submit" disabled={busy || available === null}>{busy ? 'Envoi…' : 'Recevoir un code'}</button>
          </form>
        ) : (
          <form className="account-form" onSubmit={checkCode} noValidate>
            <label>
              <span>Code à 6 chiffres</span>
              <input inputMode="numeric" autoComplete="one-time-code" value={code} maxLength={10}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="••••••" autoFocus className="account-code" />
            </label>
            <button type="submit" disabled={busy || code.length < 6}>{busy ? 'Vérification…' : 'Me connecter'}</button>
            <p className="account-links">
              <button type="button" className="link-btn" disabled={busy} onClick={() => askCode()}>Renvoyer un code</button>
              <button type="button" className="link-btn" onClick={() => { setStep('email'); setError(null); }}>Changer d'adresse</button>
            </p>
            <p className="account-note">Pas reçu ? Regarde dans les indésirables : il vient de connexion@ravitime.fr.</p>
          </form>
        )}
        {error && <p className="field-error" role="alert">{error}</p>}

        {step === 'email' && (
          <ul className="account-perks">
            <li><span aria-hidden><CloudIcon size={20} /></span>Tes courses, ton sac et tes réglages sauvegardés</li>
            <li><span aria-hidden><DevicesIcon size={20} /></span>Les mêmes sur ton téléphone et sur ordinateur</li>
            <li><span aria-hidden><KeyIcon size={20} /></span>Pas de mot de passe : un code par e-mail</li>
          </ul>
        )}
      </section>
      <p className="account-foot">Facultatif : Ravitime marche aussi sans compte. Tes données Strava n'y sont jamais
        envoyées. <a href="#confidentialite">Confidentialité</a></p>
    </div>
  );
}
