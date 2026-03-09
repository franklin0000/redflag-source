/**
 * notificationService.js — Notification CRUD via Express API
 */
import { notificationsApi } from './api';

/**
 * Subscribe to notifications (poll-based since we don't have Supabase realtime)
 */
export const subscribeToNotifications = (userId, callback) => {
    if (!userId) return () => {};

    let cancelled = false;

    const fetchAndNotify = async () => {
        try {
            const data = await notificationsApi.getAll();
            if (!cancelled) callback(mapNotifications(data || []));
        } catch (err) {
            console.warn('Notifications fetch error:', err.message);
            if (!cancelled) callback([]);
        }
    };

    fetchAndNotify();

    // Poll every 30 seconds
    const interval = setInterval(fetchAndNotify, 30000);

    return () => {
        cancelled = true;
        clearInterval(interval);
    };
};

/**
 * Mark a single notification as read
 */
export const markNotificationRead = async (notificationId) => {
    try {
        await notificationsApi.markAllRead(); // best we can do without single-read endpoint
    } catch (err) {
        console.error('Error marking notification read:', err);
    }
};

/**
 * Mark all notifications as read
 */
export const markAllNotificationsRead = async (userId) => {
    try {
        await notificationsApi.markAllRead();
    } catch (err) {
        console.error('Error marking all notifications read:', err);
    }
};

/**
 * Create a notification (only works if we have server-side routing)
 */
export const createNotification = async (userId, data) => {
    // Notifications are created server-side; this is a no-op from the client
    console.debug('createNotification called (server-side only):', userId, data);
};

/**
 * Delete a notification (stub)
 */
export const deleteNotification = async (notificationId) => {
    console.debug('deleteNotification called:', notificationId);
};

const mapNotifications = (data) => data.map(n => ({
    id: n.id,
    userId: n.user_id,
    type: n.type,
    title: n.title,
    message: n.body,
    read: n.is_read,
    actionTarget: n.data?.match_id ? `/dating/chat/${n.data.match_id}` : null,
    actionLabel: n.type === 'message' ? 'View Chat' : 'View',
    time: new Date(n.created_at).getTime(),
}));
