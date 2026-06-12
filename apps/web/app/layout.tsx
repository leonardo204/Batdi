import type { Metadata, Viewport } from 'next';
import './globals.css';
import '@copilotkit/react-ui/styles.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: '밧디 (batdi) — 너의 야구 친구',
  description: 'KBO 야구 전문 Agentic Chatbot. bat + buddy.',
};

export const viewport: Viewport = {
  themeColor: '#0B0B0E',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 다크모드 기본. data-team 은 사용자 팀 선택 시 런타임 주입.
  return (
    <html lang="ko" data-theme="dark" data-team="hanwha">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
