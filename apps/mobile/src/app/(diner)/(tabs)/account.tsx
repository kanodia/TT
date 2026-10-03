import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, Share, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Me, NotificationPrefs } from '@shared/types';
import { RequireAuth } from '@/components/RequireAuth';
import { Button, C, Card, Divider, ErrorNote, Field, Row, Txt, useFlash } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { WEB_URL } from '@/lib/env';
import { useBrand, useSession } from '@/lib/session';

function Account({ me }: { me: Me }) {
  const { refreshMe, signOut, lang, setLang, t, config } = useSession();
  const brand = useBrand();
  const [name, setName] = useState(me.name ?? '');
  const [email, setEmail] = useState(me.email ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useFlash();
  const prefs: NotificationPrefs = { sms: true, email: true, push: true, digest: true, ...me.notificationPrefs };

  async function patch(body: Record<string, unknown>, msg = t('account.saved')) {
    setError(null);
    try {
      await api('/v1/me', { method: 'PATCH', body });
      await refreshMe();
      setFlash(msg);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function exportData() {
    try {
      const data = await api('/v1/me/export');
      await Share.share({ title: 'my-data.json', message: JSON.stringify(data, null, 2) });
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  function deleteAccount() {
    Alert.alert(t('account.delete'), t('account.deleteConfirm'), [
      { text: t('action.cancel'), style: 'cancel' },
      {
        text: t('account.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await api('/v1/me', { method: 'DELETE' });
            await signOut();
            Alert.alert(t('account.deleteScheduled'));
          } catch (e) {
            setError(errorMessage(e));
          }
        },
      },
    ]);
  }

  // Partner portal and admin are web apps (spec 1); the diner app links out to them.
  const areas = [
    { icon: '🔔', title: t('notif.title'), sub: me.unreadNotifications ? t('account.unread', { n: me.unreadNotifications }) : t('notif.empty'), go: () => router.push('/notifications'), show: true },
    { icon: '🏪', title: t('account.partner'), sub: me.memberships.length ? t('account.restaurants', { n: me.memberships.length }) : t('account.partnerSub'), go: () => WebBrowser.openBrowserAsync(`${WEB_URL}/partner`), show: true },
    { icon: '🛠️', title: t('account.admin'), sub: t('account.adminSub'), go: () => WebBrowser.openBrowserAsync(`${WEB_URL}/admin`), show: ['field_supervisor', 'admin'].includes(me.role) },
  ].filter((a) => a.show);

  const toggle = (k: keyof NotificationPrefs, label: string) => (
    <Row key={k} style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
      <Txt v="small" style={{ flex: 1 }}>
        {label}
      </Txt>
      <Switch value={prefs[k] !== false} onValueChange={(v) => patch({ notificationPrefs: { ...prefs, [k]: v } })} trackColor={{ true: brand }} />
    </Row>
  );

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <Row gap={12}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: `${brand}1a`, alignItems: 'center', justifyContent: 'center' }}>
          <Txt v="h2" color={brand}>
            {(me.name ?? me.phone).slice(0, 1).toUpperCase()}
          </Txt>
        </View>
        <View style={{ flex: 1 }}>
          <Txt v="h2">{me.name ?? t('account.title')}</Txt>
          <Txt muted>+91 {me.phone}</Txt>
        </View>
      </Row>
      <ErrorNote message={error} />

      <Card style={{ padding: 0 }}>
        {areas.map((a, i) => (
          <View key={a.title}>
            {i > 0 ? <Divider /> : null}
            <Pressable onPress={a.go} style={{ padding: 14, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <Txt v="h3">{a.icon}</Txt>
              <View style={{ flex: 1 }}>
                <Txt bold>{a.title}</Txt>
                <Txt v="tiny" muted>
                  {a.sub}
                </Txt>
              </View>
              <Txt muted>›</Txt>
            </Pressable>
          </View>
        ))}
      </Card>

      <Card style={{ gap: 12 }}>
        <Txt v="h3">{t('account.profile')}</Txt>
        <Field label={t('account.name')} value={name} onChangeText={setName} maxLength={80} />
        <Field label={t('account.email')} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        <Button
          title={t('action.save')}
          busy={busy}
          onPress={async () => {
            setBusy(true);
            await patch({ name: name.trim(), email: email.trim() || null });
            setBusy(false);
          }}
        />
      </Card>

      <Card style={{ gap: 8 }}>
        <Txt v="h3">{t('account.language')}</Txt>
        <Row>
          <Button style={{ flex: 1 }} small kind="outline" active={lang === 'en'} title="English" onPress={() => setLang('en')} />
          <Button style={{ flex: 1 }} small kind="outline" active={lang === 'hi'} title="हिन्दी" onPress={() => setLang('hi')} />
        </Row>
      </Card>

      <Card style={{ gap: 4 }}>
        <Txt v="h3" style={{ marginBottom: 4 }}>
          {t('account.notifications')}
        </Txt>
        {toggle('push', t('account.pref.push'))}
        {toggle('sms', t('account.pref.sms'))}
        {toggle('email', t('account.pref.email'))}
        {me.memberships.length ? toggle('digest', t('account.pref.digest')) : null}
      </Card>

      <Card style={{ gap: 10 }}>
        <Txt v="h3">{t('account.privacy')}</Txt>
        <Txt v="small" muted>
          {t('account.privacyBody')}
        </Txt>
        <Button kind="outline" title={t('account.export')} onPress={exportData} />
        <Button kind="ghost" title={t('account.delete')} onPress={deleteAccount} style={{ borderColor: C.border }} />
        <Row style={{ justifyContent: 'center' }} gap={16}>
          <Pressable onPress={() => WebBrowser.openBrowserAsync(`${WEB_URL}/privacy`)}>
            <Txt v="tiny" color={brand}>
              {t('legal.privacy')}
            </Txt>
          </Pressable>
          <Pressable onPress={() => WebBrowser.openBrowserAsync(`${WEB_URL}/terms`)}>
            <Txt v="tiny" color={brand}>
              {t('legal.terms')}
            </Txt>
          </Pressable>
        </Row>
      </Card>

      <Button kind="outline" title={t('auth.signOut')} onPress={signOut} />
      <Txt v="tiny" muted style={{ textAlign: 'center' }}>
        {config.brand.appName} · {config.brand.supportEmail}
      </Txt>
      {flash}
    </ScrollView>
  );
}

export default function AccountScreen() {
  const insets = useSafeAreaInsets();
  const { t, lang, setLang } = useSession();
  return (
    <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: C.bg }}>
      <RequireAuth intro={t('auth.intro')}>{(me) => <Account me={me} />}</RequireAuth>
      <Pressable onPress={() => setLang(lang === 'en' ? 'hi' : 'en')} style={{ position: 'absolute', top: insets.top + 8, right: 16 }} hitSlop={8}>
        <Txt bold>{lang === 'en' ? 'हि' : 'EN'}</Txt>
      </Pressable>
    </View>
  );
}
