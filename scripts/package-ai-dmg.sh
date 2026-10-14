#!/bin/sh
set -eu

project_root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
source_app=${1:-"$project_root/dist/mac-arm64/MarkText AI.app"}
app_plist="$source_app/Contents/Info.plist"
app_id=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$app_plist")
app_version=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$app_plist")
app_arch=$(lipo -archs "$source_app/Contents/MacOS/MarkText AI")
if [ "$app_id" != 'local.marktext.ai' ] || [ "$app_arch" != 'arm64' ]; then
  printf '%s\n' 'Expected an Apple Silicon MarkText AI app bundle.' >&2
  exit 1
fi

# A temporary local folder keeps cloud-added Finder metadata out of the signature.
dmg_stage=$(mktemp -d "${TMPDIR:-/tmp}/marktext-ai-dmg.XXXXXX")
trap 'rm -rf "$dmg_stage"' EXIT HUP INT TERM
payload="$dmg_stage/payload"
mkdir -p "$payload" "$project_root/dist"
ditto --noextattr --norsrc "$source_app" "$payload/MarkText AI.app"
codesign --verify --deep --strict "$payload/MarkText AI.app"
ln -s /Applications "$payload/Applications"
cp "$project_root/docs/ai-preview/INSTALL.ko.txt" "$payload/설치 안내.txt"
cp "$project_root/LICENSE" "$payload/LICENSE.txt"
cp "$project_root/NOTICE" "$payload/NOTICE.txt"
cp "$project_root/packages/desktop/build/THIRD-PARTY-LICENSES.txt" "$payload/THIRD-PARTY-LICENSES.txt"

image_name="MarkText-AI-$app_version-arm64.dmg"
hdiutil create -volname 'MarkText AI' -srcfolder "$payload" \
  -fs HFS+ -format UDZO -imagekey zlib-level=9 "$dmg_stage/$image_name"
hdiutil verify "$dmg_stage/$image_name"
ditto --noextattr --norsrc "$dmg_stage/$image_name" "$project_root/dist/$image_name"
cp "$project_root/docs/ai-preview/INSTALL.ko.txt" "$project_root/dist/MarkText-AI-install.ko.txt"
cd "$project_root/dist"
shasum -a 256 "$image_name" > "$image_name.sha256"
printf 'Built: %s\n' "$project_root/dist/$image_name"
