# Design System — Swotta

## Product Context
- **What this is:** A student-centric academic operating system — mastery tracking, spaced repetition, AI study sessions, parent reporting
- **Who it's for:** UK secondary school students (14-18, GCSE/A-Level) and their parents/guardians
- **Space/industry:** Ed-tech, personal tutoring, revision tools
- **Project type:** Web app (dashboard + study session UI + parent view)
- **Peers:** Seneca Learning, Quizlet, Oak National Academy, Anki, Kahoot

## Aesthetic Direction
- **Direction:** Warm intellectual minimalism — Anthropic-inspired
- **Decoration level:** Intentional — subtle texture/grain on key surfaces, not flat/sterile
- **Mood:** Serious about learning, never sterile. Intellectually warm. Respects the student's intelligence. Quiet confidence with confident moments of colour. Feels like a thoughtful tool, not a gamified toy.
- **Key differentiator:** No UK ed-tech product uses this aesthetic. Competitors converge on bright saturated colours, geometric sans-serif, bubbly rounded everything. Swotta's warm cream + serif headlines + restrained palette immediately stands apart.

## Brand
- **Logo (wordmark):** "Swotta" in Instrument Serif, regular weight. Used in-app, on marketing, in emails.
- **Logo (mark):** Teal square with rounded corners, white italic serif "S". Used as favicon, app icon, small contexts only. Never placed next to the wordmark.
- **Mark colour:** Primary teal (#2D7A6E), white "S"
- **Mark border-radius:** 7px at 30px size (scales proportionally)

## Typography
- **Display/Hero:** Instrument Serif (regular + italic) — the signature move. No UK ed-tech uses a serif. Gives editorial intelligence and gravitas.
- **Body:** Instrument Sans (400, 500, 600, 700) — clean, readable, pairs naturally with Instrument Serif (same family).
- **UI/Labels:** Instrument Sans (same as body)
- **Data/Tables:** JetBrains Mono (tabular-nums for aligned numbers)
- **Code:** JetBrains Mono
- **Loading:** Google Fonts — `Instrument+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500` + `Instrument+Serif:ital@0;1` + `JetBrains+Mono:wght@400;500`
- **Scale:**
  - Display: 3.5rem (56px), line-height 1.1, letter-spacing -0.02em
  - H1: 2.5rem (40px), line-height 1.2, letter-spacing -0.01em
  - H2: 1.75rem (28px), line-height 1.3
  - H3: 1.125rem (18px), line-height 1.4, semibold, sans-serif
  - H4: 0.8125rem (13px), line-height 1.4, semibold, uppercase, letter-spacing 0.06em, sans-serif
  - Body large: 1.125rem (18px), line-height 1.7
  - Body: 1rem (16px), line-height 1.6
  - Body small: 0.875rem (14px), line-height 1.5
  - Caption: 0.75rem (12px), line-height 1.4
  - Mono: 0.875rem (14px)

## Color
- **Approach:** Restrained with confident moments. Two accent colours + neutrals. Colour earns its place — every use means something.
- **Three-state semantic system:** positive (teal), attention (coral), neutral (stone). Not four colours. Three states.

### Foundation
| Name | Hex | Usage |
|------|-----|-------|
| Canvas | #FAF6F0 | Page background — warm cream, lighter than most ed-tech |
| Paper | #FFFFFF | Elevated surfaces (cards, modals, inputs) |
| Stone | #F0ECE4 | Sunken surfaces, flat cards, disabled states |
| Ink | #1A1917 | Primary text, dark buttons |
| Graphite | #5C5950 | Secondary text |
| Pencil | #949085 | Tertiary text, captions, placeholders |

### Accent
| Name | Hex | Usage |
|------|-----|-------|
| Teal | #2D7A6E | Primary accent — progress, mastery, positive states, main CTAs |
| Teal Light | #E4F0ED | Tag/badge backgrounds, light highlights |
| Teal Surface | #D6EBE7 | Full-panel backgrounds (celebration screens) |
| Coral | #D4654A | Secondary accent — attention needed, review due, misconceptions |
| Coral Light | #FAEAE5 | Tag/badge backgrounds for attention states |
| Coral Surface | #F5D8CF | Full-panel backgrounds (milestone screens) |

### Semantic (three-state)
| State | Colour | When to use |
|-------|--------|-------------|
| Positive | Teal (#2D7A6E / #E4F0ED) | Mastered, on track, success, completed, correct |
| Attention | Coral (#D4654A / #FAEAE5) | Review due, misconception, struggling, overdue, incorrect |
| Neutral | Stone (#F0ECE4) + Graphite (#5C5950) | New topic, in progress, informational, general |

### Dark mode
| Name | Light | Dark |
|------|-------|------|
| Canvas | #FAF6F0 | #171614 |
| Paper | #FFFFFF | #222120 |
| Stone | #F0ECE4 | #111010 |
| Ink | #1A1917 | #F0ECE4 |
| Graphite | #5C5950 | #A09B90 |
| Pencil | #949085 | #6B665C |
| Teal | #2D7A6E | #4DAFA0 |
| Teal Light | #E4F0ED | #1A2E2A |
| Teal Surface | #D6EBE7 | #1E3530 |
| Coral | #D4654A | #E8836A |
| Coral Light | #FAEAE5 | #2E1E1A |
| Coral Surface | #F5D8CF | #3A2520 |
| Border | #E5E0D6 | #302E28 |
| Border Subtle | #EFEBE4 | #262420 |

## Spacing
- **Base unit:** 4px
- **Density:** Comfortable — generous whitespace signals quality and reduces cognitive load during study sessions
- **Scale:** 2xs(2) xs(4) sm(8) md(16) lg(24) xl(32) 2xl(48) 3xl(64)

## Layout
- **Approach:** Grid-disciplined for the app, slightly editorial for onboarding/marketing
- **Grid:** 12 columns at desktop, 4 at mobile
- **Max content width:** 1120px
- **Border radius:**
  - sm: 4px — tags, small inputs
  - md: 8px — buttons, inputs, alerts, queue items
  - lg: 12px — cards, panels, modals
  - full: 9999px — pills, badges, circular elements
- **Shadows:**
  - sm: `0 1px 3px rgba(26,25,23,0.05)` — subtle lift
  - md: `0 2px 8px rgba(26,25,23,0.08)` — card hover
  - lg: `0 8px 24px rgba(26,25,23,0.1)` — modals, popovers

## Motion
- **Approach:** Minimal-functional — only transitions that aid comprehension, nothing bouncy or gamified
- **Easing:** enter(ease-out) exit(ease-in) move(ease-in-out)
- **Duration:** micro(50-100ms) short(150-250ms) medium(250-400ms) long(400-700ms)
- **When to use:**
  - micro: hover states, toggles, checkbox
  - short: button press, input focus, card hover
  - medium: page transitions, panel open/close, sidebar
  - long: progress bar fills, celebration screens

## Big Colour Gestures
Inspired by Anthropic's full-width colour panels. Use sparingly for moments of significance:
- **Teal surface panel:** Session complete, mastery achieved, milestone celebrations
- **Coral surface panel:** Streak achievements, unlocks
- **Dark panel (Ink background):** Data-dense displays, "under the hood" views, footer

These create contrast and rhythm in an otherwise restrained interface. They should feel like a reward, not decoration.

## Alerts & Feedback
- **Style:** Left-border accent (3px) with tinted background. Not full-colour backgrounds.
- **Positive:** Teal border + teal-light background
- **Attention:** Coral border + coral-light background
- **Neutral:** Pencil border + stone background

## Illustration Direction (future)
- Abstract, organic/geometric line illustrations (Anthropic hand-node style)
- Thick confident strokes, single or two-colour
- Subjects: neural connections, growth patterns, knowledge graphs, learning metaphors
- NOT: stock illustrations, 3D characters, icon-in-circle grids
- NOT: AI slop patterns (purple gradients, generic hero sections, bubbly everything)

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-18 | Initial design system created | Anthropic-inspired warm intellectual minimalism. Differentiated from all UK ed-tech competitors. |
| 2026-03-18 | 3-state semantic system | Reduced from 4 colours to 3 (positive/attention/neutral). More cohesive, more intentional. |
| 2026-03-18 | Logo mark as favicon only | Mark + wordmark together is redundant. Clean wordmark in-app, teal "S" square as favicon. |
| 2026-03-18 | Instrument Serif for headlines | No UK ed-tech uses a serif. Immediately signals intellectual seriousness. |
