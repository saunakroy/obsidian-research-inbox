# Release QA record

Date: 2026-10-24. Build: development `0.1.0` (uncommitted Milestones 5–7). Native environment: macOS, Obsidian 1.14.4, installer 1.6.7, default theme, no community plugins other than Research Inbox in the temporary test vault. No changes were made to the development vault's research notes.

## Automated checks

- Production TypeScript/esbuild build and ESLint.
- 67 host-mocked tests: capture normalization, duplicate detection, write safety, workflow/review conflicts, projects/assignments, Library selection, ranking/explanations, asynchronous cache updates, and unload behavior.
- New transport cases: HTTP 429/503/404/500, offline rejection, unsupported XML, simultaneous requests, 3.1-second request cooldown, 20-second timeout retaining the underlying connection lock, and disabling during a lookup.
- Release asset syntax/version checks, ZIP allowlist, and SHA-256 validation.

Tests use an in-memory vault, controlled requests, and controlled timers. They do not impersonate real network failures, exercise Obsidian's actual XML parser, or prove live UI behavior.

## Native checks performed

A fresh temporary vault was created from the three packaged assets and opened in Obsidian. The local plugin was trusted and enabled through Obsidian's native UI.

| Check | Observed result |
| --- | --- |
| First launch | Workspace opened with empty Inbox and Projects; one ribbon entry |
| Invalid capture URL | `https://example.com/paper` rejected inline; no resource created |
| Offline capture | Preview required explicit Save; title and capture annotation saved |
| Project creation | Title, description, and question saved through native form |
| Relevance | Unassigned test paper displayed suggested project and actual shared question terms |
| Assignment | Saving converted suggested to assigned; native links and stable IDs written |
| Reading lifecycle | Queue → Start reading → Mark read; completed resource remained in Library |
| Review persistence | Useful rating, open question, and subsequently edited takeaway saved in native YAML; original capture annotation preserved |
| Vault reopen | Closing/reopening restored the Library section, project association, status, and review |
| Disable/enable | Ribbon and workspace commands returned without observed duplicates; Library data remained intact |
| Force Reload retry | Reload worked with the plugin disabled and, after confirming saved enablement, with it enabled; Library rendered and retained its resource |
| Duplicate after reopen | Versioned PDF URL recognized existing resource, with no overwrite or fetch required |
| Live arXiv lookup | `2303.08774` returned GPT-4 Technical Report metadata; cancelling preview left only the original resource note |
| Default dark/light themes | Library controls and content visually checked in both; screenshots retained locally |
| Narrow workspace/sidebar | Navigation, filters, and action rows wrapped in the split layout; screenshots captured |
| Keyboard input | Command palette, form typing, and select controls exercised; full accessibility audit remains pending |

The offline paper title in screenshots is a deliberate QA label, not fetched metadata.

## Open observation: Force Reload

One **View → Force Reload** attempt left the QA window blank. Immediately before that, screenshots sometimes lagged behind accessibility-tree state. Developer Console showed only Obsidian's startup message, with no visible plugin error. Closing the QA window and reopening that same vault restored the workspace and saved data. The cause is not established; do not attribute it to either the plugin or the test tooling without reproduction.

Follow-up comparison succeeded with the plugin disabled. An initial enable/reload sequence showed “Plugin no longer active”; the vault's saved enabled-plugin list was empty at that point. After enabling again and confirming the saved list contained the plugin, Force Reload restored a visibly rendered Library with its resource and assignment. The original blank window did not recur in that retry, but its cause remains unconfirmed. Repeat on an up-to-date Obsidian installer and inspect Console/startup diagnostics if it recurs. A full process restart was not performed because another development vault was open.

## Remaining release checks

- [ ] Complete a full process quit/relaunch and repeat reload on a current installer; investigate further if the blank-window observation recurs.
- [x] Verify plugin disable/enable in native Obsidian without observed duplicate commands or views.
- [ ] Test the minimum supported Obsidian version (1.5.0), mobile, Windows/Linux, and third-party themes as appropriate.
- [ ] Exercise a live failed/slow network request in Obsidian; automated request mocks cover failures but are not transport integration evidence.
- [x] Exercise 50+ result pagination with the synthetic fixture vault (see evidence and rendering limitation below).
- [ ] Recheck all saved Library filters, project renames, and external-edit conflicts in native Obsidian. These have automated coverage where applicable but were not all repeated in this smoke session.
- [ ] Complete keyboard-only navigation and screen-reader checks.
- [ ] Resolve the pre-release plugin-ID migration described in [RELEASE.md](RELEASE.md).

## Repeatable larger-library QA

`npm run qa:vault -- --fixtures` now creates an isolated vault with 60 synthetic resources, two projects, and a manual checklist. `--baseline --fixtures` creates the same notes without installing any community plugin. Neither mode copies development-vault notes or changes an existing vault. These fixtures are development tooling, not runtime sample data.

On macOS Obsidian 1.14.4 (installer 1.6.7), the native accessibility tree reported 60 Library results with 50 initial resource buttons, then 60 buttons and no Show more control after expanding. Selecting QA Alpha reported 30 results. However, subsequent screenshots retained the earlier 60-result view while the accessibility tree showed 30; further status-filter interactions did not reliably update. Treat pagination and project counts as observed accessibility-state evidence, not complete visual or persistence verification. Combined filters, section switching, and reopen restoration remain pending. No new reload comparison outcome is claimed for this session.

The baseline generator was checked on disk: exactly 60 resources, two projects, 12 resources per status, 30 per project, and the expected six Alpha/read fixtures. Its enabled-plugin list is empty and no plugin folder is installed. It has not yet been used for a native reload comparison. Unknown command-line options are rejected.

The latest `npm run package` passed production build, lint with zero errors/warnings, and all 67 tests. The Node-only request-test harness now has a file-scoped exception for its intentional `globalThis` mock; runtime lint protection remains enabled. Script syntax, whitespace checks, and package checksums passed. No commit, push, tag, or publication was performed.

### UI polish verification

The visual pass adds a compact workspace header, lighter navigation, responsive filter grid, status badges, resource action footers, project cards/overview, and illustrated empty states using native icons and theme colors. The sidebar no longer nests resource cards inside section cards. Project paths are displayed only to distinguish duplicate titles.

Production build and all 67 tests passed again. ESLint returned zero errors and four existing `no-global-this` warnings in the Node request-test harness. No new dependencies or resource-storage changes were introduced. The package was regenerated with the updated interface.

Native checks covered populated Inbox/Library, empty Reading queue, project cards/detail, sidebar, search with no matches and clearing it, light/dark rendering, narrow-pane wrapping, and visible keyboard focus when tabbing between sections. This is a visual smoke check, not a complete accessibility or third-party-theme audit.

The earlier blank-window/stale-render observation recurred while reloading the development vault. Closing/reopening recovered rendering and showed the rebuilt interface. The underlying cause is still open; the visual changes do not resolve that release-QA item.

Native screenshots of the dark/light Library and narrow sidebar are retained locally in `docs/screenshots/`. That directory is ignored by Git and is not included in the repository or release package.
