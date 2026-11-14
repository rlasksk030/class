# 우리 교실 디자인 다듬기 적용 (옥구초판, 2026-11-14)

- 시작점: `feature/timer-pip-okgu` `b643254`(1.8.15) → 브랜치 `feature/design-refresh-okgu`
- 따른 문서: `design/2026-11-design-refresh/우리교실_디자인적용_지시서.md` 0~8장, 디자인 적용 보완 지시서, 작업 지시서 — 알림장 칠판 모드(4-1단계). 문서가 서로 다르면 보완 지시서를 따랐다.
- 전국판(`feature/design-refresh-nationwide`)에서 먼저 만든 커밋을 `git cherry-pick -x`로 옮겼다(보완 지시서 1장). 두 판을 병합하지는 않았다.
- 버전 · 빌드 · push · PR · 태그 · Release는 하지 않았다. `app/update-config.json`(github · rlasksk030/class), 앱 ID, 데이터 폴더, `electron-builder.json`, `main.cjs`, `app/package.json`은 그대로다.

## 커밋

| 단계 | 커밋 | 전국판 원본 | 내용 |
|---|---|---|---|
| 0 | 98f9f7b | 4786db7 | 디자인 원본 자료 `design/2026-11-design-refresh/`(설치 파일 제외), 앱용 사본 `app/ui/` |
| 1 | e8cd50c | d712dea | 토큰 · 부품 · 아이콘 · 글꼴 CSS |
| 2 | 50b083b, 95667c5 | c4d9416, 9a8d004 | 대시보드 A/B, 배율, 칸 공통 규칙, 배치 편집, 화면 잠금 |
| 3 | a7a8f02 | f5370dd | 작은 창 공통 틀 |
| 4 | 450e3f9 | 3b59842 | 랜덤 뽑기 · 발표 화면, 활동완료, 화이트보드, 알림장(H01) |
| 5 | 8931b98 | c442980 | 설정 창 3묶음(I01, I03) |
| 6 | ea462ea | da47a3e | PIP J01–J04 |
| 7 | 5f1a079 | 0a0ddbc | 확인 목록 점검 |
| 보완 | d1dd366 | 962c3ac | PIP '다음 교시' · 설정 PIP 항목 6개 유지, 예전 백업 복원 |
| 4-1 | 026da8c | acd3f2f | 알림장 칠판 모드 |
| 판별 | 0009f56 | b74cf84 | 설정 학교 · 학급(I01): 회색 학교 줄, 학년 · 반 칸마다 이름 |
| 판별 | 4edb365 | a0816e1 | 첫 실행(학년 · 반 저장 전): 학교 · 학급 아래에 백업 · 복원 묶음도 보임 |
| 시험 | 7ee3842 | — | 복구 E2E: 첫 실행 창의 백업 · 복원 묶음을 옥구초판 화면 기준으로 확인(아래 참고) |
| 받아 옴 | 8a48f69, da1bc9c | — | PR #14('달라진 점' 팝업) 머리 커밋을 받고, #14를 합친 뒤 기준 브랜치(68887e1)를 받음(아래 참고) |
| 팝업 | 943590a | 350de97 | '새로워진 점' 창을 작은 창 공통 틀(.uc-dialog --sm)로, NOTES는 옥구초판 1.8.16 문구로 |

### 옥구초판 첫 실행 백업 · 복원
- 기존 복구 E2E는 "새 프로필에서 저절로 열린 설정 창 안에서 바로 [이전 데이터 찾기]를 누를 수 있다"를 본다. 설정 창을 3묶음으로 나누자 옥구초판 첫 실행 창에서는 이 버튼이 '백업 · 업데이트' 묶음에 숨어 시험이 실패했다(실제로 새로 설치한 선생님이 예전 데이터를 찾기 어려워지는 문제).
- 학년 · 반을 저장하기 전에는 '학교 · 학급' 아래에 백업 · 복원 묶음도 보이게 고쳤다(업데이트 상자는 숨김). 전국판은 첫 실행 카드(I06)에서 이미 그렇게 보인다.
- 시험은 선택자만 옥구초판 화면에 맞췄다: 전국판 첫 실행 표시(`.settings-first`) 대신 `.settings-no-class`를 보고, 학년 칸이 같은 화면에 보이는지와 전국판 첫 실행 카드가 아닌지를 더 확인한다.

### PR #14 받아 오기
- 선생님 결정은 "#14를 기준 브랜치에 먼저 합치고, 옥구초판 작업 브랜치가 그것을 받기"였다.
- 처음에는 GitHub에서 합치는 명령이 이 작업 세션의 권한 검사에 막혔다. 그래서 같은 머리 커밋(f4ec23e)을 로컬 작업 브랜치에 먼저 받아(8a48f69) 진행했다. 충돌: `app/index.html`(옥구초판 디자인 마크업 유지, whats-new 두 줄 추가), `package.json`(test:e2e 끝에 whats-new E2E 추가).
- 그 뒤 선생님 승인으로 #14를 합쳤다: draft 해제 → merge commit `68887e1`("옥구초판: 업데이트 후 '달라진 점' 안내 팝업 (#14) [skip ci]", 본문 한 줄), 작업 브랜치는 남김.
- 기준 브랜치를 작업 브랜치에 merge로 받았다(da1bc9c). 파일은 바뀌지 않았다(트리 동일). 그래서 아래 시험 결과가 그대로 적용된다.

## cherry-pick 충돌을 푼 방법 (옥구초판에만 있는 것)

- `index.html`: 옥구초판 설정 창(학교 고정, 학년 선택 · 반 입력)과 스크립트 목록을 지키고, 새 스크립트(`diary-chalk-core.js`, `diary-chalk.js`, `settings-shell.js`, `design.js`)와 새 수정 창만 더했다. 학교종이 · NEIS 인증키 관련 마크업은 없다.
- `diary.js`: 옥구초판의 하이클래스 전용 흐름을 지키고 H01 배치만 더했다. 발행 서비스 고르기(학교종이)는 없다.
- `updates-ui.js`: 판 이름은 '옥구초판'.
- `settings-shell.js`는 두 판이 같은 파일이다. NEIS 도우미(`#neisGuide`)가 있으면 전국판, 없으면 옥구초판으로 보고, 옥구초판은 학교 줄을 고정으로 그린다. 첫 실행 모드(I06)는 전국판에서만 켜진다.
- 전국판 전용 파일(`학교종이_알림장_사용안내.md`, 학교종이 테스트)은 옮기지 않았다.

## 새 저장값 (추가만 했고 기본값이 있음, 백업 · 복원 포함)

- `layoutStructure`: 'A' | 'B', 기본 'A'
- `boardLayoutB`: B 구조 배치. A 배치는 기존 `boardLayout`을 그대로 씀
- `diaryChalkPreferences`: `{fontScale: null | 0.15–3, showDate: boolean}`, 기본 `{fontScale:null, showDate:true}`
- 예전 백업을 복원하면 A는 `boardLayout`에서, B는 기본 배치, 구조는 A로 열린다.
- PR #14의 `lastSeenVersion`은 그 PR 설계대로 백업 대상이 아니다.

## 그림과 다른 점 (의도적으로 남김)

- 시간표 시작 시각은 교시 시간을 정했을 때만 보인다(지시서 본문대로).
- 칸을 숨겨도 자리는 빈 칸으로 남고, [빈 칸 채우기]로 채운다(기존 기능).
- 편집 막대 버튼 글씨는 기존 검사(16px 이상)를 지키려고 16px다(지시서 15px).
- H01: 알림장 저장 상태는 기존 문구('작성 내용은 자동 저장됩니다.' → '저장됨')를, 수신 제목은 기존 '하이클래스 수신대상'을 그대로 쓴다.

## 테스트 (PASS / 미실행) — 최종 커밋 943590a 기준

| 항목 | 결과 |
|---|---|
| `npm run check` | PASS (88/88 파일) |
| `npm test` | PASS (87/87) |
| `npm run test:e2e` 전체(20개 파일, `test:photos` 4개 포함) | PASS, FAIL 0. board-titles 26/26, v182-features 43/43, regression 41/41, hiclass-link 16/16, recovery 18/18, timetable-layout 8/8, diary-drafts 17/17, hiclass-recipients 38/38, hiclass-submit 21/21, timer-startup 21/21, diary-layout 15/15, diary-chalkboard 40/40, hiclass-window 11/11, dashboard-layout 88/88, first-run 5/5, whats-new 7/7, photos 22/22, hiclass-photos 4/4, photo-boundaries 6/6, photo-transfer 5/5 |
| 참고: 앞선 전체 실행(0009f56) | recovery가 실패해 고침(위 '옥구초판 첫 실행 백업 · 복원'). hiclass-link 1개 검사(연결 뒤 대시보드 창 포커스)가 두 판 E2E를 동시에 돌릴 때 한 번 실패했고, 최종 실행에서는 통과 |
| 칠판 모드 E2E 개수 | 전국판 41개 중 발행 서비스 검사 2개(학교종이 · 하이클래스)가 옥구초판에서는 1개(하이클래스 화면)라 40개 |
| CSP 콘솔 검사(따로 만든 점검 스크립트) | 대시보드 · A/B 전환 · 배치 편집 · 수정 창 · 타이머 · 화면 설정 · 교시 · D-Day · 설정 3묶음 · 업데이트 · 랜덤 뽑기 · 발표 화면 · 활동완료 · 화이트보드 · 알림장 · 칠판 모드 · 불러오기 창과 PIP 4개: CSP 메시지 0, 페이지 오류 0. 검사기가 일부러 넣은 인라인 스타일 2건을 잡는 것도 확인 |
| HTML style | `index.html` · `pip.html` · `recovery-read.html`에 `style` 속성 · `<style>` 태그 없음, CSP `style-src 'self'` 그대로. 실행 중 보이는 style 속성은 `element.style.setProperty`(CSSOM)로 넣은 CSS 변수 |
| 글꼴 | 화면 14곳과 PIP 4개에서 'Gowun Batang' · 'Nanum Barun Gothic' 두 가지만 쓰이고, 둘 다 실제로 로드됨 |
| 누르는 크기 | 화면 14곳에서 44px 미만 0 |
| 이모지 · 영어 | 출처 줄의 ©만 있음. 그라데이션은 디자인 부품의 라디오 점(radial-gradient)뿐, 흐림 효과 없음 |
| 화면 잠금 | 도구 5개(전체 화면 · 새로고침 · 타이머 · 잠금 해제 · PIP), 수정 버튼 0 |
| PIP J03 · J04 | 이름을 눌러 완료 켜기 · 끄기(순서 그대로), 중복 없이 켜기 · 끄기, 뽑기 PASS |
| 판 고유 확인 | 업데이트 창 판 이름 '옥구초판', 랜덤 뽑기 학급 줄은 고정 학교(OKGU_SCHOOL), 첫 실행 카드(I06)는 켜지지 않음 |
| `npm run test:migration` | 미실행: v1.7.8 압축 해제 폴더(`CLASSROOM_V178_APP`)가 없어 SKIP |
| Windows 실기 확인 | 미실행: macOS에서 Electron으로 확인 |
| GitHub에서 PR #14 합치기 | 완료: merge commit 68887e1, 작업 브랜치 남김 |

## 확인 목록 (디자인 지시서 8장, 보완 지시서 2장 · 8장 반영)

| 항목 | 결과 |
|---|---|
| 세 크기에서 A · B 칸 잘림 · 겹침 없음 | PASS(배치 편집 E2E 세 크기 겹침 검사, 세 크기 스크린샷) |
| A ↔ B 배치 따로 기억, 재시작 · 백업 복원 후 유지, 예전 백업 복원 | PASS(dashboard-layout E2E, backup-core 단위 시험) |
| 대시보드에 '다음 교시' 없음, PIP '다음 교시'는 작은 둘째 줄, 설정 PIP 항목 6개 | PASS(보완 2장대로. E2E · J01 스크린샷) |
| 좁은 칸에서도 과목 이름 유지(시각이 먼저 숨음) | PASS(timetable-layout E2E) |
| D-Day 0 · 1 · 2개, 긴 제목, 당일 "D-Day" | PASS(스크린샷: B 빈 날 · D-Day 당일) |
| 빈 아침활동 · 빈 안내사항 · 교시 시간 미설정 | PASS(A06 · A16과 같음) |
| 배치 편집 | PASS(88/88) |
| 화면 잠금: 수정 버튼 사라짐, 도구 5개 | PASS |
| 대화 상자 같은 틀, '새로워진 점' 창 포함 | PASS(화면 확인) |
| 타이머 버튼 순서 고정(창 · PIP) | PASS(화면 확인, timer-startup E2E) |
| PIP 활동완료 이름 누르기, PIP 랜덤 중복 없이 켜기 · 끄기 | PASS |
| 44px 이상 · 글꼴 두 가지 · 이모지 · 그라데이션 · 흐림 · 영어 문구 없음 | PASS(위 점검) |
| 기존 데이터(명단 · 시간표 · 알림장 초안 · 배치 · D-Day) | PASS(regression · recovery · diary-drafts E2E). v1.7.8 이전 실기 자료 시험은 미실행 |
| 판별 화면 H01 · I01 | PASS(스크린샷. H01은 저장 상태 · 수신 제목 문구만 기존 그대로) |
| 알림장 칠판 모드 H05–H10 | PASS(40/40) |
| 안내사항 3줄이 1440×900에서 18px 이상 | PASS(dashboard-layout E2E) |
| 두 판 섞임 없음, 업데이트 경로(github · rlasksk030/class) 그대로 | PASS(`app/update-config.json` 변경 없음, 학교종이 · NEIS 인증키 코드 없음) |
| (승인 후) 옥구초판 1.8.16 배포 | 하지 않음 |

## 스크린샷

`tests/validation/screenshots/design-refresh-*.jpg`: 대시보드 A · B(1440), B(1100), 배치 편집 A, 화면 잠금 A, B 빈 날 · D-Day 당일, H01 알림장, I01 설정, I01 첫 실행(백업 · 복원 보임), H06 · H09 칠판 모드, E04 발표 화면, J01 PIP, 새로워진 점 창.
