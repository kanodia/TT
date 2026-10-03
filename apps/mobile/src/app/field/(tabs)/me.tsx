import Constants from 'expo-constants';
import type { MessageKey } from '@shared/i18n';
import { Alert, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, C, Card, Row, Txt } from '@/components/ui';
import { clearFieldData } from '@/lib/fieldQueue';
import { useFieldSync } from '@/lib/fieldSync';
import { useSession } from '@/lib/session';

/** Field agent's account: language, sign-out (warns about unsent captures), app version. */
export default function FieldMe() {
  const { me, t, lang, setLang, signOut, config } = useSession();
  const insets = useSafeAreaInsets();
  const { queue, visits } = useFieldSync();
  const unsent = queue.length + visits.length;

  function out() {
    const go = async () => {
      await clearFieldData();
      await signOut();
    };
    if (!unsent) return void go();
    Alert.alert(t('fme.unsentTitle', { n: unsent }), t('fme.unsentBody'), [
      { text: t('action.cancel'), style: 'cancel' },
      { text: t('auth.signOut'), style: 'destructive', onPress: () => void go() },
    ]);
  }

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingTop: insets.top + 12, gap: 16 }}>
      <Txt v="h1">{me?.name ?? t('tab.account')}</Txt>
      <Txt muted>
        +91 {me?.phone} · {me ? t(`role.${me.role}` as MessageKey) : ''}
      </Txt>
      <Card style={{ gap: 8 }}>
        <Txt v="h3">{t('account.language')}</Txt>
        <Row>
          <Button style={{ flex: 1 }} small kind="outline" active={lang === 'en'} title="English" onPress={() => setLang('en')} />
          <Button style={{ flex: 1 }} small kind="outline" active={lang === 'hi'} title="हिन्दी" onPress={() => setLang('hi')} />
        </Row>
      </Card>
      <Button kind="outline" title={t('auth.signOut')} onPress={out} />
      <Txt v="tiny" muted style={{ textAlign: 'center' }}>
        {Constants.expoConfig?.name} {Constants.expoConfig?.version} · {config.brand.supportEmail}
      </Txt>
    </ScrollView>
  );
}
