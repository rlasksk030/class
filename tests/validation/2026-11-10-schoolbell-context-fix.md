# 학교종이 context-unverified 진단 및 실제 게시 후 재검증

기준 HEAD `3758d459efc78c573ca195995c85f190dbed7922`의 후속 변경이다. 아래 결과는 이번 Mac 개발 앱에서 새로 확인했다. 이전 A/B/C 및 Windows PASS를 재사용하지 않는다. 계정·학급·게시물의 실제 식별값과 세션은 로컬 시험 프로필에만 보관한다.

## 실제 결과

| 단계 | 이번 결과 |
|---|---|
| 앱 등록 → 제목·본문 입력 | PASS — 기존 합성 초안으로 최종 확인창 도달 |
| 사진 1장 첨부·게시 전 원본 대조 | PASS — 기존 PNG 97 bytes, SHA-256 일치 |
| 대상·내용 최종 확인 → 실제 보내기 | PASS — 기존 승인 내용으로 native mouse 입력 1회, trusted 이벤트 확인 |
| 서버 완료 화면·전체 게시물 재조회 | PASS — 전체 4건 → 5건, 동일 시험 제목 0건 → 1건 |
| 최초 게시 후 자동 성공 처리 | FAIL — 수신대상 재검증에서 context-unverified, uncertain/초안 보존 |
| 수정 후 재전송 없는 결과 재검증 | PASS — 현재 대상·원래 승인·서버 본문·사진 원본 대조 후 성공 증거 저장 |
| 성공 이력·변경 없는 초안 정리 | PASS — 게시물 ID가 있는 receipt 저장, 본문·사진 비움, 새 초안 안내 |
| 최신 수정본의 등록 버튼부터 중단 없는 1회 완주 | NOT RUN — 추가 게시하지 않음. 아래 재검증을 거친 성공과 구분 |

실제 보내기는 이번 작업 전체에서 한 번뿐이다. 중단 후 다시 보낸 것이 아니다. 게시 성공의 마무리는 **조회만 하는 복구 경로**를 거쳤으므로 중단 없는 자동 등록 전체 PASS로 표현하지 않는다. 학교종이 작성일과 즉시발행 서버 날짜는 각각 2026-11-09 / 2026-11-10으로 구분해 기록했다.

## 실패 조건과 수정

이전 본문 입력 직후의 오류는 이번 입력 준비에서 재현되지 않았다. 당시 기록에는 내부 조건이 없어 그 과거 실패까지 동일 원인으로 확정할 수 없다. 이번에는 다음 실제 실패 조건을 확보했다.

1. 게시 후 `prepared-guard(phase=submitted, action=read)`의 `readContext`가 실행됐다. 학급 페이지·학년/반·관리자 편집 권한·빈 명부·빈 초대 대상은 확인됐고 시험 승인도 존재하며 대상에 맞았다.
2. `recipientTableEmpty=false` 때문에 `testFacts(facts)=false`가 됐고 `testAuthorization.attach()`가 `context-unverified`를 반환했다. 네트워크 취소나 document epoch 비교 실패가 아니라 context 공급자 내부에서 실패했다. 원문·계정 없이 단계·불리언만 남겼다.
3. 독립 읽기 전용 검사에서도 `recipientCheck={known:false,reason:"dialog-count"}`를 관찰했다. 수신대상 창을 정확히 하나로 확인하지 못한 상태다. 당시 0개인지 복수인지 기록되지 않아 특정 개수로 단정하지 않는다. 이후 진단에는 개수도 추가했다.
4. 실제 화면에서는 초기 `ng-busy-backdrop`이 버튼을 가렸다가 준비 후 사라지는 현상도 확인했다. 다만 보내기 버튼 가림 관찰이 모든 과거 수신대상 오류의 직접 원인을 증명하지는 않는다.

`schoolbell-recipients.cjs`는 관찰된 ‘변경’ 버튼의 유일성·활성 상태·실제 화면 hit-test를 기다린 뒤, 클릭 직전에 다시 확인하고 한 번만 연다. 열린 뒤 수신대상 창을 확인하지 못하면 다시 클릭하지 않고 실패한다. 기존 대상 문구 비교, 필터 없는 빈 명부, 관리자 조건, 닫힘 대기, 대상/승인/문서 변경 guard는 유지한다. 미확인 값을 true로 바꾸지 않았다.

prepared driver, Electron evidence reader, live context provider에 실패 단계/조건 진단을 추가했다. 본문·이름·계정·게시물 ID·쿠키·원문 DOM은 로그에 넣지 않는다.

## 이미 게시된 결과의 안전한 마무리

처음 성공 처리만 실패했으므로 새 게시 없이 기존 서버 결과를 증명해야 했다. `schoolbell-reconcile.cjs`와 앱의 ‘게시 결과 재검증 (재전송 없음)’을 개발 시험 프로필에만 연결했다.

- 입력·첨부·보내기 함수가 없는 조회 전용 경로다. 이미 전송 후 `verifying`까지 도달한 `auto-uncertain` 시도만 허용한다.
- 저장된 초안 fingerprint와 현재 내용·사진이 정확히 일치해야 한다. 원래 main-process 최종 승인 감사 기록의 내용 digest, 시간, 대상 및 서비스 학급 ID를 검증한다. 새 학급의 유사한 글을 이전 시도의 성공으로 만들지 않는다.
- 현재 시험 승인과 실제 학급·수신대상을 조회 전후 재검증한다. 전체 목록의 유일한 일치 게시물, 제목·전체 본문·게시 날짜·사진 원본 개수와 순서·크기·SHA-256을 검증한다.
- 실제 원본 1장: 97 bytes, `1d6f13d252fe9b29809f8d04f04872a5013025bf0e5fb34e57c16bc50381ccc3`. 게시물 ID는 로컬 receipt에 존재함을 확인했다. 공개 증거에는 식별값을 싣지 않는다.
- 성공 receipt를 먼저 저장하고 기존 renderer의 이력 저장·편집 revision 대조·초안 정리를 재사용한다. 이전 uncertain 상태와 verifying 단계는 reconciliation 이력으로 남긴다. 원래 실패 진단 파일도 보존했다.
- 실제 수정 앱에서 이 조회 전용 경로로 성공 receipt와 ‘재전송 없이 재검증’ 표시, 본문/사진이 없는 새 초안 안내를 확인했다. 원래 승인 감사 기록과 게시물 학급 일치 조건은 마지막 보강 후 실제 로컬 저장 기록으로도 별도 대조했다. 이 마지막 보강을 포함한 전체 UI 재실행/추가 게시는 하지 않았다.

## 이번에 실행한 제한된 검사

| 명령/범위 | 결과 | 성격 |
|---|---|---|
| `node --test app/schoolbell-electron-driver.test.cjs app/schoolbell-prepared-driver.test.cjs` | 69/69 | 진단 추가 후 기존 guard 유지 |
| `node --test app/schoolbell-recipients.test.cjs app/schoolbell-reconcile.test.cjs app/schoolbell-live-evidence.test.cjs` | 10/10 | 가림/중복 창 차단, 조회 전용 복구, 실제 UI 증거 계약 |
| `node --test app/diary-services.test.cjs` | 11/11 | 기존 이력 저장/중복 처리 |
| `node tests/e2e/schoolbell-completion.e2e.cjs` | 12/12 | 합성 IPC의 receipt/이력/초안 처리, 저장 실패/중간 수정/학급 전환 보존 |
| `node --test app/schoolbell-reconcile.test.cjs app/schoolbell-test-authorization.test.cjs` | 5/5 | 마지막 원래 승인·학급 binding 보강 후 재검사 |
| 실제 저장된 원래 최종 승인 ↔ 원래 학급 ↔ 성공 receipt | PASS | 로컬 원본 감사 기록으로 대조, 추가 전송 없음 |
| 변경 파일 구문 검사 / `git diff --check` | PASS | 소스 검사 |

검사 횟수를 합산한 성과로 보고하지 않는다. 마지막 두 단위검사의 복구 사례는 앞 검사와 중복되며 원래 승인 대조를 추가한 뒤 필요한 재검사다. E2E 출력의 live BLOCKED 문구는 합성 fixture의 범위를 뜻하며 위 실제 서비스 관찰을 대체하지 않는다.

## 보존·배포 상태

이전 작성창 보존 백업·실패 문서·원본 증거를 유지했다. 하이클래스 등록 코드는 변경하지 않았고 UI 복귀 검사는 통과했지만 이번에 하이클래스 실서비스 전체 회귀를 수행한 것은 아니다. Windows 최종 회귀·설치·업데이트·재부팅도 NOT RUN이며 이전 환경 차단 상태를 유지한다.

운영 capability=false, PR #5 Draft 유지. 공식 서비스 허용 증거를 새로 만들지 않았고 개발 시험 승인을 운영 권한으로 확대하지 않았다. 정식 배포 NO GO. 버전·Release·설치 파일·전국용/옥구초 업데이트 채널 변경 없음.

Push 전 Actions 총19/마지막41977391612, 워크플로는 다른 개발 브랜치 push와 수동 실행만 대상이다. 현재 브랜치 변경에 Actions 실행이 없는 것을 확인한 뒤 `[skip ci]` 커밋을 사용한다. 신규 실행 0회·추가 비용 0원 유지. Push 후 상태는 PR/Issue에 기록한다.

증거: [개인정보 없는 이번 검사 자료](artifacts/2026-11-10-schoolbell-context-fix/). 원래 초안 백업과 실제 게시물 식별값은 로컬 시험 프로필에 보존하며 GitHub에 포함하지 않는다.
