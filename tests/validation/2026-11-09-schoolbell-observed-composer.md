# 학교종이 실제 작성 폼 연결부 — 별도 코드 검증

작업 기준: `feature/schoolbell-diary-nationwide`, 기준 HEAD `aa9648344f62c984ff434e3f56588284bb683031`. PR #5 및 Issue #4. 기존 보고서와 검증 증거를 보존한다.

## 구현

- `app/schoolbell-observed-composer.cjs`: 이전에 실제 사이트에서 **관찰된** `app-boards-write`, 제목 입력란, Froala 형태의 본문 편집기, 첨부 input 및 보내기/임시저장 버튼에 대해 구조 검사와 제목/본문 텍스트 편집 후보 구현. 기존 `schoolbell-ui-probe.cjs`를 그대로 사용한다.
- 외부 브라우저에서 현재 열려 있는 공식 HTTPS 도메인을 검사하며, `authorize()` 신뢰 가능한 main 프로세스 콜백 승인 없이는 읽기·쓰기 모두 거부한다. 쓰기는 `stillPermitted()`를 전후 확인한다. 사용자 입력은 JS 소스에 문자열 보간하지 않고 JSON 인수로 인코딩한다. HTML 주입 기능과 비공개 API 호출은 없다.
- 요소가 누락되거나 중복되면 차단. 제목은 native value setter와 input/change 이벤트, 본문은 HTML 아닌 일반 텍스트와 input/change 이벤트를 사용한 **후보 구현**이다. 이는 실제 학교종이의 Froala 런타임에서 자동 입력이 동작함을 증명하지 않는다.
- 첨부 파일 자동 업로드, 날짜·학급·권한·수신자 검증, 게시 버튼 조작, 원격 게시물 ID/원본 대조는 **아직 없다**. `schoolbell-prepared-driver.cjs` 계약의 일부만 충족한다.
- `schoolbell.cjs`의 `driver=null`, `schoolbell-capability.cjs`의 `enabled=false`를 그대로 유지했다. 운영 런타임에 이 모듈을 연결하지 않았으며 자동 발행을 활성화하지 않았다.

## 별도 로컬 검증

- 격리된 Node `vm` 모의 DOM을 대상으로 새 테스트 **5/5 PASS**. 공식 사이트 HTTPS/도메인 제한, 기본 권한 차단, 구조 일치/누락·중복 검출, 한글·줄바꿈·문자열 삽입 안전성, 권한 철회·사이트 이동·취소 신호 차단.
- `node --check` 새 파일 2개 PASS. 테스트 환경은 Node 22.16.0, OS Linux. 실제 Windows/Electron 앱·실제 학교종이 웹서비스 및 Froala 런타임 테스트는 **NOT RUN**.
- 원래 실제 화면 관찰 증거와 기존 macOS 355/355 PASS는 이번 결과로 다시 세지 않는다.
- 기존 Actions 19회 기준. 현재 브랜치 push와 PR 업데이트는 `windows-validation-build.yml`의 자동 실행 트리거 대상이 아니며 Actions를 직접 실행하지 않았다. 반영 후 재조회 시 Actions는 **19회**, 마지막 실행 **41977391612**로 동일했다.

## 잔여 게이트

1. 학교종이 공식 UI 자동화 허용 증빙(아직 미발송 기술 문의문).
2. 실제 학교/학급/교사 권한, 인원/알림, 날짜 의미 검증. 실제 작성 폼의 이벤트 동작 확인.
3. 사진 첨부/완료·원본 다운로드·순서·게시 확인을 실제 사이트에서 관찰한 뒤 bridge에 구현.
4. 실제 게시 테스트는 별도 승인받은 합성 자료와 무수신 테스트 학급에서 수행. 자동 재전송 금지 및 성공 영수증 검증 유지.
5. Windows 회귀·설치·업데이트 검증. 새 빌드·배포 없음.

**최종 판정: 실제 자동 발행 BLOCKED / 정식 배포 NO GO.**
