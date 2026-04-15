# Keyboard Event Management Design

## Overview

A vim-inspired modal system for selecting and moving calendar events using the keyboard.

## Modes

### Normal Mode (default)
No keyboard event management active. All existing shortcuts work as before. However, if events are selected (e.g. from a previous select mode session or ctrl+click), some keys are available:
- `m`/`s` — Enter move mode with the existing selection.
- `Escape` — Clear selection.

### Select Mode
Enter by pressing `v`. Focus highlights the event closest to NOW. Navigate and build a selection, then enter Move mode to reposition.

### Move Mode
Enter by pressing `m` (push/overlap mode) or `s` (swap/jump mode). Move the selected events with `j`/`k`.

## Mode Transitions

```
Normal --v--> Select --p--> Move (push)
                    \--m--> Move (overlap)
                    \--s--> Move (swap/jump)

Normal --p--> Move (push)      (only with existing selection)
Normal --m--> Move (overlap)   (only with existing selection)
Normal --s--> Move (swap)      (only with existing selection)

Select --Escape--> Normal  (keeps selection, clears focus + filter)
Select --c-------> Select  (clears selection, stays in select mode)
Move   --Escape--> Select  (keeps selection, stops moving)
Move   --v------> Select   (keeps selection, stops moving)
Move   --c------> Select   (clears selection + stops moving)
Move(push) --s--> Move(swap)      (switch sub-mode, keep selection)
Move(push) --m--> Move(overlap)   (switch sub-mode, keep selection)
Move(swap) --p--> Move(push)      (switch sub-mode, keep selection)
etc. (p/m/s freely switch between push/overlap/swap in move mode)
```

## Normal Mode

- `v` — Enter select mode.
- `p` — Enter push move mode (requires existing selection).
- `m` — Enter overlap move mode (requires existing selection).
- `s` — Enter swap/jump move mode (requires existing selection).
- `Escape` — Clear selection (if any events are selected).
- `Ctrl+click` on event — Toggle-select that event (does not enter select mode).

## Select Mode

### Entering
- `v` — Enter select mode. The event closest to NOW gets **focused** (visual ring, not selected).

### Navigation
- `j` — Move focus to the next event (chronologically later).
- `k` — Move focus to the previous event (chronologically earlier).
- `g` — Jump focus to the first event.
- `G` — Jump focus to the last event.
- Focus stops at boundaries (no wrap-around).
- Ghost-pinned and solid-pinned events are included in navigation.

### Event Filter
While in select mode, press `f` then a second key to set the filter:

- `fa` — All events (default).
- `ff` — Only finished events.
- `fu` — Only unfinished events.

The filter affects `j`/`k`/`g`/`G` navigation — filtered-out events are skipped. The current filter is shown in the mode indicator (e.g. `-- SELECT (unfinished) --`).

If the currently focused event becomes filtered out, focus moves to the nearest visible event in the forward direction (or backward if at the end).

Selected events that become filtered out **stay selected** — the filter only affects navigation, not the selection itself.

### Selecting
- `Space` or `Enter` — Toggle-select the focused event (additive, like ctrl-click).
- `Shift+j` / `Shift+k` — Extend selection range from the first selected event through the focused event (spreadsheet-style range select).

### Clearing Selection
- `c` — Clear selection (deselect all). Stays in select mode with focus preserved.

### Deleting
- `d` or `Delete` — Delete selected events (with confirmation prompt). If nothing is selected, selects the focused event first then deletes.

### Entering Move Mode
- `p` — Enter push move mode. If nothing is selected, selects the focused event first.
- `m` — Enter overlap move mode. If nothing is selected, selects the focused event first.
- `s` — Enter swap/jump move mode. If nothing is selected, selects the focused event first.

### Mouse Integration (works in any mode)
- `Ctrl+click` on event — Toggle-select that event (does not change mode).
- `Left click` on event (in select/move mode) — Focus and toggle-select the clicked event (same as navigating to it with `j`/`k` then pressing `Space`).
- Clicking empty calendar space — Clears selection and exits to normal mode.

Selection uses the same underlying selection logic as the existing rectangle-select (same `selected` extendedProp, same color treatment, same `selectEvents`/`deselectEvents` code paths).

### Exiting
- `Escape` — Clears focus and filter, returns to normal mode. **Selection is preserved** so you can re-enter select or move mode without re-selecting.

## Move Mode

### Entering
- `p` — Enter **push mode** (5-minute increments, pushes neighbors).
- `m` — Enter **overlap mode** (5-minute increments, moves through events freely).
- `s` — Enter **swap/jump mode** (event-length increments).

In all cases, if nothing is selected, the focused event is automatically selected first.

### Switching Sub-modes
- `p`/`m`/`s` freely switch between push/overlap/swap while in move mode.
Selection and position are preserved across switches.

### Pinned Events in Selection
Selected pinned events move with the group as if they were unpinned. This applies to both solid and ghost pins.

### Multi-select Grouping
When multiple events are selected, they move as a single block — as if it were one event spanning from the earliest start time to the latest end time. Internal spacing between selected events is preserved.

### Push Mode (`p`)

The selected group moves in 5-minute increments, pushing neighbors:

- `j` — Move group 5 minutes later (down).
- `k` — Move group 5 minutes earlier (up).

When the group contacts another event, that event gets pushed along in the same direction. Chain-pushes propagate (A pushes B pushes C).

**Pinned event behavior (for non-selected pinned events):**
- Solid-pinned events cannot be pushed. The moving group jumps to the other side of the pinned event.
- Ghost-pinned events are ignored entirely (group moves through them).

### Overlap Mode (`m`)

The selected group moves in 5-minute increments, overlapping freely:

- `j` — Move group 5 minutes later (down).
- `k` — Move group 5 minutes earlier (up).

The group moves through other events without pushing them.

### Swap/Jump Mode (`s`)

The selected group moves in event-length steps:

- `j` — Move group toward the next event (later).
- `k` — Move group toward the previous event (earlier).

**Behavior depends on the gap to the neighbor in the direction of movement:**

1. **Gap >= 5 minutes** — **Jump**: The group moves to close the gap, ending adjacent to the neighbor.
   ```
   Before:  [A]·····[B]     (gap >= 5m)
   After:   ········[A][B]  (A jumped to be adjacent to B)
   ```

2. **Gap < 5 minutes (touching or near-touching)** — **Swap**: The group and the neighbor swap positions.
   ```
   Before:  [A][B]
   After:   [B][A]   (B starts at A's original start, A starts right after B)
   ```

**Pinned event behavior (for non-selected pinned events):**
- Solid-pinned events cannot be swapped. Jump skips over them to the next non-pinned event.
- Ghost-pinned events are ignored (invisible to jump/swap logic).

### Clearing Selection
- `c` — Clear selection and return to select mode.

### Exiting
- `Escape` — Return to select mode (selection preserved, can re-enter move mode or modify selection).
- `v` — Same as Escape (return to select mode).

## Visual Indicators

### Focused Event (Select Mode)
CSS class `focused-event` applied via `eventClassNames`. Rendered as an outline ring around the event:
```css
.focused-event {
    outline: 2px solid #4f2a93;
    outline-offset: -1px;
}
```

### Selected Events
Existing lightened-color treatment (already implemented for rectangle select). The `selected` extendedProp is set to `true`.

### Mode Indicator
Overlay positioned at the top-left of the calendar, above the calendar wrapper and below the "Calendar" heading + button row. White text on dark semi-transparent background. Shows current mode:
- `-- SELECT --` (filter: all)
- `-- SELECT (unfinished) --`
- `-- SELECT (finished) --`
- `-- MOVE (push) --`
- `-- MOVE (overlap) --`
- `-- MOVE (swap) --`

Hidden in normal mode. Does not cause layout shift (absolutely positioned, pointer-events: none).

## Undo

All movement operations integrate with the existing undo/redo system (`ctrl-z` / `ctrl-shift-z`). Each `j`/`k` press in move mode is one undo step.

## Existing Shortcut Compatibility

These shortcuts are already registered and must not conflict:
- `ctrl-space` — Scroll to now
- `ctrl-shift-space` — Catchup
- `ctrl-shift-s` — Squeeze
- `ctrl-z` / `ctrl-shift-z` — Undo / Redo
- `ctrl-alt-e` — Task tools toggle
- `ctrl-alt-h` — Task highlighter toggle

The new keys (`v`, `p`, `m`/`o`, `s`, `c`, `j`, `k`, `g`, `G`, `fa`/`ff`/`fu`, `d`, `Delete`, `Space`, `Enter`, `Escape`, `Shift+j/k`) are all unmodified or lightly modified single keys, which are only active in their respective modes — no conflicts.

## Edge Cases

- **No events exist**: `v` does nothing.
- **Moving past calendar boundaries** (slotMinTime / slotMaxTime): Movement stops at the boundary.
- **Push chain hits boundary**: The push stops — events do not move past calendar edges.
- **Push chain hits pinned event**: Group jumps to other side of pin (same as direct contact with pin).
- **All visible events filtered out**: Focus clears, `j`/`k` do nothing. Changing filter or pressing `Escape` recovers.
- **Filter change while in move mode**: Not allowed — filter keys (`a`/`u`/`f`) only work in select mode. Exit to select mode first.
- **Actions with nothing selected**: `m`, `s`, `d`/`Delete` in select mode will auto-select the focused event first, then proceed.
