/* SphereCall Service Worker Notification Handler */

self.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  const data = notification.data || {};
  const action = event.action || 'open';

  notification.close();

  if (action === 'dismiss') {
    return;
  }

  const targetUrl =
    action === 'join' && data.meetingId
      ? `/?joinMeeting=${encodeURIComponent(data.meetingId)}`
      : data.url || '/?tab=calendar';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            client.focus();
            client.postMessage({
              type: 'MEETING_NOTIFICATION_ACTION',
              action,
              meetingId: data.meetingId || null,
            });
            return;
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'SphereCall Meeting Reminder', body: event.data.text() };
  }

  const title = payload.title || 'Upcoming Meeting in 5 Minutes';
  const options = {
    body: payload.body || 'Your scheduled SphereCall meeting starts soon.',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: payload.tag || 'spherecall-meeting-reminder',
    requireInteraction: true,
    vibrate: [200, 100, 200],
    data: payload.data || { url: '/?tab=calendar' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});
