/** @type {import('next').NextConfig} */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const nextConfig = {
  reactStrictMode: true,
  // 워크스페이스 패키지(TS 소스)를 Next 가 직접 트랜스파일
  transpilePackages: ['@batdi/ui', '@batdi/types'],
  // CopilotKit Runtime(api:3001)로 라우팅 — 프로덕션 친화(same-origin 프록시).
  // web 의 CopilotKit runtimeUrl="/api/copilotkit" → 아래 rewrite → api/copilotkit
  async rewrites() {
    return [
      {
        source: '/api/copilotkit',
        destination: `${API_URL}/copilotkit`,
      },
    ];
  },
};

export default nextConfig;
