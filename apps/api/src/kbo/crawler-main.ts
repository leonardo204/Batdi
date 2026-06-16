/**
 * crawler-main.ts — KBO 크롤러 standalone 엔트리포인트 (전용 docker 컨테이너).
 *
 * HTTP 서버 없이 NestFactory.createApplicationContext 로 CrawlerModule 만 부팅한다.
 *  - ScheduleModule 의 @Cron('0 4 * * *', Asia/Seoul) 타이머가 이벤트루프를 점유해 프로세스가 살아있다.
 *  - DailyKboScheduler.onApplicationBootstrap 이 KBO_CRAWLER_ENABLED='true' 이고 시즌 데이터가
 *    비어있으면 전체 시즌 백필을 fire-and-forget 으로 트리거한다(부팅 비블로킹).
 *
 * ⚠️ 온디맨드 크롤링 없음(HTTP 엔드포인트 미존재). 정해진 스케줄·최초 백필로만 동작.
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { CrawlerModule } from './crawler.module';

async function bootstrap(): Promise<void> {
  const logger = new Logger('CrawlerMain');
  const app = await NestFactory.createApplicationContext(CrawlerModule, {
    logger: ['log', 'warn', 'error', 'debug'],
  });
  app.enableShutdownHooks();
  logger.log(
    'KBO 크롤러 컨텍스트 기동 — 스케줄러 등록 완료. KBO_CRAWLER_ENABLED 게이트에 따라 동작.',
  );

  const shutdown = (signal: string): void => {
    logger.log(`${signal} 수신 — 크롤러 graceful 종료`);
    void app.close().then(() => process.exit(0));
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

void bootstrap();
