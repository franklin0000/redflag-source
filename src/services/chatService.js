import { supabase } from '../lib/supabase';

// Helper to get current user ID
async function getCurrentUserId() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user?.id || null;
}

// ── Dating Chat ──────────────────────────────────────────────────
export function subscribeToMessages(matchId, callback) {
    // 1. Load History
    supabase.from('messages')
        .select('*')
        .eq('room_id', matchId)
        .order('created_at', { ascending: true })
        .then(({ data, error }) => {
            if (!error && data) callback(data);
        });

    // 2. Subscribe to new messages
    const channel = supabase.channel(`match:${matchId}`)
        .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${matchId}` },
            (payload) => {
                callback(prev => {
                    const list = Array.isArray(prev) ? prev : [];
                    if (list.find(m => m.id === payload.new.id)) return list;
                    return [...list, payload.new];
                });
            }
        )
        .subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
}

export async function sendMessage(matchId, content, iv = null) {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('Not authenticated');

    const { data, error } = await supabase.from('messages').insert({
        room_id: matchId,
        sender_id: userId,
        content,
        iv,
    }).select().single();

    if (error) {
        console.error('Error sending message:', error);
        throw error;
    }
    return data;
}

// Typing indicators via Broadcast
export function subscribeToTyping(matchId, callback) {
    const channel = supabase.channel(`typing:${matchId}`);

    channel.on('broadcast', { event: 'typing' }, (payload) => {
        callback(payload.payload);
    }).subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
}

export async function sendTyping(matchId, isTyping) {
    const userId = await getCurrentUserId();
    if (!userId) return;

    const channel = supabase.channel(`typing:${matchId}`);
    await channel.send({
        type: 'broadcast',
        event: 'typing',
        payload: { matchId, isTyping, user_id: userId }
    });
}

// ── Anonymous Chat ────────────────────────────────────────────────
export function subscribeToAnonMessages(room, callback) {
    // 1. Load History
    supabase.from('messages')
        .select('*')
        .eq('room_id', room)
        .order('created_at', { ascending: true })
        .then(({ data, error }) => {
            if (!error && data) callback(data);
        });

    // 2. Subscribe to live messages
    const channel = supabase.channel(`anon:${room}`)
        .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${room}` },
            (payload) => {
                callback(prev => {
                    const list = Array.isArray(prev) ? prev : [];
                    if (list.find(m => m.id === payload.new.id)) return list;
                    return [...list, payload.new];
                });
            }
        )
        .subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
}

export async function sendAnonMessage(room, text, nickname, avatar, attachment = null, type = 'text') {
    const userId = await getCurrentUserId();
    if (!userId) return false;

    // Ephemeral messages expire in 24 hours
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    const { error } = await supabase.from('messages').insert({
        room_id: room,
        sender_id: userId,
        content: text,
        nickname,
        avatar,
        attachment,
        type,
        expires_at: expiresAt.toISOString(),
    });

    if (error) {
        console.error('Error sending anon message:', error);
        return false;
    }
    return true;
}

export async function uploadChatAttachment(file, matchId) {
    const ext = file.name.split('.').pop();
    const path = `chat/${matchId}/${crypto.randomUUID()}.${ext}`;

    const { data, error } = await supabase.storage.from('redflag').upload(path, file);
    if (error) throw error;

    const { data: publicData } = supabase.storage.from('redflag').getPublicUrl(path);
    return publicData.publicUrl;
}

export function generateNickname() {
    const adj = ['Silent', 'Red', 'Night', 'Steel', 'Dark', 'Swift'];
    const noun = ['Fox', 'Wolf', 'Hawk', 'Storm', 'Echo', 'Cipher'];
    const emojis = ['🦊', '🐺', '🦅', '⚡', '🌙', '🔥', '💎', '🌀'];
    const name = adj[Math.floor(Math.random() * adj.length)] + noun[Math.floor(Math.random() * noun.length)] + Math.floor(Math.random() * 99);
    const emoji = emojis[Math.floor(Math.random() * emojis.length)];
    return { name, emoji };
}
