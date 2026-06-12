import type { Config } from 'tailwindcss';
import batdiPreset from '@batdi/ui/tailwind-preset';

const config: Config = {
  presets: [batdiPreset],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    // @batdi/ui 패키지 내 클래스도 스캔
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
};

export default config;
