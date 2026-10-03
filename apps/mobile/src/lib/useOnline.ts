import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

/** True unless the phone knows it has no internet (unknown counts as online, so we still try). */
export function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => NetInfo.addEventListener((s) => setOnline(s.isInternetReachable !== false && s.isConnected !== false)), []);
  return online;
}
