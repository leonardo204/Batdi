/** @type {import('next').NextConfig} */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const nextConfig = {
  reactStrictMode: true,
  // 워크스페이스 패키지(TS 소스) + A2UI 렌더러 스택을 Next 가 직접 트랜스파일.
  // ⚠️ @a2ui/web_core 는 src/*.js 원본을 배포하며 import attributes
  //   (`import x from './y.json' with { type: 'json' }`, ES2025)를 사용한다.
  //   Next 14 는 node_modules 를 기본 트랜스파일하지 않아 이 `with` 토큰이 브라우저에
  //   그대로 전달 → "Invalid or unexpected token" → 청크 로드 실패. transpilePackages 에
  //   넣어 SWC 가 down-level 하게 한다. a2ui-renderer 는 web_core 를 import 하므로 함께 등록.
  transpilePackages: [
    '@batdi/ui',
    '@batdi/types',
    '@copilotkit/a2ui-renderer',
    '@a2ui/web_core',
  ],
  // CopilotKit Runtime(api:3001)로 라우팅 — 프로덕션 친화(same-origin 프록시).
  // web 의 CopilotKit runtimeUrl="/api/copilotkit" → 아래 rewrite → api/copilotkit
  // v2 클라이언트(@copilotkit/core)는 runtimeUrl 하위로 /info, /threads,
  // /agent/:id/run|connect|stop 등 여러 서브경로를 호출하므로 정확 경로뿐 아니라
  // :path* 전체를 프록시해야 한다(과거엔 정확 경로만 프록시 → 서브경로 404).
  async rewrites() {
    return [
      {
        source: '/api/copilotkit',
        destination: `${API_URL}/copilotkit`,
      },
      {
        source: '/api/copilotkit/:path*',
        destination: `${API_URL}/copilotkit/:path*`,
      },
      // 인증 프록시 — 프론트는 same-origin /api/auth/* 로 호출, api(3001)/auth/* 로 프록시.
      // JWT 는 HttpOnly 쿠키(batdi_token)로 오가므로 fetch 호출 시 credentials:'include' 필수.
      {
        source: '/api/auth/:path*',
        destination: `${API_URL}/auth/:path*`,
      },
      // 관심 선수 등록 프록시(P4-W10 10.1) — useCopilotAction 핸들러가 same-origin
      // /api/favorites/* 로 호출, api(3001)/favorites/* 로 프록시. JWT 쿠키(credentials:'include').
      {
        source: '/api/favorites/:path*',
        destination: `${API_URL}/favorites/:path*`,
      },
      // 경기 예측 프록시(ADR-054, Lv2 해금) — /my/predictions 페이지가 same-origin
      //   /api/predictions(POST)·/api/predictions/me(GET) 로 호출, api(3001)/predictions/* 로 프록시.
      //   JWT 쿠키(credentials:'include')로 가드 통과.
      {
        source: '/api/predictions/:path*',
        destination: `${API_URL}/predictions/:path*`,
      },
      {
        source: '/api/predictions',
        destination: `${API_URL}/predictions`,
      },
      // 6개 useCopilotAction 백엔드 프록시(P4-W10 10.1) — same-origin /api/* → api(3001)/*.
      // toggleNotification / showPlayerDetail / requestScoreRefresh / showTeamComparison.
      // JWT 쿠키(credentials:'include')로 가드 통과.
      {
        source: '/api/notifications/:path*',
        destination: `${API_URL}/notifications/:path*`,
      },
      {
        source: '/api/players/:path*',
        destination: `${API_URL}/players/:path*`,
      },
      {
        source: '/api/scores/:path*',
        destination: `${API_URL}/scores/:path*`,
      },
      {
        source: '/api/stats/:path*',
        destination: `${API_URL}/stats/:path*`,
      },
      // Web Push 프록시(P4-W11) — settings 의 lib/push.ts 가 same-origin
      //   /api/push/subscribe|unsubscribe|vapid-public-key 로 호출, api(3001)/push/* 로 프록시.
      //   subscribe/unsubscribe 는 JWT 쿠키(credentials:'include'). sw.js 는 public 이라 rewrite 불요.
      {
        source: '/api/push/:path*',
        destination: `${API_URL}/push/:path*`,
      },
      // 내 레벨·통계 조회 프록시(P4-W10 10.4) — /my/* 페이지가 same-origin
      //   /api/users/me/level|stats 로 호출, api(3001)/users/* 로 프록시. JWT 쿠키.
      {
        source: '/api/users/:path*',
        destination: `${API_URL}/users/:path*`,
      },
      // 내 대화 목록 조회 프록시(P4-W10 10.4) — /my/conversations 페이지가 same-origin
      //   /api/conversations 로 호출, api(3001)/conversations 로 프록시. JWT 쿠키.
      {
        source: '/api/conversations/:path*',
        destination: `${API_URL}/conversations/:path*`,
      },
      {
        source: '/api/conversations',
        destination: `${API_URL}/conversations`,
      },
    ];
  },
};

export default nextConfig;
