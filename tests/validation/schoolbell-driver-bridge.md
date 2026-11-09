# 학교종이 사전 드라이버와 미관찰 UI 경계

`app/schoolbell-prepared-driver.cjs`는 기존 `schoolbell-publish.cjs` 계약을 구현하는 **시험 학급용 사전 드라이버**다. 2026-11-09 후속 작업에서 `schoolbell.cjs`에 `createRuntimeDriver`를 연결했다. capability=false와 기본 권한/증거 공급자 부재 때문에 실제 앱의 자동 조작은 차단된다. driver=null은 더 이상 현재 상태가 아니다.

최신 구현·실서비스 시험 결과는 [Electron 및 실제 A/B/C 기록](2026-11-09-schoolbell-electron-live.md)을 기준으로 한다. 아래 기본 증거 계약은 유지한다. 학교종이 브라우저에서 실제 게시·사진 원본 다운로드는 통과했지만 앱의 실제 세션에서 이 계약 전체를 충족한 것은 아니다.

### 구체화된 Electron 연결부

- `schoolbell-observed-composer.cjs`: 격리 world의 native 제목/본문 편집, 사진 원본 File 전달, 변경 revision, 같은 조작 안의 DOM guard, 단일 보내기.
- `schoolbell-editor-text.cjs`, `probeAttachments`: 관찰한 Froala 문단과 파일명/확장자/용량 분리. 미리보기나 파일명을 독립 원본으로 취급하지 않는다.
- `schoolbell-observed-post.cjs`: classnews 경로/유일한 제목/전문/파일 순서 검사 및 실제 첨부 목록 클릭 → Electron 다운로드 → 원본 해시 비교. ID·날짜·권한은 추정하지 않는다.
- `schoolbell-electron-driver.cjs`는 기존 `readPublished` 공급자 또는 `readPublishedMetadata` + 관찰 UI 원본 다운로드를 사용할 수 있다. metadata는 원래 학급으로 재조회한 `complete, refreshed, boardURL, id, date, scope`를 요구하며 실서비스 공급자는 아직 없다.
- 게시 후 schoolnews로 이동해도 재게시하지 않는다. 읽기 공급자가 원래 classnews로 돌아온 뒤 binding과 결과를 검증한다. 실제 서비스 이동을 관찰했고 로컬 Electron 회귀를 추가했다.

`readContext`, 날짜, 게시 전 원본 다운로드, 목록 완결성/ID/date 공급자와 원자적 `guardDOM`의 실제 서비스 구현은 계속 필요하다. 합성 fixture 속성을 운영 근거로 사용하지 않는다.

## 확정한 구현과 선택자

기존 `probeComposer(document)`를 그대로 호출해 실제로 관찰한 `app-boards-write`, 제목 placeholder, `div.fr-element.fr-view[contenteditable=true]`, 파일 input, 보내기/임시저장 버튼의 유일성과 상태를 확인한다. 선택자가 없거나 중복되면 차단한다. 본문은 일반 텍스트로 전달하며 HTML 변환·주입 기능은 없다.

실사이트에서 날짜와 자동 신원/권한 검증, 게시 전 독립 원본 경로는 아직 확정하지 못했다. 파일 업로드 표시, 게시물 파일 다운로드, 링크 복사, 보내기 한 번의 실제 동작은 관찰했다. 아래 bridge가 필요한 증거를 제공하지 않으면 해당 단계에서 중단한다. 로컬 fixture의 날짜/역할/ID 속성은 합성 전용이며 실제 사이트 선택자가 아니다.

## 승인·대상

`createPreparedDriver({bridge,target,permission})`는 신뢰하는 main 코드에서만 구성한다. renderer 입력, 환경변수, 저장 설정으로 승인할 수 있는 경로는 없다. `permission` 기본값은 미승인이며, 테스트에서만 합성 승인 증거를 주입한다.

target은 `schoolId, schoolName, year, grade, classroom, classKey`다. 승인 객체는 공식 근거 참조, `electron-ui` 방식, 같은 학교/학급, 승인된 시험 학급, `read/input/attachments/submit`의 개별 범위를 요구한다. 이는 운영 활성화 승인 자체가 아니다. 실제 공식 답변과 적용 범위를 코드 검토하고 별도 실서비스 검증을 마쳐야 운영 연결을 논의할 수 있다.

`readContext`는 학교명·학년도·학년·반·학교 ID·게시판 ID, 로그인/교사/학급 승인, 인원 확인(학생 0·학부모 0), 외부 알림 없음, 시험 학급 승인, 검증 시각, 현재 계정/화면 연결 식별값을 제공해야 한다. 선택된 학급과 로컬 학교 ID를 연결하는 근거도 실제 UI로 구현해야 한다. 기본 15초보다 오래된 증거·미래 시각·항목 누락·세션/계정/학급 변경은 차단한다. 사용자 진술이나 작성 버튼 존재만으로 `identityVerified`/`authorityVerified`/`recipientsVerified`를 true로 만들 수 없다.

## Bridge 메서드 계약

모든 메서드는 마지막 인수로 AbortSignal을 받는다. 메서드가 없거나 증거가 불완전하면 차단한다. 아래 데이터는 내부 검증용이며 원격 페이지 전체/계정정보를 로그나 이력에 저장하지 않는다.

| 메서드 | 계약 |
|---|---|
| `readContext(null, signal)` | 위 신원·권한·대상·인원 증거. 현재 UI를 새로 읽어 반환 |
| `readStructure(probe, signal)` | 전달된 기존 probe를 해당 작성 화면 DOM에 읽기 전용으로 적용 |
| `readBaseline(null, signal)` | `complete:true, refreshed:true, posts`를 반환. 페이지 범위/로딩이 끝나지 않으면 complete=false. ID 중복이나 결과 누락 시 차단 |
| `openComposer(request, signal)` | 검증한 대상의 작성 화면 열기. 실제 탐색 경로는 별도 관찰 필요 |
| `readDate(null, signal)` | `verified, value:YYYY-MM-DD, writable`. 초기값을 추정하지 않음. 미확인/불가능한 날짜면 첫 제목 입력 전에 차단 |
| `writeDate/writeTitle/writeBodyText(request, signal)` | `request.value`를 검증한 UI에 입력. 제목/본문 native Electron 편집은 구현. 날짜 UI 미확인, 실제 앱 세션의 Froala 실행은 미완료 |
| `attachFiles(request, signal)` | `request.value`의 원본 바이트를 지정 순서로 한 번 첨부. 파일명은 성공 판정 근거가 아님 |
| `readContent(null, signal)` | `title, body, revision`. revision은 모든 관련 편집·날짜·첨부 변경을 포괄하는 검증 가능한 세대 값이어야 함. 격리 world의 DOM/event revision 구현, 실제 앱 세션에서 전체 검증 미완료 |
| `readUploads(null, signal)` | `complete, items:[{state:'complete',source:'original-download',bytes}]`. 업로드 완료 후 공식적으로 허용된 UI에서 다시 받은 원본을 요구. input.files/미리보기/파일명/주장된 hash만으로 대체 불가 |
| `commitOnce(request, signal)` | 아래 최종 조작 조건을 같은 조작 단계에서 검증하고 한 번만 클릭. 성공 호출 결과는 `{clicked:true}`이며 게시 성공 증거가 아님 |
| `readPublished(null, signal)` | 전체 새로고침한 `complete:true,refreshed:true,posts`. 각 게시물은 `id,kind:'published',scope,title,body,date,attachments`를 포함. attachments는 업로드와 같은 독립 원본 바이트 계약 |
| `close()` | 미완료 입력·업로드·클릭을 중단하고 다시 실행되지 않음을 보장한 경우에만 true. 실패/시간 초과 시 기존 publisher를 busy 상태로 잠금 |

입력/첨부/탐색 request는 `target,binding,value,stillPermitted`를 포함한다. bridge는 실제 조작과 같은 단계에서 대상·현재 계정·화면 연결을 다시 검사하고 signal 및 승인 철회를 반영해야 한다. 앞선 DOM 조회 결과만 믿고 나중에 다른 학급의 요소를 조작하면 안 된다.

최종 `commitOnce`는 `target,binding,revision,note,photos,beforeIds,stillPermitted`를 받는다. 최종 확인 후 생긴 편집·학급 전환·권한 철회도 감지해야 하며 유일한 보내기 요소, 전체 내용/날짜/첨부 순서, 승인 상태를 검증한 뒤 한 번만 조작해야 한다. 원자적 DOM guard 계약과 native 보내기 조작은 구현했다. 실제 대상/날짜/수신자/원본 guard 공급자는 아직 없으므로 운영 실행을 차단한다. 브라우저 A/B/C에서 보내기 한 번 후 게시됐으며 추가 확인창을 추정해 클릭하지 않았다.

## 결과 판정·실패 보존

- 사진은 독립 원본 바이트의 SHA-256과 길이를 계산해 순서대로 대조한다. 일부 업로드, 순서 변경, 원본 변형, 완료 대기 상태는 최종 게시를 막는다.
- 기존 게시물과 중복 여부는 제목·본문·날짜·사진 해시 순서로 대조한다. 새 게시 결과는 기존 ID 밖의 정확히 1개여야 한다. 제목만 같거나 사진이 일부 맞는 결과로 성공 처리하지 않는다.
- 미확인 결과는 재전송하지 않는다. 기존 디스크 이력의 미확인 잠금을 재사용해 내용/사진을 바꿔도 무단 재시도를 막는다.
- 성공한 경우 기존 처리기가 게시판/게시물 ID·사진 원본 hash/길이/순서·검증 시각을 먼저 저장한다. 공통 편집기는 저장된 증거를 대조하고 변경되지 않은 초안만 전환한다. 새 입력·사진·다른 날짜/학급·저장 실패는 보존한다.
- 오류 이유는 고정된 안전한 문구만 사용자에게 전달한다. bridge 예외 메시지·본문·계정/URL을 오류 응답에 넣지 않는다.

## 검증의 의미

단위 fixture는 계약 위반을 주입한다. 새 Electron fixture는 관찰한 작성 DOM 모양을 재현하고 localhost 서버에 원본을 올린 뒤 UI 링크로 원본을 다시 내려받아 대조한다. 모든 외부 요청을 차단한다. 본문은 일반 contenteditable이므로 **실제 Froala 런타임/한글 입력 이벤트를 검증한 것은 아니다**. 날짜·역할·ID·revision의 합성 속성도 실서비스 근거가 아니다.

브라우저 A/B/C 게시와 실제 원본 대조는 완료했다. 앱 세션에서 신원/날짜/게시 전 원본/원격 ID·목록 증거 공급자를 연결하고 별도 승인된 완주 검증을 해야 한다. 운영용 허용 근거와 최종 활성화 승인, Windows 검사도 남아 있다. 앱 자동 등록 활성화·정식 배포는 NO GO다.
