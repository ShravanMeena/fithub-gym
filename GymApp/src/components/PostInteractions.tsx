// Reactions (🔥💪👏❤️) + inline comments for a feed post. Self-contained state.
import React, { useState } from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Txt, Field } from './UI';
import { Avatar } from './Avatar';
import { FeedAPI } from '../api/client';
import { colors, font } from '../theme';

const REACTIONS: [string, string][] = [['fire', '🔥'], ['muscle', '💪'], ['clap', '👏'], ['like', '❤️']];

export function PostInteractions({ post }: { post: any }) {
  const [likes, setLikes] = useState<number>(post.likes || 0);
  const [mine, setMine] = useState<string | null>(post.myReaction || null);
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<any[]>([]);
  const [count, setCount] = useState<number>(post.comments || 0);
  const [text, setText] = useState('');
  const [loaded, setLoaded] = useState(false);

  const react = async (key: string) => {
    const wasMine = mine === key;
    const hadReaction = mine != null;
    setMine(wasMine ? null : key);
    setLikes((l) => l + (wasMine ? -1 : hadReaction ? 0 : 1));
    try { const d = await FeedAPI.react(post.id, key); setLikes(d.likes); setMine(d.myReaction); } catch {}
  };

  const toggleComments = async () => {
    setOpen((o) => !o);
    if (!loaded) {
      try { const d = await FeedAPI.comments(post.id); setComments(d.comments); setCount(d.comments.length); setLoaded(true); } catch {}
    }
  };

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setText('');
    try { const d = await FeedAPI.addComment(post.id, body); setComments((c) => [...c, d.comment]); setCount((n) => n + 1); } catch {}
  };

  return (
    <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {REACTIONS.map(([key, emoji]) => (
          <TouchableOpacity key={key} onPress={() => react(key)} style={{ paddingHorizontal: 7, paddingVertical: 4, marginRight: 2, borderRadius: 14, backgroundColor: mine === key ? colors.primary + '33' : 'transparent' }}>
            <Txt size={18} style={{ opacity: mine === key ? 1 : 0.65 }}>{emoji}</Txt>
          </TouchableOpacity>
        ))}
        {likes > 0 && <Txt dim size={font.small} style={{ marginLeft: 6 }}>{likes}</Txt>}
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={toggleComments}>
          <Txt dim size={font.small}>💬 {count > 0 ? count : ''} {count === 1 ? 'comment' : 'comments'}</Txt>
        </TouchableOpacity>
      </View>

      {open && (
        <View style={{ marginTop: 8 }}>
          {comments.map((c) => (
            <View key={c.id} style={{ flexDirection: 'row', marginBottom: 8 }}>
              <Avatar userId={c.author_id} name={c.author} hasAvatar={c.author_avatar} size={26} />
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Txt size={font.small}><Txt weight="800" size={font.small}>{c.author} </Txt>{c.body}</Txt>
              </View>
            </View>
          ))}
          {comments.length === 0 && <Txt dim size={font.tiny} style={{ marginBottom: 6 }}>Be the first to comment 👇</Txt>}
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}><Field value={text} onChangeText={setText} placeholder="Add a comment…" style={{ height: 40 }} /></View>
            <TouchableOpacity onPress={send} style={{ paddingHorizontal: 12, paddingBottom: 12 }}><Txt weight="800" style={{ color: colors.primary }}>Send</Txt></TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}
