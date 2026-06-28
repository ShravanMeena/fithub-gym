// Server-driven app update gate. On launch it asks the server whether to show a
// soft (dismissible) or force (blocking) update card. Title, message, button and
// download link are all dynamic — managed by superadmin.
import React, { useEffect, useState } from 'react';
import { View, Modal, Linking, TouchableOpacity } from 'react-native';
import { Txt, Button } from './UI';
import { AppAPI } from '../api/client';
import { colors, font, radius, shadow, spacing } from '../theme';

type UpdateInfo = {
  update: boolean;
  force?: boolean;
  title?: string;
  message?: string;
  button_text?: string;
  download_url?: string;
};

export function UpdateGate() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    AppAPI.checkUpdate().then((d) => { if (d?.update) setInfo(d); }).catch(() => {});
  }, []);

  if (!info?.update || dismissed) return null;
  const force = !!info.force;

  const onUpdate = () => {
    if (info.download_url) Linking.openURL(info.download_url).catch(() => {});
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => { if (!force) setDismissed(true); }}>
      <View style={{ flex: 1, backgroundColor: '#000c', alignItems: 'center', justifyContent: 'center', padding: spacing(3) }}>
        <View style={[{ width: '100%', maxWidth: 420, backgroundColor: colors.card, borderRadius: radius.xl, padding: spacing(3), borderWidth: 1, borderColor: colors.border }, shadow]}>
          <Txt size={44} style={{ textAlign: 'center', marginBottom: spacing(1) }}>{force ? '🚀' : '✨'}</Txt>
          <Txt size={font.h2} weight="900" style={{ textAlign: 'center' }}>{info.title || 'Update available'}</Txt>
          <Txt dim style={{ textAlign: 'center', marginTop: spacing(1), lineHeight: 22 }}>
            {info.message || 'A new version of FitHub is available.'}
          </Txt>

          {force && (
            <Txt size={font.tiny} style={{ textAlign: 'center', marginTop: spacing(1.5), color: colors.primary, fontWeight: '800' }}>
              This update is required to keep using the app.
            </Txt>
          )}

          <Button title={info.button_text || 'Update now'} onPress={onUpdate} style={{ marginTop: spacing(2.5) }} />

          {!force && (
            <TouchableOpacity onPress={() => setDismissed(true)} style={{ paddingVertical: spacing(1.5) }}>
              <Txt dim size={font.small} style={{ textAlign: 'center', fontWeight: '700' }}>Maybe later</Txt>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}
