# DESIGN.md — Product & UI Direction

Read this before any UI work. It applies to every screen, component, and piece
of visible copy.

## How to use this file

- Feature scope comes from [`PLAN.md`](PLAN.md). Visual and copy decisions come
  from this file. If they conflict, or something here is ambiguous for the task
  at hand, ask instead of guessing.
- This file overrides generic aesthetic defaults, including any
  frontend/design skill guidance that pushes toward bold or maximal treatments.
- Sections 2 (Identity) and 3 (Tokens) are filled in. The tokens live in code in
  [`css/tokens.css`](css/tokens.css), and that file is the source of truth. If a
  value you need doesn't exist, add it there and to the table below, then ask
  the owner if it changes the look. Do not improvise a visual identity.

## 1. Priorities

Clarity > usability > hierarchy > breathing room > consistency > personality >
decoration.

Design the product, not the screenshot. If something looks impressive but makes
the interface harder to understand, remove it. If something makes a screenshot
plainer but the product easier to use, keep it.

The app should feel like a designer made deliberate decisions, including about
what to leave out.

- **Target feel:** intentional, quiet, spacious, warm, clear, slightly playful,
  visually distinctive, comfortable to use every day.
- **Not:** generic SaaS, AI-generated, dashboard-heavy, social-feed-like,
  over-carded, over-rounded, over-explained, motivational-poster-like, cute for
  its own sake.

Bonsai *is* a feed, but it should read like the contents page of a good
magazine, not a social timeline. It has no like counts, no avatars, no
engagement numbers, and no metadata rows.

## 2. Identity

- **What the app is:** a phone-first reading feed for curiosity. Short cards
  from journals, essays, newsletters and podcasts open into the full piece.
  Your own books appear in the feed as 15-minute reading sessions. Quotes you
  save come back later as throwbacks. A finished session is logged to Side
  Quest as a focus session.
- **Visual world:** a small bonsai. It's quiet and hand-placed, like a shelf
  with one plant on it. The motifs are the bonsai tree, an ensō (hand-drawn
  circle) used as the session timer, and a leaf used for saving. No pixel art;
  this app shares nothing visually with Side Quest.
- **Where personality lives:**
  - **Bonsai tab:** the one illustration. The tree is drawn from your real
    activity: the trunk and crown grow with everything you do, and each topic
    grows its own branch once you read in it. Moss, a stone, blossoms and a
    top layer arrive at later stages (Seed → Old tree, 7 stages).
  - **Session timer:** the ensō ring, and a full ensō on the "Session complete"
    screen.
  - **Header:** the small tree mark and the italic serif "bonsai" wordmark.
  - **Everything else stays plain:** feed, article, library, settings.
- **Palette mood:** paper and plants. Cream paper, sand and beige, sage green,
  a nude clay pot, and warm brown ink instead of black. Low contrast between
  surfaces and high contrast for text.
- **Type personality:** literary but modern. Newsreader, a serif built for
  screen reading, carries titles and all reading text. Karla, a slightly
  quirky grotesque, carries labels and controls.
- **Product vocabulary** (real features, used as-is):
  - **Feed**: the main scroll.
  - **Library**: your books and sources.
  - **Collections**: your Reading list, your Bookmarks (in Folders), your
    Quotes and your Notes (every note you wrote under an article).
  - **Reading list**: articles to finish later. They come back in the feed
    until you remove them at the end of the article.
  - **Bookmark** / **Folder**: articles kept to find again.
  - **Bonsai** (the tab): your tree, which grows as you use the app.
  - **Notes**: your own comments under an article.
  - **Reactions**: Learned something, Made me think, Loved it, Grounding,
    More like this. These are drawn glyphs, not emoji.
  - **Session**: a timed reading session of 5, 15 or 25 min. It only counts if
    you finish it.
  - **Free read**: reading with no timer. All the active time counts.
  - **Throwback**: a saved quote shown again in the feed.
  - **Topic**: Mental health (clinical research and clinicians on symptoms and
    care), Psychology (how minds work), Self-help (practical tips), Health,
    Science, History, Queer history, Trans health, Tech & society, Tao, News,
    Nearby.
  - **Today's brief**: the once-a-day card of five news stories, one of them
    good news. News stays out of the main feed unless switched on in Settings.
  - **Video** / **Short**: YouTube posts, played in the app. Shorts play right
    in the feed (Settings → Autoplay Shorts), muted until you turn the sound
    on.
  - **Tags**: a post's labels, what it's about (a source's `tags` in
    sources.json, else its topic) then what it is: Article, Video, Short or
    Podcast. The same article from two feeds is one post with both feeds' tags.
  - **Refresh**: new posts come in only when you ask. Pull down at the top for
    a new order (new posts first), or tap Refresh at the end to add them below.
    Otherwise the feed keeps its order and your place. Each topic tab keeps
    its own order and place (a pull refreshes only the tab you're on); read,
    hidden and saved state is shared by all tabs.
  - **Hidden post**: a post you hid, collapsed to one line with **Show**.
  - The **Reading list** tab in the feed is the reading list as its own feed.
  - **Source**: a journal, newsletter, podcast or site.
  - **Side Quest**: the companion app sessions are logged to.

  Everything else uses plain UI terms. On the Bonsai tab, "grows" and
  "branch" are literal descriptions of the drawing, so they're allowed there.
  Elsewhere, don't use garden, leaf, tend, grow or prune in copy.

Personality comes from this world: illustration, color, the ensō, and motion.
It does not come from generic UI decoration or from copy describing the mood.

## 3. Tokens

Source of truth: `css/tokens.css`. Use only these values.

**Spacing:** `--s-1` … `--s-8` = 4, 8, 12, 16, 24, 32, 48, 64 px. Space within
a group is 8–16. Space between major sections is 48 or more. Feed entries are
32 apart.

**Type scale:**

| Token | Size / line-height | Use |
|---|---|---|
| `--t-sm` | 14 / 1.4 | Meta lines, captions, nav labels (the smallest size) |
| `--t-md` | 16 / 1.5 | UI body, buttons, inputs |
| `--t-lg` | 18 / 1.5 | Feed excerpts, quotes |
| `--t-xl` | 20 / 1.65 | Article and book reading text |
| `--t-2xl` | 24 / 1.25 | Entry titles, section titles |
| `--t-3xl` | 32 / 1.2 | Screen titles, article titles (desktop), "Session complete" |

No readable text under 14px. Inputs are 16px.

**Fonts:** `--font-read` is Newsreader (titles, reading, quotes).
`--font-ui` is Karla (everything else). There are no other faces.

**Radii:**
- `--r-sm`: 6 (inputs, buttons, tabs, focus rings)
- `--r-md`: 12 (the few containers: book card, throwback, bars)
- `--r-full`: round things only (the switch knob, the timer)

**Shadows:**
- `--shadow-1`: the floating "Save quote" bar
- `--shadow-2`: toasts

Nothing else has a shadow.

**Colors:**

| Token | Hex | Role |
|---|---|---|
| `--bg` | `#F5F0E7` | Page (cream) |
| `--surface` | `#FBF8F2` | Reading surface, inputs |
| `--surface-warm` | `#EADFCF` | Book card (sand) |
| `--surface-cool` | `#E4E8DA` | Resurfacing cards (throwback, reading list), text highlight (sage-soft) |
| `--text` | `#332D27` | Primary text |
| `--text-2` | `#6A5F54` | Secondary text (5.5:1 on bg) |
| `--accent` | `#56654A` | The one accent (sage-deep): primary buttons, links, selected tab |
| `--accent-ink` | `#F5F0E7` | Text on the accent |
| `--line` | `#E3D9CA` | Hairlines, input borders at rest |
| `--line-strong` | `#938370` | Input borders, the off state of a switch (3.2:1 UI boundary) |
| `--success` | `#4A6340` | Success text |
| `--warning` | `#85550F` | Warning text |
| `--danger` | `#A23B2A` | Destructive actions, errors |

**Dark theme** (`:root[data-theme="dark"]` in tokens.css): warm charcoal with
a light sage accent. It uses the same token names, so components never branch on
the theme. Settings → Appearance offers Match phone, Light or Dark, and articles and books
have a one-tap theme button beside Aa (a sun in light, a moon in dark). The choice
is stored per device and applied before first paint by the inline script in
`index.html`.

| Token | Dark hex | Contrast on `--bg` |
|---|---|---|
| `--bg` | `#1D1A17` | |
| `--surface` | `#25211D` | |
| `--surface-warm` | `#342D26` | |
| `--surface-cool` | `#262C23` | |
| `--text` | `#ECE5D8` | 13.8:1 |
| `--text-2` | `#B2A796` | 7.3:1 |
| `--accent` | `#A7BA8C` | 8.3:1 (dark `--accent-ink` on it: 8.3:1) |
| `--line` / `--line-strong` | `#38322B` / `#7C7061` | line-strong 3.6:1 |
| `--success` / `--warning` / `--danger` | `#A7C48F` / `#E2B46E` / `#EE9480` | ≥ 7.5:1 |

Dark illustration colors: sage `#6F8159`, clay `#A8836B`, clay-dark `#8C6B55`,
bark `#9A8069`, beige `#4A4239`. Any new color token needs a dark value too.

Illustration-only colors (never for text or UI state): `--sage` `#A3B18A`,
`--clay` `#CFAE96`, `--clay-dark` `#B8927A`, `--bark` `#6E5A47`, `--beige`
`#D8C6AE`.

Use the accent sparingly: one primary button per screen, links, the selected
tab and focus rings.

**Control height:** `--control` 44px for all tap targets. Primary buttons are
`--control-lg` 48px.

**Motion:** `--dur-1` 120ms (press and hover feedback), `--dur-2` 200ms (state
changes, toasts), `--dur-3` 350ms (screen transitions, timer fill).
`--ease` is `cubic-bezier(.2,.7,.2,1)`, and `--ease-in-out` is
`cubic-bezier(.4,0,.2,1)`.

Consistency should create rhythm, not sameness. Vary scale and placement, not
token values.

## 4. Copy

Use ordinary UI language. Every visible sentence must help the user understand,
decide, or act. Otherwise cut it.

- Use standard terms: Save, Delete, Cancel, Settings, Add book, Start session,
  Open original, Refresh.
- Empty states state the fact and offer the action: "No books yet" plus an
  "Add book" button. No encouragement.
- Numbers and durations stay plain: "15 min", "Ch. 11 of 81", "2 h ago".
- Don't narrate the vibe. Avoid these words unless the product vocabulary in
  Section 2 lists them:
  - cozy, journey, moment, sanctuary, ritual, magic, vibes, intention,
    wellness, adventure, tend, grow, bloom, nourish
  - "level up", "you've got this", "tiny wins", "gentle reminder", "make space
    for what matters"
- No motivational, therapeutic, pseudo-poetic, corporate, or startup-marketing
  tone. No exclamation points.
- Don't rename ordinary features to sound branded: "Settings", not "Customize
  your experience".

## 5. Layout

- **Hierarchy:** one obvious primary action per screen. Secondary actions are
  restrained. Tertiary controls are quiet or hidden until needed. If everything
  is emphasized, nothing is.
- **Containers:** a container needs a reason. Bonsai uses exactly three:
  - The book card, a different kind of thing with its own action.
  - Resurfacing cards, on the soft sage (`--surface-cool`): the throwback
    (your own words) and the reading-list card (your own queue coming back
    around).
  - Today's brief (outlined, on paper): a daily digest, not a post.
  - Floating layers: Save quote bar, toasts, the Aa popover, bottom sheets,
    the Recently opened drawer, the long-press preview + action menu, the
    movable jump button (round is fine: it's a genuinely round control), the
    pull-to-refresh arrow (round, only while pulling), and the Short player
    over a Short in the feed with its round sound button.
  - The feed's topic row sticks under the top bar (a `--line` hairline once
    scrolled). Like Safari's bar, it slides away while you scroll down and
    comes back as soon as you scroll up.
  - Swipe actions: swiping a feed post left reveals two square buttons on its
    right edge, Reading list (glasses, `--accent`) and Hide (crossed-out eye,
    `--surface-warm`). They're icon-only because they repeat the long-press
    menu's labelled actions, and each has an accessible name.

  Posts in the feed are separated by a hairline (`--line`), not boxes. Opened
  posts get a quieter title plus the word "Opened" in the meta line. Holding a
  post never selects its text: the hold opens the preview instead. A post ends
  with one row of tags: small `--text-2` labels outlined in `--line-strong`,
  `--r-sm` corners, not buttons. An opened post shows the same row above its
  title. A video's length sits on its thumbnail's corner. Shorts are tall
  (9:16, at most 70% of the screen height) and centered in the column.
  A saved post shows small `--accent` marks at the end of its meta line, in
  the feed and above an opened post's title: glasses for the Reading list
  (the same glyph as the swipe button) and a filled bookmark.

  Articles sit directly on the page. No cards inside cards.
- **Empty space:** whitespace is intentional, so don't fill it with UI. If a
  screen feels empty, first ask whether the user actually needs more there.
  Usually they don't.
- **Spacious ≠ unfinished:** use composition and visual anchors so empty space
  reads as placed, not leftover.
- **Lists:** favor rhythm and spacing over separators. No feed-style rows packed
  with timestamps, counters, and metadata. A feed entry has at most one meta
  line (source · age) and one row of tags (the owner asked for them).
- **Structure:** a single reading column, 640px max. On phone the nav sits at
  the bottom; on desktop it sits in the top bar. No sidebars, competing columns
  or dashboard grids.
- **Tabs remember:** like tabs in iPhone apps, each nav tab keeps where you
  were in it. A post or book belongs to the tab it was opened from (that tab
  stays marked), switching tabs and back returns to it, and Back goes back
  within the tab. Tapping the tab you're in goes to its own screen, then to
  the top.
- **Start from the task:** ask "what is the user trying to do here?", not "what
  cards should this page have?".

## 6. Visual

Don't default to any of these:

- gradients, gradient text, or purple/blue "AI" palettes
- glassmorphism, blur, big soft shadows, glow, or sparkles
- pill-shaped everything or badge spam
- an icon on every label, or emoji in the UI
- 3-card grids or oversized hero headers

Use icons only when they read faster than text or have an established meaning.
In Bonsai that's back, the bottom-nav icons (always paired with labels), delete,
play, and the saved marks (with hidden text for screen readers).

This is not a ban on cards, rounded corners, color, illustration, or
decoration. It's a ban on using them without a reason. Don't overcorrect into
sterile, flat, or monochrome. A few strong visual ideas beat dozens of small
ones. Bonsai's strong ideas are the serif reading type on cream, the sage
accent, the tree, and the ensō.

## 7. Motion

Animate for a reason:

- state changes and feedback
- progress (the ensō timer)
- cause and effect (a saved quote's toast)
- transitions between meaningful states (session → complete)

Not: constant floating, pulsing, bouncing, ambient particles, heavy hover
effects, or anything that delays an action.

Autoplaying Shorts are the one exception to "no constant motion": the owner
asked for them, and they're a switch in Settings. When the phone asks for
reduced motion they start switched off.

Respect `prefers-reduced-motion` by reducing animation to simple fades or none.
The app must be fully usable if all animation is ignored.

## 8. Accessibility (non-negotiable)

- Text contrast of at least 4.5:1. Large text and UI boundaries need at least
  3:1.
- Visible focus states on everything interactive (`:focus-visible`, a 2px
  accent ring with a 2px offset).
- Touch targets of at least 44×44 px.
- Never convey state by color alone. The selected tab also gets an underline
  and `aria-pressed`, and a switch also shows a knob position.
- Use semantic HTML. Label every input and every icon-only button.

## 9. Responsive

Design mobile as its own layout, not a shrunk desktop:

- Stack content where it makes sense.
- Simplify secondary controls.
- Drop decoration before shrinking important content.

Check at 375px and around 1280px wide. No horizontal page scrolling. The topic
tabs may scroll horizontally inside their own row.

## 10. Workflow for every screen

**Before building**, write a short note in your response (3–5 lines, not in
code):

1. Primary user goal
2. What the eye should hit first
3. What stays quiet or hidden until needed
4. Which elements actually need containers

**After building**, review:

1. **Look at it.** Run `node test/ui.mjs`. It serves the app, loads fixture
   data, and saves screenshots at 375 and 1280 wide to `test/shots/`. Open
   them and judge the rendered result, not the code.
2. **Copy.** Read every visible string against Section 4. Replace anything that
   isn't the shortest accurate wording.
3. **Removal pass.** Actively look for elements to remove or quiet. If roughly
   20% of the UI could go without losing function, remove it.
4. **Strip test.** Would the screen still be obvious with all decorative styling
   removed? If not, fix the structure before adding more styling.
5. **Report.** State what you cut and anything you weren't sure about.

## Final rule

Don't try to make the interface look "designed." Make good decisions and let
the result look designed.
