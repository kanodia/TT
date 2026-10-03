import { Image } from 'expo-image';
import { useState } from 'react';
import { FlatList, Modal, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { media } from '@/lib/api';

/** Full-screen photo viewer; swipe between photos. */
export function Lightbox({ urls, index, onClose }: { urls: string[]; index: number; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [i, setI] = useState(index);
  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <FlatList
          data={urls}
          horizontal
          pagingEnabled
          initialScrollIndex={index}
          getItemLayout={(_, k) => ({ length: width, offset: width * k, index: k })}
          keyExtractor={(u, k) => `${u}${k}`}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setI(Math.round(e.nativeEvent.contentOffset.x / width))}
          renderItem={({ item }) => <Image source={media(item, 'lg')} style={{ width, height }} contentFit="contain" />}
        />
        <Pressable onPress={onClose} hitSlop={16} style={{ position: 'absolute', top: insets.top + 12, right: 16 }} accessibilityRole="button" accessibilityLabel="Close">
          <Text style={{ color: '#fff', fontSize: 28 }}>✕</Text>
        </Pressable>
        {urls.length > 1 ? (
          <Text style={{ position: 'absolute', bottom: insets.bottom + 20, alignSelf: 'center', color: 'rgba(255,255,255,0.85)' }}>
            {i + 1} / {urls.length}
          </Text>
        ) : null}
      </View>
    </Modal>
  );
}
