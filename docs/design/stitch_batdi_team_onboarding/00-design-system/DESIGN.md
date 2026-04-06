# Design System Specification: High-End Baseball Intelligence

이 디자인 시스템은 KBO 야구 AI 챗봇 '밧디(Batdi)'를 위한 프리미엄 디지털 가이드라인입니다. 단순히 정보를 전달하는 앱을 넘어, 사용자에게 데이터의 깊이와 스포츠의 역동성을 'Editorial' 관점에서 전달하는 것을 목표로 합니다.

## 1. Creative North Star: "The Digital Dugout"
이 시스템의 핵심 컨셉은 **'Digital Dugout'**입니다. 경기장 뒤편의 정교한 전략 기지처럼, 어두운 배경 위에서 정밀한 데이터가 유기적으로 흐르는 고급스러운 환경을 지향합니다. Linear의 정교함, Vercel의 미니멀리즘, Claude의 대화형 직관성을 결합하여, 표준적인 그리드를 파괴하고 의도적인 비대칭과 레이어링을 통해 고유한 정체성을 구축합니다.

---

## 2. Color Strategy & Surfaces

표준적인 1px 테두리(Border) 중심의 디자인을 지양합니다. 우리는 색조의 변화와 깊이감을 통해 구획을 정의합니다.

### Palette Overview
- **Background**: `#0B0B0E` (Deep Space)
- **Surface/Card**: `#14151A` (Obsidian)
- **Primary Text**: `#E8E8EC` (Ice White)
- **Muted Text**: `#8A8B93` (Cool Grey)
- **Subtle Text**: `#5A5B63` (Iron)
- **Accent (Team Colors)**: 
    - Hanwha Orange: `#F15B2A`
    - Doosan Navy: `#131230`
    - Kia Red: `#EA002C`
    - Lotte Navy: `#041E42`

### The "No-Line" Rule
섹션을 나눌 때 1px Solid Border 사용을 엄격히 금지합니다. 경계는 오직 배경색의 변화(`surface-container-low`에서 `surface`로의 전이)나 미세한 톤 차이로만 구분합니다.

### Surface Hierarchy & Nesting
UI를 평면적인 그리드가 아닌, 여러 층의 '불투명한 유리'가 겹쳐진 레이어로 취급합니다.
- **Level 1 (Base)**: `surface-container-lowest` (#0B0B0E) - 전체 배경.
- **Level 2 (Section)**: `surface-container-low` (#111114) - 큰 콘텐츠 영역.
- **Level 3 (Card)**: `surface-container` (#14151A) - 개별 데이터 카드.
- **Level 4 (Floating)**: `surface-container-high` (#1F1F24) - 호버 상태 및 팝업.

### Glass & Gradient Rule
주요 CTA(버튼)나 히어로 섹션에는 단색 대신 미세한 그라데이션(`primary` -> `primary-container`)을 적용하여 디지털적인 '영혼'을 부여합니다. 플로팅 요소에는 `backdrop-blur`를 적용하여 배경색이 은은하게 투영되도록 유도하십시오.

---

## 3. Typography: Editorial Precision

Pretendard의 유연함과 Monospace의 정밀함을 결합하여 야구 데이터의 권위를 세웁니다.

| Category | Token | Font | Size | Weight | Color |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Display** | Title Large | Pretendard | 28px | Bold | `on-surface` |
| **Headline** | Player Name | Pretendard | 16px | SemiBold | `on-surface` |
| **Body** | Chat Bubble | Pretendard | 15px | Medium | `on-surface` |
| **Support** | Subtitle | Pretendard | 14px | Regular | `on-surface-variant` |
| **Data** | Stats/Numbers | Monospace | 14px | Medium | `primary` |
| **Micro** | Slogan/Label | Pretendard | 12px | Regular | `subtle-text` |

- **Spacing Tip**: 타이틀과 본문 사이의 간격은 8px 그리드를 따르되, 데이터 수치(Monospace) 주위에는 더 넓은 여백을 두어 가독성을 확보합니다.

---

## 4. Elevation & Depth (Tonal Layering)

그림자가 아닌 '톤의 중첩'으로 깊이를 표현합니다.

- **The Layering Principle**: `surface-container-lowest` 배경 위에 `surface-container-low` 카드를 배치하여 자연스러운 층차를 만듭니다.
- **Ambient Shadows**: 플로팅 요소에 그림자가 필요한 경우, Blur 값은 크게(20px 이상), Opacity는 극도로 낮게(4-6%) 설정하십시오. 그림자 색상은 단순 검정이 아닌 배경색의 틴트값을 섞어 사용합니다.
- **The Ghost Border**: 접근성을 위해 경계가 반드시 필요한 경우, `outline-variant` 토큰의 불투명도를 10-15%로 낮추어 '유령 테두리'를 만듭니다. 100% 불투명한 테두리는 절대 사용하지 않습니다.

---

## 5. Signature Components

### Chat Bubbles
- **Radius**: 20px (둥근 곡선으로 대화의 부드러움 강조).
- **Style**: AI 응답은 `surface-container-high`를 사용하고, 사용자 메시지는 미세한 테두리만 있는 투명한 형태를 유지하여 시각적 위계를 만듭니다.

### Data Cards
- **Radius**: 14px.
- **Layout**: Divider(구분선) 사용을 금지합니다. 대신 16px 또는 24px의 수직 여백(White Space)을 활용하여 정보를 그룹화하십시오.
- **Stats**: KBO 기록(AVG, ERA 등)은 반드시 Monospace 폰트를 사용하여 숫자의 정렬이 흐트러지지 않게 합니다.

### Interaction Buttons
- **Radius**: 10px.
- **Primary**: 구단 컬러(예: 한화 오렌지)를 배경으로 사용하되, 텍스트는 `on-primary`를 사용하여 명도 대비를 7:1 이상으로 유지합니다.
- **State**: Hover 시 배경색이 8% 더 밝아지는 대신, 미세한 `Inner Glow` 효과를 추가하여 고급스러움을 더합니다.

### Team Accent Chips
- 특정 구단 정보를 보여줄 때, 칩 전체를 해당 색상으로 채우지 마십시오. 왼쪽 끝에 4px 너비의 수직 바(Vertical Bar)로 팀 컬러를 표시하여 미니멀리즘을 유지합니다.

---

## 6. Do's and Don'ts

### ✅ Do
- **의도적인 여백**: 정보 밀도가 높을수록 더 대담한 여백을 사용하세요.
- **데이터 시각화**: 차트나 그래프는 `outline-variant`를 축으로 사용하고, 선의 굵기를 1.5px로 고정하여 정교함을 유지하세요.
- **비대칭 레이아웃**: 모든 요소를 중앙 정렬하지 마세요. 중요 지표는 왼쪽 상단에 크게, 부연 설명은 하단에 작게 배치하는 에디토리얼 레이아웃을 시도하세요.

### ❌ Don't
- **Solid Dividers**: 콘텐츠를 나누기 위해 흰색이나 회색의 직선을 긋지 마세요.
- **Generic Icons**: 시스템 기본 아이콘 대신, 선의 끝이 둥글고 굵기가 일정한(2px) 커스텀 아이콘 셋을 사용하세요.
- **High Contrast Borders**: 배경과 대비가 강한 테두리는 사용자 시선을 분산시킵니다. 오직 톤 차이로만 승부하세요.

---
**Director's Note:**
이 디자인 시스템은 절제를 통해 완성됩니다. '더하기'보다는 '빼기'를 통해 야구라는 역동적인 스포츠의 데이터를 가장 정적인 아름다움으로 승화시키십시오.