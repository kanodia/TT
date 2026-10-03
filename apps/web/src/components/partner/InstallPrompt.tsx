'use client';

import { useEffect, useState } from 'react';
import { useSession } from '@/lib/session';

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
const DISMISSED_KEY = 'tt_partner_install_dismissed';

/**
 * "Install the partner app" banner. Android/desktop Chrome get the browser's install prompt;
 * iPhone shows the Share → Add to Home Screen steps. Hidden once installed or dismissed.
 */
export function InstallPrompt() {
  const { t } = useSession();
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISSED_KEY) === '1';
    } catch {
      /* storage unavailable */
    }
    if (standalone || dismissed) return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
      setHidden(false);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    // iOS Safari has no install prompt; show the manual steps on phones there.
    if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
      /* eslint-disable react-hooks/set-state-in-effect -- reads the browser once on mount */
      setIos(true);
      setHidden(false);
      /* eslint-enable react-hooks/set-state-in-effect */
    }
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (hidden) return null;
  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      /* storage unavailable */
    }
  };
  return (
    <div className="card flex flex-wrap items-center gap-3 p-4">
      <span className="text-2xl">📲</span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{t('partner.install.title')}</p>
        <p className="text-sm text-muted">{ios ? t('partner.install.ios') : t('partner.install.body')}</p>
      </div>
      {event && (
        <button
          className="btn-primary"
          onClick={async () => {
            await event.prompt();
            await event.userChoice;
            setEvent(null);
            setHidden(true);
          }}
        >
          {t('partner.install.cta')}
        </button>
      )}
      <button className="btn-ghost text-sm" onClick={dismiss}>
        {t('partner.install.later')}
      </button>
    </div>
  );
}
