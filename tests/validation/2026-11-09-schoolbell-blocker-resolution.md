# 학교종이 차단 조건과 게시 전 원본 검증 — 2026-11-09

기준 HEAD `402b384e62c3647518b27139bc532299d8e2f427`, 구현 커밋 `ebb4d34c02acaadd4f758372a79b244bfd8a5066`.
기존 개발 브랜치와 Draft PR #5 / Issue #4를 유지한다. **앱 자동 등록 완주는 BLOCKED, 출시 NO GO**다. 이번에 날짜 계약과 게시 전 원본 다운로드의 실제 오류를 해결했지만 운영 잠금은 해제하지 않았다.

## 실제 앱에서 이번에 확인한 결과

- 앱 소유 Electron 세션에서 기존 시험 학급에 접속했다. 코드 적용을 위한 재실행에서도 직접 로그인한 세션을 계속 사용했다. 외부 브라우저 인증정보 복사·세션 파일 읽기 없음.
- 실제 즉시/예약 선택창의 native radio에서 **즉시발행**을 확인했다. 즉시발행에는 지정할 게시 날짜가 없다. 메뉴를 닫으면 radio가 DOM에서 사라지는 것도 확인했다.
- 학년·반 표시는 앱 설정과 일치했다. 검색 없는 발행 대상 표가 비어 있고 학생·학부모 대상이 없는 점을 확인했다. 필수 관리자 수신자는 별도 검증 대상이다.
- 앱에 저장한 합성 PNG를 정상 파일 선택 UI로 비게시 첨부했다. 처음에는 미리보기 로딩/주소 전환으로 원본 reader가 실패했다. 수정 후 **앱의 ‘첨부 원본 확인 (게시 안 함)’ 버튼 → 실제 미리보기 파일 다운로드 → 앱 원본 대조**가 1장과 2장에서 모두 성공했다.
- 2장 각각 **97 bytes**, SHA-256과 표시 순서 일치. JPEG 미리보기 이미지는 사용하지 않았다. 실제 원본 파일 다운로드가 지원되므로 원본 검증을 생략하는 대안을 추가하지 않았다.
- 검사 후 앱 초안의 본문·사진 2장은 유지됐고 검증용 임시 폴더는 0개였다. 운영 등록 버튼은 표시되지만 비활성 상태다.
- **신규 게시 0회**. 이전 A/B/C 게시, 기존 글 본문·원본 조회를 반복하지 않았다. 이번 가상 사진은 오류 수정에 따른 비게시 업로드만 수행했다. 이것을 앱 등록 버튼의 자동 입력·자동 첨부·게시 성공으로 계산하지 않는다.

[1장 원본 증거](artifacts/2026-11-09-schoolbell-blocker-resolution/live-original-one.json), [2장 원본 증거](artifacts/2026-11-09-schoolbell-blocker-resolution/live-original-two.json), [수정 전 실패](artifacts/2026-11-09-schoolbell-blocker-resolution/live-preview-before-route-fix.json), [대상·발행 방식 검사](artifacts/2026-11-09-schoolbell-blocker-resolution/live-context-and-mode.json).
파일에는 합성 사진 해시·크기·불리언·구조만 포함했다. 실제 학급/계정/게시물 식별값, 연락처, 세션, 사진 파일은 기록하지 않았다.

## 차단 조건별 원인·공급자·수정·실제 결과

| 조건 | 실제 코드/공급자와 누락 근거 | 이번 처리 및 판정 |
|---|---|---|
| `capability.enabled` | `schoolbell-capability.cjs`의 코드 소유 false. renderer/환경변수로 해제 불가 | 유지. 전체 앱 게시 검증·잠금 해제 승인 전 **BLOCKED** |
| 허용 정보 | `createRuntimeDriver`에 permission 공급자가 주입되지 않아 기본 null. `requirePermission`과 prepared driver가 official/method/school/class/actions/evidenceRef/test-class 범위를 각각 요구 | 구현 누락과 공식 근거 부재를 명시. 가상 사진 업로드 허용을 공식 허용으로 바꾸지 않음. **BLOCKED** |
| `identityVerified` | live context 공급자는 있지만 독립 학급 설정에 학교·학년도 필드가 없음. 학급 이름은 수정 가능한 표시 이름. `schoolVerified/yearVerified`는 현재 false | 없는 선택자를 만들지 않음. 실제 학교/학년도 대조 **BLOCKED** |
| `actorVerified/actorKey` | 계정 화면의 ‘새 이름’ 입력값과 기본 프로필 사진은 고유 신원이 아님. 현재 연락처 표시의 존재는 확인했으나 관리자 카드에는 대조할 고유 값이 없음 | 연락처 값 대신 존재 여부만 반환. 이름/사진 해시를 actorKey처럼 제공하던 부분 제거. 신원 **BLOCKED** |
| `authorityVerified/teacher` | 관리자 카드 1개와 관리 화면 접근만으로 현재 계정=필수 관리자임을 증명하지 못함. 실제 권한 공급자는 완성되지 않음 | 표시 이름 일치만으로 true 처리하지 않음. **BLOCKED** |
| `classApproved/testClassApproved` | main evidence factory에서 false. 서비스의 거절 응답이 아니라 검토된 실제 대상·시험 범위를 증명할 기록이 연결되지 않은 상태 | 사용자 소유 테스트 학급이라는 기존 설명을 보존하되 다른 권한 검증으로 대체하지 않음. **BLOCKED** |
| `recipientsVerified` | 실제 대상 창의 검색 없는 빈 표는 확인. 학생 0/부모 0은 확인됨. 필수 관리자는 checked+disabled | 학생·부모 없음 **PASS**. 본인 관리자 고유 연결 및 최신 notificationEvidence, 범위가 지정된 selfNotice 공급자는 없음. 전체 수신자 증명 **BLOCKED** |
| `readDate.verified` | 종전에는 false 및 ‘게시일=초안 날짜’를 요구. 실제 서비스는 즉시/예약 발행 방식 제공 | 실제 native radio 공급자 연결. 즉시발행 **관찰 PASS**, 날짜 분리 및 최종 DOM 확인 로컬 PASS. 새 게시의 서버 날짜 검증은 **NOT RUN** |
| `readUploads.complete` | 원본 공급자는 있었지만 iframe 최초 주소를 최종 미리보기 주소로 오인해 차단 | 실제 학급 classnews preview로 전환 완료를 기다린 뒤 같은 프레임/경로를 고정. 1·2장 원본 다운로드/해시/크기/순서 **실제 앱 PASS** |
| 전체 게시물/원격 중복 | 기존 live post provider의 끝 표시·전체 ID·동일 제목 후보 원본 조회는 이전 커밋에서 실제 앱 성공 | 코드 재사용. 이번에 이전 조회를 반복하지 않음. 즉시발행에서 로컬 날짜만 바꾼 같은 내용도 중복으로 차단하도록 수정, 로컬 PASS |
| 최종 DOM/단일 게시 | 기본 guard/publisher가 대상·내용·첨부·revision·발행 방식을 재검증한 뒤 1회 클릭, pending 먼저 저장 | 즉시발행 DOM 재확인 연결. 입력/사진/대상 변경은 계속 차단. 실서비스 신규 게시 **NOT RUN / BLOCKED** |
| 성공 증거/초안 | publisher가 원본을 포함한 결과 검증 후 이력을 저장하고 renderer가 변경 없는 초안만 정리 | 작성일/서버 발행일을 구분해 이력에 저장. 기존 보존 계약 유지. 신규 실서비스 성공이 없으므로 성공 이력·초안 초기화 **NOT RUN** |

학교/학년도 근거와 본인 관리자 연결은 **사용자가 다시 로그인하지 않아서** 막힌 것이 아니다. 현재 확인한 독립 학급 UI에 필요한 독립 근거가 없는 문제다. 새 로그인이나 같은 A/B/C 시험 반복으로 해결됐다고 처리하지 않는다.

## 날짜와 원본 연결 변경

`schoolbell-publication-mode.cjs`와 `schoolbell-date-policy.cjs`가 관찰된 발행 방식과 날짜 계약을 분리한다. 앱 날짜는 초안 키로 유지하고, 학교종이는 즉시발행만 지원한다. 임의의 날짜 입력란, PC 시계/기본 제목에서 추정한 서버 날짜, 예약 기능은 추가하지 않았다. 최종 확인에도 이 차이를 안내한다. 성공 후 새 게시물에 표시된 유효한 날짜가 있어야 하고 `draftDate/publishedDate`를 따로 저장한다. 기존 날짜 계약/사진 없는 이력과 호환된다.

`schoolbell-electron-driver.cjs`는 대상 조회가 메뉴를 닫을 수 있으므로 각 변경 직전에 발행 방식 UI를 다시 확인한다. `schoolbell-final-guard.cjs`는 실제 native checked 상태를 같은 DOM 작업에서 검사한다. `schoolbell-observed-composer.cjs`는 읽기용 메뉴 표시를 본문 편집으로 오인하지 않으면서 제목·본문·사진·대상 변경, 조합 입력, 문서 교체를 계속 감지한다.

`schoolbell-preview-originals.cjs`의 실제 오류는 ‘iframe src = 최종 preview 주소’라는 가정이었다. 프레임이 초기 문서에서 관찰된 학급 미리보기 경로로 이동한다. 허용 호스트·현재 학급·classnews·preview 경로·origin을 대조한 뒤 최종 프레임 주소를 고정하고, 관찰된 Ionic 파일 버튼만 사용한다. 파일명 단독으로 성공시키지 않고 독립 다운로드 바이트의 크기·형식·SHA-256·순서를 원본과 비교한다. 표시 JPEG·비공개 API·인증 추출은 사용하지 않는다.

개발 프로필에서만 보이는 읽기 전용 확인 버튼은 이 원본 공급자를 직접 검증하기 위한 도구다. 자동 등록 잠금을 우회하거나 성공 이력/초안을 수정하지 않는다.

## 이번 검사와 한계

- 구현 커밋의 최종 전체 Node 회귀 **211/211**, 구문 **131/131**. 중간 209/209 이후 실제 원본 경로 수정과 새 경계 검사 2건이 추가되어 최종 전체 검사를 한 번 수행했다. 관련 검사 8/8·최종 URL 경계 2/2 기록도 보존하되 겹치는 수를 합산하지 않는다.
- 실제 로컬 Electron 날짜/최종 guard **4/4**: 대상 변경 차단, 예약으로 바뀐 상태 차단, 표시용 DOM 변화 후 단일 게시·별도 날짜 이력, 문서 교체 revision 변경.
- 실제 로컬 Electron 원본 연결 **4/4**: iframe 초기화 후 실제 형식 경로로 이동, 두 원본 순서 및 불일치 차단 포함. 외부 요청을 차단한 격리 fixture이며 실서비스 게시 PASS가 아니다.
- 학교종이 UI 회귀 **20/20**, 하이클래스 게시 **21/21**, 하이클래스 사진 **4/4**. 기존 하이클래스 소스·배포 채널·버전·appId·백업 로직 변경 없음.
- 실제 UI 검증은 위 날짜/빈 수신표/게시 전 1·2장 원본 검사만 이번 결과다. 기존 A/B/C 및 이전 앱 readback 기록은 이전 증거로 보존한다.
- macOS Electron 실행의 sandbox extension 경고는 원본 로그에 남겼으며 검사 종료 0과 구분한다.

Windows: 기존 VM만 재개했다. 기본 원격 실행은 로그인 사용자 대신 SYSTEM/systemprofile에서 실행됨을 확인했다. 공통 `Program Files\\nodejs\\node.exe`는 없고 SYSTEM의 사용자별 경로 조회로 실제 교사 사용자의 설치 부재를 단정할 수 없다. 공식 `--current-user` 실행으로 Node 버전/위치를 확인했지만 각각 시간 초과였다. PowerShell 설치 경로/레지스트리 조회도 시간 초과. 새 설치·VM·유료 자원 없이 원래 suspended 상태로 복귀했다. **Windows 제품·설치·업데이트·재부팅·클립보드 NOT RUN**, 제품 FAIL로 기록하지 않는다.

## 전체 실제 앱 흐름과 다음 조건

| 실제 앱 단계 | 판정 |
|---|---|
| 연결 버튼 → 앱 세션 → 테스트 학급 | 기존 성공 유지, 이번 작업에서도 세션 사용 |
| 등록 버튼 표시 | PASS, 잠금 유지 |
| 등록 버튼 → 자동 입력·첨부 | BLOCKED: 허용 공급자 및 학교/학년도/교사/본인 관리자 근거 미완성 |
| 게시 전 사진 원본 확인 | PASS: 실제 앱 1장/2장, 해시·크기·순서 일치 |
| 최종 승인 → 신규 실제 게시 | BLOCKED / NOT RUN, 새 게시 0회 |
| 신규 게시 → 서버 재조회·원본 대조 | BLOCKED / NOT RUN |
| 신규 성공 이력 → 변경 없는 초안 초기화 | BLOCKED / NOT RUN |
| 원본 검사 실패/성공 후 초안 보존 | PASS |

추가 로그인·기존 게시 재시험을 요청하지 않는다. 다음 완주 시험에는 실제 학교·학년도와 현재 계정/필수 관리자의 고유 연결을 증명할 서비스 UI 근거, 검토된 허용 범위 및 그 근거에 묶인 main-process 공급자가 필요하다. 그 후 구체적인 대상·내용·사진을 준비하여 **별도 최종 게시 승인**을 받는다. 확인 불가능한 권한을 임의 true로 만들거나 운영 잠금을 먼저 해제하지 않는다.

## GitHub / 비용

브랜치와 PR base의 workflow blob `58613481272e59545c0c910d5d6e033a65f0247a`가 같고, 다른 Windows 개발 브랜치 push/수동 dispatch만 구독한다. 현재 브랜치/PR 트리거 없음. Push 전 Actions 총 **19**, 마지막 **41977391612**. 신규 실행·재실행 요청 0회, 추가 비용 0원. [skip ci]로 기존 브랜치에 반영하며 Draft 유지, 병합·빌드·Release·배포·결제/권한/워크플로 변경 없음. Push 후 확인은 PR #5 / Issue #4에 기록한다.

[검사 결과·소스/로그 해시](2026-11-09-schoolbell-blocker-resolution-results.json). 기존 감사·실패 로그는 삭제하거나 고치지 않았다.

