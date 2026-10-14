#!/bin/sh
set -eu

if [ "$#" -gt 1 ]; then
  printf 'Usage: %s [source.png]\n' "$0" >&2
  exit 1
fi

project_root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
source_icon=${1:-"$project_root/docs/assets/marktext-ai-icon.png"}
if [ ! -f "$source_icon" ]; then
  printf 'PNG source not found: %s\n' "$source_icon" >&2
  exit 1
fi
source_icon_dir=$(CDPATH='' cd -- "$(dirname -- "$source_icon")" && pwd)
source_icon="$source_icon_dir/$(basename -- "$source_icon")"

for icon_tool in sips iconutil magick; do
  if ! command -v "$icon_tool" >/dev/null 2>&1; then
    printf 'Required tool not found: %s\n' "$icon_tool" >&2
    exit 1
  fi
done

icon_format=$(magick identify -ping -format '%m' "$source_icon")
icon_width=$(magick identify -ping -format '%w' "$source_icon")
icon_height=$(magick identify -ping -format '%h' "$source_icon")
if [ "$icon_format" != PNG ] || [ "$icon_width" != "$icon_height" ]; then
  printf 'Expected a square PNG source: %s\n' "$source_icon" >&2
  exit 1
fi

# Convert every format before replacing assets, so a converter failure leaves
# the currently usable icon set intact. The source copy also handles in-place use.
icon_stage=$(mktemp -d "${TMPDIR:-/tmp}/marktext-ai-icons.XXXXXX")
trap 'rm -rf "$icon_stage"' EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
cp "$source_icon" "$icon_stage/source.png"
iconset="$icon_stage/MarkTextAI.iconset"
mkdir -p "$iconset"

for icon_size in 16 32 128 256 512; do
  sips -z "$icon_size" "$icon_size" "$icon_stage/source.png" \
    --out "$iconset/icon_${icon_size}x${icon_size}.png" >/dev/null
  icon_double=$((icon_size * 2))
  sips -z "$icon_double" "$icon_double" "$icon_stage/source.png" \
    --out "$iconset/icon_${icon_size}x${icon_size}@2x.png" >/dev/null
done
iconutil -c icns "$iconset" -o "$icon_stage/icon.icns"
cp "$iconset/icon_512x512@2x.png" "$icon_stage/icon.png"
magick "$icon_stage/icon.png" -define icon:auto-resize=256,128,64,48,32,24,16 \
  "$icon_stage/icon.ico"

for icon_size in 16 24 32 48 64 96 128 256 512; do
  sips -z "$icon_size" "$icon_size" "$icon_stage/source.png" \
    --out "$icon_stage/logo-$icon_size.png" >/dev/null
done

cd "$project_root"
mkdir -p docs/assets packages/desktop/static packages/desktop/build/icons \
  packages/desktop/src/renderer/src/assets/images
if ! cmp -s "$icon_stage/source.png" docs/assets/marktext-ai-icon.png; then
  cp "$icon_stage/source.png" docs/assets/marktext-ai-icon.png
fi
for icon_format in png icns ico; do
  cp "$icon_stage/icon.$icon_format" "packages/desktop/static/icon.$icon_format"
  cp "$icon_stage/icon.$icon_format" "packages/desktop/build/icons/icon.$icon_format"
done
cp "$icon_stage/logo-96.png" packages/desktop/static/logo-96px.png
cp "$icon_stage/logo-128.png" packages/desktop/static/logo-small.png
cp "$icon_stage/logo-256.png" packages/desktop/src/renderer/src/assets/images/logo.png

for icon_size in 16 24 32 48 64 128 256 512; do
  icon_output="packages/desktop/build/icons/${icon_size}x${icon_size}"
  mkdir -p "$icon_output"
  cp "$icon_stage/logo-$icon_size.png" "$icon_output/marktext.png"
done

printf 'Updated MarkText AI icons from: %s\n' "$source_icon"
