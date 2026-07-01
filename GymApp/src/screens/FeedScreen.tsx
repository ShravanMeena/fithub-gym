import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, View, Image, Alert, TouchableOpacity, RefreshControl } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Asset } from 'react-native-image-picker';
import Video from 'react-native-video';
import VideoTrim, { showEditor } from 'react-native-video-trim';
import { Card, Txt, Button, Field } from '../components/UI';
import { Avatar } from '../components/Avatar';
import { AutoImage } from '../components/AutoImage';
import { PostInteractions } from '../components/PostInteractions';
import { FeedAPI, authedImageSource, authedVideoSource, apiError } from '../api/client';
import { useOrg } from '../context/OrgContext';
import { scanOrUpload, pickVideo, uriToBase64 } from '../utils/imagePicker';
import { colors, font, radius, spacing } from '../theme';

const fileUri = (p: string) => (p.startsWith('file://') || p.startsWith('http') ? p : `file://${p}`);

export default function FeedScreen() {
  const { org } = useOrg();
  const navigation = useNavigation<any>();
  const [tab, setTab] = useState<'community' | 'public'>('community');
  const [posts, setPosts] = useState<any[]>([]);
  const [sources, setSources] = useState<Record<number, any>>({});
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<Asset | null>(null);
  const [video, setVideo] = useState<Asset | null>(null);
  const [isPublic, setIsPublic] = useState(true);
  const [posting, setPosting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const resolveSources = useCallback(async (list: any[]) => {
    const srcs: Record<number, any> = {};
    await Promise.all(
      list.filter((p) => p.media_url).map(async (p) => {
        srcs[p.id] = p.type === 'video' ? await authedVideoSource(p.media_url) : await authedImageSource(p.media_url);
      })
    );
    setSources((prev) => ({ ...prev, ...srcs }));
  }, []);

  const load = useCallback(async (which: 'community' | 'public' = tab) => {
    try {
      const res = which === 'public' ? await FeedAPI.publicFeed() : await FeedAPI.list();
      setPosts(res.posts);
      setNextBefore(res.nextBefore ?? null);
      resolveSources(res.posts);
    } catch (e) {
      Alert.alert('Error', apiError(e));
    }
  }, [tab, resolveSources]);

  const loadMore = async () => {
    if (!nextBefore || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = tab === 'public' ? await FeedAPI.publicFeed(nextBefore) : await FeedAPI.list(nextBefore);
      setPosts((prev) => [...prev, ...res.posts]);
      setNextBefore(res.nextBefore ?? null);
      resolveSources(res.posts);
    } catch { /* ignore */ } finally { setLoadingMore(false); }
  };

  useEffect(() => { setPosts([]); setNextBefore(null); load(tab); }, [tab]); // eslint-disable-line
  useFocusEffect(useCallback(() => { load(tab); }, [tab])); // eslint-disable-line

  // video-trim editor result events (defensive)
  useEffect(() => {
    const sub = (name: string, cb: (e: any) => void) => {
      try { const fn = (VideoTrim as any)?.[name]; return typeof fn === 'function' ? fn(cb) : null; } catch { return null; }
    };
    const subs = [
      sub('onFinishTrimming', ({ outputPath }: any) => outputPath && setVideo((v) => ({ ...(v || {}), uri: fileUri(outputPath), type: 'video/mp4' }) as Asset)),
      sub('onError', ({ message }: any) => message && Alert.alert('Trim error', String(message))),
    ];
    return () => subs.forEach((s: any) => s?.remove?.());
  }, []);

  const trimVideo = () => {
    if (!video?.uri) return;
    try { showEditor(video.uri.replace('file://', ''), { maxDuration: 60, saveToPhoto: false }); }
    catch (e: any) { Alert.alert('Trim unavailable', e?.message || 'Could not open the trimmer.'); }
  };

  const post = async () => {
    if (!text.trim() && !photo && !video) return Alert.alert('Empty', 'Write something or add a photo/video.');
    setPosting(true);
    try {
      const base = { content: text.trim() || undefined, is_public: isPublic };
      if (video?.uri) {
        const b64 = await uriToBase64(video.uri);
        await FeedAPI.create({ ...base, type: 'video', mediaBase64: b64, mediaType: video.type || 'video/mp4' });
      } else if (photo?.base64) {
        await FeedAPI.create({ ...base, type: 'image', mediaBase64: photo.base64, mediaType: photo.type || 'image/jpeg' });
      } else {
        await FeedAPI.create({ ...base, type: 'text' });
      }
      setText(''); setPhoto(null); setVideo(null);
      await load('community');
    } catch (e) {
      Alert.alert('Could not post', apiError(e));
    } finally { setPosting(false); }
  };

  const remove = (p: any) => {
    Alert.alert('Delete post?', '', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await FeedAPI.remove(p.id); load(tab); } },
    ]);
  };

  const Seg = ({ id, label }: { id: 'community' | 'public'; label: string }) => (
    <TouchableOpacity
      onPress={() => setTab(id)}
      style={{ flex: 1, paddingVertical: 10, borderRadius: radius.pill, alignItems: 'center', backgroundColor: tab === id ? colors.primary : 'transparent' }}>
      <Txt weight="700" size={font.small} style={{ color: tab === id ? '#fff' : colors.textDim }}>{label}</Txt>
    </TouchableOpacity>
  );

  return (
    <ScrollView
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing(2) }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(tab); setRefreshing(false); }} tintColor={colors.primary} />}>

      {/* Segmented control */}
      <View style={{ flexDirection: 'row', backgroundColor: colors.card, borderRadius: radius.pill, padding: 4, borderWidth: 1, borderColor: colors.border, marginBottom: spacing(2) }}>
        <Seg id="community" label={`${org?.name || 'Gym'} Community`} />
        <Seg id="public" label="Public Feed 🌍" />
      </View>

      {/* Composer — only in your community */}
      {tab === 'community' && (
        <Card>
          <Field value={text} onChangeText={setText} placeholder="What's on your mind? PR, progress, motivation…" multiline style={{ height: 70, textAlignVertical: 'top', paddingTop: 12 }} />
          {photo?.uri ? (
            <View style={{ marginBottom: spacing(1) }}>
              <Image source={{ uri: photo.uri }} style={{ width: '100%', height: 180, borderRadius: radius.sm }} />
              <TouchableOpacity onPress={() => setPhoto(null)} style={{ position: 'absolute', top: 6, right: 6, backgroundColor: '#000a', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}><Txt size={font.small}>✕</Txt></TouchableOpacity>
            </View>
          ) : null}
          {video?.uri ? (
            <View style={{ marginBottom: spacing(1) }}>
              <Video source={{ uri: video.uri }} style={{ width: '100%', height: 200, borderRadius: radius.sm, backgroundColor: '#000' }} controls paused resizeMode="contain" />
              <View style={{ flexDirection: 'row', gap: spacing(1), marginTop: 8 }}>
                <Button title="✂️ Trim" variant="ghost" onPress={trimVideo} style={{ flex: 1, height: 42 }} />
                <Button title="✕ Remove" variant="ghost" onPress={() => setVideo(null)} style={{ flex: 1, height: 42 }} />
              </View>
            </View>
          ) : null}
          <TouchableOpacity onPress={() => setIsPublic((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing(1) }}>
            <View style={{ width: 20, height: 20, borderRadius: 5, borderWidth: 2, borderColor: isPublic ? colors.accent : colors.border, backgroundColor: isPublic ? colors.accent : 'transparent', marginRight: 8, alignItems: 'center', justifyContent: 'center' }}>
              {isPublic ? <Txt size={12} style={{ color: '#fff' }}>✓</Txt> : null}
            </View>
            <Txt size={font.small} dim>Also share to the 🌍 Public Feed (all gyms)</Txt>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', gap: spacing(1) }}>
            <Button title="🖼 Photo" variant="ghost" onPress={() => { setVideo(null); scanOrUpload((a) => setPhoto(a)); }} style={{ flex: 1 }} />
            <Button title="🎥 Video" variant="ghost" onPress={async () => { const v = await pickVideo(); if (v) { setPhoto(null); setVideo(v); } }} style={{ flex: 1 }} />
            <Button title="Post" loading={posting} onPress={post} style={{ flex: 1 }} />
          </View>
        </Card>
      )}

      {posts.length === 0 ? (
        <Card><Txt dim>{tab === 'public' ? 'No public posts yet.' : 'No posts yet. Be the first to share!'}</Txt></Card>
      ) : (
        posts.map((p) => (
          <Card key={p.id} style={p.is_announcement ? { borderColor: colors.primary, backgroundColor: colors.primary + '0e' } : undefined}>
            {p.is_announcement ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <View style={{ backgroundColor: colors.primary, paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill }}><Txt size={font.tiny} weight="800" style={{ color: '#fff' }}>📣 ANNOUNCEMENT</Txt></View>
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ marginRight: 8 }}><Avatar userId={p.authorId} name={p.author} hasAvatar={p.authorAvatar} size={38} /></View>
                <View>
                  <Txt weight="700">{p.author}{tab === 'public' && p.gym ? <Txt dim size={font.tiny}>  ·  {p.gym}</Txt> : null}</Txt>
                  <Txt dim size={font.tiny}>{p.created_at?.slice(0, 16).replace('T', ' ')}</Txt>
                </View>
              </View>
              {p.mine ? <TouchableOpacity onPress={() => remove(p)}><Txt size={font.small} style={{ color: colors.danger }}>✕</Txt></TouchableOpacity> : null}
            </View>

            {p.content ? (
              <TouchableOpacity activeOpacity={0.7} onPress={() => navigation.navigate('PostDetail', { post: p })}>
                <Txt style={{ marginBottom: p.media_url ? 8 : 0, lineHeight: 21 }}>{p.content}</Txt>
              </TouchableOpacity>
            ) : null}

            {p.type === 'image' && sources[p.id] ? (
              <TouchableOpacity activeOpacity={0.9} onPress={() => navigation.navigate('PostDetail', { post: p })}>
                <AutoImage source={sources[p.id]} />
              </TouchableOpacity>
            ) : null}
            {p.type === 'video' && sources[p.id] ? (
              <View>
                <Video
                  source={sources[p.id]}
                  style={{ width: '100%', height: 260, borderRadius: radius.sm, backgroundColor: '#000' }}
                  controls={playingId === p.id}
                  paused={playingId !== p.id}
                  resizeMode="contain"
                  onError={(e: any) => console.log('video error', p.id, JSON.stringify(e?.error || e))}
                />
                {playingId !== p.id ? (
                  <TouchableOpacity onPress={() => setPlayingId(p.id)} activeOpacity={0.8} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
                    <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#000a', alignItems: 'center', justifyContent: 'center' }}><Txt size={30} style={{ color: '#fff', marginLeft: 4 }}>▶</Txt></View>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}

            <PostInteractions post={p} />
          </Card>
        ))
      )}

      {nextBefore ? (
        <Button title={loadingMore ? 'Loading…' : 'Load more'} variant="ghost" loading={loadingMore} onPress={loadMore} style={{ marginTop: spacing(1) }} />
      ) : null}
      <View style={{ height: spacing(4) }} />
    </ScrollView>
  );
}
