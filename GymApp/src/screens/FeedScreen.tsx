import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, FlatList, Image, Alert, TouchableOpacity, RefreshControl } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { Asset } from 'react-native-image-picker';
import Video from 'react-native-video';
import VideoTrim, { showEditor } from 'react-native-video-trim';
import { Card, Txt, Button, Field } from '../components/UI';
import { Avatar } from '../components/Avatar';
import { AutoImage } from '../components/AutoImage';
import { PostSkeleton } from '../components/Skeleton';
import { PostInteractions } from '../components/PostInteractions';
import { FeedAPI, authedImageSource, authedVideoSource, apiError } from '../api/client';
import { useOrg } from '../context/OrgContext';
import { scanOrUpload, pickVideo } from '../utils/imagePicker';
import { colors, font, radius, spacing } from '../theme';

const fileUri = (p: string) => (p.startsWith('file://') || p.startsWith('http') ? p : `file://${p}`);

// Render post text with tappable #hashtags highlighted in the accent colour.
function renderContent(content: string, onTag: (t: string) => void) {
  return content.split(/(#[A-Za-z0-9_]+)/g).map((part, i) => {
    const m = /^#([A-Za-z0-9_]+)$/.exec(part);
    if (m) return <Txt key={i} onPress={() => onTag(m[1])} style={{ color: colors.primary, fontWeight: '700' }}>{part}</Txt>;
    return part;
  });
}

// ---- Composer: keeps its own state so typing never re-renders the feed list ----
const Composer = React.memo(function Composer({ onPosted }: { onPosted: () => void }) {
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<Asset | null>(null);
  const [video, setVideo] = useState<Asset | null>(null);
  const [isPublic, setIsPublic] = useState(true);
  const [posting, setPosting] = useState(false);

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
        await FeedAPI.createVideo(video.uri, video.type || 'video/mp4', text.trim() || undefined, isPublic);
      } else if (photo?.base64) {
        await FeedAPI.create({ ...base, type: 'image', mediaBase64: photo.base64, mediaType: photo.type || 'image/jpeg' });
      } else {
        await FeedAPI.create({ ...base, type: 'text' });
      }
      setText(''); setPhoto(null); setVideo(null);
      onPosted();
    } catch (e) {
      Alert.alert('Could not post', apiError(e));
    } finally { setPosting(false); }
  };

  return (
    <Card>
      <Field value={text} onChangeText={setText} placeholder="What's on your mind? Add #hashtags like #legday…" multiline style={{ height: 70, textAlignVertical: 'top', paddingTop: 12 }} />
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
  );
});

// ---- Feed video: renders at its natural aspect ratio (no fixed height) ----
// Inline video player: autoplays (muted) when scrolled into view; tap to
// play/pause, tap the speaker to turn sound on/off. No navigation.
function FeedVideo({ source, playing, postId }: any) {
  const [ratio, setRatio] = useState<number | null>(null);
  const [userPaused, setUserPaused] = useState(false);
  const [muted, setMuted] = useState(true);
  const paused = userPaused || !playing;

  return (
    <View style={{ width: '100%', aspectRatio: ratio || 0.75, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: '#000' }}>
      <Video
        source={source}
        style={{ width: '100%', height: '100%' }}
        paused={paused}
        muted={muted}
        repeat
        resizeMode="contain"
        // Start playing as soon as ~1s is buffered (fast start, Instagram-like).
        bufferConfig={{ minBufferMs: 2000, maxBufferMs: 10000, bufferForPlaybackMs: 800, bufferForPlaybackAfterRebufferMs: 1500 }}
        ignoreSilentSwitch="ignore"
        playInBackground={false}
        onLoad={(d: any) => {
          const ns = d?.naturalSize;
          if (ns?.width && ns?.height) {
            let r = ns.width / ns.height;
            if (ns.orientation === 'portrait' && r > 1) r = 1 / r; // fix mislabelled portrait
            setRatio(Math.max(0.5, Math.min(2, r)));
          }
        }}
        onError={(e: any) => console.log('video error', postId, JSON.stringify(e?.error || e))}
      />

      {/* Tap anywhere to play / pause */}
      <TouchableOpacity activeOpacity={1} onPress={() => setUserPaused((p) => !p)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
        {paused ? (
          <View style={{ width: 62, height: 62, borderRadius: 31, backgroundColor: '#000a', alignItems: 'center', justifyContent: 'center' }}>
            <Txt size={28} style={{ color: '#fff', marginLeft: 4 }}>▶</Txt>
          </View>
        ) : null}
      </TouchableOpacity>

      {/* Sound toggle */}
      <TouchableOpacity onPress={() => setMuted((m) => !m)} style={{ position: 'absolute', bottom: 10, right: 10, backgroundColor: '#000a', borderRadius: 999, width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}>
        <Txt size={15}>{muted ? '🔇' : '🔊'}</Txt>
      </TouchableOpacity>
    </View>
  );
}

// ---- One post card ----
function PostCard({ p, source, playing, tab, onOpen, onRemove, onTag }: any) {
  return (
    <Card style={p.is_announcement ? { borderColor: colors.primary, backgroundColor: colors.primary + '0e' } : undefined}>
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
        {p.mine ? <TouchableOpacity onPress={onRemove}><Txt size={font.small} style={{ color: colors.danger }}>✕</Txt></TouchableOpacity> : null}
      </View>

      {p.content ? (
        <TouchableOpacity activeOpacity={0.7} onPress={onOpen}>
          <Txt style={{ marginBottom: p.media_url ? 8 : 0, lineHeight: 21 }}>{renderContent(p.content, onTag)}</Txt>
        </TouchableOpacity>
      ) : null}

      {p.type === 'image' && source ? (
        <TouchableOpacity activeOpacity={0.9} onPress={onOpen}><AutoImage source={source} /></TouchableOpacity>
      ) : null}

      {p.type === 'video' && source ? (
        <FeedVideo source={source} playing={playing} postId={p.id} />
      ) : null}

      <PostInteractions post={p} />
    </Card>
  );
}

export default function FeedScreen() {
  const { org } = useOrg();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const tagParam: string | undefined = route.params?.tag; // set when viewing a #hashtag feed
  const [tab, setTab] = useState<'foryou' | 'community' | 'public'>('foryou');
  const [posts, setPosts] = useState<any[]>([]);
  const [sources, setSources] = useState<Record<number, any>>({});
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const openTag = useCallback((t: string) => navigation.navigate('HashtagFeed', { tag: t }), [navigation]);

  const resolveSources = useCallback(async (list: any[]) => {
    const srcs: Record<number, any> = {};
    await Promise.all(
      list.filter((p) => p.media_url).map(async (p) => {
        // Video = direct GCS URL (fast). Image = cached thumbnail via proxy.
        srcs[p.id] = p.type === 'video'
          ? await authedVideoSource(p.media_url)
          : await authedImageSource(p.media_url.startsWith('http') ? p.media_url : `${p.media_url}?w=700`);
      })
    );
    setSources((prev) => ({ ...prev, ...srcs }));
  }, []);

  // One fetcher for every mode; `cursor` is an id-cursor (before) or an offset
  // (for-you), whichever that mode uses. Returns the raw response.
  const fetchFeed = (which: typeof tab, cursor?: number) =>
    tagParam ? FeedAPI.tag(tagParam, cursor)
      : which === 'foryou' ? FeedAPI.forYou(cursor)
      : which === 'public' ? FeedAPI.publicFeed(cursor)
      : FeedAPI.list(cursor);

  const load = useCallback(async (which: typeof tab = tab) => {
    setLoading(true);
    try {
      const res = await fetchFeed(which);
      setPosts(res.posts);
      setNextBefore(res.nextBefore ?? res.nextOffset ?? null);
      resolveSources(res.posts);
    } catch (e) { Alert.alert('Error', apiError(e)); }
    finally { setLoading(false); }
  }, [tab, tagParam, resolveSources]); // eslint-disable-line

  const loadMore = async () => {
    if (!nextBefore || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetchFeed(tab, nextBefore);
      setPosts((prev) => [...prev, ...res.posts]);
      setNextBefore(res.nextBefore ?? res.nextOffset ?? null);
      resolveSources(res.posts);
    } catch { /* ignore */ } finally { setLoadingMore(false); }
  };

  useEffect(() => { setPosts([]); setNextBefore(null); setPlayingId(null); load(tab); }, [tab, tagParam]); // eslint-disable-line
  // Reload on focus; pause any playing video when leaving the tab.
  useFocusEffect(useCallback(() => { load(tab); return () => setPlayingId(null); }, [tab, tagParam])); // eslint-disable-line

  const onPosted = useCallback(() => { setTab('community'); load('community'); }, [load]);
  const remove = (p: any) => {
    Alert.alert('Delete post?', '', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          setPosts((prev) => prev.filter((x) => x.id !== p.id)); // vanish immediately
          try { await FeedAPI.remove(p.id); } catch {}
          load(tab); // resync current tab; other tab reloads fresh on switch
        },
      },
    ]);
  };

  // Autoplay the most-visible video, pause the rest (Instagram-style).
  const viewConfigRef = useRef({ itemVisiblePercentThreshold: 70, minimumViewTime: 120 });
  const onViewRef = useRef(({ viewableItems }: any) => {
    const vid = viewableItems.find((v: any) => v.item?.type === 'video' && v.item?.media_url);
    setPlayingId(vid ? vid.item.id : null);
  });

  const Seg = ({ id, label }: { id: 'foryou' | 'community' | 'public'; label: string }) => (
    <TouchableOpacity onPress={() => setTab(id)} style={{ flex: 1, paddingVertical: 10, borderRadius: radius.pill, alignItems: 'center', backgroundColor: tab === id ? colors.primary : 'transparent' }}>
      <Txt weight="700" size={font.tiny} numberOfLines={1} style={{ color: tab === id ? '#fff' : colors.textDim }}>{label}</Txt>
    </TouchableOpacity>
  );

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing(2) }}
      data={posts}
      keyExtractor={(p) => String(p.id)}
      extraData={`${playingId}|${Object.keys(sources).length}`}
      keyboardShouldPersistTaps="handled"
      initialNumToRender={5}
      windowSize={7}
      onEndReached={loadMore}
      onEndReachedThreshold={0.6}
      onViewableItemsChanged={onViewRef.current}
      viewabilityConfig={viewConfigRef.current}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(tab); setRefreshing(false); }} tintColor={colors.primary} />}
      ListHeaderComponent={
        tagParam ? (
          <View style={{ marginBottom: spacing(1) }}>
            <Txt size={font.h2} weight="900" style={{ color: colors.primary }}>#{tagParam}</Txt>
            <Txt dim size={font.small} style={{ marginTop: 2 }}>Posts tagged #{tagParam}</Txt>
          </View>
        ) : (
          <View>
            <View style={{ flexDirection: 'row', backgroundColor: colors.card, borderRadius: radius.pill, padding: 4, borderWidth: 1, borderColor: colors.border, marginBottom: spacing(2) }}>
              <Seg id="foryou" label="✨ For You" />
              <Seg id="community" label={org?.name || 'Gym'} />
              <Seg id="public" label="🌍 Public" />
            </View>
            {tab !== 'public' ? <Composer onPosted={onPosted} /> : null}
          </View>
        )
      }
      ListEmptyComponent={
        loading
          ? <View><PostSkeleton /><PostSkeleton /><PostSkeleton /></View>
          : <Card><Txt dim>{tagParam ? `No posts tagged #${tagParam} yet.` : tab === 'public' ? 'No public posts yet.' : 'No posts yet. Be the first to share!'}</Txt></Card>
      }
      renderItem={({ item: p }) => (
        <PostCard
          p={p}
          source={sources[p.id]}
          playing={playingId === p.id}
          tab={tab}
          onOpen={() => navigation.navigate('PostDetail', { post: p })}
          onRemove={() => remove(p)}
          onTag={openTag}
        />
      )}
      ListFooterComponent={
        <View>
          {nextBefore ? <Button title={loadingMore ? 'Loading…' : 'Load more'} variant="ghost" loading={loadingMore} onPress={loadMore} style={{ marginTop: spacing(1) }} /> : null}
          <View style={{ height: spacing(4) }} />
        </View>
      }
    />
  );
}
