# 전국판 설치 파일을 GitHub Release로 옮기기 — 다리 버전 1.8.16 준비 (2026-11-13)

- 시작점: `feature/timer-pip-nationwide` `942af9e`(1.8.15) → 브랜치 `feature/nationwide-release-assets`
- 옥구초판, 앱 ID, 데이터 폴더, 기능 코드는 바꾸지 않았다. 버전은 승인 후 1.8.16으로 올려 빌드했다(소스 `f3e446c`).

## 바꾼 것

| 파일 | 내용 |
|---|---|
| `app/update-config.json` | `channel`만 `nationwide` → `nationwide2`. `provider`·`url`(브랜치 raw 주소)은 그대로 |
| `app/update-feed-check.cjs` (새) | 피드의 `files[0].url`과 `path`(있으면)가 `https://github.com/rlasksk030/class/releases/download/nationwide-v<버전>/classroom-dashboard-nationwide-setup-<버전>-x64.exe`와 글자까지 같을 때만 통과. 버전 형식·파일 1개·`packages` 없음 검사는 그대로 |
| `app/updates.cjs` | 위 함수로 검사 |
| `electron-builder.json` | publish 채널 `nationwide2`(빌드 결과 `dist/nationwide2.yml`, 설치 파일 속 `app-update.yml`도 같은 채널) |
| `scripts/make-nationwide-feeds.cjs` (새) | `npm run dist:win` 끝에 실행. 설치 파일 크기·sha512를 builder 피드와 대조한 뒤 `nationwide2.yml`을 Release 주소 형식으로 쓴다. `nationwide.yml`(파일 이름 형식)은 **버전이 1.8.16일 때만** 쓰고, 다른 버전이면 `dist`에 남은 것을 지운다 |
| `tests/windows/*.cjs`, 검증 워크플로 | `nationwide2.yml`을 읽도록 맞춤(Windows 전용, 여기서는 미실행) |
| `docs/전국판_배포_절차.md` (새), `전국학교_시작안내.md` | 1.8.17부터의 순서: 태그 → Release(Latest 아님, 자산 확인) → 그다음 `nationwide2.yml` |
| `타이머_PIP_사용안내.md` | 전국용 설치 링크를 raw 1.8.11 파일에서 `downloads/nationwide` README(항상 최신)로. 전국용 1.8.11 Release는 draft라 공개 주소가 없다 |

### 두 피드 예시 (1.8.16, 같은 sha512·size·version)

```yaml
# nationwide.yml — 1.8.9~1.8.15가 읽음, 1.8.16에서 멈춤
version: 1.8.16
files:
  - url: classroom-dashboard-nationwide-setup-1.8.16-x64.exe
    sha512: <설치 파일 sha512>
    size: <바이트>
path: classroom-dashboard-nationwide-setup-1.8.16-x64.exe
sha512: <설치 파일 sha512>
releaseDate: '<빌드 시각>'

# nationwide2.yml — 1.8.16부터 읽음
version: 1.8.16
files:
  - url: https://github.com/rlasksk030/class/releases/download/nationwide-v1.8.16/classroom-dashboard-nationwide-setup-1.8.16-x64.exe
    sha512: <설치 파일 sha512>
    size: <바이트>
path: https://github.com/rlasksk030/class/releases/download/nationwide-v1.8.16/classroom-dashboard-nationwide-setup-1.8.16-x64.exe
sha512: <설치 파일 sha512>
releaseDate: '<빌드 시각>'
```

### 확인한 사실

- 엄격한 피드 검사가 들어 있는 것은 **1.8.9~1.8.15**다. 1.8.8은 `provider: github`(옥구초 `releases/latest`)를 보고 검사가 없어, 원래부터 `nationwide.yml`을 읽지 않는다. 지금 README대로 1.8.8은 설치 파일을 한 번 직접 설치해야 하며, 이번 변경으로 달라지지 않는다.
- electron-updater generic 공급자는 채널 파일을 `<url>/<channel>.yml`로 읽고(Windows는 접미사 없음), 피드의 `url`이 절대 주소면 그대로 내려받는다. 다운로드는 redirect를 최대 10번 따라가고 sha512를 검사한다.

## 테스트 (PASS / 미실행)

| 항목 | 결과 |
|---|---|
| 피드 검사 단위 테스트 `app/update-feed-check.test.cjs` | PASS 4/4 — 정확한 주소만 통과. 파일 이름만, http, 다른 호스트·비슷한 호스트·대문자 호스트, 다른 소유자·저장소·태그, 버전 불일치, 쿼리·조각·공백·인코딩, raw 주소, 파일 0·2개, `path` 불일치, `packages` 모두 거부 |
| 피드 생성 테스트 `tests/nationwide-feeds.test.cjs` | PASS 4/4 — 두 피드의 version·sha512·size·날짜가 같고 url·path만 다름. 1.8.15 검사는 `nationwide.yml`만, 1.8.16 검사는 `nationwide2.yml`만 받음. 설치 파일과 다르면 쓰지 않음. 1.8.17에서는 `nationwide.yml`을 쓰지 않고 남은 것을 지움. 두 번 실행해도 같음 |
| 업데이트 흐름 모의 시험 `tests/e2e/update-feeds.e2e.cjs` | PASS 9/9 (아래) |
| 전국판 구문 검사 `npm run check` | PASS 112/112 |
| 전국판 단위 `npm test` | PASS 115/115 |
| 전국판 E2E `npm run test:e2e` (21개 파일) | 모두 PASS — board-titles 24, v182-features 43, regression 36, hiclass-link 16, recovery 17, timetable-layout 8, diary-drafts 17, hiclass-recipients 38, hiclass-submit 21, timer-startup 21, diary-layout 15, hiclass-window 11, photos 22, hiclass-photos 4, photo-boundaries 6, photo-transfer 5, multischool 10, schoolbell 73(합성 사이트), dashboard-layout 71, first-run 8, update-feeds 9 |
| `migration-v178` | **미실행** — v1.7.8 원본 앱이 필요(이번 변경과 무관) |
| 1.8.16 빌드 `npm run dist:win` (`f3e446c`) | PASS — 설치 파일 99,370,331바이트(94.77MiB, 100MiB 미만), SHA-256 `3d6e6be0f5bfed38b5425f7201d2dc5faf5de32830d556470e0fded62af581b6` |
| 설치 파일 속 업데이트 채널 | PASS — 설치 파일 → `app-64.7z` → `app.asar`의 `update-config.json`과 `resources/app-update.yml` 모두 generic·`downloads/nationwide`·`nationwide2`. `app.asar` 파일 103개가 소스와 같음 |
| `dist` 두 피드 | PASS — `nationwide.yml`(파일 이름)·`nationwide2.yml`(Release 주소)의 version·sha512·size·releaseDate가 같고 설치 파일과 일치. `nationwide2.yml`은 앱 검사 통과 |
| 배포(v1.8.16) | **완료** 2026-11-13 — PR #11 → `99b6fa3`, 태그 `nationwide-v1.8.16` → `f3e446c`, Release 게시(Latest 아님, 자산 6개), `downloads/nationwide` `a99ccd8`(설치 파일은 브랜치에 마지막, `nationwide.yml`·`nationwide2.yml` 둘 다 1.8.16). 공개 주소의 두 피드가 빌드와 같고, 브랜치·Release 설치 파일 sha512가 피드와 일치. `releases/latest`는 옥구초 `v1.8.15` 유지. Actions 신규 0회 |
| Windows 설치·업데이트 | **미실행** — 아래 체크리스트 |

모의 시험은 앱에 들어 있는 electron-updater(NsisUpdater, Windows 채널 이름 규칙)를 Electron 안에서 돌린다. `raw.githubusercontent.com`·`github.com`·Release 첨부 호스트는 Chromium 호스트 규칙으로 로컬 HTTPS 서버에 연결하고, 나머지 호스트는 모두 실패하게 해서 실제 인터넷에 나가지 않는다. 피드는 `make-nationwide-feeds.cjs`로 만들었다.

1. 1.8.15(채널 `nationwide`)가 `nationwide.yml`만 요청해 1.8.16을 제안받고, 예전 검사는 통과·새 검사는 거부
2. 1.8.15가 브랜치의 파일 이름으로 1.8.16을 내려받고 sha512 일치
3. 1.8.16(채널 `nationwide2`)이 `nationwide2.yml`만 요청하고 "최신"
4. 같은 1.8.16 피드를 예전 검사는 거부, 새 검사는 통과
5. 1.8.17을 Release에만 올리고 `nationwide2.yml` 갱신 → 1.8.16이 제안받고 새 검사 통과
6. 1.8.16이 `github.com/.../nationwide-v1.8.17/...`에서 302를 따라 첨부 호스트로 가서 내려받고 sha512 일치
7. 1.8.17이 나온 뒤에도 1.8.9는 멈춘 `nationwide.yml`로 1.8.16을 제안받음
8. `nationwide2.yml`이 파일 이름 형식이면 1.8.16의 검사가 거부(앱은 오류 표시, 다운로드 안 함)
9. 피드 sha512가 Release 파일과 다르면 다운로드 실패

대조 실험: 설정의 채널을 `nationwide`로 되돌리면 3번에서 실패한다.

## Windows 확인 체크리스트 (학교 PC, 전국판)

1. 1.8.15 PC: 설정 → 업데이트 확인 → **1.8.16** 표시 → 업데이트 → 재시작 후 1.8.16, 초안·배치·학급 연결 그대로
2. 1.8.9~1.8.14 PC가 있으면: 바로 1.8.16이 제안되고 설치되는지
3. 1.8.16에서 업데이트 확인 → "최신 버전"(오류 문구 없음)
4. (1.8.17 배포 뒤) 1.8.16 → 1.8.17 업데이트: 진행률이 오르고 설치·재시작까지 되는지 — 처음으로 Release 첨부 파일에서 받는 단계
5. 학교 네트워크에서 4번이 막히면 브라우저로 Release 설치 파일 주소가 열리는지 확인(`github.com` → `release-assets.githubusercontent.com` 또는 `objects.githubusercontent.com`)
6. 1.8.17에서 업데이트 확인 → "최신 버전", 데이터 그대로
7. 옥구초판 PC: 업데이트 확인이 옥구초판만 제안하는지(전국판을 받지 않는지)
