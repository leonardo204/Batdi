/**
 * CacheLookup 노드 (W2 stub) — 항상 cacheHit='miss'
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md §4 (4단계 캐시 L0~L3)
 *
 * ⚠️ W2 범위에서는 L0 Envelope / L1 Template / L2 Partial / L3 Full 캐시 조회를
 *    수행하지 않고 항상 MISS로 둔다(stub). 항상 UIComposer로 진행.
 *    실제 캐시 조회·키 생성(sha256(intent||params||teamId||date||personaScope))은 P2+.
 */
import type { CoreGraphState, CoreGraphUpdate } from '../state';

export function cacheLookup(_state: CoreGraphState): CoreGraphUpdate {
  return { cacheHit: 'miss' };
}
