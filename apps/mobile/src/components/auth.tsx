import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { api, errorMessage } from '@/lib/api';
import { WEB_URL } from '@/lib/env';
import { useBrand, useSession } from '@/lib/session';
import { Button, ErrorNote, Field, Note, Row, Txt } from './ui';

type Tokens = { accessToken: string; refreshToken: string };

/** Phone + OTP sign-in (spec: phone is the identity; no passwords). */
export function LoginForm({ onDone, intro }: { onDone?: () => void; intro?: string }) {
  const { signIn, t } = useSession();
  const brand = useBrand();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function requestOtp() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ sent: boolean; devCode?: string }>('/v1/auth/otp/request', { method: 'POST', body: { phone }, token: null });
      setDevCode(r.devCode ?? null);
      setCode('');
      setStep('code');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<Tokens>('/v1/auth/otp/verify', { method: 'POST', body: { phone, code, ...(name.trim() ? { name: name.trim() } : {}) }, token: null });
      await signIn(r);
      onDone?.();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 14 }}>
      <View>
        <Txt v="h2">{t('auth.title')}</Txt>
        <Txt muted style={{ marginTop: 4 }}>
          {intro ?? t('auth.intro')}
        </Txt>
      </View>
      <ErrorNote message={error} />
      {step === 'phone' ? (
        <>
          <View style={{ gap: 4 }}>
            <Txt v="small" bold>
              {t('auth.mobile')}
            </Txt>
            <Row>
              <View style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, backgroundColor: '#f4f4f5' }}>
                <Text>+91</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Field
                  value={phone}
                  onChangeText={(v) => setPhone(v.replace(/\D/g, '').slice(0, 10))}
                  keyboardType="number-pad"
                  autoComplete="tel"
                  textContentType="telephoneNumber"
                  placeholder="98xxxxxxxx"
                  maxLength={10}
                  autoFocus
                  accessibilityLabel={t('auth.mobile')}
                  returnKeyType="done"
                  onSubmitEditing={() => phone.length === 10 && requestOtp()}
                />
              </View>
            </Row>
          </View>
          <Button title={busy ? t('auth.sending') : t('auth.sendOtp')} onPress={requestOtp} disabled={phone.length !== 10} busy={busy} />
        </>
      ) : (
        <>
          <Row style={{ flexWrap: 'wrap' }} gap={4}>
            <Txt v="small">{t('auth.codeSentTo')}</Txt>
            <Txt v="small" bold>
              +91 {phone}
            </Txt>
            <Pressable onPress={() => setStep('phone')} hitSlop={8}>
              <Txt v="small" color={brand} style={{ textDecorationLine: 'underline' }}>
                {t('action.change')}
              </Txt>
            </Pressable>
          </Row>
          {devCode ? (
            <Note>
              <Txt v="small" color="#92400e">
                {t('auth.devCode')} <Text style={{ fontWeight: '700', fontFamily: 'monospace' }}>{devCode}</Text>
              </Txt>
            </Note>
          ) : null}
          <Field
            label={t('auth.code')}
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            autoComplete="sms-otp"
            textContentType="oneTimeCode"
            maxLength={6}
            autoFocus
            style={{ letterSpacing: 8, fontFamily: 'monospace', fontSize: 18 }}
          />
          <Field label={t('auth.name')} value={name} onChangeText={setName} maxLength={80} autoComplete="name" />
          <Button title={busy ? t('auth.verifying') : t('auth.verify')} onPress={verify} disabled={code.length !== 6} busy={busy} />
        </>
      )}
      <Txt v="tiny" muted style={{ textAlign: 'center' }}>
        {t('auth.agree')}{' '}
        <Txt v="tiny" style={{ textDecorationLine: 'underline' }} color={brand} onPress={() => WebBrowser.openBrowserAsync(`${WEB_URL}/terms`)}>
          {t('legal.terms')}
        </Txt>{' '}
        {t('legal.and')}{' '}
        <Txt v="tiny" style={{ textDecorationLine: 'underline' }} color={brand} onPress={() => WebBrowser.openBrowserAsync(`${WEB_URL}/privacy`)}>
          {t('legal.privacy')}
        </Txt>
        .
      </Txt>
    </View>
  );
}
