'use client';

import Link from 'next/link';
import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';
import { ApiError, api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { Me } from '@/lib/types';
import { ErrorNote, Loading } from './ui';

type Tokens = { accessToken: string; refreshToken: string };
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

declare global {
  interface Window {
    google?: { accounts: { id: { initialize: (o: object) => void; renderButton: (el: HTMLElement, o: object) => void } } };
  }
}

/** Google Identity Services button; only shown when both the API and the web app are configured. */
function GoogleButton({ onToken }: { onToken: (idToken: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!loaded || !ref.current || !window.google) return;
    window.google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: (r: { credential: string }) => onToken(r.credential) });
    window.google.accounts.id.renderButton(ref.current, { theme: 'outline', size: 'large', width: 320, text: 'continue_with' });
  }, [loaded, onToken]);
  return (
    <>
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onLoad={() => setLoaded(true)} />
      <div ref={ref} className="flex justify-center" />
    </>
  );
}

/** Phone + OTP sign-in (spec: phone is the identity; no passwords). */
export function LoginForm({ onDone, intro }: { onDone?: () => void; intro?: string }) {
  const { signIn, config, t } = useSession();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function requestOtp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ sent: boolean; devCode?: string }>('/v1/auth/otp/request', { method: 'POST', body: { phone }, token: null });
      setDevCode(r.devCode ?? null);
      setStep('code');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = { phone, code, ...(name.trim() ? { name: name.trim() } : {}) };
      // Linking a Google account on first use sends the phone + code along with its token.
      const r = googleToken
        ? await api<Tokens>('/v1/auth/oauth/google', { method: 'POST', body: { ...body, idToken: googleToken }, token: null })
        : await api<Tokens>('/v1/auth/otp/verify', { method: 'POST', body, token: null });
      await signIn(r);
      onDone?.();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function google(idToken: string) {
    setError(null);
    try {
      await signIn(await api<Tokens>('/v1/auth/oauth/google', { method: 'POST', body: { idToken }, token: null }));
      onDone?.();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'phone_required') {
        setGoogleToken(idToken);
        setError(err.message);
      } else setError(errorMessage(err));
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{t('auth.title')}</h1>
        <p className="mt-1 text-sm text-muted">{intro ?? t('auth.intro')}</p>
      </div>
      <ErrorNote message={error} />
      {step === 'phone' ? (
        <form onSubmit={requestOtp} className="space-y-3">
          <label className="block">
            <span className="label">{t('auth.mobile')}</span>
            <div className="flex items-center gap-2">
              <span className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">+91</span>
              <input
                className="input"
                inputMode="numeric"
                autoComplete="tel-national"
                maxLength={10}
                placeholder="98xxxxxxxx"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                autoFocus
                required
              />
            </div>
          </label>
          <button className="btn-primary w-full" disabled={busy || phone.length !== 10}>
            {busy ? t('auth.sending') : t('auth.sendOtp')}
          </button>
          {config.features.socialLogin.google && GOOGLE_CLIENT_ID && !googleToken && (
            <>
              <div className="flex items-center gap-3 text-xs text-muted">
                <span className="h-px flex-1 bg-border" />
                or
                <span className="h-px flex-1 bg-border" />
              </div>
              <GoogleButton onToken={google} />
            </>
          )}
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-3">
          <p className="text-sm">
            {t('auth.codeSentTo')} <b>+91 {phone}</b>{' '}
            <button type="button" className="text-brand underline" onClick={() => setStep('phone')}>
              {t('action.change')}
            </button>
          </p>
          {devCode && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {t('auth.devCode')} <b className="font-mono">{devCode}</b>
            </p>
          )}
          <label className="block">
            <span className="label">{t('auth.code')}</span>
            <input
              className="input font-mono tracking-[0.5em]"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              autoFocus
              required
            />
          </label>
          <label className="block">
            <span className="label">{t('auth.name')}</span>
            <input className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          </label>
          <button className="btn-primary w-full" disabled={busy || code.length !== 6}>
            {busy ? t('auth.verifying') : t('auth.verify')}
          </button>
        </form>
      )}
    </div>
  );
}

/** Renders children only for a signed-in user (optionally with one of `roles`). */
export function RequireAuth({
  children,
  roles,
  intro,
}: {
  children: (me: Me) => React.ReactNode;
  roles?: Me['role'][];
  intro?: string;
}) {
  const { me, ready, t } = useSession();
  if (!ready) return <Loading />;
  if (!me) {
    return (
      <div className="mx-auto max-w-sm px-4 py-12">
        <LoginForm intro={intro} />
      </div>
    );
  }
  if (roles && !roles.includes(me.role)) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-4xl">🔒</p>
        <h1 className="mt-3 text-lg font-semibold">{t('auth.noAccess')}</h1>
        <p className="mt-1 text-sm text-muted">{t('auth.noAccessBody', { phone: me.phone })}</p>
        <Link href="/" className="btn-outline mt-5">
          {t('action.goHome')}
        </Link>
      </div>
    );
  }
  return <>{children(me)}</>;
}
