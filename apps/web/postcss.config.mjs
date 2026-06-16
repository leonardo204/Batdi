/**
 * PostCSS 설정 — Tailwind v4 (ADR-021)
 *
 * v4 는 단일 `@tailwindcss/postcss` 플러그인이 import·vendor prefix 를 모두 처리한다
 * (postcss-import·autoprefixer 불필요). v3→v4 전환 이유: @copilotkit/react-core/v2
 * CopilotChat(a2ui-surface 렌더에 필수)이 Tailwind v4 컴파일 CSS(`cpk:` prefix)를
 * 자동 import 하는데, 프로젝트가 v3 면 PostCSS 가 그 CSS 를 재파싱하다 깨졌다.
 * 프로젝트는 Tailwind 유틸 클래스 미사용(토큰 기반)이라 v4 전환 리스크가 최소.
 *
 * @type {import('postcss-load-config').Config}
 */
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;
