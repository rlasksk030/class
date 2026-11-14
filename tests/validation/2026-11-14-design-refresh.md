# 우리 교실 디자인 다듬기 적용 (전국판, 2026-11-14)

- 시작점: `feature/timer-pip-nationwide` `bf20a3a`(1.8.16) → 브랜치 `feature/design-refresh-nationwide`
- 따른 문서: `design/2026-11-design-refresh/우리교실_디자인적용_지시서.md` 0~8장, 디자인 적용 보완 지시서, 작업 지시서 — 알림장 칠판 모드(4-1단계). 문서가 서로 다르면 보완 지시서를 따랐다.
- 버전 · 빌드 · push · PR · 태그 · Release는 하지 않았다. `app/update-config.json`(generic · nationwide2), 앱 ID, 데이터 폴더는 그대로다.
- 이 판에서 먼저 만들고, 옥구초판(`feature/design-refresh-okgu`)으로 cherry-pick했다. 두 판을 병합하지는 않았다.

## 커밋

| 단계 | 커밋 | 내용 |
|---|---|---|
| 0 | 4786db7 | 디자인 원본 자료를 `design/2026-11-design-refresh/`에 둠(설치 파일에는 안 들어감: electron-builder가 `app/`만 묶음). 앱용 사본은 `app/ui/` |
| 1 | d712dea | 토큰 · 부품 · 아이콘 · 글꼴 CSS를 모든 창에 연결 |
| 2 | c4d9416, 9a8d004 | 대시보드 A/B 구조, 배율 s, 칸 공통 공식, 시간표 · 급식 · 빈 상태 · D-Day · 날씨, 아래 도구 막대, 배치 편집, 화면 잠금 |
| 3 | f5370dd | 작은 창 공통 틀(B01–B04, C01–C03, D01–D02, I04, I05) |
| 4 | 3b59842 | 랜덤 뽑기 · 발표 화면(E01–E04), 활동완료, 화이트보드, 알림장(H02–H04) |
| 5 | c442980 | 설정 창 3묶음, 첫 실행(I02, I03, I06) |
| 6 | da47a3e | PIP J01–J04 |
| 7 | 0a0ddbc | 확인 목록 점검: 누르는 크기 44px, 옛 효과 정리 |
| 보완 | 962c3ac | PIP '다음 교시'(작은 둘째 줄) · 설정 PIP 항목 6개 유지, 예전 백업 복원 시 B는 기본 배치, 자료 위치 |
| 4-1 | acd3f2f | 알림장 칠판 모드(H05–H10) |
| 판별 | b74cf84 | 옥구초판 설정 화면(I01) 모양. 전국판 화면은 바뀌지 않음 |
| 판별 | a0816e1 | 옥구초판 첫 실행(학년 · 반 저장 전)에 백업 · 복원 묶음도 보이게. 전국판은 첫 실행 카드(I06)에서 이미 보임 |
| 받아 옴 | 8552cd1, dd96e7e | PR #13('달라진 점' 팝업) 머리 커밋을 받고, #13을 합친 뒤 기준 브랜치(b45781a)를 받음(아래 참고) |
| 팝업 | 350de97 | '새로워진 점' 창을 작은 창 공통 틀(.uc-dialog --sm)로, NOTES 1.8.17 문구, 닫힌 대화 상자 숨김 |

### PR #13 받아 오기
- 선생님 결정은 "#13을 기준 브랜치에 먼저 합친 뒤 작업 브랜치에 기준 브랜치를 merge로 받기"였다.
- 처음에는 GitHub에서 합치는 명령이 이 작업 세션의 권한 검사에 막혔다. 그래서 같은 머리 커밋(0051871)을 로컬 작업 브랜치에 먼저 받아(8552cd1) 디자인과 시험을 진행했다. 충돌: `app/index.html`(디자인 마크업 유지, whats-new 두 줄 추가), `package.json`(test:e2e 끝에 whats-new E2E 추가).
- 그 뒤 선생님 승인으로 #13을 합쳤다: draft 해제 → merge commit `b45781a`("전국용: 업데이트 후 '달라진 점' 안내 팝업 (#13) [skip ci]", 본문 한 줄), 작업 브랜치는 남김.
- 기준 브랜치를 작업 브랜치에 merge로 받았다(dd96e7e). 파일은 바뀌지 않았다(트리 동일). 그래서 아래 시험 결과가 그대로 적용된다.

## 새 저장값 (추가만 했고 기본값이 있음, 백업 · 복원 포함)

- `layoutStructure`: 'A' | 'B', 기본 'A'
- `boardLayoutB`: B 구조 배치. A 배치는 기존 `boardLayout`을 그대로 씀
- `diaryChalkPreferences`: `{fontScale: null | 0.15–3, showDate: boolean}`, 기본 `{fontScale:null, showDate:true}`
- PR #13의 `lastSeenVersion`은 그 PR 설계대로 백업 대상이 아니다.
- 예전 백업을 복원하면 A는 `boardLayout`에서, B는 기본 배치, 구조는 A로 열린다.

## 그림과 다른 점 (의도적으로 남김)

- 시간표 시작 시각은 교시 시간을 정했을 때만 보인다(지시서 본문대로).
- 칸을 숨겨도 자리는 빈 칸으로 남고, [빈 칸 채우기]로 채운다(기존 기능).
- 알림장 발행 서비스는 기존 선택 상자, 학교종이 수신 대상은 기존 체크박스를 쓴다(기존 테스트와 동작 유지).
- 첫 실행 I06은 단계 표시가 있는 같은 카드다. [← 이전]/[다음] 넘김은 없다.
- 편집 막대 버튼 글씨는 기존 검사(16px 이상)를 지키려고 16px다(지시서 15px).
- 알림장 저장 상태는 기존 문구('작성 내용은 자동 저장됩니다.' → '저장됨')를 그대로 쓴다.

## 테스트 (PASS / 미실행) — 최종 커밋 350de97 기준

| 항목 | 결과 |
|---|---|
| `npm run check` | PASS (121/121 파일) |
| `npm test` | PASS (135/135) |
| `npm run test:e2e` 전체(23개 파일, `test:photos` 4개 포함) | PASS, FAIL 0. board-titles 26/26, v182-features 43/43, regression 41/41, hiclass-link 16/16, recovery 18/18, timetable-layout 8/8, diary-drafts 17/17, hiclass-recipients 38/38, hiclass-submit 21/21, timer-startup 21/21, diary-layout 15/15, diary-chalkboard 41/41, hiclass-window 11/11, multischool 10/10, schoolbell 73/73, dashboard-layout 88/88, first-run 8/8, update-feeds 9/9, whats-new 7/7, photos 22/22, hiclass-photos 4/4, photo-boundaries 6/6, photo-transfer 5/5 |
| 참고: 앞선 전체 실행(b74cf84) | schoolbell 1개 검사('재실행: 로그인이 유효하면 연결됨 그대로', 다시 켠 뒤 1.5초 고정 대기)가 한 번 실패했고, 최종 실행에서는 통과. 두 판 E2E를 동시에 돌린 부하에서 생긴 것으로 보고 시험은 바꾸지 않음 |
| CSP 콘솔 검사(따로 만든 점검 스크립트) | 대시보드 · A/B 전환 · 배치 편집 · 수정 창 · 타이머 · 화면 설정 · 교시 · D-Day · 설정 3묶음 · 업데이트 · 랜덤 뽑기 · 발표 화면 · 활동완료 · 화이트보드 · 알림장 · 칠판 모드 · 불러오기 창과 PIP 4개: CSP 메시지 0, 페이지 오류 0. 검사기가 일부러 넣은 인라인 스타일 2건을 잡는 것도 확인 |
| HTML style | `index.html` · `pip.html` · `recovery-read.html`에 `style` 속성 · `<style>` 태그 없음, CSP `style-src 'self'` 그대로. 실행 중 보이는 style 속성은 `element.style.setProperty`(CSSOM)로 넣은 CSS 변수 |
| 글꼴 | 화면 14곳과 PIP 4개에서 'Gowun Batang' · 'Nanum Barun Gothic' 두 가지만 쓰이고, 둘 다 실제로 로드됨(dashboard-layout E2E에도 검사 있음) |
| 누르는 크기 | 화면 14곳에서 44px 미만 0 |
| 이모지 · 영어 | 출처 줄의 ©만 있음. 그라데이션은 디자인 부품의 라디오 점(radial-gradient)뿐, 흐림 효과 없음 |
| 화면 잠금 | 도구 5개(전체 화면 · 새로고침 · 타이머 · 잠금 해제 · PIP), 수정 버튼 0 |
| PIP J03 · J04 | 이름을 눌러 완료 켜기 · 끄기(순서 그대로), 중복 없이 켜기 · 끄기, 뽑기 PASS |
| `npm run test:migration` | 미실행: v1.7.8 압축 해제 폴더(`CLASSROOM_V178_APP`)가 없어 SKIP |
| Windows 실기 확인 | 미실행: macOS에서 Electron으로 확인 |
| GitHub에서 PR #13 합치기 | 완료: merge commit b45781a, 작업 브랜치 남김 |

## 확인 목록 (디자인 지시서 8장, 보완 지시서 2장 · 8장 반영)

| 항목 | 결과 |
|---|---|
| 세 크기에서 A · B 칸 잘림 · 겹침 없음 | PASS(배치 편집 E2E 세 크기 겹침 검사, 스크린샷) |
| A ↔ B 배치 따로 기억, 재시작 · 백업 복원 후 유지, 예전 백업 복원 | PASS(dashboard-layout E2E, backup-core 단위 시험) |
| 대시보드에 '다음 교시' 없음, PIP '다음 교시'는 작은 둘째 줄, 설정 PIP 항목 6개 | PASS(보완 2장대로. E2E · J01 스크린샷) |
| 좁은 칸에서도 과목 이름 유지(시각이 먼저 숨음) | PASS(timetable-layout E2E) |
| D-Day 0 · 1 · 2개, 긴 제목, 당일 "D-Day" | PASS(2단계 스크린샷) |
| 빈 아침활동 · 빈 안내사항 · 교시 시간 미설정 | PASS(A06 · A16과 같음) |
| 배치 편집: 크기 표시가 글자를 덮지 않음, 다시 넣기 · 기본 배치로 · 취소 · 완료 | PASS(88/88) |
| 화면 잠금: 수정 버튼 사라짐, 도구 5개 | PASS |
| 대화 상자 같은 틀(제목 · [×] · [취소][저장] 순서), '새로워진 점' 창 포함 | PASS(화면 확인) |
| 타이머 버튼 순서가 상태에 따라 바뀌지 않음(창 · PIP) | PASS(화면 확인, timer-startup E2E) |
| PIP 활동완료 이름 누르기, PIP 랜덤 중복 없이 켜기 · 끄기 | PASS |
| 44px 이상 · 글꼴 두 가지 · 이모지 · 그라데이션 · 흐림 · 영어 문구 없음 | PASS(위 점검) |
| 기존 데이터(명단 · 시간표 · 알림장 초안 · 배치 · D-Day) | PASS(regression · recovery · diary-drafts E2E). v1.7.8 이전 실기 자료 시험은 미실행 |
| 판별 화면 H02 · H03 · I02 · I06 | PASS(스크린샷) |
| 알림장 칠판 모드 H05–H10(흐린 버튼, 자동 맞춤, 쪽 나누기, 막대 3초 뒤 숨김, 명암비 7:1 이상) | PASS(41/41) |
| 안내사항 3줄이 1440×900에서 18px 이상 | PASS(dashboard-layout E2E) |
| 두 판 섞임 없음, 업데이트 경로(generic · nationwide2) 그대로 | PASS(`app/update-config.json` 변경 없음) |
| (승인 후) 전국판 1.8.17 배포 | 하지 않음 |

## 스크린샷

`tests/validation/screenshots/design-refresh-*.jpg`(1440×900): 대시보드 A · B, 화면 잠금, H02 · H03 알림장, I02 설정, I06 첫 실행, H06 칠판 모드, J01 PIP, 새로워진 점 창.
