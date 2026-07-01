// Single-post detail: the post full-size + its reactions and comments.
import React, { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Video from 'react-native-video';
import { Card, Txt } from '../components/UI';
import { Avatar } from '../components/Avatar';
import { AutoImage } from '../components/AutoImage';
import { PostInteractions } from '../components/PostInteractions';
import { authedImageSource, authedVideoSource } from '../api/client';
import { colors, font, radius, spacing } from '../theme';

export default function PostDetailScreen({ route }: any) {
  const post = route.params?.post;
  const [src, setSrc] = useState<any>(null);
  const [vidRatio, setVidRatio] = useState<number | null>(null);

  useFocusEffect(useCallback(() => {
    let alive = true;
    if (post?.media_url) {
      const fn = post.type === 'video' ? authedVideoSource : authedImageSource;
      fn(post.media_url).then((s) => alive && setSrc(s)).catch(() => {});
    }
    return () => { alive = false; };
  }, [post?.media_url, post?.type]));

  if (!post) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing(2) }}>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing(1) }}>
          <View style={{ marginRight: 10 }}><Avatar userId={post.authorId} name={post.author} hasAvatar={post.authorAvatar} size={44} /></View>
          <View>
            <Txt weight="800">{post.author}{post.gym ? <Txt dim size={font.tiny}>  ·  {post.gym}</Txt> : null}</Txt>
            <Txt dim size={font.tiny}>{post.created_at?.slice(0, 16).replace('T', ' ')}</Txt>
          </View>
        </View>

        {post.content ? <Txt style={{ fontSize: font.body, lineHeight: 23, marginBottom: post.media_url ? spacing(1.5) : 0 }}>{post.content}</Txt> : null}

        {post.type === 'image' && src ? <AutoImage source={src} /> : null}
        {post.type === 'video' && src ? (
          <Video
            source={src}
            style={{ width: '100%', aspectRatio: vidRatio || 0.75, borderRadius: radius.sm, backgroundColor: '#000' }}
            controls
            resizeMode="contain"
            onLoad={(d: any) => {
              const ns = d?.naturalSize;
              if (ns?.width && ns?.height) {
                let r = ns.width / ns.height;
                if (ns.orientation === 'portrait' && r > 1) r = 1 / r;
                setVidRatio(Math.max(0.5, Math.min(2, r)));
              }
            }}
          />
        ) : null}

        <View style={{ marginTop: spacing(1.5) }}>
          <PostInteractions post={post} />
        </View>
      </Card>
      <View style={{ height: spacing(4) }} />
    </ScrollView>
  );
}
