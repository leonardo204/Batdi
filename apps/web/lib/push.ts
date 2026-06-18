// 밧디 web push 구독 플로우 (P4-W11 — ADR-055).
//
// settings 페이지의 "브라우저 알림 켜기" 토글이 호출한다.
//  1) Service Worker 등록('/sw.js')
//  2) Notification.requestPermission
//  3) GET /api/push/vapid-public-key (null 이면 서버 푸시 비활성 → graceful 중단)
//  4) PushManager.subscribe({userVisibleOnly, applicationServerKey})
//  5) POST /api/push/subscribe (credentials:'include')
//
// 미지원/권한 거부/키 미설정은 throw 대신 결과 코드로 반환 → UI 가 친화 안내.

/** 구독 시도 결과. */
export type SubscribeResult =
  | { status: 'subscribed' }
  | { status: 'unsupported' } // 브라우저가 SW/Push 미지원
  | { status: 'denied' } // 사용자가 알림 권한 거부
  | { status: 'disabled' } // 서버 VAPID 키 미설정(푸시 비활성)
  | { status: 'error'; message: string };

/** base64url(VAPID 공개키) → ArrayBuffer(applicationServerKey). */
function urlBase64ToArrayBuffer(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) {
    view[i] = raw.charCodeAt(i);
  }
  return buffer;
}

/** 브라우저 Web Push 지원 여부. */
export function isPushSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** 현재 구독 여부(이미 구독돼 있으면 토글 초기값). */
export async function getSubscriptionState(): Promise<boolean> {
  if (!isPushSupported()) {
    return false;
  }
  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    if (!reg) {
      return false;
    }
    const sub = await reg.pushManager.getSubscription();
    return sub !== null;
  } catch {
    return false;
  }
}

/** 푸시 구독 전체 플로우. */
export async function subscribeToPush(): Promise<SubscribeResult> {
  if (!isPushSupported()) {
    return { status: 'unsupported' };
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js');

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { status: 'denied' };
    }

    const keyRes = await fetch('/api/push/vapid-public-key', {
      credentials: 'include',
    });
    if (!keyRes.ok) {
      return { status: 'error', message: `키 조회 실패 (${keyRes.status})` };
    }
    const { publicKey } = (await keyRes.json()) as { publicKey: string | null };
    if (!publicKey) {
      return { status: 'disabled' };
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToArrayBuffer(publicKey),
    });

    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription.toJSON()),
    });
    if (!res.ok) {
      return { status: 'error', message: `구독 저장 실패 (${res.status})` };
    }

    return { status: 'subscribed' };
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : '알 수 없는 오류',
    };
  }
}

/** 푸시 구독 해제(서버 + 브라우저). */
export async function unsubscribeFromPush(): Promise<boolean> {
  if (!isPushSupported()) {
    return false;
  }
  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    if (!reg) {
      return true;
    }
    const sub = await reg.pushManager.getSubscription();
    if (!sub) {
      return true;
    }
    await fetch('/api/push/unsubscribe', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
    await sub.unsubscribe();
    return true;
  } catch {
    return false;
  }
}
