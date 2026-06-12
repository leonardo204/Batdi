/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 워크스페이스 패키지(TS 소스)를 Next 가 직접 트랜스파일
  transpilePackages: ['@batdi/ui', '@batdi/types'],
};

export default nextConfig;
