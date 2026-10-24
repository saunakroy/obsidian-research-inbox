# Research Inbox

An Obsidian plugin for organizing academic and technical research.

## Current milestone: Reading workflow

Research Inbox has a compact right sidebar and a main Research workspace. Capture arXiv papers, save them as ordinary Markdown notes, and open those notes from the Inbox. Inbox triage, a Reading queue, and reading reviews are available. Projects and Library remain placeholder screens; AI is not implemented.

Commands:

- **Research Inbox: Add resource**
- **Research Inbox: Open sidebar**
- **Research Inbox: Open workspace**
- **Research Inbox: Open reading queue**

The ribbon opens or focuses the sidebar. Reopening the workspace reuses its tab and preserves the selected section. Sidebar shortcuts navigate the workspace to a specific section.

## Capture a paper

1. Select **Add resource** in the sidebar or workspace, or run the command.
2. Paste an arXiv identifier, abstract URL, PDF URL, or HTML URL. Modern IDs (such as `1706.03762`), legacy IDs (such as `hep-th/9901001`), and version suffixes are accepted.
3. Select **Fetch metadata** to retrieve title, authors, abstract, and publication date. Review the result and optionally edit the title or add a capture note.
4. Select **Save to inbox**. The workspace opens to the Inbox, and the sidebar count updates.
5. Select the resource title to open its Markdown note in a native editor tab.

**Save without metadata** prepares an offline draft for review. It does not save until you select **Save to inbox**. This option is also available after a failed lookup. Missing fields remain empty or explicitly unavailable; they are not invented. Closing the capture form during a lookup prevents it from saving anything.

The form detects an existing paper before requesting metadata and offers **Open existing note**. Abstract/PDF links and version suffixes share one duplicate identity. Recapturing an existing paper never overwrites or enriches that note automatically, including a note previously saved without metadata. You can edit it yourself.

## Reading workflow

1. In **Inbox → Pending**, select **Queue** to move a resource into the Reading queue, or **Archive** to remove it from active work while retaining its note.
2. Open **Reading queue** from workspace navigation or the command palette. Use **Show** to filter queued, currently reading, or completed resources. **Sort** supports oldest first, newest first, and title.
3. Select **Start reading** to mark a queued resource as reading. Select its title to open the native Markdown note.
4. Select **Mark read** to open the review form. Choose Useful, Somewhat useful, Not useful, or leave Not rated. Key takeaways and Open questions are optional. Select **Mark read** in the form to save; cancelling before saving changes nothing.
5. Choose **Reading queue → Completed** to revisit finished papers. **Edit review** updates feedback; **Read again** queues the paper again while retaining its previous review.
6. **Defer** returns a queued or currently reading paper to the Inbox for reconsideration. No separate deferred status or reminder is created.
7. Choose **Inbox → Archived** to see archived papers and select **Restore to inbox**. Archiving never deletes or moves the Markdown file.

The sidebar's **Up next** shows real queued/reading resources: currently reading papers first, then the oldest queued papers. These are chronological queue entries, not personalized recommendations. In the active queue, currently reading papers stay ahead of queued papers for each sort option. Dates use queue time, completion time for Completed, or capture time in the Inbox.

The selected section, status filters, and sort options are stored in native workspace view state. Capturing a new resource switches the Inbox back to Pending so the saved resource is visible.

Reading status changes are centralized in the resource service and saved using Obsidian's native `processFrontMatter`. The note body and unrelated property values are preserved; Obsidian may reformat the YAML. Reviews live in note properties and do not overwrite the existing Key Takeaways or Open Questions body sections. The latest review is editable; an automatic review history is not maintained.

Concurrent actions are serialized. Each update checks the current paper identity and status; review saves also check whether the stored feedback changed while the form was open. Conflicting edits are rejected with a message so you can reopen the form. Failed writes leave the displayed state unchanged and can be retried. These workflow actions stay local and make no network requests.

## Storage and privacy

The default resource folder is `Research Inbox/Resources`. Change it under **Settings → Research Inbox → Resource folder** and select **Save folder**. Only new captures use the changed folder; existing notes are not moved. Notes with valid Research Inbox identifiers remain indexed if moved elsewhere in the vault.

Notes use filenames such as `arxiv-1706.03762.md` and `arxiv-hep-th-9901001.md`; the paper title is stored in frontmatter and the heading. If an unrelated file has that name, a numbered filename is used. Capture uses Obsidian's create API and never overwrites an existing file. No separate resource database is maintained.

Core frontmatter schema:

| Property | Meaning |
| --- | --- |
| `research_id` | Stable, version-independent ID, e.g. `arxiv:1706.03762` |
| `arxiv_id` | Normalized arXiv ID without a version suffix |
| `type` | `paper` |
| `status` | `inbox`, `queued`, `reading`, `read`, or `archived` |
| `title`, `authors` | Paper metadata; title may be edited before saving |
| `source` | Canonical HTTPS arXiv abstract URL, retaining a requested version |
| `original_source` | Original trimmed input, including the supplied URL or ID |
| `captured` | UTC capture timestamp |
| `published` | Publication date when available; omitted otherwise |
| `projects` | Empty list reserved for later project associations |
| `metadata_status` | `complete`, `partial`, or `unavailable` |
| `queued_at`, `reading_started_at`, `read_at`, `archived_at` | UTC timestamps of the most recent corresponding action, when available |
| `review_usefulness` | `useful`, `somewhat_useful`, `not_useful`, or empty for Not rated |
| `review_takeaways`, `review_questions` | Optional review text stored in the note's properties |
| `reviewed_at` | UTC timestamp of the most recent saved review |

Notes include Abstract, Why I Saved This, Key Takeaways, Open Questions, and Personal Notes sections. Incoming metadata is rendered as text and escaped in the Markdown body. User-authored capture notes retain their Markdown formatting.

**Network use:** only selecting **Fetch metadata** sends the normalized paper identifier to `https://export.arxiv.org/api/query` using Obsidian's `requestUrl`. Vault content and capture notes are not sent. No API key, AI service, analytics, or PDF download is involved. Saving without fetching works offline.

Metadata lookups use the [official arXiv API](https://info.arxiv.org/help/api/user-manual.html). The client allows one in-flight request and at least 3.1 seconds between request starts, following the [arXiv API rate limits](https://info.arxiv.org/help/api/tou.html). The form times out after 20 seconds; Obsidian's request API cannot cancel the underlying connection, so another lookup remains blocked until that connection finishes. Offline saving remains available. Rate limiting is per running plugin instance; avoid simultaneous lookups across multiple vaults.

The resource index is rebuilt from Obsidian's metadata cache on startup and updated for metadata changes, renames, and deletes. Capture waits for the initial cache to be ready so existing notes are considered for duplicate detection. Only notes bearing a valid `research_id: arxiv:...` marker are recognized. Removing that marker removes a note from the index. Unknown statuses do not appear in the workflow lists, but the paper remains deduplicated. Workflow actions reject unrecognized statuses.

## Development

Use Node.js 20+ and npm:

```sh
npm install
npm run build
npm run lint
npm test
```

For continuous rebuilding, use `npm run dev`. Build output is `main.js` in this directory and is ignored by Git. This repository already lives at `<Development Vault>/.obsidian/plugins/obsidian-research-inbox`, so no copying is necessary. Obsidian loads `main.js`, `manifest.json`, and `styles.css` from here.

The test runner uses the existing esbuild dependency and Node's test runner. Tests mock the Obsidian host and write only to an in-memory vault. No test sends network requests or creates files in your real vault. Coverage includes input normalization, path validation, metadata serialization inputs, duplicate writes, collisions, write failures, indexing, offline/partial metadata behavior, reading transitions, review conflicts, and scoped metadata updates. Actual Atom parsing in the browser, Obsidian's YAML serializer and frontmatter updates, HTTP transport, and the live UI still require integration testing.

## Test Milestone 4 in your development vault

1. Reload Research Inbox. Open the workspace and select **Inbox → Pending**. Capture a test paper first if needed.
2. Add a sentence to that resource's Markdown body and an unrelated property. Select **Queue** in the Inbox. Verify `status: queued`, a queue timestamp, and that your writing and other properties remain intact.
3. Open **Reading queue**, select **Start reading**, then open the note. Verify `status: reading`. The sidebar's Up next should update too.
4. Select **Mark read**, enter a usefulness rating, takeaways, and an open question, then save. Select **Show → Completed** to find the paper. Verify the review properties and `status: read` in its Markdown note.
5. Use **Edit review** and change the feedback. The completion timestamp should remain the same. Close another review without saving and confirm nothing changes.
6. Select **Read again**, then **Defer**. The paper should return to **Inbox → Pending**, retaining its prior review.
7. Archive the paper, then select **Inbox → Archived → Restore to inbox**. Verify its file and annotations are still present throughout.
8. Try the filter and sort controls with several papers. Switch sections and reload Obsidian; the selected section and list controls should restore. Capture a paper while viewing Archived; the new note should appear in Pending.
9. Test a conflicting edit: leave a review form open, change a review property from another editor/device, then try to save the form. Expect a conflict message rather than overwritten feedback. Close and reopen the form to use the new values.
10. Check keyboard focus, narrow panes, and light/dark themes. Open developer tools and verify there are no plugin errors during actions and reloads.

The 29 host-mocked tests pass, along with build and lint. Live UI behavior and native frontmatter integration still need the checks above; automated tests do not operate on your real notes.

## Test Milestone 3 in your development vault

1. In **Settings → Community plugins**, toggle **Research Inbox** off and on after building, or use Hot Reload.
2. Press **Cmd+P** on Mac (**Ctrl+P** on Windows/Linux), run **Research Inbox: Add resource**, and enter `1706.03762`.
3. Select **Fetch metadata**. Check the title, authors, abstract, and publication date. Nothing should be saved yet. Add a capture note and select **Save to inbox**.
4. Confirm a single note appears under `Research Inbox/Resources`, the sidebar count updates, and the Inbox displays the resource. Select its title and inspect the native Markdown note and properties.
5. Add `https://arxiv.org/pdf/1706.03762v1.pdf`. It should report that the paper already exists, offer to open it, and leave the original note and annotations unchanged.
6. Enter a different valid ID and choose **Save without metadata**. Edit the fallback title, save, and confirm `metadata_status: unavailable`, with no invented authors or date.
7. Enter an unsupported URL or malformed ID. Expect an inline validation message and no note. If a real lookup fails, verify the error and the offline option. Close a form during lookup and confirm it never saves automatically.
8. Edit a captured note's title property and move it to another folder. Confirm the Inbox refreshes and another capture of the same ID still detects it. Restart Obsidian and confirm the saved resources reappear.
9. Change **Resource folder** to another valid vault folder and save a new paper. Only the new capture should use that folder. Invalid paths such as `../notes` or hidden folders should be rejected.
10. Check keyboard navigation, light/dark themes, and narrow panes. Open the workspace repeatedly: it should reuse the existing tab. Reload the plugin: there should be one ribbon icon and one of each command.

For console inspection use **Cmd+Option+I** (Mac) or **Ctrl+Shift+I** (Windows/Linux). Live API availability, mobile behavior, and third-party themes need checks in Obsidian. Tests and builds alone do not verify them.

## Source layout

- `src/main.ts`: lifecycle, service wiring, commands, ribbon, and settings.
- `src/navigation.ts`: pane reuse, navigation, and unload handling.
- `src/views/`: sidebar and main workspace.
- `src/components/`: shared resource lists, workflow actions, and placeholder rendering.
- `src/modals/`: capture/preview and reading-review forms.
- `src/services/`: arXiv requests/parsing, capture orchestration, and resource indexing/storage.
- `src/models/Resource.ts`: resource and capture draft types.
- `src/utils/`: identifiers, folder validation, Markdown serialization, workflow rules, and list filtering/sorting.
- `src/settings/SettingsTab.ts`: resource folder configuration and network disclosure.
- `tests/`: host-mocked regression tests.

No new runtime dependencies were added. The manifest still supports Obsidian 1.5.0; the settings tab uses the classic API, so it does not participate in newer settings-search APIs yet.
