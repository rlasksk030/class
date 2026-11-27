# 학교종이 최종 비교 분리 및 비게시 진단

기준 `f3888c031e35e4f021b1d34f8a13b9cb4c95a8a0`. 이전 uncertain 기록·성공 게시물·A/B/C·정식 배포판을 보존했다. 이 기록의 로컬 검사는 실서비스 PASS가 아니다.

## 실제로 확인한 실패 항목

수정 앱의 첫 비게시 검사에서 `checkCommit → commit-revision-mismatch`를 확인했다. `notSubmitted`, `sendEnabled`, `singleAction`, `titleMatch`, `bodyMatch`, `sameDocument`는 모두 true이고 `revisionMatch`, `semanticRevisionMatch`는 false였다. `before-readDate`부터 이미 불일치했다. 이후 `after-readDate`, `before-focus`, `after-focus`, `after-target-ready`에서도 같은 비교 결과였다. 따라서 그 실행에서는 focusForSend/waitForSendTarget/readDate가 최초 불일치를 만든 것은 아니다. 내용 재조회 이후 대상 guard가 다시 동작하는 구간을 진단 대상으로 좁혔다. 기존 로그만으로 특정 본문 변경이라고 단정하지 않았다.

서버 독립 전체 조회는5건/이번 제목0건. 보내기/native mouse 이벤트는0회. 제목·본문·사진은 앱과 웹 작성창에 그대로 남았다. 기존 uncertain 원본을 별도 보존하고, 서버 조회에 근거한 사용자 미게시 확인을 이력에 덧붙였다. 재전송 또는 성공으로 변환하지 않았다.

## 수정

- `schoolbell-observed-composer.cjs`: 최종 제출 상태, 보내기 버튼, single-send, revision, 제목, 본문 비교 및 본문 읽기 실패/미분류 renderer 예외를 별도 고정 코드로 구분한다. 진단에는 비교 boolean·고정 코드만 사용한다.
- 읽기 전용 날짜·초점·버튼 대기 전후 비교를 기록한다. 문서 내 mutation은 고정 분류와 boolean만 기록하며 값·내용·DOM 덤프는 기록하지 않는다.
- class/style 변화 또는 이전 값과 같은 속성 재설정에 한해 재검증 후보가 된다. 동일 배치에서 속성을 바꿨다가 되돌리는 경우도 각 전이를 복원하여 실제 변경으로 차단한다. 입력 이벤트, 텍스트·노드·파일·대상 변경, 문서 교체는 계속 차단한다.
- `schoolbell-electron-driver.cjs`: 후보라도 현재 권한/학급/수신자, 제목·본문, 첨부 개수·순서와 다시 다운로드한 원본 해시, 즉시발행을 모두 재검증해야 최종 revision을 한 번 갱신한다. 전송을 준비하거나 시도한 후에는 갱신·재클릭하지 않는다.
- `schoolbell-prepared-driver.cjs`, `schoolbell-final-guard.cjs`: 사용자 최종 게시 확인 전에 동일 검증을 수행하는 비게시 preflight를 연결한다. 이 검사는 native-send를 arm/dispatch하지 않는다. 실제 commit은 별도 최종 내용 승인·권한 검증을 그대로 요구한다.
- 제목·본문 입력 및 파일 선택/업로드 로직, 하이클래스, 운영 잠금은 변경하지 않았다.

## 관련 로컬 검사

- 최종 변경본의 관련 단위 검사83건 통과. 오류 우선순위·변경 분류 보완 중에는 observed-composer 관련9건만 추가 확인했다.
- 격리 Electron revision 검사: 표시 속성만 바뀐 경우 전체 재검증 뒤 로컬 단일 게시/원본 대조/이력 저장 통과. 본문 변경, 변경 후 되돌림, 대상 변경, 원본 손상은 전송 전에 차단.
- 추가 속성 전이 검사2건: 실제 변경 후 원상복구는 차단, 동일 값 재설정만 개발 시험 승인 계약으로 재검증 후 로컬 단일 게시 통과.
- 실서비스 네트워크를 차단한 격리 검사다. 기존 전체 회귀/A·B·C 게시 시험은 반복하지 않았다.

## 실제 앱 후속 결과

두 번째 수정 앱에서 같은 합성 초안으로 제목·본문·사진 자동 입력, 원본 다운로드 대조, 비게시 commit-check를 통과했다. 실제 앱의 최종 게시 확인창에 도달했고 immediate/settled 두 시점의 즉시발행·버튼 활성·실제 클릭 위치 일치를 확인했다. 사용자에게 같은 테스트 학급·학생/학부모0·필수 관리자 본인1·정확한 합성 제목/본문·97-byte PNG1장의 새로운 최종 게시 승인을 요청했다. 승인 전에는 보내지 않는다. 실제 게시·서버 신규 ID/원본·새 성공 이력·초안 초기화는 아직 NOT RUN이다.

## 운영 상태

PR5 Draft, 운영 잠금 유지. Windows 필수 제품·설치·업데이트·재부팅 검사는 이번 변경에서 NOT RUN이며 이전 Node/PATH 및 VM 응답 지연과 제품 실패를 구분한다. 실제 앱 완주 이후에만 남은 Windows 게이트로 진행한다. 정식 버전·Release·업데이트 채널 변경 없음. GitHub Actions 신규 실행0회·추가 비용0원. 현재 작업 브랜치는 Windows push 트리거 대상이 아님을 확인했다.

증거: [고정 비교 진단과 서버 재조회](artifacts/2026-11-10-schoolbell-commit-comparison/). 실제 계정·학급·게시물 식별값·세션은 포함하지 않는다.
