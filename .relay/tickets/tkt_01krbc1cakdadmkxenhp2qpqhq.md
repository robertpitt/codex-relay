---
schemaVersion: 1
id: tkt_01krbc1cakdadmkxenhp2qpqhq
title: Elevate Relay UI to Premium Modern Desktop App Standards
status: completed
position: 17000
priority: medium
labels: []
createdAt: '2026-05-11T11:16:27.603Z'
updatedAt: '2026-05-11T11:26:22.602Z'
codexThreadId: 019e16c1-0982-7592-a34f-6397c519e19e
runStatus: completed
lastRunId: run_01krbc2196ws658pksnyrjqngz
---
# Epic: Elevate Relay UI to Premium Modern Desktop App Standards

## Overview

Relay already has a strong functional foundation:
- Clean kanban workflow
- Mature dark-mode aesthetic
- Strong productivity-oriented layout
- Clear swimlane/task mental model
- Multi-project support
- Developer-focused workflows

However, compared to modern AI-native desktop applications such as:
- Codex Desktop
- T3Code

Relay currently feels:
- operational
- dense
- dashboard-oriented
- enterprise/admin-like

while the target experience should feel:
- calm
- focused
- atmospheric
- premium
- modern
- deeply intentional
- crafted for flow-state work

This epic focuses entirely on:
# visual refinement, interaction polish, spatial hierarchy, and modern desktop UX quality

NOT:
- new platform features
- backend changes
- workflow redesigns
- new capabilities

---

# Goal

Transform Relay from:
> “A powerful internal productivity dashboard”

into:
> “A premium AI-native desktop workspace for focused engineering execution”

---

# Core Design Direction

The modern desktop AI tooling aesthetic is built around:
- restraint
- atmosphere
- focus
- spaciousness
- low visual noise
- progressive disclosure
- intentional motion
- layered surfaces
- soft hierarchy

Relay should adopt these principles while preserving:
- kanban workflows
- swimlane-based task management
- multi-project operation
- agent/task orchestration

---

# Current Design Issues

## 1. Excessive Visual Density

### Current Problems
- Columns feel cramped
- Cards are tightly stacked
- Sidebar is visually heavy
- Too much metadata visible simultaneously
- Minimal breathing room
- Narrow gutters between regions

### Desired Outcome
Create a calmer and more spacious workspace with dramatically improved visual rhythm.

### Tasks
- Increase lane gutter spacing
- Increase vertical spacing between cards
- Increase card internal padding
- Increase sidebar breathing room
- Reduce simultaneous visible information density
- Add more whitespace across all layout regions

---

## 2. Overuse of Borders

### Current Problems
- Most surfaces use visible outlines
- UI feels fragmented into boxes
- Creates enterprise/admin-tool aesthetics
- Harsh visual separation

### Desired Outcome
Adopt layered surfaces and tonal separation instead of explicit borders.

### Tasks
- Remove most hard borders
- Replace borders with:
  - soft shadows
  - tonal elevation
  - translucency
  - subtle inner highlights
- Introduce layered surface hierarchy
- Use depth instead of outlines

### Visual Direction
Instead of:
```css
border: 1px solid #2A2A2A;
````

Use:

```css
background: rgba(255,255,255,0.03);
box-shadow:
  inset 0 1px 0 rgba(255,255,255,0.03),
  0 8px 30px rgba(0,0,0,0.25);
```

---

## 3. Aggressive Contrast Hierarchy

### Current Problems

Too many competing focal points:

* Bright active states
* Strong reds
* Heavy lane headers
* Bright cards
* Strong pills/tags
* High-contrast sections everywhere

### Desired Outcome

Create a quieter interface where attention is intentionally guided.

### Tasks

* Reduce brightness of sidebar
* Soften lane headers
* Lower contrast of cards
* Reduce visual prominence of metadata
* Reserve high contrast ONLY for:

  * active task
  * primary CTA
  * focused input
  * currently running agent

### Design Principle

> Most things should almost disappear until needed.

---

## 4. Typography Lacks Editorial Hierarchy

### Current Problems

* Too many semibold elements
* Flat typography hierarchy
* Similar font weights everywhere
* Descriptions feel compressed
* Metadata competes with titles

### Desired Outcome

Create sophisticated typography with stronger rhythm and hierarchy.

### Tasks

* Reduce global font weights
* Reserve semibold/bold for high-priority elements only
* Increase line-height globally
* Improve secondary/muted text styling
* Create clearer typography hierarchy

### Typography Targets

```css
Primary: rgba(255,255,255,0.92)
Secondary: rgba(255,255,255,0.58)
Muted: rgba(255,255,255,0.38)
```

---

## 5. Cards Feel Too Much Like Jira/Trello

### Current Problems

Cards expose:

* too many tags
* too much metadata
* overly long descriptions
* excessive visible status indicators

Result:

* noisy cards
* dashboard feeling
* reduced focus

### Desired Outcome

Create ambient, modern, AI-native task cards.

### Tasks

* Limit visible tags
* Truncate metadata
* Reduce description length
* Add progressive disclosure
* Expand details on hover/focus
* Simplify card structure

### Design Principle

Cards should:

* preview information
* not fully explain everything immediately

---

## 6. Sidebar Feels Heavy and Dominant

### Current Problems

* Sidebar occupies too much visual attention
* Active states are too strong
* Feels navigation-heavy
* Dense project list styling

### Desired Outcome

Create a softer, calmer, IDE-like navigation system.

### Tasks

* Reduce sidebar width
* Reduce visual contrast
* Soften active project styling
* Introduce translucent/ambient active states
* Improve icon/text balance
* Increase spacing between navigation groups

---

## 7. Swimlanes Feel Too Rigid

### Current Problems

* Swimlanes feel like hard containers
* Strong outlines create fragmentation
* Empty lanes feel unfinished

### Desired Outcome

Create softer atmospheric workspace regions.

### Tasks

* Reduce lane borders
* Introduce subtle tonal differentiation
* Add soft empty-state treatments
* Improve spatial continuity between lanes

---

## 8. Lack of Depth & Materiality

### Current Problems

UI feels visually flat.

### Desired Outcome

Introduce subtle material layering and atmospheric depth.

### Tasks

* Add layered surfaces
* Add subtle blur treatments
* Add depth shadows
* Add inner highlights
* Introduce mild gradients
* Improve elevation hierarchy

### Avoid

* neumorphism
* glossy UI
* exaggerated blur
* over-stylization

---

## 9. Color Palette Feels Too Binary

### Current Problems

Current palette:

* dark gray
* bright red

Feels:

* harsh
* simplistic
* less premium

### Desired Outcome

Adopt richer grayscale palettes with subtle chromatic undertones.

### Tasks

* Introduce blue-gray undertones
* Add subtle warm/cool surface variance
* Refine dark surfaces
* Improve tonal layering

### Suggested Palette Direction

```css
#0F1012
#131417
#17191D
#1B1E24
```

---

## 10. Missing Focused Workspace Feel

### Current Problems

Everything competes equally for attention.

### Desired Outcome

Create deep-work-oriented focus experiences.

### Tasks

* Add active-card focus mode
* Dim inactive areas
* Blur/de-emphasize background regions
* Expand focused tasks elegantly
* Improve workspace attention guidance

### Design Goal

The UI should feel:

> calm, immersive, and focus-preserving

---

## 11. Missing Motion System

### Current Problems

Interactions likely feel abrupt/static.

### Desired Outcome

Introduce intentional motion and transition systems.

### Tasks

* Add motion primitives
* Add smooth hover states
* Add spring animations
* Add lane/card transitions
* Improve drag-and-drop animations
* Add fade/elevation transitions
* Animate expansion/collapse states

### Timing Targets

* 120–180ms standard transitions
* Soft spring easing where appropriate

---

## 12. Top Bar Feels Too Administrative

### Current Problems

* Header consumes too much visual attention
* Workspace feels secondary to chrome/navigation

### Desired Outcome

Minimize chrome and maximize immersion.

### Tasks

* Reduce header height
* Reduce title dominance
* Simplify top navigation
* Blend header into workspace more naturally

---

## 13. Weak Empty States

### Current Problems

Empty swimlanes feel unfinished.

### Desired Outcome

Make empty states intentional and atmospheric.

### Tasks

* Add contextual empty-state messaging
* Add subtle visuals/illustrations
* Improve lane placeholders
* Add lightweight onboarding hints

---

## 14. Weak Surface Hierarchy

### Current Problems

Everything sits at nearly identical elevation.

### Desired Outcome

Establish strong layered visual hierarchy.

### Required Layers

* App background
* Workspace
* Swimlane
* Card
* Hovered card
* Focused card
* Overlay/modal

### Tasks

* Define elevation system
* Standardize shadow treatments
* Improve active/focus elevation states

---

## 15. Lack of Restraint

### Current Problems

UI exposes too much simultaneously.

### Desired Outcome

Adopt premium modern desktop restraint.

### Tasks

* Reduce visible metadata
* Hide secondary actions until hover/focus
* Reduce simultaneous visual stimuli
* Simplify card presentation
* Embrace progressive disclosure

### Design Principle

> Premium interfaces are defined more by what they hide than what they show.

---

# Motion & Interaction Design Requirements

## Global Requirements

* Smooth transitions
* Ambient hover states
* Soft focus transitions
* Elegant drag-and-drop motion
* Reduced abrupt state changes

## Key Interaction Areas

* Card hover
* Card drag
* Lane transitions
* Focus mode
* Sidebar selection
* Search interactions
* Empty-state transitions

---

# Visual Inspiration Direction

Relay should visually move closer toward:

* Codex Desktop
* T3Code
* Linear
* Arc Browser
* Raycast
* modern IDE-native productivity tools

while preserving:

* kanban workflows
* engineering productivity focus
* operational clarity

---

# Success Criteria

Relay should feel:

* calmer
* more spacious
* more premium
* more intentional
* less dashboard-like
* less enterprise-heavy
* more immersive
* more focused
* more modern
* more emotionally polished

Users should feel:

> “This is a beautifully crafted engineering workspace”

rather than:

> “This is an internal admin/productivity board”

---

# Priority Breakdown

## Tier 1 — Highest Impact

1. Reduce borders
2. Increase spacing
3. Reduce metadata clutter
4. Improve typography hierarchy
5. Soften contrast

---

## Tier 2 — Premium Feel

6. Add motion system
7. Improve surface layering
8. Introduce focus modes
9. Redesign sidebar hierarchy
10. Improve material depth

---

## Tier 3 — World-Class Polish

11. Ambient lighting
12. Intelligent empty states
13. Progressive disclosure patterns
14. Advanced focus transitions
15. Premium microinteractions

---

# Final Design Goal

Relay should evolve into:

> A premium AI-native desktop engineering workspace that feels calm, immersive, modern, and deeply intentional while preserving the power and clarity of kanban-based execution workflows.

## Codex Handoff

### 5/11/2026, 12:26:22 PM

**Summary**
- Refined the renderer toward a calmer premium desktop feel: blue-gray dark palette, softer typography, fewer hard borders, tonal elevation, wider board gutters, roomier cards, quieter sidebar, and layered modal/detail surfaces.
- Added card restraint/progressive disclosure: only urgent/high priority and non-idle run states show by default, labels are capped and revealed on hover/focus, excerpts clamp then expand, and drag handles stay hidden until needed.
- Added focus treatments: keyboard-focused cards dim surrounding cards, and detail/modal states de-emphasize the workspace/sidebar/status rail.
- Added contextual empty-lane messaging and motion primitives with reduced-motion support.

**Files Changed**
- [App.tsx](/Users/robertpitt/Projects/relay/src/renderer/src/App.tsx:103)
- [styles.css](/Users/robertpitt/Projects/relay/src/renderer/src/styles.css:1)

**Commands Run**
- Project inspection: `pwd`, `ls`, `find`, `sed`, `grep`, `git status --short`, `git diff`
- `rg` was attempted first but is not installed in this environment.
- Validation: `npm run typecheck`, `npm test`, `npm run build`, `git diff --check`

**Tests**
- `npm run typecheck`: passed
- `npm test`: passed, 36/36 tests
- `npm run build`: passed after final CSS changes

**Remaining Risks**
- I did not visually screenshot-review the running Electron app; the changes are type/test/build verified but should still get a quick manual visual pass.
- The worktree already had unrelated modified/untracked files before I started. I left those intact and only intentionally changed `App.tsx` and `styles.css`.
