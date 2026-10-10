# Material Folder Design Reference

- purpose: implementation details for reusing the realistic folder, paper, ledger, and dashboard styling across Pipeline and Alamo Platform
- status: active design reference; extracted values plus explicitly identified reuse rules, not a completed shared component library
- owners: product, frontend
- updated: 2026-10-09
- tags: design, folders, pipeline, dashboard, typography, materials, responsive
- labels: platform-handbook, implementation-reference

## Use this before changing the style

Use the realistic **folder** for an actual client or report file: a Pipeline
referral, an open client chart, or a scanned LIC 624 under review. A folder
represents a record someone can inspect or work on. Do not turn dashboard
metrics, charts, filters, navigation, or live operational summaries into
folding folders. Those need readable data panels with domain color and direct
drilldowns. The executive dashboard is not a stack of documents.

This is a code reference, not a new website, route, brand, or UI redesign.
Do not create a component gallery or add explanatory copy to the product when
applying it. Keep the existing Alamo Health Management logo and top navigation.

Read the relevant source below and the host application's own agent map before
implementing. Reuse presentation across products; do not import one product's
clinical transactions, authorization, or runtime into another.

## Source anchors

Extraction baseline: Platform implementation commit `a6863b2`, reviewed on
October 9, 2026. These values describe that implementation, not a promise that
every current branch has them. Inspect the latest owning source before editing.
The Licensing construction below incorporates the October 9 local cardstock
and navigation refinements: one continuous workspace, shaped working tabs,
a printed community label, a visible manila cover, layered paper, and readable
compact layouts. It supersedes the rejected thin green outline and the
community label styled as a fourth tab. The Licensing refinements shipped in
the October 9 folder release. The baseline can be recovered without relying on
a temporary worktree:

```sh
git show a6863b2:src/features/executive/executiveCommunity.css
```

| Source (under `src/features/executive/` unless stated) | What to reuse or inspect |
| --- | --- |
| `executiveCommunity.css` | Domain-colored dashboard panels; record-detail covers; `.admissions-file*` folder geometry; mobile collapse |
| `components/ExecutiveCommunityDetailModal.tsx` | File sections, timeline, period tabs, scrollable records, inline vs dialog detail |
| `pages/ExecutiveDirectorDashboardPage.tsx` | `DomainPanel`, overview composition, new-client entry point |
| `components/ExecutiveTrendChart.tsx` and `.css` | Chart geometry, selected-period behavior, keyboard point navigation |
| `executiveLicensing.css` | Manila cover, curved Reports/Upload/Review tabs, paper stack, forest actions |
| `components/ExecutiveDirectorHeader.tsx` and `executiveHeader.css` | Official logo placement, desktop center navigation, two-row mobile header and its height contract |
| `src/features/california/components/PlatformPageNavigation.tsx` | Main Platform shell's matching desktop active-rule navigation; its mobile menu remains a distinct compact pattern |
| `src/platformWorkspace.css` | Main Platform-scoped report and Licensing reader, Admissions file, and community dashboard treatments; does not change Executive Director permissions or data |
| `src/features/admissions/admissionsVisual.css` | Main Admissions briefing paper/blue dashboard treatment, neutral stage lanes, and the manila referral-file card; keep this distinct from the client detail folder |
| `src/features/california/components/AnalyticsSectionNavigation.tsx` | Main Platform's Reports / Ask a question / Licensing secondary rail; same underline rhythm as primary navigation |
| `src/features/communities/components/CommunityDashboardSurface.tsx` | Four linked domain panels in the community profile; the selected domain still opens its existing detail |
| `pages/ExecutiveDirectorPage.tsx` | Visible and accessible tab labels, conditional Review tab, printed community/form context |
| `components/Lic624ReviewWorkspace.tsx` and `lic624Review.css` | Editable document, section navigation, dirty/busy/save states |
| `components/ExecutiveIncidentRegister.tsx` and `executiveIncidentRegister.css` | Search/filter/expand/paginate and mobile record rows |
| `licensingBulkUpload.css` | Per-file queue and receipt states |

Most helpers are feature-local. Names such as `FolderShell`, `PaperStack`,
`FileHeader`, `RecordRows`, and `HistoryRail` below are proposed extraction
boundaries, not existing exported components.

## Non-negotiable visual rules

- A folder is not a generic rounded card with a folder icon. Use its outer
  shape, tab shoulders, paper edges, and depth only for a real file workflow.
- Dashboards use flat, aligned domain panels. Distinguish Census, MAR, and
  Incidents with blue, plum, and rust accents, not separate leather covers,
  fake spines, paper stacks, or repeated category tabs.
- Put texture and depth in the material layers. Keep text and controls flat,
  sharp, and selectable. Do not put a photograph of a UI behind live fields.
- Use one visible outer object around a coherent task. Internal sections use
  restrained 1px rules, not another stack of brightly framed cards.
- Keep meaningful color: manila client and Licensing files, blue census/history,
  plum MAR analytics, rust incident records, forest Licensing actions. Emerald is primarily an
  action/accent color. Do not wash every surface in mint.
- Color family identifies the kind of document, not its severity or stage.
  A client stays manila when its workflow status changes; update its labeled
  status, not the whole folder's color.
- Remove repeated titles, subtitles, generic instructions, and floating stat
  lines. Make density with aligned content, not tiny text or empty boxes.
- No generated names, clinical facts, counts, timelines, or dates to make a
  specimen look complete. Missing data needs an honest compact state.

## Tokens

### Shared foundation

| Token | Baseline value |
| --- | --- |
| UI/body font | `"Helvetica Neue", Arial, sans-serif` |
| Document font | `"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif` |
| Chart font | `Arial, Helvetica, sans-serif` |
| Ink | `#16283a` |
| Secondary ink | `#65717d` |
| Paper | `#fcfbf7` |
| Emerald action | `#087d64` |
| Interior rule | `#d3d8dd` |

### Domain materials

Card and full-document colors are deliberately listed separately. Do not
silently flatten them into one guessed shade.

| Family | Card tone | Card cover | Card soft | Full cover | Full edge | Full tone |
| --- | --- | --- | --- | --- | --- | --- |
| Census | `#164d7c` | `#23577e` | `#e6eef5` | `#255779` | `#12364f` | `#164e82` |
| MAR | `#68214e` | `#65264e` | `#f0e4ed` | `#66284e` | `#401330` | `#6b204f` |
| Incidents | `#923621` | `#a1462e` | `#f3e4de` | `#9c422c` | `#6f281c` | `#983b26` |
| Client | `#9a631a` | `#e4c487` | `#f7eed9` | See manila recipe | `#b79353` | `#9a631a` |

Manila cover: `linear-gradient(135deg, #f4deb1, #d6ad68)`.
Inactive client tab: `linear-gradient(#ecd3a2, #dfbf86)`.
Client status: `linear-gradient(#a66d1c, #89520c)` with white text.

Licensing uses stock `#e6c68a`, edge `#ab8146`, and ink `#193246`, with a
generated cardstock texture at `public/materials/manila-stock-v1.webp`.
The LIC 624 form's action color remains `#285544`; the cover is not green.

### Grain

The quiet reading paper uses an SVG filter, not an image of a folder:

```svg
<svg viewBox="0 0 180 180" xmlns="http://www.w3.org/2000/svg">
  <filter id="grain">
    <feTurbulence type="fractalNoise" baseFrequency=".82"
      numOctaves="3" stitchTiles="stitch" />
  </filter>
  <path fill="#80786c" opacity=".075" filter="url(#grain)"
    d="M0 0h180v180H0z" />
</svg>
```

Use as the first background layer above the material color/gradient. When
embedded as a CSS data URI, encode `#` as `%23`. Texture must remain subdued;
it should not read as wallpaper, geometric decoration, or dirt. Do not apply
opacity to the whole content container. Keep decorative layers
`pointer-events: none` and out of the accessibility tree.

Licensing's outer stock instead repeats `manila-stock-v1.webp` at `360px ×
360px`. This is a material-only bitmap, not a screenshot of controls. Its
fibers must remain separate from the quieter reading sheet. The asset is
approximately 220 KB, converted from the built-in image tool's original PNG
to WebP at quality 82 without changing its dimensions. Original:
`/Users/eric/.codex/generated_images/01a068b2-775b-7e81-8e80-b83942654b5b/exec-c4f38c77-0683-48d6-a850-b448679a90b8.png`.

Generation prompt (built-in image tool):

> Use case: photorealistic-natural. Asset type: seamless tileable material texture for a realistic manila file-folder web interface. Create a perfectly flat, orthographic macro scan of clean premium golden-buff manila cardstock. The entire square image is only the material, edge-to-edge. Fine short irregular paper fibers embedded in the stock, tiny natural flecks, subtle tooth and restrained mottling, tactile photorealism. Base color warm honey sand near #e6c68a with subtle ochre and cream variation, not orange, not gray. Even diffuse scanner lighting, low contrast, no directional shading, no vignette, no gradients. Seamless wrapping edges, no focal objects, no sheet edges, no folder shape, no creases, no stains, no tears, no printing, no text, no logos, no watermark. This will repeat at 360px square behind live HTML, so very fine texture, not coarse wallpaper.

The Community census, MAR, and incident covers use
`public/materials/bookbinding-leather-v1.webp`, a neutral 512px leather-grain
tile generated with the built-in image tool. Tint the same tile separately
through each domain's cover color using a solid color gradient with
`background-blend-mode: multiply`; keep its image layer on the backing and
decorative tab only. This retains crisp live labels, charts, and controls.
The prompt specified a flat orthographic scan of fine-grain premium
bookbinding leather, neutral grayscale, subtle irregular pores, even diffuse
light, edge-to-edge tiling, and no objects, seams, text, UI, or vignette.

## Folder construction

### Layer order

1. **Cover:** positioned backing layer; shaped top edge; manila grain and
   gradient; thin darker edge. This is the largest silhouette.
2. **Tabs:** attached to the cover. Selected tab becomes paper and visually
   joins the reading sheet. Other tabs retain manila. Status is a separate
   labeled badge, not a fake navigation tab.
3. **Paper:** one reading surface; optional one or two offset paper edges.
   Small contact shadows, never a stack of five floating cards.
4. **Content:** file identity, ruled facts, task-specific sections, history.
   Meaningful HTML remains real text and controls.
5. **Fold:** optional narrow decorative seam between paper leaves, aligned to
   the actual column gap. Remove it when the leaves stack.

### Baseline dimensions

| Part | Existing value |
| --- | --- |
| Outer folder | `position: relative; isolation: isolate; border-radius: 15px; padding: 0 12px 13px` |
| Header | Minimum height `66px`; gap `10px`; padding `9px 6px 0` |
| Inactive tab | Height `48px`; padding `0 26px`; radius `12px 16px 0 0`; `17px` document font |
| Active tab | Height `56px`; `23px/600` document font; paper fill; raised above sheet |
| Status badge | Minimum height `36px`; padding `7px 17px`; radius `5px`; `11px/600` UI font |
| Paper sheet | `1px solid #d7cbb7`; radius `8px 12px 14px 8px`; padding `24px` |
| Desktop content | `minmax(0,1.45fr) minmax(0,1fr) 185px`; gap `28px` |
| Column spacing | Vertical `14px`; `min-width: 0` |
| Fold | Width `18px`; baseline left `48%`; pointer events disabled |
| Client identity | `42px/600` document font |
| Internal panels | Mostly `1px` borders and `3-5px` radii |

Baseline cover silhouette from `.admissions-file::before`:

```css
clip-path: polygon(
  0 44px, 1% 34px, 3% 34px, 4% 6px, 4.5% 0,
  35% 0, 35.5% 6px, 36.5% 34px,
  80% 34px, 81% 18px, 82% 14px, 97% 14px,
  98% 20px, 99% 38px, 100% 46px, 100% 100%, 0 100%
);
```

The clip belongs to the **backing layer only**. Clipping the whole folder
will cut off menus, focus outlines, shadows, and selected tabs. When refining
the shoulders, use a small SVG path/mask for genuine curves rather than
adding more arbitrary polygon points. Never scale text as part of the mask.

Paper fold recipe:

```css
background: linear-gradient(
  90deg, #50402a12, #ffffffdd 35%, #51432c26 53%,
  #ffffff99 70%, #51432b0c
);
```

The `48%` fold location is specific to the baseline layout. Do not copy it
into a changed grid and leave the seam running through content. Prefer a
named grid gap or a dedicated decorative column when extracting the shell.

### Reusable CSS boundary

Scope new shared recipes to a local wrapper; do not replace global `:root`,
app headings, or Pipeline's existing class names. This is the minimum shape
of an extraction, not a drop-in replacement for the current component:

```css
[data-material-ui] {
  --file-paper: #fcfbf7;
  --file-ink: #16283a;
  --file-muted: #65717d;
  --file-grain: url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.82' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Cpath fill='%2380786c' opacity='.075' filter='url(%23n)' d='M0 0h180v180H0z'/%3E%3C/svg%3E");
  --file-sans: "Helvetica Neue", Arial, sans-serif;
  --file-serif: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
  color: var(--file-ink);
  font-family: var(--file-sans);
}
[data-material-ui] .folder-shell {
  position: relative;
  isolation: isolate;
  min-width: 0;
  padding: 0 12px 13px;
}
[data-material-ui] .folder-shell::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  border: 1px solid #b79353;
  border-radius: 15px;
  background: var(--file-grain), linear-gradient(135deg, #f4deb1, #d6ad68);
  box-shadow: inset 1px 1px #ffffff99;
  clip-path: polygon(
    0 44px, 1% 34px, 3% 34px, 4% 6px, 4.5% 0,
    35% 0, 35.5% 6px, 36.5% 34px,
    80% 34px, 81% 18px, 82% 14px, 97% 14px,
    98% 20px, 99% 38px, 100% 46px, 100% 100%, 0 100%
  );
}
[data-material-ui] .folder-tabs {
  display: flex;
  align-items: end;
  min-width: 0;
  overflow-x: auto;
  min-height: 66px;
  padding: 9px 6px 0;
}
[data-material-ui] .folder-tabs [role="tab"] {
  box-sizing: border-box;
  flex: 0 0 auto;
  height: 48px;
  padding: 0 26px;
  border: 1px solid #bf9d68;
  border-bottom: 0;
  border-radius: 12px 16px 0 0;
  background: linear-gradient(#ecd3a2, #dfbf86);
  font: 400 17px var(--file-serif);
}
[data-material-ui] .folder-tabs [aria-selected="true"] {
  height: 56px;
  background: var(--file-paper);
  font-size: 23px;
  font-weight: 600;
}
[data-material-ui] .folder-paper {
  min-width: 0;
  padding: 24px;
  border: 1px solid #d7cbb7;
  border-radius: 8px 12px 14px 8px;
  background: var(--file-grain), var(--file-paper);
}
[data-material-ui] :is(button, a, input, select, textarea):focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 3px;
}
```

Avoid `filter: drop-shadow(...)`, transforms, or opacity on the entire live
file; they can rasterize text in print/capture and make it look soft. Put
shadows on backing/paper layers. Use actual font weights, not text shadows.
Include `box-sizing: border-box` wherever dimensions assume padding is inside
the specified height; do not depend on the host app's reset.

## Files and data surfaces

| Variant | Construction | Content limit |
| --- | --- | --- |
| Pipeline folder card | Small manila cover + attached identity tab + one paper inset | Identity, explicit workflow state, next useful fact; open the file. Do not bury board controls inside the open action. |
| Dashboard panel | Flat paper/white surface; domain-colored top rule and quiet tinted header | One useful measure or chart with a direct drilldown. No faux tab, spine, fold, or paper stack. |
| Record detail | Domain-colored bounded reading surface; texture stays outside text | Period/section controls only when they select actual data. A chart modal is not automatically a file. |
| Licensing file | `18px` left / `16px` right / `19px` bottom stock; `8px` side stock on phones; paper radius `5px 8px 9px 5px` | Reports / Upload / Review; community and LIC 624 are printed cover context, never a fourth tab. Existing digital form and original document access remain intact. |

Dashboard panel depth (use a single outer edge; do not imply stacked paper):

```css
box-shadow:
  0 8px 20px #172a3c16;
```

Licensing paper edges:

```css
box-shadow:
  0 -1px 1px #fffefb,
  inset 1px 0 #ffffff,
  0 1px 3px #59472d3d;
```

For a working register, keep the hierarchy continuous: tabs and community
context → search/filter/result count → records. Do not add a separate hero,
divider, repeated Reports heading, or another Upload button above a populated
list. Keep the empty-state Upload action. Show the pagination footer only when
more records can be loaded.

The cover starts `35px` below the `68px` desktop header top so the tabs rise
above its shoulder. Do not reduce it to a colored border. Two real decorative
sheet layers sit `3px` and `6px` right of the paper, and `3px` and `7px` below
it, with fine warm edges and contact shadows. The cover has its own broader
cast shadow and a `4px` fold crease `9px` from its left edge.

Tab material uses an SVG alpha mask with `viewBox="0 0 240 64"` and
`preserveAspectRatio="none"`. Its curved shoulder path is:

```text
M0 64C8 64 11 60 13 52L21 13C23 4 28 1 39 1H200C211 1 216 5 218 14L227 53C229 60 233 64 240 64Z
```

Only decorative tab layers are masked/shadowed, not the live labels. Desktop
active/inactive tabs are `62px`/`52px`; mobile uses `54px`/`48px`. The selected
tab's paper fill joins the sheet with a `4px` bottom patch. Do not force equal
heights, which erases the raised active leaf.

Licensing's visible and accessible tab names are **Reports**, **Upload**, and
**Review**. Reports opens the submission list; Upload opens the batch intake;
Review resumes the active report and exists only while that report is open.
Keep a `4px` gap between tab controls and at least `16px` of visible separation
between neighboring label text. The desktop tablist uses `flex: 0 0 auto` so
community context cannot squeeze it. At `320px`, keep every label visible and
single-line, retain at least `14px` type and `10px` inline padding, and hide
decorative icons instead of shrinking or hiding labels.

Community and LIC 624 are a printed label on the cover: no tab mask, raised
shoulders, or inactive-tab affordance. At widths up to `1023px`, this label
stacks above the working tabs; on wider screens it sits to their right. Long
community names wrap within their own area. Keep an accessible page heading
even when the top navigation makes a second visible title unnecessary.

On phones, the review header gives the filename the full reading width and
keeps the close control separately at the upper right. Extraction, required
check, and review state become three label/value rows, with labels at least
`12px` and values at least `13px`; do not compress them into three narrow
columns. Original-document and save actions retain `44px` targets. At widths
up to `420px`, upload-queue filenames also span the full row, with status and
actions underneath so long names remain readable.

MAR rings are optional desktop decoration: `34px × 10px` metallic ovals with
`3px` borders at the paper seam. Do not add them to every file or let them
cover a chart. The existing implementation hides them below `1200px`.

## Header and workspace fit

The authenticated Executive Director header retains the official Alamo Health
Management wordmark at every width. Only its surrounding navigation changes:
the desktop bar uses centered Community/Licensing links with a thin active
rule, consistent with the main Platform navigation's active rule and `1500px`
shell width; below `640px` the full wordmark and profile occupy the first row, with
the two links in a second `46px` row. The mobile header is `99px` tall, so
workspace scroll offsets and dialogs must use `--platform-header-height`
instead of a hardcoded `60px`.

Community places its identity, Overview/MARs/Incidents navigation, and new
client notification on one ruled rail at desktop widths. On phones the
identity and notification stay together, with the three view labels on the
next line. The rail is navigation, not another folder tab or a second hero.
Keep it aligned to the `1500px` workspace width and `32px` desktop gutters;
place the first dashboard panel about `18px` below it. Licensing uses the same outer
workspace width and starts its cover after `14px` of page padding. Its
Reports/Upload/Review controls remain attached to the manila cover, not to
the app bar. Full-screen mobile document dialogs begin below the visible
header and consume only the remaining viewport height.

## Typography and density

| Role | Baseline | Reuse rule |
| --- | --- | --- |
| App/community identity | UI font, `29px/1.1` desktop and `26px` mobile, weight `650`, tracking `-.045em` | One compact identity; preserve the official Alamo Health Management logo |
| Client identity | Document font, `42px`, weight `600` | Keep the name prominent, wrap long names |
| Document headings | Commonly `21-29px`, weight `600`, tracking `-.025em` | Use consistent levels within the file |
| Primary figures | `27-39px` document font | Always attach units/context |
| Dense records | UI font, `13px/1.4` | Alignment and rules, not bolding every cell |
| Form input | UI font, `16px`, minimum height `44px` | Preserve on phones to avoid input zoom |

For new shared surfaces, target `16px` reading text, at least `12px` supporting
text, and `44px` control targets. These are reuse targets, not claims about
every current element: existing metadata sometimes runs `10-12px`, and chart
point targets are only `32px` high. Do not spread those smaller exceptions.

Use `8 / 12 / 16 / 24px` as a practical spacing rhythm. Paper insets can use
the source-specific values above. Prefer tabular numerals for comparable
counts. Use the existing icon library at consistent stroke/size; no unrelated
emoji, novelty fonts, or generated logos.

## Charts and records

- Source line: `2px`; ordinary points `7px` hollow; selected point `10px`
  filled with a `2px` white halo.
- Area opacity fades `.20` to `.025`; selected-period strip opacity `.055`.
- Grid: `.7px`, horizontal dash `2 2`; reference line `1px`, dash `5 4`.
- A single domain accent is enough. Use a labeled selected period and units;
  do not confuse partial-month counts with complete-month comparisons.
- Current chart colors differ slightly from covers: census overview
  `#174f81`, detail `#0d4f8d`; incidents overview `#9b3826`, detail `#a33d26`;
  MAR detail `#74134f`.
- Selecting a period/category should change the corresponding context and
  records, not just highlight a dot. Preserve accessible labels and keyboard
  point navigation. Do not label snapshot history as live transactions.
- In a community overview, attach the latest figure to its chart or record
  list. Do not put a second row of KPI cards above sections that already show
  those same figures. Give each section one direct link to its deeper view.
- Searchable registers need explicit result counts, coverage, filters, and
  bounded pagination. Distinguish no records from no filter matches and from
  source failure. Never fabricate zero while loading.

## Interaction belongs to the reusable pattern

- A folder can open from a Pipeline card, notification, search result, or
  dashboard. Preserve the host's selected board/stage, filters, period, scroll
  position, and focus on return.
- Do not put every drilldown in the same modal. The baseline uses inline MAR
  and incident workspaces; census history and client files use dialogs.
  Use a dialog only for a bounded contextual task; avoid nested modal chains.
- Actual tabs use `tablist` / `tab` / `tabpanel`, `aria-selected`, associated
  IDs, one tab stop, and Arrow/Home/End navigation. Scroll only the tab strip
  to reveal its selected item. Tab activation must not lose draft work.
- Decorative tabs and badges are not interactive roles. A status badge must
  not look like an available navigation action.
- Pipeline keeps its existing stage transitions, editing, ownership, and
  document actions. A read-only scoped dashboard can reuse the shell without
  gaining those permissions. Never make a card-opening button contain another
  button; keep move/overflow actions separate and labeled.
- New-client notification eligibility comes from the admissions source.
  Reading a folder alone does not clear the notification or admit the client.
- Licensing keeps the original scan separate from editable extracted fields.
  Received, awaiting extraction, needs review, saved, and filed are distinct.
  Do not imply OCR or mailbox processing is enabled merely from the UI design.
- Retain dirty fields across internal tabs. Guard leaving/replacing edited
  work; serialize saves and replacements; keep save confirmation visible.
  The current implementation does **not** guard browser Back: fix that when
  extracting navigation protection rather than documenting it as complete.
- Return focus after close, clear, pagination, section jumps, and batch
  completion. Disabled/busy actions need a visible reason or progress state.

## Responsive behavior

| Available space | Required adaptation |
| --- | --- |
| Wide desktop | Open folder facts + task modules + history rail. Bound documents can use chart/context columns. |
| Below `1200px` | Baseline folder becomes two columns with history below; MAR rings disappear. |
| Up to `1023px` | Licensing community/form context stacks above the tabs; review header separates the close control from file identity and actions. |
| Below `960px` | Chart and context panels stack where needed. Recalculate fold position or remove it. |
| Below `768px` | Licensing/register rows become stacked records. Hide tilted upload-document decoration. |
| Below `640px` | Single reading column; no fold/spine hardware in the content flow; Community document dialogs fill the viewport below the `99px` app header. LIC 624 metadata uses three label/value rows, full-width filenames, and a separate upper-right close control. |
| Chart container at/below `440px` | Reduce visible tick/point labels, not the data series; retain selected/focused values. |
| Up to `420px` | Licensing tabs keep at least `14px` labels and hide only decorative icons. Upload-queue filenames span the row; status and actions sit underneath. |

These thresholds reflect the owning sources, not one normalized global
breakpoint system: LIC 624 also has `1023px` and Licensing has `420px` rules.
Use available content width when adapting to a different host.

Keep `min-width: 0` on grid/flex children and wrap long identities/filenames.
Use local horizontal scrolling only for genuinely wide tables or tab strips.
Tables keep a sticky identifying column and a labeled scroll region; show a
scroll hint only when overflow exists. Do not let the page itself scroll
sideways or silently clip columns. Account for the app header and safe-area
insets around sticky actions. Respect reduced-motion preferences.

## Applying it elsewhere

1. Read the host's agent map and identify its existing data/actions. This
   reference authorizes no cross-product runtime coupling.
2. Extract presentation pieces: cover, tabs, paper, file header, ruled rows,
   document sections, history rail. Prefer the real source over generated
   mockup text or the appearance of an older deployment.
3. Preserve folder construction only for actual files. Use manila for client
   and Licensing files. Use flat, domain-colored panels for overview data.
4. Supply host-owned content and callbacks. Hide unavailable modules instead
   of filling empty columns with invented metrics, decorative copy, or false
   completion states.
5. Compare the rendered result to the supplied folder reference: shoulder
   shape, selected-tab join, paper offset, serif/sans hierarchy, edge color,
   shadow softness, and content alignment. Verify actual screenshots, not
   only CSS values or a successful build.

Acceptance checks:

- The official Alamo Health Management logo stays intact and visible in the top bar at every width; surrounding navigation remains compact and reachable.
- A client or report folder looks like a folder before any icon or label is read;
  overview cards do not look like files.
- Selected tab meets the paper with no double border or floating gap.
- Licensing exposes Reports / Upload / Review with matching accessible names;
  Review exists only with an open report. Community context never resembles
  another tab.
- Tab controls have a `4px` gap and neighboring label text has at least `16px`
  separation. Phone labels remain at least `14px`, including at `320px`.
- Seams, shadows, grain, and tab shoulders do not obscure content or focus.
- No giant introduction, repeated subtitles, mint wash, or floating stat strip.
- No invented data, stale-date claims, hidden source errors, or false zeroes.
- Text remains crisp under zoom and print; no screenshot-as-interface.
- Keyboard opening, tab selection, closing, and focus return work.
- Dirty forms, busy saves, long names, empty results, and failed sources work.
- Phone review metadata keeps `12px` labels and `13px` values; full-width
  filenames, separate close controls, and `44px` action targets do not crowd
  one another.
- Check `320`, `390`, `768`, and `1440px`, plus a narrow/short zoom-equivalent
  viewport. Check intrinsic element overflow, not only document scroll width.
- Run the owning application's relevant verification; record any unresolved
  baseline failure instead of treating visual similarity as release proof.

## Visual reference location

The supplied generated images are visual targets only; their residents,
dates, medication names, counts, and workflow facts are illustrative.
Do not copy those values into production.

Original folder reference supplied in this conversation:
`/Users/eric/.codex/generated_images/01a068b2-775b-7e81-8e80-b83942654b5b/exec-a525a8d1-63ab-4e91-84a7-c68a40fb4434.png`.

Companion census, incident, and MAR material references in that same directory:
`exec-60dc869d-d24d-49fb-9260-589c9fee3724.png`,
`exec-839fb439-bf33-4a68-a0d3-37513dd93811.png`, and
`exec-484a2d32-e17e-435d-97f3-d46d1d1148cb.png`.
These local images may not exist on another machine; the source anchors,
geometry, and token values above are the portable implementation reference.
