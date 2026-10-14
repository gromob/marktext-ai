# MarkText AI 아이콘

아이보리색 타일 위의 큰 네이비색 `M`과 코발트색 `AI` 배지로 Markdown 작성과 AI 편집을 표현한다. `M`의 큰 형태를 중심에 두고 오른쪽 아래에 흰색 `AI` 글자가 있는 배지를 배치했다.

## 생성 기록

- 생성일: 2026-10-14
- 도구: OpenAI 이미지 생성 도구 `imagegen.imagegen`
- 방식: 새 이미지 생성, `transparent_background: true`
- 채택본: 큰 `M`과 읽을 수 있는 `AI` 배지를 함께 표시한 시안
- 보존 원본: [`../assets/marktext-ai-icon.png`](../assets/marktext-ai-icon.png)
- 실제 원본 규격: 1254 × 1254 px, 8-bit RGBA PNG, sRGB
- 원본 SHA-256: `f62a6e7fb02b6dae2b11a0641a2139abc5d26037fac6691e6b394a832fde8900`

아래 프롬프트와 투명 배경 옵션으로 새 시안을 생성할 수 있다. 배포 아이콘을 동일하게 재현할 때는 저장된 PNG 원본을 사용한다. 앱용 파생 파일은 원본의 크기와 포맷을 변환해 만들었다.

### 생성 프롬프트 원문

```text
Design one refined minimal macOS app icon for MarkText AI. CRITICAL: preserve a large unmistakable uppercase M as the main symbol, AND include the exact uppercase text "AI" in a clearly readable badge. Both M and AI must be present. Brand-new graphic direction, a calm professional writing app. One warm white rounded-square app tile with a very subtle porcelain edge, centered on transparent canvas. The main M is a confident, simple geometric bold monogram in deep midnight navy, occupying the upper-middle of the tile with clean straight strokes and slightly softened corners; it is a flat typographic M, not folded paper or a ribbon. Place a compact cobalt-blue rounded rectangular badge in the lower-right quadrant just below the M baseline, with crisp white "AI" in bold sans-serif capitals, large enough to remain readable at small Dock sizes. Compose the M and AI badge as a coherent balanced emblem; the badge should occupy about 34 percent of tile width. Use only warm white, dark navy, and electric cobalt. Generous spacing, precise alignment, optically centered, strong silhouette, premium contemporary typography. The entire icon should feel elegant and very simple, not toy-like, not a detailed illustration. Very subtle native macOS depth on the tile only; the M and badge are clean and flat. Equal transparent margins around tile, tile 84% of canvas, square image with genuine alpha transparency. No extra letters or words, no pencil, no robot, no sparkle, no document lines, no folded corner, no glossy rainbow, no origami, no heavy shadows, no mockup. Prioritize beauty, visual restraint, and unmistakable readable M plus AI.
```

## 배포 파일

| 경로                                                       | 용도·규격                                                |
| ---------------------------------------------------------- | -------------------------------------------------------- |
| `docs/assets/marktext-ai-icon.png`                         | README 및 재생성을 위한 원본 PNG                         |
| `packages/desktop/static/icon.png`                         | 1024 px 앱 아이콘                                        |
| `packages/desktop/static/icon.icns`                        | macOS 아이콘: 16·32·128·256·512 pt의 1×·2×, 총 10개 슬롯 |
| `packages/desktop/static/icon.ico`                         | Windows 아이콘: 16·24·32·48·64·128·256 px                |
| `packages/desktop/static/logo-96px.png`                    | Linux 창 아이콘, 96 px                                   |
| `packages/desktop/static/logo-small.png`                   | 소형 로고, 128 px                                        |
| `packages/desktop/src/renderer/src/assets/images/logo.png` | 앱 정보 창 로고, 256 px                                  |
| `packages/desktop/build/icons/icon.*`                      | 패키징 리소스용 앱 아이콘 사본                           |
| `packages/desktop/build/icons/<size>x<size>/marktext.png`  | 16·24·32·48·64·128·256·512 px 앱 아이콘                  |

## 파생 파일 재생성

macOS에서 아래 명령을 저장소 루트에서 실행하면 위의 모든 앱 아이콘을 재생성한다. macOS 기본 도구 `sips`·`iconutil`과 ImageMagick의 `magick`이 필요하다.

```sh
sh scripts/update-ai-icons.sh
```

새 정사각 PNG를 적용할 때는 경로를 인수로 전달한다. 스크립트가 원본을 `docs/assets/marktext-ai-icon.png`에 보존하고, 모든 포맷 변환이 성공하면 앱 아이콘을 교체한다.

```sh
sh scripts/update-ai-icons.sh /path/to/new-icon.png
```

검증 시 32 px 미리보기에서 큰 `M`과 파란 배지를 확인했고, 128 px에서 `AI` 글자를 명확하게 읽을 수 있었다. PNG·ICO의 모서리 알파는 0이며, ICNS에는 10개 이미지 슬롯이 포함되어 있다.
