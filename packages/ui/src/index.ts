/**
 * @batdi/ui — 디자인 토큰 + Tailwind preset 엔트리
 *
 * 사용:
 *   import '@batdi/ui/tokens.css';            // 전역 CSS variable
 *   import batdiPreset from '@batdi/ui/tailwind-preset';
 *   import { TEAM_IDS } from '@batdi/ui';
 */
export { default as tailwindPreset } from './tailwind-preset';

/** data-team 속성 스위치 키 (MVP 우선 지원 팀) */
export const TEAM_IDS = ['lotte', 'doosan', 'kia', 'hanwha'] as const;
export type TeamSwitchId = (typeof TEAM_IDS)[number];

/** 서비스 메타 (랜딩 데모용) */
export const BATDI_META = {
  name: '밧디',
  nameEn: 'batdi',
  tagline: '너의 야구 친구',
} as const;
