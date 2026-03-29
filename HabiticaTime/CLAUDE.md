# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

HabiticaTime is a **Violentmonkey userscript** that enhances [Habitica](https://habitica.com/) with time-tracking features. It injects a FullCalendar-based day view alongside the Habitica dailies column, parses task note durations (e.g. `30m`, `15fm`), and displays time calculations. Built with **SolidJS** for reactive UI and the **@violentmonkey** ecosystem for userscript integration.

## Commands

```bash
# Watch mode (compile on save, outputs dist/awesome-script.user.js)
yarn dev

# Production build (lint + clean + build)
yarn build

# Lint (ESLint + Prettier check)
yarn lint

# Auto-fix lint issues
yarn lint:fix

# Open built script in Firefox for installation
yarn open
```

## Architecture

**Single entry point**: `src/awesome-script/index.ts` → imports `meta.js` (userscript header) and `app.tsx` (main logic).

**app.tsx** — Orchestrates everything via `@violentmonkey/dom`'s `observe()` to wait for Habitica's DOM elements, then:
- Injects a calendar column next to dailies using FullCalendar (`utils/calendar.ts`)
- Injects a `TimeCalc` component showing current time + remaining task time
- Injects `TaskTools` (enable/disable/skip dailies) and `TaskHighlighter` (highlight tasks with `%` in notes)
- Registers keyboard shortcuts via `@violentmonkey/shortcut` (`ctrl-space`, `ctrl-shift-space`, `ctrl-shift-s`, `ctrl-alt-e`, `ctrl-alt-h`)

**Key modules**:
- `utils/habitica.ts` — Parses Habitica DOM: reads task colors, titles, notes, and duration notation (`30m` = 30 min, `15fm` = 15 "full" min, `pt=9:30am` = preferred time, `pto=+10m` = preferred time offset). Interacts with Habitica's Vue.js inputs to modify tasks.
- `utils/calendar.ts` — Creates and configures the FullCalendar instance with zoom (ctrl+scroll/+/-), custom scroll management, drag-and-drop events, shift-click selection, right-click delete, middle-click pin cycling.
- `utils/events.ts` — Event creation with unique IDs, batched property setters to minimize FullCalendar re-renders. Defines `PinType` and `cyclePinType` for pin state management.
- `utils/reschedule.ts` — Catchup (reschedule events around NOW) and squeeze (pull next event group adjacent to current). Respects pin types when rescheduling.
- `utils/selection.ts` — Rectangle-based multi-select with auto-scroll.
- `global.ts` — Shared state (calendar instance, zoom levels, color palette, ghost pin opacity).
- `timeCalc.tsx` — Displays `Current + Task = End + Full = Full End` time calculation bar.
- `taskTools.tsx` — Toggle buttons to bulk enable/disable/skip dailies by manipulating Habitica's "Repeat Every" field.
- `taskHighlighter.tsx` — Highlights tasks containing `%` in notes; shows count in a floating panel.

## Build System

- **Rollup** with `@gera2ld/plaid-rollup` for bundling, `rollup-plugin-userscript` for metadata injection
- **Babel** with `babel-preset-solid` for SolidJS JSX compilation
- **UnoCSS** for utility CSS (PostCSS plugin)
- **TypeScript** with `jsx: "preserve"` and `jsxImportSource: "solid-js"`
- External deps (`solid-js`, `@violentmonkey/dom`, `@violentmonkey/ui`) are loaded at runtime via `@require` CDN URLs in `meta.js`
- Output: single IIFE file at `dist/awesome-script.user.js`

## Development Workflow

1. Run `yarn dev` for watch mode
2. Install the built `dist/awesome-script.user.js` in Violentmonkey (use `yarn open` for first install)
3. Violentmonkey auto-reloads the script when the file changes
4. Habitica page must be open at `https://habitica.com/` to test

## Task Duration Notation

Tasks use a specific notation in Habitica task notes that the script parses:
- `30m` — 30 minutes duration
- `15fm` — 15 "full minutes" (shown in green-tinted color)
- `pt=9:30am` — preferred start time
- `pto=+10m` — preferred time offset from previous task
- `%` — marks task for highlighting (taskHighlighter)

A task cannot have both `pt` and `pto`.

## Event Interactions

- **Left click** — Toggle finished state
- **Right click** — Delete event (with confirmation)
- **Middle click** — Cycle pin type: unpinned → solid (`📌`) → ghost (`👻📌`) → unpinned
- **Shift+click drag** — Rectangle multi-select
- **Ctrl+scroll / Ctrl+`+`/`-`** — Zoom

## Pins

Events can be pinned to prevent catchup/reschedule from moving them. Pin state is stored in `extendedProps.pinType` and persists via localStorage.

- **Solid pin** (`📌`): Event stays in place. Catchup packs other events around it without overlapping.
- **Ghost pin** (`👻📌`): Event stays in place. Catchup completely ignores it (other events can overlap). Ghost pins render at reduced opacity (configurable via slider in "Show More" menu, stored in localStorage as `ghostOpacity`).

Pin cycling is handled by `cyclePinType()` in `utils/events.ts`. Visual styling uses FullCalendar's `eventClassNames` callback (adds `.ghost-pin` class) with a `--ghost-opacity` CSS variable on the calendar element.

## Catchup & Squeeze

**Catchup** (`rescheduleEvents` in `utils/reschedule.ts`):
- Packs unfinished events forward from NOW, finished events backward from NOW
- Respects solid pins as obstacles (events route around them), ignores ghost pins entirely
- Finished event handling is configurable: don't move / move / move + cascade (setting in "Show More" menu)
- Keyboard shortcut: `ctrl-shift-space`

**Squeeze** (`squeezeEvents` in `utils/reschedule.ts`):
- Finds the "NOW-group" — the continuous group of events touching NOW (gaps <5m treated as continuous via `buildSoftClusters`)
- Pulls the next group after the NOW-group to be adjacent (closing the gap)
- If no NOW-group exists, pulls the first future group to start at NOW
- One group per press (incremental)
- Keyboard shortcut: `ctrl-shift-s`
