import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

export type PickedPhoto = {
  uri: string;
  width: number;
  height: number;
  base64?: string;
  /** Camera GPS and time from EXIF, read before compression drops it (field QA only, spec 7.3). */
  exif?: { lat?: number; lng?: number; takenAt?: string };
};

/** EXIF "2026:10:03 14:22:01" → ISO. */
function exifDate(v: unknown) {
  if (typeof v !== 'string') return undefined;
  const m = v.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  return m ? new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`).toISOString() : undefined;
}

function readExif(exif: Record<string, unknown> | null | undefined): PickedPhoto['exif'] {
  if (!exif) return undefined;
  const lat = Number(exif.GPSLatitude);
  const lng = Number(exif.GPSLongitude);
  const out = {
    ...(Number.isFinite(lat) && Number.isFinite(lng) && (lat || lng)
      ? { lat: exif.GPSLatitudeRef === 'S' ? -Math.abs(lat) : lat, lng: exif.GPSLongitudeRef === 'W' ? -Math.abs(lng) : lng }
      : {}),
    ...(exifDate(exif.DateTimeOriginal) ? { takenAt: exifDate(exif.DateTimeOriginal) } : {}),
  };
  return Object.keys(out).length ? out : undefined;
}

/**
 * Takes or picks photos and shrinks them on the phone (JPEG, longest side `maxSide`) so uploads work on 3G.
 * Returns [] if the user cancels; throws a readable error if permission is refused.
 */
export async function pickPhotos(opts: { source: 'camera' | 'library'; max?: number; maxSide?: number; base64?: boolean; exif?: boolean; deniedMessage: string }): Promise<PickedPhoto[]> {
  const { source, max = 1, maxSide = 1600 } = opts;
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error(opts.deniedMessage);
  }
  const pickerOpts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, exif: !!opts.exif, allowsMultipleSelection: source === 'library' && max > 1, selectionLimit: max };
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(pickerOpts) : await ImagePicker.launchImageLibraryAsync(pickerOpts);
  if (result.canceled) return [];
  const out: PickedPhoto[] = [];
  for (const a of result.assets.slice(0, max)) {
    const scale = Math.min(1, maxSide / Math.max(a.width || maxSide, a.height || maxSide));
    const ctx = ImageManipulator.manipulate(a.uri);
    if (scale < 1) ctx.resize({ width: Math.round(a.width * scale) });
    const img = await ctx.renderAsync();
    const saved = await img.saveAsync({ format: SaveFormat.JPEG, compress: 0.75, base64: !!opts.base64 });
    out.push({ uri: saved.uri, width: saved.width, height: saved.height, base64: saved.base64, exif: opts.exif ? readExif(a.exif) : undefined });
  }
  return out;
}
