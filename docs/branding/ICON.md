# MarkText AI 아이콘

짙은 청록색 타일, 종이를 접은 형태의 아이보리색 `M`, 민트색 입력 커서로 Markdown 작성과 AI 편집을 표현한다. 큰 형태와 선명한 명도 차이를 사용해 작은 앱 아이콘에서도 구분할 수 있게 구성했다.

## 생성 기록

- 생성일: 2026-10-14
- 도구: OpenAI 이미지 생성 도구 `imagegen.imagegen`
- 방식: 새 이미지 생성, `transparent_background: true`
- 채택본: 최초 생성 결과
- 보존 원본: [`../assets/marktext-ai-icon.png`](../assets/marktext-ai-icon.png)
- 실제 원본 규격: 1254 × 1254 px, 8-bit RGBA PNG, sRGB
- 원본 SHA-256: `edaf85b961ae3c513cb36180a564564db614cc88203cadac39e08a8fe8a8c3cd`

아래 프롬프트와 투명 배경 옵션으로 새 시안을 생성할 수 있다. 배포 아이콘을 동일하게 재현할 때는 저장된 PNG 원본을 사용한다. 앱용 파생 파일은 원본의 크기와 포맷을 변환해 만들었다.

### 생성 프롬프트 원문

```text
Use case: logo-brand. Create a finished original macOS app icon for MarkText AI, a calm, minimal Markdown editor with an AI chat assistant. Produce one centered icon only, square 1024x1024, with genuinely transparent space outside the rounded-square app tile. Design direction: precise editorial writing tool. A deep midnight teal rounded-square tile, an elegant thick ivory folded-paper ribbon in the center that forms a distinctive geometric M, and one small bright mint insertion caret integrated beside the paper glyph to suggest active editing. Large confident simple shapes that remain readable at 32 pixels. Restrained subtle depth and a soft top highlight, very clean edges, premium native macOS feel. The tile occupies about 84% of the canvas, with equal transparent margins; rounded corners consistent with macOS app icons. No typography or words, no AI lettering, no decorative stars, no robot, no pencil illustration, no external shadow, no mockup, no surrounding objects, no border around the canvas. This must be a new identity visually distinct from the original MarkText icon. Strong silhouette, quiet dark teal and ivory palette with one mint accent.
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

macOS ICNS는 아래 명령을 저장소 루트에서 실행해 재생성한다. `sips`와 `iconutil`은 macOS 기본 도구다.

```sh
task_iconset="$(mktemp -d)/MarkTextAI.iconset"
mkdir -p "$task_iconset"
for task_icon_size in 16 32 128 256 512; do
  sips -z "$task_icon_size" "$task_icon_size" docs/assets/marktext-ai-icon.png \
    --out "$task_iconset/icon_${task_icon_size}x${task_icon_size}.png"
  task_icon_double=$((task_icon_size * 2))
  sips -z "$task_icon_double" "$task_icon_double" docs/assets/marktext-ai-icon.png \
    --out "$task_iconset/icon_${task_icon_size}x${task_icon_size}@2x.png"
done
iconutil -c icns "$task_iconset" -o packages/desktop/static/icon.icns
```

PNG 파생 파일은 `sips -z <높이> <너비> <원본> --out <출력>`으로 변환한다. ICO는 ImageMagick으로 변환한다.

```sh
magick packages/desktop/static/icon.png \
  -define icon:auto-resize=256,128,64,48,32,24,16 \
  packages/desktop/static/icon.ico
```

검증 시 32 px와 128 px 미리보기에서 `M`과 민트색 커서를 확인했다. PNG·ICO의 모서리 알파는 0이며, ICNS에는 10개 이미지 슬롯이 포함되어 있다.
