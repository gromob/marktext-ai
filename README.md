**English** · [한국어](README.ko.md)

<p align="center"><img src="docs/assets/marktext-local-icon.png" alt="MarkText Local app icon" width="128" height="128"></p>

# MarkText Local

A Markdown editor with local LLM and Codex support. The project alias is **AJ**.

This is an independent, unofficial fork based on [MarkText AI](https://github.com/yunju-baek/marktext-ai) `v0.21.2-ai.2` (`7cd32b04`). It is not an official distribution of either [MarkText](https://github.com/marktext/marktext) or MarkText AI.

## Features

- Retains the existing Markdown editor and Codex connection.
- Adds, edits, and removes OpenAI-compatible local AI servers and models, with model discovery.
- Improves macOS Korean-to-Hanja conversion, undo, and caret restoration.
- Provides persistent font size controls for AI conversations, input fields, and menus.
- Uses a new app icon with a chip integrated into the right foot of the M.

Users start their own local AI servers and load their models. Requests send the current document and recent conversation to the selected server. API keys for local servers are stored in **plain text** in the app profile, without Keychain.

## Development and builds

Requirements: Node.js 20.19 or later, pnpm 10, and Xcode Command Line Tools. The verified environment is Apple Silicon with Node 22.23.3 and pnpm 10.33.4.

```sh
git clone https://github.com/gromob/marktext-ai.git
cd marktext-ai
git checkout work/hanja-local
pnpm install --frozen-lockfile
pnpm run dev
```

Build an Apple Silicon installer with:

```sh
./scripts/build-ai-mac.sh
```

Outputs include `dist/mac-arm64/MarkText Local.app`, `dist/MarkText-Local-<version>-arm64.dmg`, and a ZIP archive. The current package version, `0.21.2-ai.2`, retains the base version for local validation. **No public MarkText Local release has been published yet.** Local builds use ad-hoc signing and are not signed with an Apple Developer ID or notarized.

To preserve existing settings and recovery data, the app retains the ID `local.marktext.ai` and profile directory `~/Library/Application Support/MarkText AI`. It does not automatically remove the previously installed app.

## Guides and validation

The detailed guides and validation records below are currently in Korean.

- [Usage and development guide](docs/ai-preview/README.ko.md)
- [Local AI connections](docs/ai-preview/LOCAL-AI.ko.md)
- [Installation guide](docs/ai-preview/INSTALL.ko.txt)
- [Validation record: 206 related automated tests](docs/ai-preview/INTEGRATION-VALIDATION.ko.md)
- [Hanja input validation record](docs/ai-preview/HANJA-IME-VALIDATION.ko.md)
- [Report an issue](https://github.com/gromob/marktext-ai/issues)

The alias AJ treats AI as a sequence term $A_i$ and its variation as $A_j$.

## Attribution and license

This project is based on [yunju-baek/marktext-ai](https://github.com/yunju-baek/marktext-ai), which in turn is based on MarkText v0.21.2. It preserves attribution to Luo Ran, the MarkText Contributors, and AI fork developer Yunju Baek.

See the [MIT License](LICENSE), [NOTICE](NOTICE), and [third-party license notices](packages/desktop/build/THIRD-PARTY-LICENSES.txt).
