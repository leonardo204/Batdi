import { describe, it, expect } from 'vitest';
import {
  dotPathToJsonPointer,
  compileBindings,
  getStubScoreData,
  scoreSummaryText,
} from '../src/databind/compile';
import { SCORE_COMPACT_COMPONENTS } from '../src/templates/score_compact';

describe('DataBinder.dotPathToJsonPointer', () => {
  it('home.score → /home/score', () => {
    expect(dotPathToJsonPointer('home.score')).toBe('/home/score');
  });
  it('inning → /inning', () => {
    expect(dotPathToJsonPointer('inning')).toBe('/inning');
  });
  it('away.name → /away/name', () => {
    expect(dotPathToJsonPointer('away.name')).toBe('/away/name');
  });
});

describe('DataBinder.compileBindings', () => {
  it('{{bind:"home.name"}} 슬롯을 {path:"/home/name"} 로 컴파일', () => {
    const compiled = compileBindings([
      { id: 'home_name', component: 'Text', text: '{{bind:"home.name"}}' },
    ]);
    expect(compiled[0]).toEqual({
      id: 'home_name',
      component: 'Text',
      text: { path: '/home/name' },
    });
  });

  it('정적 문자열/children/id/component는 보존', () => {
    const compiled = compileBindings([
      {
        id: 'root',
        component: 'Column',
        children: ['title'],
      },
      { id: 'title', component: 'Text', text: '스코어', variant: 'h3' },
    ]);
    expect(compiled[0]).toEqual({
      id: 'root',
      component: 'Column',
      children: ['title'],
    });
    expect(compiled[1]).toEqual({
      id: 'title',
      component: 'Text',
      text: '스코어',
      variant: 'h3',
    });
  });

  it('score_compact 템플릿 전체 컴파일 — bind 슬롯만 path 객체로', () => {
    const compiled = compileBindings(SCORE_COMPACT_COMPONENTS);
    const homeName = compiled.find((c) => c.id === 'home_name');
    const homeScore = compiled.find((c) => c.id === 'home_score');
    const inning = compiled.find((c) => c.id === 'inning');
    expect(homeName?.text).toEqual({ path: '/home/name' });
    expect(homeScore?.text).toEqual({ path: '/home/score' });
    expect(inning?.text).toEqual({ path: '/inning' });
    // 정적 타이틀은 그대로
    const title = compiled.find((c) => c.id === 'title');
    expect(title?.text).toBe('스코어');
  });
});

describe('DataBinder stub data + summary', () => {
  it('getStubScoreData → 롯데 5 : 두산 3 (7회말)', () => {
    const data = getStubScoreData();
    expect(scoreSummaryText(data)).toBe('롯데 5 : 두산 3 (7회말)');
  });
});
