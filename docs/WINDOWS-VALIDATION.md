# v1.8.2 Windows 실기 검증 인계

이 브랜치는 **검증용**입니다. main 병합, 태그(v1.8.2), GitHub Release 발행, latest.yml 공개를 하지 않습니다.
Release가 올라가지 않는 한 선생님 PC의 업데이트 확인에는 새 버전이 나타나지 않습니다.

## 구성

| 경로 | 내용 |
| --- | --- |
| `app/` | 앱 소스(app.asar 내용). 첫 커밋은 공개 v1.8.1 원본 그대로, 다음 커밋이 v1.8.2 변경분 |
| `electron-builder.json` | v1.8.1 설치기와 동일한 설정 (appId `kr.classroom.dashboard`, 선택형 NSIS, x64) |
| `tests/e2e/` | Electron 실제 실행 E2E (Playwright) |
| `app/*.test.cjs` | 단위 테스트 (`node --test`) |

## v1.8.2 변경 사항

1. 아침활동·안내사항 제목 편집 (`board-titles.js/.css`, `resize.js` 최소폭 계산 1줄)
2. 설정 화면 백업/복원 (`backup-core.js`, `backup-ui.js`, `backup.cjs`, `backup.css`, `preload.cjs`, `main.cjs`, `app.js`의 복원 중 저장 차단 1줄)
3. 휴일·방학·시간표/급식 없는 날 처리 (`app.js`)
4. 화이트보드 실행 취소/다시 실행 (`whiteboard-objects.js`)

`updates.cjs`, `UpdateRecovery.exe`, `updater-bundle.cjs`, `update-config.json`은 v1.7.8·v1.8.1과 바이트 단위로 동일합니다(업데이트·ASAR 백업 로직 미변경).
관리자 권한 없는 per-user 설치 전환은 호환성 검증 전이라 **이번 버전에 넣지 않았습니다.**

## Windows에서 처음 실행할 명령 (PowerShell)

```powershell
git clone -b feature/class-dashboard-v1.8.2-windows-validation https://github.com/rlasksk030/class.git
cd class
npm ci
npm test
npm run test:e2e
npm run dist:win      # dist\classroom-dashboard-setup-1.8.2.exe + dist\latest.yml 생성 (게시 안 함)
```

`dist:win`은 `--publish never`라서 GitHub에 아무것도 올리지 않습니다.

## 컨테이너(Linux)에서 확인된 것 / 확인 못 한 것

확인됨 (Linux Electron 40.10.6 실행):
- 단위 15개, 제목 편집 E2E 24개, v1.8.2 기능 E2E 42개 통과
- 기본 상태 대시보드 레이아웃이 v1.8.1 원본과 동일 (보드 위치·크기·제목 스타일 비교)
- v1.7.8·v1.8.1의 업데이트 설정 동일: provider github / owner rlasksk030 / repo class

확인 못 함 (Windows 필요):
- 설치, 관리자 권한 요구 여부, 업데이트 감지·다운로드·ASAR 백업·설치 교체·재실행, 업데이트 후 데이터 유지
- Windows용 설치 파일 빌드 (Linux+Wine에서 NSIS 단계 실패 → 환경 문제로 판단, Windows에서 재빌드 필요)

## 검증 시 꼭 볼 것: v1.7.x → v1.8.x 설치기 식별자 변경

설치기 헤더를 확인한 결과:

| 버전 | appId | 설치 방식 |
| --- | --- | --- |
| v1.7.0 ~ v1.7.8 | `org.school.classroomdashboard` (GUID d78eedc4-…) | 원클릭, 사용자 설치 (관리자 권한 불필요) |
| v1.8.0(프리릴리스), v1.8.1 | `kr.classroom.dashboard` (GUID 80d89bea-…) | 선택형 (사용자/모든 사용자 선택) |

- v1.7.8 업데이터는 새 설치 파일을 `/S /D=<기존 설치 폴더>`로 실행합니다. 기존 폴더가 사용자 폴더(`%LOCALAPPDATA%\Programs\우리 교실`)이면 권한 상승 없이 덮어쓰는 경로입니다(코드 분석 결과, 실기 미확인).
- appId가 달라 **"설치된 앱" 목록에 '우리 교실'이 2개 남는지**, 한쪽을 제거할 때 다른 쪽 파일·바로가기가 지워지는지 확인이 필요합니다.
- 사용자 데이터는 설치 폴더가 아니라 `%APPDATA%\classroom-dashboard`에 고정되어 있습니다(`main.cjs`).

## 테스트용 새 버전 공급 방법 (결정 필요)

v1.7.8 업데이터는 이 저장소의 정식 릴리스만 봅니다(프리릴리스·초안 제외). 공개 릴리스를 건드리지 않고 검증하려면:
- A. 현재 공개된 v1.8.1을 대상으로 v1.7.8 → v1.8.1 경로를 먼저 검증
- B. 로컬 프록시로 GitHub 응답을 가짜로 보여 주기 (공개 영향 없음, 준비 복잡)
- C. 1.8.2를 정식 릴리스로 올린 직후 검증 (다른 PC에도 알림이 뜸 — 사전 승인 필요)
