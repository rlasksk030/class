# 디자인 자료 (Claude Design 결과물)

이 폴더는 '우리 교실' 디자인 다듬기 작업의 원본 자료입니다. **설치 파일에는 들어가지 않습니다.**
(`electron-builder.json`의 `directories.app`이 `app`이므로, 저장소 맨 위의 `design/`은 빌드에 포함되지 않습니다.)

| 경로 | 내용 |
|---|---|
| `우리교실_디자인적용_지시서.md` | 적용 지시서 (Claude Code용) |
| `tokens.css`, `components.css` | 원본 토큰 · 공통 부품 CSS |
| `icons/*.svg` | 원본 아이콘 30개 + 날씨 아이콘 |
| `screens/*.png` | 다듬은 화면 56장 (비교 기준) |

앱이 실제로 쓰는 사본은 `app/ui/`에 있습니다.

- `app/ui/tokens.css`: 원본과 같고, `--uc-font-sub`의 글꼴 이름만 앱의 `@font-face` 이름(`'Nanum Barun Gothic'`, `app/okgu.css`)에 맞췄습니다.
- `app/ui/components.css`: 원본 그대로.
- `app/ui/icons/*.svg`: 원본에서 내용 증명용 `<metadata>`(C2PA) 블록만 뺀 사본입니다(파일당 약 8KB → 0.3KB). 그림은 같습니다.

자료 출처: 선생님이 올린 `우리교실_디자인자료.zip` (SHA-256 앞자리 `e78ab9ad6c30a3e3`, 2026-11-13).
