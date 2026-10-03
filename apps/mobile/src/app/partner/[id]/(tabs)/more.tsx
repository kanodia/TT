import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, ScrollView, Switch, View } from 'react-native';
import type { MessageKey } from '@shared/i18n';
import type { NotificationPrefs, PartnerArea } from '@shared/types';
import { usePartner } from '@/components/partner/context';
import { Button, C, Card, Chip, Divider, ErrorNote, Row, Txt, useFlash } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { WEB_URL } from '@/lib/env';
import { useBrand, useSession } from '@/lib/session';

/** Closed until the end of the chosen day, India time. */
function untilIST(daysFromNow: number) {
  const d = new Date(Date.now() + daysFromNow * 864e5).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  return new Date(`${d}T23:59:00+05:30`).toISOString();
}

/** Holiday switch, hours, offers, alerts — and the rarer tasks that open the website. */
export default function PartnerMore() {
  const { restaurant: r, reload, can } = usePartner();
  const { t, me, refreshMe, signOut, lang, setLang } = useSession();
  const brand = useBrand();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useFlash();
  const closedUntil = r.temporarilyClosedUntil && new Date(r.temporarilyClosedUntil) > new Date() ? r.temporarilyClosedUntil : null;
  const prefs: NotificationPrefs = { sms: true, email: true, push: true, digest: true, ...me?.notificationPrefs };

  async function setClosed(until: string | null) {
    setBusy(true);
    setError(null);
    try {
      await api(`/v1/partner/restaurants/${r.id}/temporarily-closed`, { method: 'PUT', body: { until } });
      setFlash(t('account.saved'));
      reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function setPref(k: keyof NotificationPrefs, v: boolean) {
    await api('/v1/me', { method: 'PATCH', body: { notificationPrefs: { ...prefs, [k]: v } } }).catch(() => {});
    await refreshMe();
  }

  const row = (icon: string, label: string, go: () => void, show = true) =>
    show ? (
      <Pressable key={label} onPress={go} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
        <Txt>{icon}</Txt>
        <Txt style={{ flex: 1 }}>{label}</Txt>
        <Txt muted>›</Txt>
      </Pressable>
    ) : null;
  const web = (path: string) => () => WebBrowser.openBrowserAsync(`${WEB_URL}/partner/${r.id}${path}`);
  const allowed = (a: PartnerArea) => can(a);

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 48 }}>
      <ErrorNote message={error} />
      {can('profile') ? (
        <Card style={{ gap: 8 }}>
          <Txt v="h3">{t('tempClosed.title')}</Txt>
          <Txt v="small" muted>
            {t('tempClosed.body')}
          </Txt>
          {closedUntil ? (
            <>
              <Txt v="small" bold color={C.bad}>
                {t('dash.tempClosed', { date: new Date(closedUntil).toLocaleDateString('en-IN') })}
              </Txt>
              <Button title={t('tempClosed.reopen')} busy={busy} onPress={() => setClosed(null)} />
            </>
          ) : (
            <Row style={{ flexWrap: 'wrap' }} gap={6}>
              <Chip label={t('tempClosed.today')} onPress={() => setClosed(untilIST(0))} disabled={busy} />
              {[1, 3, 7, 14].map((n) => (
                <Chip key={n} label={t('papp.closedFor', { n })} onPress={() => setClosed(untilIST(n - 1))} disabled={busy} />
              ))}
            </Row>
          )}
        </Card>
      ) : null}

      <Card style={{ paddingVertical: 4 }}>
        {[
          row('🕒', t('ptab.hours'), () => router.push({ pathname: '/partner/[id]/hours', params: { id: r.id } }), allowed('profile')),
          row('🏷️', t('ptab.offers'), () => router.push({ pathname: '/partner/[id]/offers', params: { id: r.id } }), allowed('offers')),
        ]}
      </Card>

      <Card style={{ gap: 2 }}>
        <Txt v="h3" style={{ marginBottom: 4 }}>
          {t('psettings.notifications')}
        </Txt>
        {(['push', 'sms', 'email', 'digest'] as const).map((k) => (
          <Row key={k} style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
            <Txt v="small" style={{ flex: 1 }}>
              {k === 'push' ? t('account.pref.push') : t(`psettings.pref.${k}` as MessageKey)}
            </Txt>
            <Switch value={prefs[k] !== false} onValueChange={(v) => setPref(k, v)} trackColor={{ true: brand }} />
          </Row>
        ))}
      </Card>

      <Card style={{ paddingVertical: 4 }}>
        <Txt v="tiny" muted style={{ paddingTop: 10 }}>
          {t('papp.onWebsite')}
        </Txt>
        {[
          row('📝', t('ptab.profile'), web('/profile'), allowed('profile')),
          row('📅', t('detail.specialHours'), web('/hours'), allowed('profile')),
          row('⬆', t('papp.importOnWeb'), web('/menu'), allowed('menu')),
          row('👥', t('ptab.team'), web('/team'), allowed('team')),
          row('📄', t('psettings.documents'), web('/settings'), allowed('core')),
        ]}
      </Card>

      <View style={{ gap: 4 }}>
        <Divider />
        <Row style={{ justifyContent: 'center', paddingTop: 10 }} gap={20}>
          <Pressable onPress={() => router.navigate('/partner')} hitSlop={8}>
            <Txt v="small" color={brand}>
              {t('partner.myRestaurants')}
            </Txt>
          </Pressable>
          <Pressable onPress={() => setLang(lang === 'en' ? 'hi' : 'en')} hitSlop={8}>
            <Txt v="small" color={brand}>
              {lang === 'en' ? 'हिन्दी' : 'English'}
            </Txt>
          </Pressable>
          <Pressable onPress={signOut} hitSlop={8}>
            <Txt v="small" muted>
              {t('auth.signOut')}
            </Txt>
          </Pressable>
        </Row>
      </View>
      {flash}
    </ScrollView>
  );
}
