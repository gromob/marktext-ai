#!/bin/sh
set -eu

project_root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
cd "$project_root"

# Stage outside Documents: cloud-backed folders can attach Finder metadata
# during packaging, which makes Apple's ad-hoc signing reject the bundle.
build_stage=$(mktemp -d "${TMPDIR:-/tmp}/marktext-ai-package.XXXXXX")
trap 'rm -rf "$build_stage"' EXIT HUP INT TERM

pnpm run build:unpack
CSC_IDENTITY_AUTO_DISCOVERY=false pnpm -C packages/desktop exec electron-builder \
  --mac --arm64 --dir --publish never \
  --config.directories.output="$build_stage"

built_app="$build_stage/mac-arm64/MarkText Local.app"
output_app="$project_root/dist/mac-arm64/MarkText Local.app"
codesign --verify --deep --strict "$built_app"
mkdir -p "$project_root/dist/mac-arm64"
app_version=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$built_app/Contents/Info.plist")
archive="$project_root/dist/MarkText-Local-$app_version-arm64.zip"
ditto -c -k --noextattr --norsrc --keepParent "$built_app" "$archive"
rm -rf "$output_app"
ditto --noextattr "$built_app" "$output_app"
printf 'Built: %s\n' "$archive"
sh "$project_root/scripts/package-ai-dmg.sh" "$built_app"
