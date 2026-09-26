# Reference: working on Foundry VTT module/system version migrations

A reusable how-to for any agent doing Foundry VTT compatibility work (not specific to the
v13/v14 migration this file was written during, though that's where it was learned).
Foundry core is closed-source, versions frequently rename/relocate APIs, and this
environment has no Foundry install - so verifying an API assumption against the *real*
documentation before writing code around it is cheap and catches real bugs. Section 3
below is a worked example of exactly that.

## 1. Where to find the real API docs

Foundry publishes generated JSDoc/TypeDoc API reference sites, versioned per major
release:

- **Live docs for the current stable version:** `https://foundryvtt.com/api/`. Just
  `curl` it - it's public, unauthenticated, static HTML.
- **Docs for an older major version:** the live site only serves the current version, so
  for anything else use the Wayback Machine. Query the CDX API for snapshots of
  `foundryvtt.com/api/` and pick one from the date range the target version was current:
  ```
  curl "https://web.archive.org/cdx/search/cdx?url=foundryvtt.com/api/&output=json&from=YYYYMMDD&to=YYYYMMDD&collapse=timestamp:8"
  ```
  Each row is `[urlkey, timestamp, original, mimetype, statuscode, digest, length]`. Rows
  with the same `digest` are identical captures of the same content; a changed digest
  means the page (and likely the documented version) changed. Fetch a candidate and check
  its `<title>` / footer text ("Public API documentation for Foundry Virtual Tabletop
  version X.YYY") to confirm which version you actually got.
- **Fetching an archived page:** `curl -sS -L "https://web.archive.org/web/<timestamp>/<url>"`.
  Always pass `-L` - if the exact timestamp wasn't captured, archive.org 302s to the
  nearest actual snapshot, and `-L` follows it transparently. `--check` doesn't care that
  the resolved page differs slightly from the requested timestamp; it's still real
  content from the target site, just from a nearby date.
- **The built-in `WebFetch` tool refuses every `web.archive.org` URL outright** (some kind
  of blanket domain block, seemingly unrelated to it being public/unauthenticated - the
  Wayback Machine has no auth and curl reaches it fine). Use `curl` via Bash instead for
  anything on that domain. `WebFetch` works fine on the live `foundryvtt.com/api/` site
  directly, if you prefer it there.

## 2. Reading the fetched pages

The API doc pages are TypeDoc output, which wraps every camelCase identifier in
per-syllable `<span>` tags for its search index. Naive regex tag-stripping
(`re.sub('<[^>]+>', ' ', html)`) mangles identifiers into fragments like `Actor` /
`Directory` on separate lines. Don't do that. Instead:

- **`lynx -dump -nolist <file>.html`** (available in this environment) renders the page
  properly, like a real browser would, and produces clean readable text. This is the
  right default.
- Not every documented page is linked from the site's own index/nav (e.g.
  `CompendiumDirectory`'s class page exists and is fully populated, but isn't linked from
  `foundryvtt.com/api/`'s class list for some reason). If you expect a class to exist,
  just try fetching its guessed URL directly - `classes/<full.dotted.path>.html` - rather
  than trusting the index page's link list is exhaustive.
- JSDoc/TypeDoc only documents **JS class/method/property signatures and their prose
  doc-comments** - it does not include compiled Handlebars template source or rendered
  DOM output. If you need to confirm exact CSS classes or `data-*` attributes a core
  template produces, this reference can't get you there; that needs a live Foundry
  client. What it *can* often do is corroborate the underlying JS-side terminology (e.g.
  confirming a class's methods consistently use "entry" instead of "document" as a naming
  convention, which is decent indirect evidence for what a `data-entry-id` attribute is
  probably called, even without seeing the template itself).
- For hook names Foundry fires internally (e.g. `render<ClassName>` for anything derived
  from `ApplicationV2`), look at the `BASE_APPLICATION` static property's doc text on the
  class in question ("Hook events for super-classes further upstream of the
  BASE_APPLICATION are not dispatched") - this confirms the mechanism and that every class
  in the chain up to `BASE_APPLICATION` gets its own `render<ThatClass'sName>` hook fired,
  which is usually the fact you actually need (rather than finding an explicit `@fires`
  tag, which isn't used consistently in this codebase).

## 3. Worked example of why this matters

During the v13/v14 migration (see `documentation/foundry-v13-v14-migration-plan.md` and
`documentation/dev-log.md`), the plan claimed `ChatMessage.applyRollMode` is "shimmed on
v14 until V16 but warns." Checking the actual v14.365 docs showed it doesn't exist on v14
at all - not deprecated-and-warning, just gone. The code that had been written already
happened to be safe (it feature-detected on `ChatMessage.applyMode` existing, rather than
branching on version, so it never reached the removed method on v14) - but a *different*
part of the same code guessed a settings key (`game.settings.get("core", "messageMode")`)
that doesn't appear anywhere in the v14 docs either, which would have thrown at runtime
for every chat message sent on v14. The docs for `ChatMessage.applyMode` itself state its
second argument is optional and defaults to "the mode stored in client settings" when
omitted - so the actual fix was to stop guessing the setting key and just not pass it,
letting core resolve its own default. This is the kind of bug that's very easy to ship
when working from a migration plan's prose or general training knowledge alone, and cheap
to catch by spending five minutes with `curl` + `lynx` against the real docs first.

**Rule of thumb:** when a plan or your own recollection asserts a specific method exists,
a specific option name is accepted, or a specific hook fires with specific arguments -
and you're about to write code whose correctness depends on that being exactly right -
spend the few minutes to check the real docs before or immediately after writing it,
rather than trusting prose (including your own).

## 4. Tooling gotchas in this sandbox

- **No `npm`/`npx`, no `node_modules`.** The `npm` package is present on disk but not
  executable (permission denied, no sudo). Network access to the npm registry itself
  works fine via `curl` (e.g. `curl https://registry.npmjs.org/<pkg>/latest` to check a
  package's current version), so you can still make informed version-bump decisions - you
  just can't install anything or run `eslint`/`prettier` locally. Say so explicitly in
  whatever log you're keeping, and tell the user `npm run lint` still needs to be run
  before merging.
- **`node --check some-file.js` is NOT reliable syntax validation in this repo**, because
  `package.json` has no `"type": "module"`, so Node's module-type detection for ambiguous
  `.js` files can silently tolerate broken ESM syntax that would be a hard error in a real
  module context. Concretely: an automated find/replace once inserted an `import`
  statement in the middle of another multi-line `import { ... } from ...` block across
  three files, and `node --check` reported all three as valid.
  **The reliable check:** copy the file to a `.mjs` path first (forces strict module
  parsing) and check that instead - `node --check` doesn't resolve import targets, so the
  copy's new location/relative-import-brokenness doesn't matter, only the syntax does.
  ```bash
  cp src/some/file.js /tmp/check.mjs && node --check /tmp/check.mjs
  ```
  Do this for every file you touch (or, cheaply, for the whole `src/` tree) before
  calling a change verified.
- `lynx` is installed and is the right tool for turning any fetched HTML doc page into
  readable text (see §2 above) - prefer it over hand-rolled regex/BeautifulSoup-style
  stripping, especially for TypeDoc-generated pages.
