/**
 * news-rss.scraper.ts — Google News RSS 기반 KBO 뉴스 스크래퍼 (P3-W7 7.5, ADR-048).
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md ADR-048.
 *
 * ⚠️ 크롤 채널은 **Google News RSS 공개 피드만** 사용한다 — 네이버/다음 직접 크롤 절대 금지
 *    (CLAUDE.md 불변식). RSS 는 robots 무관 공개 피드라 허용.
 * ⚠️ CLAUDE.md "요청 간격 10초+·동시 1·순차" — for...of 순차 + 팀 사이 sleep(REQUEST_DELAY_MS).
 *
 * best-effort: fetch/파싱 실패는 throw 하지 않고 빈 배열을 반환한다(graceful degradation).
 * cheerio(xmlMode)로 `<item>`(title/link/pubDate/source)을 파싱해 상위 N 건만 추린다.
 */

import { Injectable, Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { NEWS_REQUEST_DELAY_MS, NEWS_TEAM_QUERIES, NEWS_TOP_N } from './news.constants';

/** RSS 1건 → 뉴스 행(cache_news 적재용 부분 구조). */
export interface NewsScrapeRow {
  /** 팀 코드(hanwha/doosan/kia/lotte) 또는 null(일반 KBO). */
  teamId: string | null;
  /** 기사 제목. */
  title: string;
  /** 기사 원본 URL(link). upsert 멱등키. */
  url: string;
  /** 출처(매체명) — RSS `<source>` 텍스트, 없으면 null. */
  source: string | null;
  /** 게시 시각 — RSS `<pubDate>` 파싱(파싱 실패 시 null). */
  publishedAt: Date | null;
}

/** 지정 ms 만큼 대기(요청 간격 확보). */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Google News RSS 검색 URL 생성(한국어·KR). */
export function buildRssUrl(query: string): string {
  const q = encodeURIComponent(query);
  return `https://news.google.com/rss/search?q=${q}&hl=ko&gl=KR&ceid=KR:ko`;
}

@Injectable()
export class NewsRssScraper {
  private readonly logger = new Logger(NewsRssScraper.name);

  /**
   * 한 팀(또는 일반)의 Google News RSS 를 fetch·파싱해 상위 N 건을 반환한다(best-effort).
   *
   * @param teamId 팀 코드 또는 null(일반 KBO)
   * @param query  검색 쿼리(예: "KBO 한화")
   * @returns NewsScrapeRow[] (실패 시 빈 배열)
   */
  async scrapeTeamNews(
    teamId: string | null,
    query: string,
  ): Promise<NewsScrapeRow[]> {
    const url = buildRssUrl(query);
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': 'batdi-newsbot/1.0' },
      });
      if (!res.ok) {
        this.logger.warn(`RSS fetch 실패(${query}): HTTP ${res.status}`);
        return [];
      }
      const xml = await res.text();
      return this.parseRss(xml, teamId);
    } catch (err) {
      this.logger.warn(`RSS fetch/파싱 오류(${query}): ${String(err)}`);
      return [];
    }
  }

  /**
   * RSS XML 문자열 → NewsScrapeRow[] (순수 파싱, 테스트가 직접 검증).
   * cheerio xmlMode 로 `<item>` 순회. url 없는 항목은 skip. 상위 NEWS_TOP_N 건만.
   */
  parseRss(xml: string, teamId: string | null): NewsScrapeRow[] {
    const $ = cheerio.load(xml, { xmlMode: true });
    const rows: NewsScrapeRow[] = [];

    $('item').each((_i, el) => {
      if (rows.length >= NEWS_TOP_N) {
        return;
      }
      const item = $(el);
      const title = item.find('title').first().text().trim();
      const link = item.find('link').first().text().trim();
      const source = item.find('source').first().text().trim();
      const pubDate = item.find('pubDate').first().text().trim();

      if (link === '' || title === '') {
        return; // url/title 없는 항목은 skip
      }

      const publishedAt = pubDate !== '' ? new Date(pubDate) : null;
      rows.push({
        teamId,
        title,
        url: link,
        source: source !== '' ? source : null,
        publishedAt:
          publishedAt && !Number.isNaN(publishedAt.getTime())
            ? publishedAt
            : null,
      });
    });

    return rows;
  }

  /**
   * 4팀(hanwha/doosan/kia/lotte) 뉴스를 순차 크롤한다(요청 간 10초 sleep, 동시 1).
   * best-effort — 한 팀 실패가 다른 팀을 막지 않는다(빈 배열만 누락).
   *
   * @returns 전 팀 NewsScrapeRow 평탄 배열(실패 팀은 0건 기여).
   */
  async scrapeAll(): Promise<NewsScrapeRow[]> {
    const all: NewsScrapeRow[] = [];
    const entries = NEWS_TEAM_QUERIES;

    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i];
      if (entry === undefined) {
        continue;
      }
      const rows = await this.scrapeTeamNews(entry.teamId, entry.query);
      all.push(...rows);
      // 마지막 팀 뒤에는 sleep 불필요.
      if (i < entries.length - 1) {
        await sleep(NEWS_REQUEST_DELAY_MS);
      }
    }

    this.logger.log(`Google News RSS 크롤 완료: collected=${all.length}`);
    return all;
  }
}
