/** @type {import('next').NextConfig} */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const nextConfig = {
  reactStrictMode: true,
  // 워크스페이스 패키지(TS 소스)를 Next 가 직접 트랜스파일
  transpilePackages: ['@batdi/ui', '@batdi/types'],
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
