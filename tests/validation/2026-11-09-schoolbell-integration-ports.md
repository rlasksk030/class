# 학교종이 앱 연결부 후속 구현 — 2026-11-09

기준 HEAD `9d17b8be0b694a635b0f34efb3923f21a833b839`, 코드 커밋 `fb6020357a13f3ebcaef8f26736605c1a1a98d9d`. 기존 `feature/schoolbell-diary-nationwide` / Draft PR #5 / Issue #4를 유지한다. **앱 버튼부터 실제 게시·초안 정리까지는 아직 BLOCKED / 출시 NO GO**다. 운영 잠금을 해제하지 않았다.

사용자는 이번에도 앱 직접 로그인을 현재 할 수 없다고 답했다. 외부 브라우저 인증정보를 앱에 복사하지 않았다. 이전 브라우저 A/B/C 성공은 [당시 감사 기록](2026-11-09-schoolbell-electron-live.md)으로 보존하며 재게시하지 않았다. 이번 실서비스 신규 입력·업로드·게시 모두 0회다. 이전에 승인된 비게시 합성 사진의 미리보기와 기존 합성 게시 목록만 읽기 조사했다. 기존 사용자 작성 글을 수정·삭제하지 않았다.

## 이번에 실제로 새로 확인한 UI

| 관찰 | 결과와 구현에 반영한 범위 |
|---|---|
| 전체 최신 목록 | 개별 글 경로의 ‘최신 글 목록 보기’로 일반 classnews 목록에 진입했다. `검색` 입력/버튼, `작성하기` 버튼과 목록 끝의 `app-infinite-list-info p` 텍스트 `더이상 글이 없습니다.`를 확인했다. 이전의 ‘끝 표시 미확인’은 이번 관찰로 갱신된다. |
| 실제 스크롤 소유자 | `virtual-scroller`는 overflow visible이고 실제 스크롤은 상위 `.document-wrapper`가 처리했다. 목록 끝에서 실제 읽기 함수는 높이 649 / top 2411 / total 3077 / end true / 렌더된 ID 4개를 반환했다. **단일 샘플은 complete false**다. 앱 collector의 실서비스 전체 순회 성공으로 기록하지 않는다. |
| 발행 대상 | 작성폼의 `변경` 버튼 → `app-select-letter-targets`. 검색어가 비어 있고, 표 1개/정확한 헤더/`colspan=5`의 `구성원이 없습니다.` 한 행을 확인했다. 실제 probe는 학생·부모 대상 0, 필수 관리자 체크를 반환했다. `닫기`로 닫았고 대상 확인/저장 버튼은 누르지 않았다. 이름·전화번호와 명단을 수집하지 않았다. |
| 필수 관리자 | 관리자 체크는 checked + disabled. 대상 표가 비어 있어도 관리자 신원과 본인 알림 허용을 자동 검증한 것은 아니다. 전체 권한/수신대상 검증은 계속 false다. |
| 미리보기 원본 여부 | 기존 synthetic-1.png의 표시 이미지 다운로드는 **JPEG 4,120 bytes**, 원본은 **PNG 1,967 bytes**였다. 해시가 다르므로 표시 이미지로 원본 검증을 통과시킬 수 없다. |
| 미리보기 파일 컨트롤 | `app-mobile-preview`의 HTTPS v5 iframe → `app-group-board-letter-detail-preview` → `app-files-list ion-item.file-item` → open shadow root의 `button.item-native`를 확인했다. CUA 파일 컨트롤 클릭은 대상 오류, 다운로드 대기는 시간 초과였다. 실제 파일 원본 다운로드 **미확인**이며 서비스 금지라고 단정하지 않는다. 미리보기는 Escape로 닫았다. |

합성 이미지 해시만 기록한다. 원본 PNG: `42f53ca6f45208343a47e4b7e70e2bcb1a02457c5591c6d0476ba7d3f3987fe2`. 표시 JPEG: `18c44fc5ce733fb2fbda291564e575c9937182b684e2ffa5109b3542465641bc`. 이미지 파일 자체, 실제 학급/게시물 ID, 계정명, 세션은 저장소에 넣지 않는다.

## 연결한 코드

- `schoolbell-live-posts.cjs`: 새 동일 앱 세션 reader에서 일반 목록의 처음부터 실제 scroll owner를 겹치는 구간으로 순회한다. 빈 검색 입력, 관찰된 끝 표시, 안정된 연속 샘플을 요구한다. 로딩 중 빈 구간을 넘기지 않고, ID/날짜 변경·구간 겹침 소실·5,000개 초과·시간 초과는 차단한다. 모든 ID를 보존하되 **같은 제목의 후보만** 본문·다운로드 원본까지 읽는다. 각 후보를 관찰된 게시물 경로로 다시 열어 가상 스크롤 밖의 글도 대조한다. 게시 후에는 이전 전체 ID에 없던 후보가 정확히 하나여야 한다.
- `schoolbell-observed-post.cjs`, `schoolbell-prepared-driver.cjs`: 같은 제목의 여러 글을 게시물 ID로 구분한다. 비교용 원본 다운로드는 현재 초안 해시와 다르다는 이유만으로 읽기를 실패시키지 않고, 기존 중복 판정기가 본문·날짜·사진 내용과 순서를 비교한다. 전체 ID 집합과 제목 후보 집합의 관계를 검증한다. 최종 성공용 원본 검증은 기존대로 정확한 해시·바이트 수·순서를 요구한다.
- `schoolbell-preview-originals.cjs`, `schoolbell-download.cjs`: 미리보기 파일 컨트롤을 통한 정상 UI 다운로드를 앱 세션의 `will-download`에 연결했다. 원본과 크기·형식·해시·순서를 대조하며 표시 이미지 URL을 원본으로 사용하지 않는다. 검증 임시 파일은 앱 사용자 데이터 안에 만들고 성공/불일치/취소 후 정리한다. renderer 종료 중에도 정리와 작업 상태 해제가 수행되도록 보완했다. **실서비스에서 이 Electron 경로가 원본 파일을 받는지는 아직 NOT RUN**이다. v5 iframe 관찰로 최상위 로그인 허용 호스트를 확대하지 않았다.
- `schoolbell-recipients.cjs`, `schoolbell-live-context.cjs`: 실제 발행 대상 창의 검색 없는 빈 표와 필수 관리자 상태를 읽는다. 기존 빈 명단 슬롯을 가입자 수로 간주하지 않는다. 사용자 작성 창이 목록/게시물 화면이면 disposable reader에서 관찰된 작성 버튼으로 진입해 대상을 읽고 reader만 닫는다. 현재 사용자 작성 창의 내용과 경로를 이동시키지 않는다.
- `schoolbell-composer-entry.cjs`: 현재 공식 classnews 경로/학급 ID를 대조하고 실제 `작성하기` 버튼을 한 번 클릭한다. 이미 열린 작성폼은 보존한다. 잘못된 학급/다중 요소/경로 변경은 차단한다. 작성 URL을 추측해 직접 이동하지 않는다. 이 연결부의 실제 앱 실행은 NOT RUN이다.
- `schoolbell.cjs`, `schoolbell-electron-driver.cjs`: 위 provider를 기존 runtime/publisher에 주입했다. provider 실행 중에도 권한·취소·경로를 확인하고 원시 사이트 오류를 고정 오류 코드로 바꾼다. 기존 pending 선저장, 최종 확인, 단일 발행, 결과 불확실 시 재전송 금지, 성공 증거 우선 저장, 변경되지 않은 초안만 초기화하는 흐름을 유지한다.

실제 미확인 정보를 코드로 꾸며 넣지 않았다. 현재 runtime의 `readDate.verified=false`, `identityVerified=false`, `authorityVerified=false`, `classApproved=false`, `testClassApproved=false`, `recipientsVerified=false`, `externalNotifications=null`은 그대로다. 최종 원자적 DOM guard와 승인된 finalAction 역시 연결 완료 상태가 아니다. `capability.enabled=false` 및 기본 permission 없음도 유지한다. 이 조건은 앱 로그인만으로 해결되지 않는다.

## 앱 전체 흐름 판정과 남은 작업

| 단계 | 이번 실서비스 판정 | 정확한 남은 조건 |
|---|---|---|
| 앱 세션 직접 로그인 | BLOCKED | 사용자가 지금 직접 로그인 불가. 외부 브라우저 로그인은 대체하지 않음 |
| 앱 버튼 → 제목·본문·사진 입력 | NOT RUN / BLOCKED | 앱 세션, 학교·학년도·고유 교사 신원/권한/학급 승인, 수신자 binding 및 날짜 의미가 미확인 |
| 게시 전 원본·원격 중복 조회 | NOT RUN / BLOCKED | 코드 연결/로컬 검증 완료. 실제 앱에서 원본 파일 다운로드와 전체 목록 순회를 아직 확인하지 못함 |
| 최종 승인 → 실제 게시 | NOT RUN / BLOCKED | 위 증거를 동기 재검사하는 최종 DOM guard/finalAction 연결, 허용 범위와 실행 승인 필요. 각 새 게시 직전 별도 확인 |
| 게시 → 서버 재조회 | NOT RUN / BLOCKED | ID 기반 후보 재조회와 원본 대조 코드 연결. 앱 publisher가 만든 실제 게시물 없음 |
| 성공 이력 → 초안 처리 | NOT RUN / BLOCKED | 실서비스 성공 증거가 없으므로 성공 이력 생성·초안 초기화하지 않음 |

다음 앱 시험은 직접 로그인 후 현재 학급의 실제 학교·학년도·고유 교사 권한을 확인할 수 있는 UI 근거부터 연결해야 한다. 독립 학급의 편집 가능한 이름이나 관리자 카드만으로 이를 통과시키지 않는다. 작성폼에 확인되지 않은 날짜 입력란을 만들지 않고, 앱 작성 날짜와 서버 발행 날짜의 정책을 먼저 확정한다. 학생/부모 없는 대상과 필수 관리자 본인 알림을 앱 binding에 연결하고, 비게시 원본 확인이 성공한 뒤 전체 앱 시험을 1회씩 별도 승인받는다. 기존 A/B/C는 다시 실행하지 않는다. 공식 운영 허용과 최종 잠금 해제/배포 승인도 별도이며 아직 확보된 것으로 간주하지 않는다.

## 이번 로컬 검증 / Windows / 보존

- 변경 파일 구문 **13/13** 및 `git diff --check` 통과.
- 영향 단위 **69/69** 통과. 이후 검색/로딩 중 목록 완료 오인 방지 수정 후 해당 파일 검사 **6/6** 재검증. 합산하여 새 테스트 수로 부풀리지 않는다.
- 실제 Electron의 **새 연결부 4/4**: 전체 ID/제목 후보/독립 원본, 작성 화면 진입과 학급 불일치, iframe 파일 원본 순서, 해시 불일치 시 차단·정리. 공식 호스트를 격리된 로컬 응답으로 가로채고 외부 요청을 차단한 fixture다. 실서비스 PASS가 아니다.
- 초기 baseline 계약 검사 1건은 test fixture에서 최초 inspect에 아직 없는 board binding을 넘겨 실패했다. fixture를 실제 최초 scope에 맞게 수정했고 실패 로그도 보존한다. native 실행의 macOS sandbox extension/task policy 경고는 로그에 남기며 프로세스 종료 0 / 검사 성공과 구분한다.
- 이전 전체 E2E와 하이클래스 회귀는 반복하지 않았다. 이번에 하이클래스 소스·공유 미디어 저장·백업·초안 로직·버전·appId·업데이트 채널 변경 없음. 이전 [전체 검사 결과](2026-11-09-schoolbell-app-flow-results.json)는 이전 커밋의 증거이며 이번 PASS로 재사용하지 않는다.
- Windows 제품/설치/업데이트/재부팅/클립보드 검사는 이번 **NOT RUN**. 이전 guest TIMEOUT/PrlJob Invalid argument는 기존 환경 차단 기록으로 남는다. 이번에는 host 상태 조회만 수행했다. 첫 조회는 sandbox의 ps 차단으로 실패, 승인된 읽기 조회에서는 suspended/invalid 상태가 반환됐다. 게스트 명령·VM 재개·Tools 변경·새 VM·빌드·설치 없음. 이 조회로 Windows 제품 실패나 복구 완료를 판정하지 않는다.

소스/실행 결과와 실패 로그 해시는 [manifest](2026-11-09-schoolbell-integration-ports-results.json)에 남긴다. 실제 학생 자료·본문·계정·학급/게시물 ID·인증정보는 기록하지 않는다. 기존 감사 파일은 수정/삭제하지 않는다.

## GitHub

Push 전 원격 HEAD와 Draft PR 상태를 확인했다. 현재 브랜치의 workflow는 `windows-validation-build.yml` 한 개이고 blob `58613481272e59545c0c910d5d6e033a65f0247a`가 로컬과 일치한다. 다른 Windows 개발 브랜치의 push 및 수동 dispatch만 구독한다. 현재 브랜치/PR 트리거 없음. Actions 총 19 / 마지막 41977391612, 새 실행·재실행 요청 0회. `[skip ci]` 커밋으로 기존 브랜치에만 반영한다. 신규 유료 자원/VM/결제·권한·워크플로 변경·병합·정식 배포 없음. Push 후 확인 결과는 PR #5 / Issue #4 갱신과 최종 보고에 남긴다.
