# Research Inbox

An Obsidian plugin for organizing academic and technical research.

## Current milestone: Testing and Release Preparation

Research Inbox has a compact right sidebar and a main Research workspace. Capture arXiv papers, save them as ordinary Markdown notes, and open those notes from the Inbox. Inbox triage, a Reading queue, reading reviews, projects, and Library search are available. Projects connect research questions, existing notes, and resources. Local, explainable relevance ranking now helps prioritize unread resources. AI is not implemented.

A local `0.1.0` package is available through `npm run package`. It is not published or listed in the community directory. See [installation and release steps](docs/RELEASE.md) and the [QA record](docs/QA.md). Community submission is blocked by the development plugin ID, and a native Force Reload observation remains under investigation.

Commands:

- **Research Inbox: Add resource**
- **Research Inbox: Open sidebar**
- **Research Inbox: Open workspace**
- **Research Inbox: Open reading queue**
- **Research Inbox: Create project**
- **Research Inbox: Open projects**
- **Research Inbox: Open library**

The ribbon opens or focuses the sidebar. Reopening the workspace reuses its tab and preserves the selected section. Sidebar shortcuts navigate the workspace to a specific section.

The interface follows your Obsidian theme, with compact status badges, grouped resource actions, responsive search/filter controls, project cards, and a lightweight sidebar. See the [visual QA results](docs/QA.md#ui-polish-verification). After rebuilding, reload Research Inbox and open the workspace to see the updated interface. If the documented blank-window issue occurs during Force Reload, close and reopen the vault.

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
2. Open **Reading queue** from workspace navigation or the command palette. Use **Show** to filter queued, currently reading, or completed resources. **Sort** supports oldest first, newest first, title, and relevance.
3. Select **Start reading** to mark a queued resource as reading. Select its title to open the native Markdown note.
4. Select **Mark read** to open the review form. Choose Useful, Somewhat useful, Not useful, or leave Not rated. Key takeaways and Open questions are optional. Select **Mark read** in the form to save; cancelling before saving changes nothing.
5. Choose **Reading queue → Completed** to revisit finished papers. **Edit review** updates feedback; **Read again** queues the paper again while retaining its previous review.
6. **Defer** returns a queued or currently reading paper to the Inbox for reconsideration. No separate deferred status or reminder is created.
7. Choose **Inbox → Archived** to see archived papers and select **Restore to inbox**. Archiving never deletes or moves the Markdown file.

The sidebar's **Up next** shows queued/reading resources: currently reading papers first, then project relevance, with oldest queued first for ties or missing context. Its Pending inbox also uses relevance, then oldest captured first. Cards show suggested or assigned projects and a short explanation when evidence is available. In the active queue, currently reading papers stay ahead of queued papers for each sort option. Dates use queue time, completion time for Completed, or capture time in the Inbox.

The selected section, status filters, and sort options are stored in native workspace view state. Capturing a new resource switches the Inbox back to Pending so the saved resource is visible.

Reading status changes are centralized in the resource service and saved using Obsidian's native `processFrontMatter`. The note body and unrelated property values are preserved; Obsidian may reformat the YAML. Reviews live in note properties and do not overwrite the existing Key Takeaways or Open Questions body sections. The latest review is editable; an automatic review history is not maintained.

Concurrent actions are serialized. Each update checks the current paper identity and status; review saves also check whether the stored feedback changed while the form was open. Conflicting edits are rejected with a message so you can reopen the form. Failed writes leave the displayed state unchanged and can be retried. These workflow actions stay local and make no network requests.

## Projects and Library

1. Open **Projects → Create project**, or run **Research Inbox: Create project**. Enter a title, description, and research questions (one per line).
2. Link existing Markdown notes using `[[Note name]]` inside a question or by adding paths/links in **Linked notes**, one per line. Missing notes are reported before saving. Raw linked-note paths are converted to native links; existing link aliases and headings are retained in the properties. The project screen opens linked notes at the note level.
3. Select **Save project**. Its detail screen shows questions, linked notes, and associated resources. **Edit project** changes its details or marks it Archived/Active. **Open project note** opens the underlying Markdown file for your own annotations.
4. In the Inbox, Reading queue, or Library, select a resource's **Assign projects** action. Toggle any number of projects and select **Save assignments**. Turn off a known project to remove that association.
5. Open a project's detail screen to browse its resources. Choose **Show → Queued and reading** for that project's reading queue; the existing reading/review actions work here too.
6. Open **Library** to browse all recognized resources, including archived papers. Search matches all entered words, case-insensitively, across title, authors, arXiv ID, and note path. Combine it with status, project (including Unassigned), and resource-type filters, then sort by date or title. Search does not scan note bodies. Capture currently creates papers; other type values edited in resource properties appear in the type filter.

Library search and filters, the selected section, and the selected project restore through native workspace view state. Filters inside a project's resource list are local to that open project screen. Resource lists show the first 50 matches with **Show more** for additional results.

Projects are ordinary Markdown notes, created under `Research Inbox/Projects` by default with unique `project-<UUID>.md` filenames. You can rename them in Obsidian. Their frontmatter stores:

| Property | Meaning |
| --- | --- |
| `research_project_id` | Stable `project:<UUID>` identity; preserve this when renaming a note |
| `type` | `research-project` |
| `title`, `description` | Editable project details |
| `project_status` | `active` or `archived` |
| `research_questions` | List of research questions; may contain links to existing notes |
| `related_notes` | List of links to existing Markdown notes |
| `created` | UTC creation timestamp |

Archiving retains the project note and all resource assignments. Project editing preserves the Markdown body and unrelated property values. Conflicting edits are rejected so the form can be reopened with current values. Project IDs remain stable through title/path changes; duplicated IDs are treated as ambiguous until corrected in the notes. The project index follows metadata edits, moves, and deletions throughout the vault.

Resource associations use `project_ids` for stable membership and `projects` for native links. Existing links to recognized projects are also supported. References to missing or unrecognized projects are retained when saving assignments; remove obsolete references explicitly in the Markdown properties if desired. A stale native link after a rename may remain when Obsidian's automatic link updating is off, while stable-ID membership still works. No project action deletes resource notes.

## Local relevance ranking

Select **Sort → Relevance** in the Inbox, Reading queue, Library, or a project's resource list. Your chosen workspace sort is preserved; existing date/title sorts are unchanged. In the active Reading queue, papers already being read stay first. Other ties fall back to oldest first, then title and note path. The sidebar uses relevance automatically.

Candidate cards show their strongest active-project match as **Suggested project** or **Assigned project**. Open **Why this may be relevant** to inspect the actual project terms, matched research questions, linked-note-name terms, and any usefulness feedback that affected ordering. Select the project label to open its details. Use **Assign projects** to accept a suggestion yourself. Project-filtered lists use only that project's relevance; their membership still reflects saved assignments, not suggestions.

The initial algorithm uses exact normalized word overlap, with an English common-word list. It does not use semantic similarity, infer understanding from completed reading, or claim a paper answers a question. A missing match means insufficient lexical context, not that a paper is irrelevant. Add descriptive project details/questions or assign a resource explicitly to supply context.

Internal ordering rules (weights are not percentages or confidence estimates and are not shown in the interface):

| Signal | Ordering contribution |
| --- | --- |
| Explicit assignment to an active project | +8 |
| Title/abstract overlap with project title/description | +3 |
| Overlap with at least one project question | +5 total; explain up to three matching questions |
| Overlap with names of resolved notes linked by that project/questions | +2 |
| Closest similar, explicitly rated resource assigned to the same project | Useful +3, Somewhat useful +1, Not useful −3 |

Text signals need at least two distinct matching terms, or one when the context has just one meaningful term. Repeating words does not increase weight. Feedback needs at least two shared title/abstract terms and uses one example per project, chosen by most shared terms then note path. A candidate's own previous review and duplicate copies of its arXiv identity are excluded. Feedback adjusts an existing project match and cannot create one alone. The best project weight determines overall ordering; weights are floored at zero and never accumulated across projects.

Only Inbox, Queued, and Reading resources receive suggestions. Read, Archived, and unknown statuses remain available through the existing Library filters. Archived projects and projects with duplicate IDs do not influence ranking. Explicit feedback is retained as a signal even if its resource has since been archived or queued again. Unrated reading completion adds no signal.

Ranking reads recognized resource notes locally through Obsidian's vault API and extracts only the `## Abstract` section. Titles, project descriptions/questions, assignments, and ratings come from the existing indexes. Linked notes contribute their resolved filenames; their bodies are not read. Personal annotations, takeaways, and review questions are not analyzed. Missing/unreadable abstracts fall back to available context. Cached abstracts and recommendations are held in memory, refreshed after relevant edits, and discarded on unload. Nothing is written to notes or a separate recommendation database; no new network requests or dependencies are introduced.

## Storage and privacy

The default resource folder is `Research Inbox/Resources`; the default project folder is `Research Inbox/Projects`. Change either under **Settings → Research Inbox** and select **Save folders**. Only new notes use the changed folders; existing notes are not moved. Notes with valid Research Inbox identifiers remain indexed if moved elsewhere in the vault.

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
| `projects` | Native links to associated project notes; initially empty |
| `project_ids` | Stable project identities, added when assignments are saved |
| `metadata_status` | `complete`, `partial`, or `unavailable` |
| `queued_at`, `reading_started_at`, `read_at`, `archived_at` | UTC timestamps of the most recent corresponding action, when available |
| `review_usefulness` | `useful`, `somewhat_useful`, `not_useful`, or empty for Not rated |
| `review_takeaways`, `review_questions` | Optional review text stored in the note's properties |
| `reviewed_at` | UTC timestamp of the most recent saved review |

Notes include Abstract, Why I Saved This, Key Takeaways, Open Questions, and Personal Notes sections. Incoming metadata is rendered as text and escaped in the Markdown body. User-authored capture notes retain their Markdown formatting.

**Network use:** only selecting **Fetch metadata** sends the normalized paper identifier to `https://export.arxiv.org/api/query` using Obsidian's `requestUrl`. Vault content and capture notes are not sent. No API key, AI service, analytics, or PDF download is involved. Saving without fetching works offline.

Metadata lookups use the [official arXiv API](https://info.arxiv.org/help/api/user-manual.html). The client allows one in-flight request and at least 3.1 seconds between request starts, following the [arXiv API rate limits](https://info.arxiv.org/help/api/tou.html). The form times out after 20 seconds; Obsidian's request API cannot cancel the underlying connection, so another lookup remains blocked until that connection finishes. Offline saving remains available. Rate limiting is per running plugin instance; avoid simultaneous lookups across multiple vaults.

The resource index is rebuilt from Obsidian's metadata cache on startup and updated for metadata changes, renames, and deletes. Capture waits for the initial cache to be ready so existing notes are considered for duplicate detection. Only notes bearing a valid `research_id: arxiv:...` marker are recognized. Removing that marker removes a note from the index. Unknown statuses remain visible in the Library under All statuses, but do not appear in the Inbox or Reading queue; the paper remains deduplicated. Workflow actions reject unrecognized statuses.

## Development

Use Node.js 20+ and npm:

```sh
npm install
npm run build
npm run lint
npm test
npm run package
```

For continuous rebuilding, use `npm run dev`. Build output is `main.js` in this directory and is ignored by Git. This repository already lives at `<Development Vault>/.obsidian/plugins/obsidian-research-inbox`, so no copying is necessary. Obsidian loads `main.js`, `manifest.json`, and `styles.css` from here.

The test runner uses the existing esbuild dependency and Node's test runner. Tests mock the Obsidian host and write only to an in-memory vault. No test sends network requests or creates files in your real vault. Coverage includes input normalization, path validation, metadata serialization inputs, duplicate writes, collisions, write failures, indexing, offline/partial metadata behavior, reading transitions, review conflicts, project creation/editing/link validation, assignments and renames, Library filtering, deterministic ranking/explanations, feedback boundaries, asynchronous cache invalidation/unload, and scoped metadata updates. Actual Atom parsing in the browser, Obsidian's YAML serializer and frontmatter updates, HTTP transport, and the live UI still require integration testing.

## Test Milestone 6 in your development vault

1. Toggle **Research Inbox** off and on under **Settings → Community plugins** after building. The generated `main.js` is already in the development vault.
2. Create or edit an active project with title **Attention mechanisms** and a question such as **How do attention mechanisms improve translation?** Save it. Use a saved paper whose title or Abstract includes **attention mechanisms**; for an offline test, give an offline capture that title before saving.
3. Open **Inbox → Sort → Relevance**. Verify the matching card shows **Suggested project** and **Why this may be relevant** names the project and question with shared terms. Inspect the resource note: no automatic project assignment or generated text should appear.
4. Select **Assign projects** and save the project association. The card should change to **Assigned project**. Select its project label to open project details, then try relevance sorting in the project's resource list.
5. Queue two papers. Assign a second paper with similar title/abstract terms to the project, mark it read, and rate it Useful. The unread paper's explanation should name that reviewed paper and say its priority was raised. Change the review to Not useful; the explanation should say lowered. The rating may not visibly reorder the list when there are no competing candidates.
6. Edit a project's questions or a saved resource's Abstract. Verify explanations refresh. Edit unrelated Personal Notes text; it should not create relevance matches. Archive the project; its suggestions should disappear while its notes/assignments remain.
7. Check **Up next** in the sidebar. A currently Reading paper stays ahead of Queued papers. Queue relevance and explanations should update after project/feedback edits. With no active project match, the queue falls back to chronological order without inventing a recommendation.
8. Try Library project/status/type filters while using relevance sort. Archived and Read papers should remain browsable but receive no new-read suggestions. Selecting a specific project must not borrow a match from another project.
9. Switch sections and reload Obsidian. Workspace sort should restore, and the same unchanged inputs should produce the same ordering after local indexing finishes.
10. Check narrow panes, keyboard focus (including the expandable explanation), light/dark themes, and developer-console errors. Native UI/metadata event behavior still needs these checks in Obsidian.

Build, lint, and all 67 host-mocked tests pass. Automated tests use an in-memory vault. The separate [native QA record](docs/QA.md) distinguishes completed smoke checks from remaining release work.

## Test Milestone 5 in your development vault

1. Build, then toggle **Research Inbox** off and on under **Settings → Community plugins**, or use Hot Reload. No copying is needed in this development vault.
2. Run **Research Inbox: Create project** from **Cmd+P**. Add a title, description, and two questions. Reference a real note using `[[Note name]]` and add another under **Linked notes**. Save; verify both buttons open the intended notes. An unknown note link should prevent saving with a clear error.
3. Select **Open project note**. Confirm its properties, then add a personal annotation in the body and a custom property. Use **Edit project** to change the title and questions; verify your annotation and custom property remain intact.
4. Open the Inbox or Library, select **Assign projects** on a saved paper, enable the project, and save. Verify it appears under **Project resources**. Assign it to a second project, then remove one association and confirm the other remains.
5. Queue the assigned paper and choose **Show → Queued and reading** inside its project. Try **Start reading**, **Mark read**, and the Read filter. Review text and note annotations should remain intact when assignments change.
6. Open **Library**. Search by title, author, and arXiv ID; combine search with project/status/type filters. Try Unassigned, Archived, and a query with no results. Switch sections and reload Obsidian; Library controls should restore. With more than 50 matches, verify **Show more**.
7. Rename a project note in Obsidian. Confirm its resource membership still works. Archive it through **Edit project** and verify the project note and assignments remain; set it back to Active to restore it.
8. Leave **Edit project** open, change a project detail in its Markdown properties, and try to save the form. Expect a conflict message. Repeat with **Assign projects** and an external assignment edit. Closing a form without saving should make no changes.
9. Change **Project folder** in settings and select **Save folders**. Create another project and confirm only the new note uses that folder. Restart Obsidian and verify both projects and their assignments return.
10. Check keyboard navigation, narrow panes, and light/dark themes. Open developer tools and check for plugin errors during navigation, edits, and reloads. Confirm the new commands appear only once.

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
- `src/components/`: shared resource lists, relevance explanations, Library controls, and project screens.
- `src/modals/`: capture/preview, reading-review, project-editing, and assignment forms.
- `src/services/`: arXiv requests/parsing, capture orchestration, resource/project indexing and Markdown storage, and a read-only ranking service.
- `src/models/`: resource, capture draft, project, and recommendation types.
- `src/utils/`: identifiers, folder validation, Markdown serialization, workflow rules, project validation/associations, local relevance rules, and list filtering/sorting.
- `src/settings/SettingsTab.ts`: resource/project folder configuration and network disclosure.
- `tests/`: host-mocked regression tests.

No new runtime dependencies were added. The manifest still supports Obsidian 1.5.0; the settings tab uses the classic API, so it does not participate in newer settings-search APIs yet.

## License

[Zero-Clause BSD](LICENSE). Based on the Obsidian sample-plugin scaffold; its original license notice is retained.
