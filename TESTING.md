# Testing Contract

Tests are derived from observable product requirements and data invariants. They are not scored against the authoring model's preferred wording, component layout, colors, or implementation technique.

## Test Layers

- `src/lib/notes.test.ts`: pure domain contracts, deterministic IDs/timestamps, valid and invalid import inputs, state transitions, sorting, and search.
- `src/app/workspace.test.tsx`: user-visible keyboard and pointer flows, persistence, folder/tag filters, lifecycle actions, file import, and untrusted Markdown preview.
- `e2e/local-account.ts`: creates an isolated local SQLite account for browser flows.
- `e2e/auth.spec.ts`: local registration, login/logout, session persistence, and invalid credentials.
- `e2e/workspace.spec.ts`: SQLite persistence across reload, folder/tag/trash workflow, Markdown import, mobile navigation, and rendered output.
- `e2e/accessibility.spec.ts`: automated WCAG 2.1 A/AA checks against the empty workspace and note editing.
- `src/lib/local-db.ts` and `src/app/api/local-*/route.ts`: SQLite account/session/workspace storage, authorization, and role checks.

## Reliability Rules

- Use synthetic fixed fixtures; avoid production accounts, secrets, network-dependent services, random test expectations, and test-order dependencies.
- Assert both positive and negative outcomes where relevant: authorized content appears, private or deleted content does not, and unsafe HTML is not rendered.
- Prefer semantic roles, labels, persisted state, and user-observable status over CSS selectors, snapshots, internal state, or incidental DOM structure.
- Do not weaken a test merely because an implementation fails it. First compare the test to the acceptance contract; change the product when behavior is wrong, and change the fixture/query only when its declared input or target is demonstrably incorrect.
- Avoid subjective assertions about preferred colors, exact spacing, prose style, or component decomposition. Accessibility checks use published axe rules rather than personal preference.
- Keep generated IDs and timestamps controlled in unit tests; E2E tests assert stable data fields and user outcomes rather than exact clock values.

## Acceptance Coverage

| Requirement | Automated check |
| --- | --- |
| New note has stable empty defaults and can be edited | domain creation test; workspace create/edit test |
| Changes persist in SQLite and can be read after reload | authenticated workspace E2E |
| Search covers Chinese, English, title, body, and tags | domain search cases; workspace query interaction |
| Folder/tag views include matching notes | domain filter tests; workspace and E2E classification flows |
| Archive/trash are separate and restore preserves prior state | lifecycle unit tests; workspace lifecycle test |
| Markdown import/export preserves title and body | format round-trip tests; browser import E2E |
| Raw HTML in Markdown is not interpreted | workspace preview test; browser preview E2E |
| Shortcuts and mobile back navigation remain usable | component shortcut test; mobile viewport E2E |
| First local account receives admin role; later accounts are isolated | local SQLite account E2E |
| Users cannot read or mutate another account's notes or folders | session-owned workspace API; two-account integration check |
| Only administrators can view account lists or change roles | local admin API authorization and role transaction |
| Empty workspace meets automated accessibility rules | axe Playwright test |

Run the full pull-request gate with `npm run test:ci`.

Before any deployment, use two test accounts to confirm each account sees only its own notes/folders, regular users cannot list accounts or change roles, and at least one administrator remains. This local SQLite setup is intended for a local demonstration, not public or multi-instance hosting.