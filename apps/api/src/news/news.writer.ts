/**
 * news.writer.ts — 뉴스 행 Prisma 영속화 (P3-W7 7.5, ADR-048).
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md ADR-048.
 *
 * 각 행마다 summary = await summarizer.summarize(title)(best-effort, null→title 폴백 안 함:
 *   summary 컬럼은 null 허용이라 null 그대로 저장) 후 cache_news 를 url 자연키로 upsert 한다.
 *  - expiresAt = now + 24h (NEWS_TTL_MS). source = 'google-news'.
 *  - url 없는 행은 skip. url unique(@unique) 라 upsert 멱등.
 *  - best-effort: 행별 upsert 실패는 흡수하고 다음 행으로 진행(throw 금지).
 *
 * kbo-writer.ts 의 upsert(created/updated 구분) 패턴 그대로.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NewsSummarizer } from './news.summarizer';
import { NEWS_SOURCE_TAG, NEWS_TTL_MS } from './news.constants';
import type { NewsScrapeRow } from './news-rss.scraper';

/** 뉴스 write 결과 요약. */
export interface NewsWriteResult {
  /** 입력 행 수. */
  collected: number;
  /** 신규 생성된 행 수. */
  saved: number;
  /** 기존 행 중 갱신된 수. */
  modified: number;
}

@Injectable()
export class NewsWriter {
  private readonly logger = new Logger(NewsWriter.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly summarizer: NewsSummarizer,
  ) {}

  /**
   * 뉴스 행들을 cache_news 에 upsert(by url). 각 행 summary 는 LLM best-effort.
   *
   * @param rows 스크랩된 뉴스 행들
   * @returns {collected, saved, modified}
   */
  async write(rows: NewsScrapeRow[]): Promise<NewsWriteResult> {
    let saved = 0;
    let modified = 0;
    const expiresAt = new Date(Date.now() + NEWS_TTL_MS);

    for (const row of rows) {
      if (!row.url || row.url.trim() === '') {
        continue; // url 없는 행 skip(upsert 키 부재)
      }

      // 제목 1문장 요약(best-effort). 키 없음/오류 → null(컬럼 null 저장).
      const summary = await this.summarizer.summarize(row.title);

      try {
        const existing = await this.prisma.cacheNews.findUnique({
          where: { url: row.url },
          select: { id: true },
        });

        await this.prisma.cacheNews.upsert({
          where: { url: row.url },
          create: {
            teamId: row.teamId,
            title: row.title,
            url: row.url,
            summary,
            publishedAt: row.publishedAt,
            source: NEWS_SOURCE_TAG,
            expiresAt,
          },
          update: {
            teamId: row.teamId,
            title: row.title,
            summary,
            publishedAt: row.publishedAt,
            source: NEWS_SOURCE_TAG,
            expiresAt,
          },
        });

        if (existing) {
          modified += 1;
        } else {
          saved += 1;
        }
      } catch (err) {
        // best-effort — 행별 실패는 흡수하고 다음 행 진행.
        this.logger.warn(`cache_news upsert 실패(${row.url}): ${String(err)}`);
      }
    }

    const result: NewsWriteResult = {
      collected: rows.length,
      saved,
      modified,
    };
    this.logger.log(
      `cache_news upsert: collected=${result.collected} saved=${result.saved} modified=${result.modified}`,
    );
    return result;
  }
}
