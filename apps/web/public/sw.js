/*
 * 밧디 Service Worker — Web Push 수신 (P4-W11 — ADR-055).
 *
 * - push 이벤트: 서버가 보낸 JSON({title, body, url, tag})을 파싱해 showNotification.
 *   파싱 실패/빈 데이터는 기본 문구로 graceful 폴백.
 * - notificationclick: 알림 닫고 data.url 로 기존 탭 포커스(있으면) 또는 새 탭 오픈.
 *
 * public/ 정적 파일이라 Next rewrite 불요. web 구독 플로우(lib/push.ts)가 '/sw.js' 로 등록한다.
 */

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = {};
  }

  const title = payload.title || '밧디';
  const options = {
    body: payload.body || '새로운 소식이 있어!',
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: payload.tag || undefined,
    data: { url: payload.url || '/chat' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/chat';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          // 이미 열린 탭이 있으면 그쪽으로 포커스 + 네비.
          if ('focus' in client) {
            client.focus();
            if ('navigate' in client) {
              return client.navigate(targetUrl);
            }
            return undefined;
          }
        }
        // 열린 탭이 없으면 새 창.
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
        return undefined;
      }),
  );
});
