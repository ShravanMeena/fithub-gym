import React, { useCallback, useState } from 'react';
import { ScrollView, View, Alert, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Card, Txt } from '../components/UI';
import { AttendanceAPI, apiError } from '../api/client';
import { colors, font, radius, spacing } from '../theme';

function fmt(s?: string) {
  return s ? s.slice(0, 16).replace('T', ' ') : '—';
}

export default function AttendanceScreen() {
  const [data, setData] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setData(await AttendanceAPI.status()); }
    catch (e) { Alert.alert('Error', apiError(e)); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const history = data?.history || [];
  const completed = history.filter((h: any) => h.minutes != null);
  const avg = completed.length ? Math.round(completed.reduce((s: number, h: any) => s + h.minutes, 0) / completed.length) : 0;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing(2) }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.primary} />}>

      <Txt size={font.h2} weight="800">My Attendance 📍</Txt>
      <Txt dim style={{ marginBottom: spacing(2) }}>Your gym check-in history.</Txt>

      <Card style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
        <Stat label="Total visits" value={data?.myVisits ?? 0} />
        <Stat label="This week" value={`${data?.daysThisWeek ?? 0}×`} />
        <Stat label="Avg session" value={avg ? `${avg}m` : '—'} />
      </Card>

      {data?.checkedIn && (
        <Card style={{ borderColor: colors.accent }}>
          <Txt weight="700" style={{ color: colors.accent }}>🟢 Currently checked in</Txt>
          <Txt dim size={font.small}>Since {fmt(data.open?.checked_in_at)}</Txt>
        </Card>
      )}

      <Txt size={font.h3} weight="700" style={{ marginTop: spacing(1), marginBottom: spacing(1) }}>History</Txt>
      {history.length === 0 ? (
        <Card><Txt dim>No check-ins yet. Tap “Check in” on Home when you reach the gym.</Txt></Card>
      ) : (
        history.map((h: any) => {
          const short = h.minutes != null && h.minutes < 40;
          return (
            <Card key={h.id} style={{ borderColor: short ? colors.danger + '55' : colors.border }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Txt weight="700">{fmt(h.checked_in_at)}</Txt>
                {h.minutes != null ? (
                  <View style={{ backgroundColor: (short ? colors.danger : colors.accent) + '22', paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill }}>
                    <Txt size={font.small} weight="700" style={{ color: short ? colors.danger : colors.accent }}>{h.minutes} min</Txt>
                  </View>
                ) : (
                  <Txt size={font.small} style={{ color: colors.accent }}>in gym</Txt>
                )}
              </View>
              {h.checked_out_at ? <Txt dim size={font.tiny}>out at {fmt(h.checked_out_at)}</Txt> : null}
              {short && h.reason ? <Txt size={font.small} style={{ color: colors.danger, marginTop: 4 }}>Note: {h.reason}</Txt> : null}
            </Card>
          );
        })
      )}
      <View style={{ height: spacing(4) }} />
    </ScrollView>
  );
}

function Stat({ label, value }: any) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Txt weight="800" size={font.h2} style={{ color: colors.primary }}>{value}</Txt>
      <Txt dim size={font.tiny}>{label}</Txt>
    </View>
  );
}
