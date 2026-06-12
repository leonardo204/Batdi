/**
 * 부트스트랩 환경 설정 — 다른 import 보다 먼저 평가되어야 하는 부수효과.
 *
 * CopilotKit 익명 텔레메트리는 모듈 로드 시점에 env 를 읽는다. agent/run 처리 중
 * lambdaClient.send 미정의로 프로세스가 크래시하는 런타임 v1.60 버그를 회피하려면
 * @copilotkit/runtime 이 require 되기 *전에* 이 변수를 설정해야 한다.
 *
 * 따라서 이 파일을 main.ts 의 최상단(app.module 보다 위)에서 import 한다.
 */
if (process.env.COPILOTKIT_TELEMETRY_DISABLED === undefined) {
  process.env.COPILOTKIT_TELEMETRY_DISABLED = 'true';
}

export {};
