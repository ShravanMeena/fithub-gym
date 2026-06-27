import { ActionSheetIOS, Alert, Platform } from 'react-native';
import { launchCamera, launchImageLibrary, Asset } from 'react-native-image-picker';

const defaultOpts = {
  mediaType: 'photo' as const,
  includeBase64: true,
  quality: 0.6 as const,
  maxWidth: 1080,
  maxHeight: 1080,
};

// Present a native "Scan with Camera / Upload from Gallery" chooser.
export function chooseImageSource(onPick: (from: 'camera' | 'library') => void) {
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      { options: ['Cancel', '📷 Scan with Camera', '🖼 Upload from Gallery'], cancelButtonIndex: 0 },
      (i) => { if (i === 1) onPick('camera'); else if (i === 2) onPick('library'); }
    );
  } else {
    Alert.alert('Add Photo', 'Choose a source', [
      { text: '📷 Scan with Camera', onPress: () => onPick('camera') },
      { text: '🖼 Upload from Gallery', onPress: () => onPick('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }
}

// Launch the chosen source and return the picked asset (with base64), or null.
export async function captureImage(from: 'camera' | 'library'): Promise<Asset | null> {
  const res = from === 'camera' ? await launchCamera(defaultOpts) : await launchImageLibrary(defaultOpts);
  if (res.didCancel) return null;
  if (res.errorCode) {
    Alert.alert('Image error', res.errorMessage || res.errorCode);
    return null;
  }
  return res.assets?.[0] || null;
}

// Convenience: show chooser, then capture, then hand the asset to a callback.
export function scanOrUpload(onAsset: (asset: Asset) => void) {
  chooseImageSource(async (from) => {
    const asset = await captureImage(from);
    if (asset?.base64) onAsset(asset);
  });
}

// Pick a short video from the gallery (image-picker doesn't reliably return
// base64 for video, so we read the file ourselves at upload time).
export async function pickVideo(): Promise<Asset | null> {
  const res = await launchImageLibrary({
    mediaType: 'video',
    selectionLimit: 1,
  });
  if (res.didCancel) return null;
  if (res.errorCode) {
    Alert.alert('Video error', res.errorMessage || res.errorCode);
    return null;
  }
  return res.assets?.[0] || null;
}

// Read a local file URI into base64 (works for the video the picker returns).
export async function uriToBase64(uri: string): Promise<string> {
  const resp = await fetch(uri);
  const blob = await resp.blob();
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = reject;
    fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
    fr.readAsDataURL(blob);
  });
}
