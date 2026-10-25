# Release preparation

The current `0.1.0` package is for local/manual testing. It has not been published or submitted to the Obsidian directory. See [QA results](QA.md) for verified behavior and outstanding checks.

## Build a local package

Use Node.js 20+ with npm and a `zip` command (available by default on macOS and the CI Ubuntu runner).

```sh
npm ci
npm run package
```

`package` runs the production build, lint, and all tests before creating `dist/0.1.0/`:

- `main.js`, `manifest.json`, `styles.css`: the three individual plugin assets.
- `obsidian-research-inbox-0.1.0.zip`: a manual-install archive containing exactly those three files inside the plugin folder.
- `SHA256SUMS.txt`: hashes for the assets and archive.

The packaging script checks version agreement, manifest essentials, JavaScript syntax, and absence of bundled source maps. It checks an exact version tag when run on a GitHub tag. It uses a fresh staging directory and an explicit file allowlist. Source code, `AGENTS.md`, vault notes, `data.json`, tests, and dependencies are never included in the archive. Generated packages are ignored by Git.

Check the package on macOS/Linux:

```sh
unzip -l dist/0.1.0/obsidian-research-inbox-0.1.0.zip
(cd dist/0.1.0 && shasum -a 256 -c SHA256SUMS.txt)
```

## Install manually

1. Extract the ZIP. Copy its `obsidian-research-inbox` folder into `<Vault>/.obsidian/plugins/`.
2. Confirm that `main.js`, `manifest.json`, and `styles.css` sit directly inside that folder, not inside an extra nested directory.
3. In Obsidian, open **Settings → Community plugins**, allow your trusted local plugin, and enable **Research Inbox**.
4. Run **Research Inbox: Open workspace** from the command palette.
5. For updates, disable the plugin, replace only those three files, then enable it again. Preserve `data.json` and your resource/project Markdown notes.

Disabling or uninstalling the plugin leaves the research notes in the vault. Its interface and ranking become unavailable, but ordinary Markdown remains readable.

## Isolated smoke-test vault

After packaging:

```sh
npm run qa:vault
```

This prints a newly created temporary directory. Open it using **Manage vaults → Open folder as vault**. It contains only the packaged plugin and minimal vault configuration, with no copied development-vault notes, secrets, or settings. Obsidian may ask you to trust the local build and enable it. The temporary vault is not a backup and is not a place for real research. Follow [QA.md](QA.md).

For repeatable larger-library checks, generate a separate fixture vault:

```sh
npm run qa:vault -- --fixtures
```

It contains 60 clearly labeled synthetic resources, two projects, and a `QA checklist.md` with expected counts and manual checks. Library starts with 50 cards; **Show more** reveals all 60. Each project has 30 resources and each status has 12. Filtering **QA Alpha → Read → Title** should produce six results: 004, 014, 024, 034, 044, and 054. The identifiers are synthetic test inputs, not metadata about real papers; do not fetch or cite them.

For a host-only comparison with identical notes and no community plugin installed:

```sh
npm run qa:vault -- --baseline --fixtures
```

Each invocation creates a new temporary folder; it never writes fixtures into an existing vault. Baseline mode needs no built package. Generating fixtures does not execute or pass their checklist. Record actual outcomes in [QA.md](QA.md).

## Before community submission

1. **Resolve the plugin ID.** Current ID `obsidian-research-inbox` contains `obsidian`, which current [manifest rules](https://docs.obsidian.md/Reference/Manifest) disallow. Recommended candidate: `research-inbox`, subject to checking directory availability. The existing ID is preserved for development compatibility. Before the first public release, change the manifest ID and install folder together; disable the old installation, copy its `data.json` into the new installation, enable only the new one, and rebind any command hotkeys. Resource/project identifiers and Markdown locations do not need to change. Verify view restoration and prevent duplicate installations. Do not change an ID after public release.
2. Complete the full-restart/current-installer check for the **Force Reload blank-window observation** in [QA.md](QA.md). Closing/reopening and a later Force Reload worked; investigate further if the initial blank window recurs.
3. Complete the remaining compatibility checks, including the declared minimum Obsidian version and mobile, before broad release. The manifest remains at minimum 1.5.0 with `isDesktopOnly: false`; this is API compatibility intent, not proof of testing on those platforms.
4. Review the [developer policies](https://docs.obsidian.md/community-directory/developer-policies) and [submission requirements](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins). Confirm name/ID availability in the current directory.
5. Update version fields together in `package.json`, `manifest.json`, and `versions.json`. Run `npm run package` and `node scripts/package-release.mjs --community`. The latter currently fails intentionally on the development ID.
6. Review and commit the intended source changes. Keep `AGENTS.md` changes and generated build artifacts out of that commit. No commit, tag, or push is performed by the packaging commands.
7. When authorized to release, create an exact version tag (such as `0.1.0`, without `v`). The tag workflow runs build/lint/tests and the community-ID guard before creating a **draft** GitHub release with the individual assets. Publishing that draft is a separate action.
8. Follow Obsidian's current [submission process](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin). Submission and acceptance have not happened for this project.

The local package and CI job can be used while submission is blocked. The tag release job intentionally refuses a noncompliant ID. CI runs checks on Node 20, 22, and 24; this configuration has not yet been exercised remotely for these uncommitted changes.

## Privacy and permission review

Source review found one external request path: explicitly selecting **Fetch metadata** sends a normalized arXiv identifier to `https://export.arxiv.org/api/query` via Obsidian `requestUrl`. Offline capture, projects, workflow, Library search, and relevance use local data. No API keys, paid accounts, analytics, PDF downloads, AI calls, remote code execution, Node/Electron access, or direct filesystem adapters are used by the runtime plugin.

Resource creation uses `Vault.create`; updates use `FileManager.processFrontMatter` with identity/conflict checks. Metadata is serialized with Obsidian's YAML serializer. External titles and abstracts are displayed as text, and escaped when inserted into Markdown. Native links are validated against existing notes. Recommendation processing reads recognized resource notes and extracts their Abstract sections; linked note bodies and personal annotations are not analyzed. UI/service listeners and in-memory state are registered for lifecycle cleanup.

Development scripts use Node/filesystem/ZIP tools locally to build artifacts and temporary QA vaults; they are not part of the runtime bundle. This source review is not an independent security audit.
