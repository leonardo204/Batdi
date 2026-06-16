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
    ];
  },
};

export default nextConfig;
