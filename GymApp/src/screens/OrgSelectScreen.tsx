import React, { useEffect, useState } from 'react';
import { ScrollView, View, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { Screen, Card, Txt } from '../components/UI';
import { OrgAPI, apiError } from '../api/client';
import { useOrg, Org } from '../context/OrgContext';
import { colors, font, radius, spacing } from '../theme';

export default function OrgSelectScreen() {
  const { selectOrg } = useOrg();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    OrgAPI.list()
      .then((d) => setOrgs(d.organizations))
      .catch((e) => setErr(apiError(e)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Screen>
      <View style={{ alignItems: 'center', marginTop: spacing(6), marginBottom: spacing(3) }}>
        <Image source={require('../assets/mark.png')} style={{ width: 72, height: 45, tintColor: colors.primary, resizeMode: 'contain' }} />
        <Txt size={font.h2} weight="800" style={{ marginTop: spacing(1) }}>Choose your gym</Txt>
        <Txt dim style={{ marginTop: 4 }}>Select your gym to continue</Txt>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} size="large" style={{ marginTop: spacing(4) }} />
      ) : err ? (
        <Card><Txt style={{ color: colors.danger }}>{err}</Txt><Txt dim size={font.small} style={{ marginTop: 6 }}>Make sure the backend is running.</Txt></Card>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          {orgs.map((o) => (
            <TouchableOpacity key={o.id} activeOpacity={0.85} onPress={() => selectOrg(o)}>
              <Card style={{ flexDirection: 'row', alignItems: 'center', borderLeftWidth: 4, borderLeftColor: o.primary_color || colors.primary }}>
                <View style={{ width: 52, height: 52, borderRadius: radius.sm, backgroundColor: (o.primary_color || colors.primary) + '22', alignItems: 'center', justifyContent: 'center', marginRight: spacing(1.5) }}>
                  <Image source={require('../assets/mark.png')} style={{ width: 30, height: 19, tintColor: o.primary_color || colors.primary, resizeMode: 'contain' }} />
                </View>
                <View style={{ flex: 1 }}>
                  <Txt weight="700" size={font.h3}>{o.name}</Txt>
                  {o.tagline ? <Txt dim size={font.small}>{o.tagline}</Txt> : null}
                </View>
                <Txt size={20} style={{ color: o.primary_color || colors.primary }}>›</Txt>
              </Card>
            </TouchableOpacity>
          ))}
          <Txt dim size={font.tiny} style={{ textAlign: 'center', marginTop: spacing(2) }}>
            Don't see your gym? Ask your gym to get on the platform.
          </Txt>
        </ScrollView>
      )}
    </Screen>
  );
}
