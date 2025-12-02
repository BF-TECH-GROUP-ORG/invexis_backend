// Simple Service Worker for Push Notifications
self.addEventListener('install', () => {
    console.log('Service Worker installed');
    self.skipWaiting();
});

self.addEventListener('activate', () => {
    console.log('Service Worker activated');
    return self.clients.claim();
});

self.addEventListener('push', (event) => {
    console.log('Push received:', event);
    
    let data = {};
    if (event.data) {
        try {
            data = event.data.json();
        } catch (e) {
            data = { title: 'New Notification', body: event.data.text() };
        }
    }
    
    const title = data.title || 'Invexis Notification';
    const options = {
        body: data.body || 'You have a new notification',
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle fill="%23667eea" cx="50" cy="50" r="50"/><text y="70" x="50" text-anchor="middle" font-size="50" fill="white">🔔</text></svg>',
        tag: data.id || 'notification',
        data: data
    };
    
    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if ('focus' in client) return client.focus();
            }
            if (clients.openWindow) return clients.openWindow('/');
        })
    );
});
