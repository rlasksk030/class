# 학교종이 알림장 자동 등록 — 하이클래스 방식으로 재구성 (2026-11-12)

기준: `feature/timer-pip-nationwide` (`1df89ee`, 전국용 v1.8.12). 작업 브랜치: `claude/schoolbell-autopost-nationwide-07paco`.
버전(`app/package.json` 1.8.12), appId, 업데이트 채널, `main`, `downloads/nationwide`, 하이클래스 모듈은 바꾸지 않았다.

**요약: 합성 사이트 기준 연결 → 등록(사진 0/1/2장) → 결과 확인 → 초안 정리까지 PASS. 실서비스 시험과 Windows 확인은 NOT RUN.**

## 1. 무엇을 바꿨나

기존 v1.8.12는 학급 연결을 30분마다 다시 확인하고, 등록할 때마다 입력 준비·최종 게시 확인창을 거쳤다. 이번에는 하이클래스와 같은 흐름으로 바꿨다.

| 단계 | 동작 |
|---|---|
| 연결 (최초 1회) | [학교종이 연결하기] → 앱 창에서 교사가 직접 로그인 → 학급페이지 알림장으로 이동 → 앱이 1.5초 간격으로 창을 확인 → "○학년 ○반 알림장을 찾았습니다. 이 학급에 연결할까요?" 1회 → 게시판 주소·학급 이름·학교명 저장 → 창 닫고 우리 교실로 복귀 |
| 세션 확인 | 알림장 화면을 열 때 백그라운드 창에서 저장된 게시판을 불러 `ok` / `expired` / `unknown` 판정. 만료면 [다시 로그인]만 표시 |
| 등록 | [학교종이 등록] 한 번 → 백그라운드 창에서 게시판 → 작성하기 → 제목 → 본문 → 사진 → 수신대상 → 즉시발행 → 보내기 → 학교종이 확인창 → 결과 확인. `diary:progress`로 7단계 표시 |
| 결과 | 성공: 이력 저장, 등록 중 바뀌지 않은 초안만 비움, 사진 원본 보존. 실패·불확실: 초안·사진 보존, 한 줄 안내, 자동 재전송 없음 |

확인 단계는 하이클래스와 같다. 하이클래스는 등록 버튼을 누른 것을 승인으로 보고 앱 확인창을 띄우지 않으므로, 학교종이도 앱 확인창을 띄우지 않는다.

### 모듈 구성

| 모듈 | 역할 |
|---|---|
| `schoolbell-flow.cjs` | 화면 판별(login / home / class / board), 학년·반 대조, 업로드 이름, 게시 결과 판정, 확인창 판별. 순수 함수 |
| `schoolbell-adapter.cjs` | isolated world에서 페이지 읽기·입력. 고정 코드만 main으로 돌려준다 |
| `schoolbell-submit.cjs` | 등록 한 번의 전체 순서와 중단 사유 → 한 줄 안내 |
| `schoolbell-photos.cjs` | 사진 원본 전달, 업로드 완료·개수·순서 대기 |
| `schoolbell-input.cjs` | CDP로 trusted 클릭, 포커스 에뮬레이션, 브라우저 확인창 감지 |
| `schoolbell-window.cjs` | 로그인용 창과 백그라운드 작업 창, 이동 허용 범위 |
| `schoolbell.cjs` | IPC: `schoolbell:connect` `:link` `:status` `:session` `:recipients` `:publish` `:close` + 직접 발행·결과 기록 |
| 유지 | `schoolbell-login-navigation.cjs`, `schoolbell-editor-text.cjs`, `diary-services.cjs`(확장) |

## 2. 보내기 입력: 이 환경에서 확인한 것

Linux 컨테이너(Xvfb), Electron 40.10.6에서 창 상태별로 직접 측정했다.

| 창 상태 | CDP 클릭이 trusted인가 | 0.6초간 프레임 | 200ms 애니메이션 완료 | 포커스 |
|---|---|---|---|---|
| 한 번도 표시하지 않은 숨긴 창 | 예 (pointerdown·mousedown·pointerup·mouseup·click 모두 `isTrusted`) | 5 | **아니오** | 없음 |
| 화면 밖에 비활성으로 표시한 창 | 예 | 38 | 예 | 없음 |
| 오프스크린 렌더링 창 (표시 안 함) | 예 | 38 (프레임률 10으로 낮추면 10) | 예 | 없음 |

- `webContents.debugger`의 `Input.dispatchMouseEvent`는 **포커스와 표시 여부에 상관없이 trusted 이벤트를 만든다.** 창을 잠깐 띄우는 대안은 필요 없었다.
- 숨긴 창은 프레임이 거의 돌지 않아 애니메이션이 끝나지 않았다. 기존 기록의 "숨긴 창에서 수신대상 모달 누락", "로딩 가림막이 보내기 버튼을 가림"과 같은 원인으로 보인다.
- 그래서 백그라운드 작업 창은 **오프스크린 렌더링**(`webPreferences.offscreen`)으로 만든다. 화면·작업 표시줄에 나타나지 않고 포커스도 갖지 않지만 프레임은 정상으로 돈다. 로그인·연결에만 보이는 창을 쓰고, 두 창은 같은 로그인 저장소를 쓴다.
- 포커스 이벤트는 `Emulation.setFocusEmulationEnabled`로 켰다(숨긴 창에서 `focus()`만으로는 focus 이벤트가 0회, 켠 뒤 발생).
- 브라우저 기본 확인창(`confirm()`)은 작업 창에서 뜨지 않게 막고(`disableDialogs`), 떴다는 사실만 감지해 중단한다.

## 3. 기존 기록에서 가져온 학교종이 화면 사실

기존 문서의 잠금·승인 정책은 따르지 않았고, 실제 화면에서 확인된 사실과 코드 조각만 옮겼다.

| 항목 | 사용한 것 |
|---|---|
| 주소 | 게시판 `/ko/main/group/{id}/boards/classnews`, 작성 `/boards/write/classnews`, 게시 후 `classnews` 또는 `schoolnews` |
| 게시판 | `app-group-board`, `작성하기` 버튼(1개), 카드 `app-letter-item-long`, ID `div.notification-post[data-letter-id]`, 제목 `app-translation-viewer`, 본문 `app-text-viewer .fr-view`, 첨부 `app-letter-filelist .file-item` |
| 작성 화면 | `app-boards-write`, 제목 `input[placeholder="제목을 입력해 주세요."]`, 본문 `div.fr-element.fr-view[contenteditable="true"]`, `input[type="file"]`, 첨부 목록 `app-letter-write-file-list app-file-row`, 업로드 중 `app-file-upload-list` / `app-progress-bar` |
| 본문 입력 | `execCommand('insertText' / 'insertLineBreak')` 줄 단위 입력, `P` / `BR` 구조 기반 읽기 |
| 수신대상 | `변경` 버튼 + `app-letter-simplified-target-text`, 창 `mat-dialog-container app-select-letter-targets`, 체크박스 관리자·보호자1·보호자2·학생, `닫기` |
| 발행 방식 | `드롭다운 토글`, 라디오 `즉시발행하기` / `예약발행하기` |
| 보내기 | `button.btn-with-description`(문구가 `보내기`로 시작), DOM click 불가 → trusted 클릭 |
| 학급 이름 | `settings/groupinfo`의 `app-name-and-address input[placeholder="기관이름을 입력해주세요."]` |

게시물 ID는 게시판 카드의 `data-letter-id`에서 얻어 저장한다. 얻지 못해도 제목·본문·첨부(개수·순서)가 일치하는 새 글이 정확히 1개면 성공으로 본다.

### 실서비스에서 아직 확인하지 못한 것 (첫 실서비스 시험에서 볼 것)

1. **보내기 뒤 학교종이 확인창.** 기존 기록(빈 테스트 학급)에서는 확인창 없이 게시됐다. 페이지 안 대화상자(`mat-dialog-container` 등)가 뜨면 "보내기/발행" 질문이고 긍정 버튼이 하나일 때만 trusted 클릭으로 확인한다. 그 밖의 대화상자나 브라우저 `confirm()`이면 누르지 않고 결과 미확인으로 멈춘다.
2. **수신대상 창의 적용 버튼.** 기존 코드는 수신대상을 바꾼 적이 없어 적용 버튼 문구가 기록에 없다. `확인·적용·저장·완료·선택완료` 중 하나가 정확히 1개면 누르고, 없으면 `닫기`로 닫은 뒤 **다시 열어 실제 선택을 대조**한다. 다르면 보내지 않는다. 기본값인 "학교종이 기본 선택"은 이 창을 열지 않는다.
3. **한글 파일 이름**(`사진01.png`). 기존 실서비스 시험은 영문·숫자 이름이었다. 이름이 바뀌어 표시되면 업로드 확인에서 멈춘다(게시 전).
4. 오프스크린 창에서의 실제 Angular 화면 동작, 로그인 만료 시 게시판 주소가 어디로 이동하는지.

위 네 가지는 모두 **확인되지 않으면 보내기 전에 멈추거나, 보낸 뒤라면 결과 미확인으로 남는** 쪽으로 만들었다.

### 실서비스 시험 진행 (2026-11-12, 교사의 Mac 개발 앱, 테스트 학급)

| 단계 | 결과 |
|---|---|
| 앱 창에서 직접 로그인 → 학급 알림장 감지 → 확인창 1회 → 연결 저장 | PASS |
| 등록: 게시판 열기(0.3초) → 작성하기 → 작성 화면 진입(1.8초), 오프스크린 창 | PASS |
| 빈 작성 화면 판정 | 첫 시도 중단 → 수정 |

첫 시도는 "작성 중인 글이 있음"으로 멈췄다(입력·전송 전). 기록 파일과 화면으로 확인한 원인: **학교종이는 새 알림장의 제목 칸에 오늘 날짜(`2026년 11월 12일 목요일`)를 자동으로 넣는다.** 본문·첨부·안내창은 비어 있었고 업로드/진행 표시 요소도 없었다. 그래서 제목은 빈 화면 판정에서 빼고(교사의 제목으로 바꿔 넣는다), 본문·첨부·열린 안내창만 "이미 내용이 있음"으로 본다.

실제 작성 화면에서 추가로 본 것: 수신대상 표시 `6학년 모두`, 보내기 버튼 문구 `보내기 (빈칸 또는 잘못된 칸이 있습니다.)`(내용이 없을 때), `임시저장` 옆의 저장 개수, `미리보기`, `AI 안내문 작성`, 본문 아래 `파일 첨부`.

## 4. 그대로 지킨 것

- 중복 방지: 날짜·제목·본문·사진 해시가 같은 등록 차단(기존 fingerprint 그대로). 게시판에 같은 글이 이미 있어도 차단.
- 초안 보호: 성공 확인 전에는 비우지 않음. 등록 중 추가한 내용 보존.
- 학교종이 화면 보호: 작성 화면이 비어 있지 않거나 안내창이 떠 있으면 덮어쓰지 않고 중단. 즉시발행만 사용(예약이 선택돼 있으면 즉시발행으로 바꾸고, 확인 못 하면 중단).
- 결과 미확인: 보내기 클릭 직전에 `submitting`을 먼저 기록. 클릭 뒤 확인이 안 되면 `auto-uncertain`으로 남겨 새 등록을 막고, 교사가 [게시됨] / [게시 안 됨]을 고른다. 클릭이 버튼에 도달하지 않은 것이 확인되면 기록을 지워 바로 다시 시도할 수 있다.
- 데이터 호환: 로그인 저장소 이름 `persist:diary-schoolbell-<sha>` 유지. `row.schoolbell`(`confirmation:'teacher-manual'`)은 읽기만 하고 지우지 않으며, 그 값만 있으면 "다시 연결 필요". 새 정보는 `row.schoolbellLink`, `row.schoolbellRecipients`. v1.8.12 이력·미확인 기록은 계속 표시되고 계속 막는다.
- 보안: `contextIsolation`, `sandbox`, 허용 호스트 밖 이동 차단, 새 창 차단, 권한 요청 거부. 진단 파일 `schoolbell-last-run.json`에는 단계·시간·결과 코드만 남긴다.
- 하지 않는 것: 로그인 우회, 비밀번호 수집·저장, 다른 브라우저 쿠키 복사, 비공개 API 호출, 캡차·이용 제한 우회.

## 5. 테스트 결과

환경: Linux 컨테이너(Xvfb), Node 22.23.4, Electron 40.10.6. 모든 HTTPS 요청은 로컬 합성 사이트로 대체했다.

| 범위 | 결과 |
|---|---|
| 구문 검사 `npm run check` | **PASS** 102/102 |
| 단위 `npm test` | **PASS** 88/88 (화면 판별, 학년·반 대조, 본문→편집기 줄 변환, 업로드 이름, 결과 판정, 확인창 판별, 저장소 호환) |
| 학교종이 E2E `tests/e2e/schoolbell.e2e.cjs` | **PASS** 68/68 |
| 하이클래스 E2E (수정 없이 실행) | **PASS** 연결 16/16, 수신대상 38/38, 등록 21/21, 창 11/11, 사진 4/4 |
| 그 밖의 E2E | **PASS** diary-drafts 17, diary-layout 15, multischool 7, board-titles 24, regression 36, recovery 17, timetable-layout 8, photos 22, photo-boundaries 6, photo-transfer 5 |
| `v182-features`, `timer-startup` | 41개·18개 PASS 뒤 중단. **수정 전 `1df89ee`에서도 같은 지점·같은 오류**(OS 키 저장소 파일 없음, 두 번째 인스턴스 종료 코드). 이 컨테이너의 환경 제한이며 이번 변경과 무관 |
| 실서비스(테스트 학급) 사진 0/1/2장 | **NOT RUN** — 교사의 직접 로그인과 게시 직전 승인이 필요 |
| Windows 설치·업데이트·실행 | **NOT RUN** — 아래 체크리스트 |
| 배포(v1.8.13) | **NOT RUN** — 승인 후 진행 |

학교종이 E2E가 확인한 것: 서비스 선택과 초안 유지 → 연결(로그인, 다른 학급 경고·취소, 확인창 1회, 저장 값, 창 닫힘) → 등록 사진 0/1/2장(본문 한글·빈 줄·공백, trusted 클릭 1회, 등록 중 창 비표시·무포커스, 첨부 이름·순서·원본 해시, 이력, 초안 정리, 게시 후 schoolnews 이동) → 등록 중 수정 보존 → 중복 차단 2종 → 구조 변경·작성하기 없음·작성 중인 글·복원 안내창·업로드 실패에서 게시 전 중단 → 결과 미확인 4종과 재전송 차단, [게시됨]/[게시 안 됨] → 학교종이 확인창, 예약→즉시발행 전환, 메뉴 안의 발행 방식, 수신대상 기본·직접 선택·적용 실패, 게시물 ID 없음 → 직접 발행 → 하이클래스 전환 → 재실행 후 로그인 만료·다시 로그인 → v1.8.12 기록 호환.

합성 사이트(`tests/schoolbell-site.cjs`)는 관찰된 동작을 흉내 낸다: 스크립트 클릭은 무시하고 trusted 클릭만 전송, 수신대상 창과 로딩 가림막은 애니메이션으로 열리고 사라짐, 게시 후 schoolnews로 이동. **합성 사이트 PASS는 실서비스 PASS가 아니다.**

## 6. 삭제한 모듈

앱 모듈 24개 (`app/schoolbell-*.cjs`): audience, capability, composer-entry, date-policy, download, driver-errors, electron-driver, final-guard, live-context, live-posts, nonpublishing, observed-composer, observed-post, operating-authorization, prepared-driver, preview-originals, publication-mode, publish, readback, recipients, reconcile, send-input, test-authorization, ui-probe

단위 테스트 18개: electron-driver, final-guard, live-evidence, nonpublishing, observed-composer, observed-post, operating-authorization, post-navigation, prepared-driver, preview-originals, publication-mode, publish, readback, recipients, reconcile, test-authorization, ui-probe, window

fixture 7개 (`tests/schoolbell-*-fixture.cjs`): electron, final-integration, live-ports, nonpublishing, prepared, recipient-lifecycle, send-input

E2E 5개: schoolbell-automatic, schoolbell-completion, schoolbell-electron, schoolbell-operating-connect, schoolbell-prepared (`schoolbell.e2e.cjs`는 새로 작성)

함께 없앤 기능: 30분 학급 연결과 재확인, 15초 관찰값 유효시간, 학교명·학년도·반 수기 입력 확인, 테스트 학급 승인, 비게시 검증 버튼, 게시 전 원본 다운로드 대조, "이 내용으로 한 번 게시" 2차 승인, 재전송 없는 재검증(reconcile).

## 7. Windows 확인 체크리스트 (학교 PC)

1. v1.8.12가 설치된 PC에서 v1.8.13으로 업데이트한 뒤 기존 초안·사진·등록 이력이 그대로인지
2. 발행 서비스가 학교종이인 학급에서 이전 로그인 그대로 **● 학교종이 연결됨** 또는 **다시 연결 필요**가 표시되는지, [학교종이 연결하기] → 로그인 → 학급 알림장 → 확인창 1회로 연결되는지
3. 알림장 본문에 **한글 입력**(조합 중 글자 깨짐 없음, 줄바꿈·빈 줄)과 **Ctrl+V 사진** 추가가 되는지
4. [학교종이 등록] → 단계 표시 → **학교종이 등록 완료**, 학교종이에서 제목·본문·사진 순서가 맞는지 (사진 없음 / 1장 / 2장)
5. 등록 중 학교종이 창이 **화면·작업 표시줄에 나타나지 않고 입력 포커스를 빼앗지 않는지**
6. 로그인이 만료됐을 때 **[다시 로그인]** 안내가 나오고, 로그인 뒤 다시 묻지 않고 복귀하는지
7. 하이클래스 학급의 연결·등록이 이전과 같은지
8. 앱을 껐다 켠 뒤(재부팅 포함) 연결 상태와 초안이 유지되는지
