import { EventApi } from '@fullcalendar/core'
import {
    state,
    KeyboardMode,
    keyboardMode,
    setKeyboardMode,
    moveSubMode,
    setMoveSubMode,
    resizeEdge,
    setResizeEdge,
    eventFilter,
    setEventFilter,
    focusedEventId,
    setFocusedEventId,
    legendHidden,
    setLegendHidden
} from '../global'
import { selectEvents, deselectEvents, getSelectedEvents, refreshSelectedCount } from './selection'
import { isFinished, buildOverlapGroups, buildClusters } from './reschedule'
import { pushUndo, undo, redo } from './history'
import { parseTime } from './utils'

const EXIT_KEY = 'Backspace'

// --- Sorted event helpers ---

function getSortedEvents(): EventApi[] {
    if (!state.calendar) return []
    return state.calendar.getEvents().sort((a, b) => a.start.getTime() - b.start.getTime())
}

function getFilteredEvents(events: EventApi[]): EventApi[] {
    const filter = eventFilter()
    if (filter === 'all') return events
    if (filter === 'unfinished') return events.filter(e => !isFinished(e))
    return events.filter(e => isFinished(e))
}

// --- Focus management ---

function focusEvent(eventId: string | null): void {
    setFocusedEventId(eventId)
    if (state.calendar) state.calendar.render()
    if (eventId) {
        const el = document.querySelector(`[data-event-id="${eventId}"]`)
        el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
}

function findClosestEventToNow(events: EventApi[]): EventApi | null {
    if (events.length === 0) return null
    const now = Date.now()
    let closest = events[0]
    let closestDist = Math.abs(closest.start.getTime() - now)
    for (const event of events) {
        const dist = Math.abs(event.start.getTime() - now)
        if (dist < closestDist) {
            closest = event
            closestDist = dist
        }
    }
    return closest
}

function moveFocus(direction: 1 | -1): void {
    const sorted = getSortedEvents()
    const filtered = getFilteredEvents(sorted)
    if (filtered.length === 0) return

    const currentId = focusedEventId()
    const currentIndex = filtered.findIndex(e => e.id === currentId)

    let newIndex: number
    if (currentIndex === -1) {
        const closest = findClosestEventToNow(filtered)
        newIndex = closest ? filtered.indexOf(closest) : 0
    } else {
        newIndex = Math.max(0, Math.min(filtered.length - 1, currentIndex + direction))
    }

    focusEvent(filtered[newIndex].id)
}

function jumpFocus(position: 'first' | 'last'): void {
    const sorted = getSortedEvents()
    const filtered = getFilteredEvents(sorted)
    if (filtered.length === 0) return

    const event = position === 'first' ? filtered[0] : filtered[filtered.length - 1]
    focusEvent(event.id)
}

// --- Selection management ---

function toggleSelectFocused(): void {
    if (!state.calendar) return
    const id = focusedEventId()
    if (!id) return
    const event = state.calendar.getEventById(id)
    if (!event) return

    state.calendar.pauseRendering()
    if (event.extendedProps.selected) {
        deselectEvents([event])
    } else {
        selectEvents([event])
    }
    state.calendar.resumeRendering()
}

function selectAndMove(direction: 1 | -1): void {
    if (!state.calendar) return

    // Select current focused event
    const currentId = focusedEventId()
    if (currentId) {
        const current = state.calendar.getEventById(currentId)
        if (current && !current.extendedProps.selected) {
            selectEvents([current])
        }
    }

    // Move focus
    moveFocus(direction)

    // Select newly focused event
    const newId = focusedEventId()
    if (newId) {
        const newEvent = state.calendar.getEventById(newId)
        if (newEvent && !newEvent.extendedProps.selected) {
            selectEvents([newEvent])
        }
    }
}

export function handleCtrlClick(event: EventApi): void {
    if (!state.calendar) return
    state.calendar.pauseRendering()
    if (event.extendedProps.selected) {
        deselectEvents([event])
    } else {
        selectEvents([event])
    }
    state.calendar.resumeRendering()
}

export function handleSelectModeClick(event: EventApi): void {
    focusEvent(event.id)
    toggleSelectFocused()
}

function clearSelection(): void {
    if (!state.calendar) return
    const selected = getSelectedEvents()
    if (selected.length > 0) {
        state.calendar.pauseRendering()
        deselectEvents(selected)
        state.calendar.resumeRendering()
    }
}

export function clearSelectionAndFocus(): void {
    clearSelection()
    focusEvent(null)
    setEventFilter('all')
}

// --- Filter management ---

function handleFilterChange(filter: 'all' | 'unfinished' | 'finished'): void {
    setEventFilter(filter)
    const sorted = getSortedEvents()
    const filtered = getFilteredEvents(sorted)
    const currentId = focusedEventId()
    if (currentId && filtered.some(e => e.id === currentId)) return
    if (filtered.length === 0) {
        focusEvent(null)
    } else {
        const closest = findClosestEventToNow(filtered)
        focusEvent(closest ? closest.id : filtered[0].id)
    }
}

// --- Select around focused event ---

function toggleSelectGroup(buildFn: (events: EventApi[]) => EventApi[][]): void {
    if (!state.calendar) return
    const id = focusedEventId()
    if (!id) return
    const sorted = getSortedEvents()
    const groups = buildFn(sorted)
    const group = groups.find(g => g.some(e => e.id === id))
    if (!group) return

    const allSelected = group.every(e => e.extendedProps.selected)
    state.calendar.pauseRendering()
    if (allSelected) {
        deselectEvents(group)
    } else {
        const toSelect = group.filter(e => !e.extendedProps.selected)
        selectEvents(toSelect)
    }
    state.calendar.resumeRendering()
}

// --- Target events: selected if any, otherwise just the focused event ---

function getTargetEvents(): EventApi[] {
    const selected = getSelectedEvents()
    if (selected.length > 0) return selected
    if (!state.calendar) return []
    const id = focusedEventId()
    if (!id) return []
    const event = state.calendar.getEventById(id)
    return event ? [event] : []
}

// --- Snap to 5m grid ---

function snapToGrid(): void {
    if (!state.calendar) return
    const selected = getTargetEvents()

    const needsSnap = selected.some(e => e.start.getTime() % FIVE_MIN !== 0)
    if (!needsSnap) return

    pushUndo(state.calendar)
    state.calendar.pauseRendering()
    // Remove groupId so setDates doesn't move all grouped events by the same delta
    for (const event of selected) event.setProp('groupId', '')
    for (const event of selected) {
        const startMs = event.start.getTime()
        const duration = event.end.getTime() - startMs
        const snappedStart = Math.floor(startMs / FIVE_MIN) * FIVE_MIN
        event.setDates(new Date(snappedStart), new Date(snappedStart + duration))
    }
    for (const event of selected) event.setProp('groupId', 'selected')
    state.calendar.resumeRendering()
}

// --- Delete selected events ---

function deleteSelectedEvents(): void {
    if (!state.calendar) return
    const selected = getTargetEvents()
    if (selected.length === 0) return

    const names = selected.map(e => e.title).join(', ')
    const msg =
        selected.length === 1
            ? `Delete event "${selected[0].title}"?`
            : `Delete ${selected.length} events (${names})?`

    if (confirm(msg)) {
        pushUndo(state.calendar)
        for (const event of selected) {
            event.remove()
        }
        refreshSelectedCount()
    }
}

// --- Enter move mode (select focused if nothing selected) ---

function enterMoveMode(subMode: 'push' | 'swap' | 'overlap'): void {
    if (getTargetEvents().length === 0) return
    setKeyboardMode('move')
    setMoveSubMode(subMode)
}

function enterResizeMode(edge: 'start' | 'end'): void {
    if (getTargetEvents().length === 0) return
    setKeyboardMode('move')
    setMoveSubMode('resize')
    setResizeEdge(edge)
}

// --- Move helpers ---

const FIVE_MIN = 5 * 60 * 1000

function getSelectionBlock(): {
    events: EventApi[]
    blockStart: number
    blockEnd: number
} | null {
    const events = getTargetEvents().sort((a, b) => a.start.getTime() - b.start.getTime())
    if (events.length === 0) return null
    const blockStart = Math.min(...events.map(e => e.start.getTime()))
    const blockEnd = Math.max(...events.map(e => e.end.getTime()))
    return { events, blockStart, blockEnd }
}

function getCalendarBounds(): { minMs: number; maxMs: number } {
    const cal = state.calendar!
    const minStr = cal.getOption('slotMinTime').toString()
    const maxStr = cal.getOption('slotMaxTime').toString()
    const midnight = new Date()
    midnight.setHours(0, 0, 0, 0)
    const base = midnight.getTime()
    return { minMs: base + parseTime(minStr), maxMs: base + parseTime(maxStr) }
}

function shiftEvents(events: EventApi[], offsetMs: number): void {
    if (events.length === 0) return
    // All selected events share groupId 'selected', so moving one moves them all
    const first = events[0]
    first.setDates(
        new Date(first.start.getTime() + offsetMs),
        new Date(first.end.getTime() + offsetMs)
    )
}

// --- Push mode ---

function movePush(direction: 1 | -1, overlap: boolean): void {
    if (!state.calendar) return
    const block = getSelectionBlock()
    if (!block) return

    const calendar = state.calendar
    const offset = direction * FIVE_MIN
    const bounds = getCalendarBounds()

    const newBlockStart = block.blockStart + offset
    const newBlockEnd = block.blockEnd + offset

    if (newBlockStart < bounds.minMs || newBlockEnd > bounds.maxMs) return

    pushUndo(calendar)
    calendar.pauseRendering()

    if (overlap) {
        shiftEvents(block.events, offset)
        calendar.resumeRendering()
        return
    }

    const selectedIds = new Set(block.events.map(e => e.id))
    const others = getSortedEvents().filter(e => !selectedIds.has(e.id))

    const solidPinHit = others.find(e => {
        if (e.extendedProps.pinType !== 'solid') return false
        const eStart = e.start.getTime()
        const eEnd = e.end.getTime()
        return eStart < newBlockEnd && eEnd > newBlockStart
    })

    if (solidPinHit) {
        const blockDuration = block.blockEnd - block.blockStart
        let jumpStart: number
        if (direction === 1) {
            jumpStart = solidPinHit.end.getTime()
        } else {
            jumpStart = solidPinHit.start.getTime() - blockDuration
        }
        const jumpEnd = jumpStart + blockDuration
        if (jumpStart < bounds.minMs || jumpEnd > bounds.maxMs) {
            calendar.resumeRendering()
            undo(calendar)
            return
        }
        shiftEvents(block.events, jumpStart - block.blockStart)
        calendar.resumeRendering()
        return
    }

    shiftEvents(block.events, offset)

    const pushable = others.filter(e => e.extendedProps.pinType !== 'ghost')

    // Group overlapping events so they get pushed by the same amount
    const pushed = new Set<string>()

    if (direction === 1) {
        pushable.sort((a, b) => a.start.getTime() - b.start.getTime())
        let wavefront = newBlockEnd
        for (const event of pushable) {
            if (pushed.has(event.id)) continue
            const eStart = event.start.getTime()
            const eEnd = event.end.getTime()
            if (eStart < wavefront && eEnd > block.blockEnd) {
                if (event.extendedProps.pinType === 'solid') {
                    calendar.resumeRendering()
                    undo(calendar)
                    return
                }
                // Find all events overlapping with this one (same start or overlapping range)
                const group = pushable.filter(e => {
                    if (pushed.has(e.id) || e.id === event.id) return false
                    const s = e.start.getTime()
                    const en = e.end.getTime()
                    return s < eEnd && en > eStart
                })
                const pushAmount = wavefront - eStart
                // Push the event and its overlapping group by the same amount
                event.setDates(new Date(eStart + pushAmount), new Date(eEnd + pushAmount))
                pushed.add(event.id)
                if (eEnd + pushAmount > bounds.maxMs) {
                    calendar.resumeRendering()
                    undo(calendar)
                    return
                }
                for (const g of group) {
                    if (g.extendedProps.pinType === 'solid') {
                        calendar.resumeRendering()
                        undo(calendar)
                        return
                    }
                    const gs = g.start.getTime()
                    const ge = g.end.getTime()
                    const newEnd = ge + pushAmount
                    if (newEnd > bounds.maxMs) {
                        calendar.resumeRendering()
                        undo(calendar)
                        return
                    }
                    g.setDates(new Date(gs + pushAmount), new Date(newEnd))
                    pushed.add(g.id)
                }
                // Advance wavefront by trigger event's new end, not the overlap group's max
                wavefront = eEnd + pushAmount
            }
        }
    } else {
        pushable.sort((a, b) => b.end.getTime() - a.end.getTime())
        let wavefront = newBlockStart
        for (const event of pushable) {
            if (pushed.has(event.id)) continue
            const eStart = event.start.getTime()
            const eEnd = event.end.getTime()
            if (eEnd > wavefront && eStart < block.blockStart) {
                if (event.extendedProps.pinType === 'solid') {
                    calendar.resumeRendering()
                    undo(calendar)
                    return
                }
                // Find all events overlapping with this one
                const group = pushable.filter(e => {
                    if (pushed.has(e.id) || e.id === event.id) return false
                    const s = e.start.getTime()
                    const en = e.end.getTime()
                    return s < eEnd && en > eStart
                })
                const pushAmount = eEnd - wavefront
                // Push the event and its overlapping group by the same amount
                event.setDates(new Date(eStart - pushAmount), new Date(eEnd - pushAmount))
                pushed.add(event.id)
                if (eStart - pushAmount < bounds.minMs) {
                    calendar.resumeRendering()
                    undo(calendar)
                    return
                }
                for (const g of group) {
                    if (g.extendedProps.pinType === 'solid') {
                        calendar.resumeRendering()
                        undo(calendar)
                        return
                    }
                    const gs = g.start.getTime()
                    const ge = g.end.getTime()
                    const newStart = gs - pushAmount
                    if (newStart < bounds.minMs) {
                        calendar.resumeRendering()
                        undo(calendar)
                        return
                    }
                    g.setDates(new Date(newStart), new Date(ge - pushAmount))
                    pushed.add(g.id)
                }
                // Advance wavefront by trigger event's new start, not the overlap group's min
                wavefront = eStart - pushAmount
            }
        }
    }

    calendar.resumeRendering()
}

// --- Swap/Jump mode ---

function moveSwap(direction: 1 | -1): void {
    if (!state.calendar) return
    const block = getSelectionBlock()
    if (!block) return

    const calendar = state.calendar
    const bounds = getCalendarBounds()
    const blockDuration = block.blockEnd - block.blockStart

    const selectedIds = new Set(block.events.map(e => e.id))
    const others = getSortedEvents()
        .filter(e => !selectedIds.has(e.id))
        .filter(e => e.extendedProps.pinType !== 'ghost')

    let neighbor: EventApi | null = null
    if (direction === 1) {
        for (const e of others.sort((a, b) => a.start.getTime() - b.start.getTime())) {
            if (e.start.getTime() >= block.blockEnd) {
                if (e.extendedProps.pinType === 'solid') continue
                neighbor = e
                break
            }
        }
    } else {
        for (const e of others.sort((a, b) => b.end.getTime() - a.end.getTime())) {
            if (e.end.getTime() <= block.blockStart) {
                if (e.extendedProps.pinType === 'solid') continue
                neighbor = e
                break
            }
        }
    }

    if (!neighbor) return

    pushUndo(calendar)
    calendar.pauseRendering()

    const gap =
        direction === 1
            ? neighbor.start.getTime() - block.blockEnd
            : block.blockStart - neighbor.end.getTime()

    if (gap >= FIVE_MIN) {
        let newBlockStart: number
        if (direction === 1) {
            newBlockStart = neighbor.start.getTime() - blockDuration
        } else {
            newBlockStart = neighbor.end.getTime()
        }
        const newBlockEnd = newBlockStart + blockDuration
        if (newBlockStart < bounds.minMs || newBlockEnd > bounds.maxMs) {
            calendar.resumeRendering()
            undo(calendar)
            return
        }
        shiftEvents(block.events, newBlockStart - block.blockStart)
    } else {
        const neighborDuration = neighbor.end.getTime() - neighbor.start.getTime()

        if (direction === 1) {
            neighbor.setDates(
                new Date(block.blockStart),
                new Date(block.blockStart + neighborDuration)
            )
            shiftEvents(block.events, neighborDuration)
        } else {
            neighbor.setDates(new Date(block.blockEnd - neighborDuration), new Date(block.blockEnd))
            shiftEvents(block.events, -neighborDuration)
        }

        const newStart = Math.min(...block.events.map(e => e.start.getTime()))
        const newEnd = Math.max(...block.events.map(e => e.end.getTime()))
        if (newStart < bounds.minMs || newEnd > bounds.maxMs) {
            calendar.resumeRendering()
            undo(calendar)
            return
        }
    }

    calendar.resumeRendering()
}

// --- Resize mode ---

function getResizeTarget(): EventApi | null {
    const selected = getTargetEvents()
    if (selected.length === 0) return null
    // Pick the shortest event — resizing it lets groupId propagate safely
    return selected.reduce((a, b) => {
        const aDur = a.end.getTime() - a.start.getTime()
        const bDur = b.end.getTime() - b.start.getTime()
        return bDur < aDur ? b : a
    })
}

function moveResize(direction: 1 | -1): void {
    if (!state.calendar) return
    const target = getResizeTarget()
    if (!target) return

    const bounds = getCalendarBounds()
    const startEdge = resizeEdge() === 'start'
    const offset = direction * FIVE_MIN

    pushUndo(state.calendar)
    state.calendar.pauseRendering()

    if (startEdge) {
        const newStart = target.start.getTime() + offset
        if (newStart < bounds.minMs || newStart >= target.end.getTime()) {
            state.calendar.resumeRendering()
            undo(state.calendar)
            return
        }
        target.setDates(new Date(newStart), target.end)
    } else {
        const newEnd = target.end.getTime() + offset
        if (newEnd > bounds.maxMs || newEnd <= target.start.getTime()) {
            state.calendar.resumeRendering()
            undo(state.calendar)
            return
        }
        target.setDates(target.start, new Date(newEnd))
    }

    state.calendar.resumeRendering()
}

function moveResizeWithPush(direction: 1 | -1): void {
    if (!state.calendar) return
    const selected = getTargetEvents()
    // Push/pull disabled for multi-select
    if (selected.length !== 1) return

    const target = selected[0]
    const bounds = getCalendarBounds()
    const startEdge = resizeEdge() === 'start'
    const offset = direction * FIVE_MIN
    const calendar = state.calendar

    pushUndo(calendar)
    calendar.pauseRendering()

    // Validate the resize itself
    if (startEdge) {
        const newStart = target.start.getTime() + offset
        if (newStart < bounds.minMs || newStart >= target.end.getTime()) {
            calendar.resumeRendering()
            undo(calendar)
            return
        }
    } else {
        const newEnd = target.end.getTime() + offset
        if (newEnd > bounds.maxMs || newEnd <= target.start.getTime()) {
            calendar.resumeRendering()
            undo(calendar)
            return
        }
    }

    // Find the adjacent cluster on the affected side and shift it
    const allSorted = getSortedEvents()
    const others = allSorted.filter(e => e.id !== target.id && e.extendedProps.pinType !== 'ghost')

    if (startEdge) {
        // Resizing the start edge — the cluster above is affected
        // direction = -1 (k) extends start up → push cluster up (negative offset)
        // direction = +1 (j) shrinks start down → pull cluster down (positive offset)
        const eventsAbove = others
            .filter(e => e.end.getTime() <= target.start.getTime() + FIVE_MIN)
            .sort((a, b) => b.end.getTime() - a.end.getTime())

        // Build the contiguous cluster touching the start edge
        const cluster: EventApi[] = []
        let frontier = target.start.getTime()
        for (const e of eventsAbove) {
            if (e.end.getTime() >= frontier - FIVE_MIN) {
                // Check for solid pin — can't push it, jump over
                if (e.extendedProps.pinType === 'solid') {
                    // Jump: skip this event, update frontier to its start
                    frontier = Math.min(frontier, e.start.getTime())
                    continue
                }
                cluster.push(e)
                frontier = Math.min(frontier, e.start.getTime())
            } else {
                break
            }
        }

        // Check boundary for cluster shift
        if (cluster.length > 0) {
            const clusterMinStart = Math.min(...cluster.map(e => e.start.getTime()))
            if (clusterMinStart + offset < bounds.minMs) {
                calendar.resumeRendering()
                undo(calendar)
                return
            }
            // Shift cluster
            for (const e of cluster) {
                e.setDates(new Date(e.start.getTime() + offset), new Date(e.end.getTime() + offset))
            }
        }

        // Resize the target
        target.setDates(new Date(target.start.getTime() + offset), target.end)
    } else {
        // Resizing the end edge — the cluster below is affected
        // direction = +1 (j) extends end down → push cluster down (positive offset)
        // direction = -1 (k) shrinks end up → pull cluster up (negative offset)
        const eventsBelow = others
            .filter(e => e.start.getTime() >= target.end.getTime() - FIVE_MIN)
            .sort((a, b) => a.start.getTime() - b.start.getTime())

        // Build the contiguous cluster touching the end edge
        const cluster: EventApi[] = []
        let frontier = target.end.getTime()
        for (const e of eventsBelow) {
            if (e.start.getTime() <= frontier + FIVE_MIN) {
                if (e.extendedProps.pinType === 'solid') {
                    frontier = Math.max(frontier, e.end.getTime())
                    continue
                }
                cluster.push(e)
                frontier = Math.max(frontier, e.end.getTime())
            } else {
                break
            }
        }

        // Check boundary for cluster shift
        if (cluster.length > 0) {
            const clusterMaxEnd = Math.max(...cluster.map(e => e.end.getTime()))
            if (clusterMaxEnd + offset > bounds.maxMs) {
                calendar.resumeRendering()
                undo(calendar)
                return
            }
            // Shift cluster
            for (const e of cluster) {
                e.setDates(new Date(e.start.getTime() + offset), new Date(e.end.getTime() + offset))
            }
        }

        // Resize the target
        target.setDates(target.start, new Date(target.end.getTime() + offset))
    }

    calendar.resumeRendering()
}

// --- Key binding registry (single source of truth for handler + legend) ---

interface KeyBinding {
    mode: KeyboardMode | KeyboardMode[]
    key: string | string[]
    shift?: boolean
    alt?: boolean
    ctrl?: boolean
    prefix?: string
    label: string | (() => string)
    handler: (e: KeyboardEvent) => void
}

const bindings: KeyBinding[] = [
    // --- Normal mode ---
    {
        mode: 'normal',
        key: 'v',
        label: 'select',
        handler: () => {
            const sorted = getSortedEvents()
            const filtered = getFilteredEvents(sorted)
            if (filtered.length === 0) return
            setKeyboardMode('select')
            const closest = findClosestEventToNow(filtered)
            if (closest) focusEvent(closest.id)
        }
    },
    {
        mode: 'normal',
        key: 'p',
        label: 'push mode',
        handler: () => {
            if (getSelectedEvents().length > 0) enterMoveMode('push')
        }
    },
    {
        mode: 'normal',
        key: ['m', 'o'],
        label: 'overlap mode',
        handler: () => {
            if (getSelectedEvents().length > 0) enterMoveMode('overlap')
        }
    },
    {
        mode: 'normal',
        key: 's',
        label: 'swap mode',
        handler: () => {
            if (getSelectedEvents().length > 0) enterMoveMode('swap')
        }
    },
    {
        mode: 'normal',
        key: 'e',
        prefix: 't',
        label: 'resize end',
        handler: () => {
            if (getSelectedEvents().length > 0) enterResizeMode('end')
        }
    },
    {
        mode: 'normal',
        key: 's',
        prefix: 't',
        label: 'resize start',
        handler: () => {
            if (getSelectedEvents().length > 0) enterResizeMode('start')
        }
    },
    {
        mode: 'normal',
        key: EXIT_KEY,
        label: 'deselect',
        handler: () => {
            if (getSelectedEvents().length > 0) clearSelection()
        }
    },

    // --- Select mode ---
    {
        mode: 'select',
        key: 'j',
        label: 'next',
        handler: () => moveFocus(1)
    },
    {
        mode: 'select',
        key: 'k',
        label: 'prev',
        handler: () => moveFocus(-1)
    },
    {
        mode: 'select',
        key: ['j', 'J'],
        shift: true,
        label: 'select + next',
        handler: () => selectAndMove(1)
    },
    {
        mode: 'select',
        key: ['k', 'K'],
        shift: true,
        label: 'select + prev',
        handler: () => selectAndMove(-1)
    },
    {
        mode: 'select',
        key: 'g',
        label: 'first',
        handler: () => jumpFocus('first')
    },
    {
        mode: 'select',
        key: 'G',
        label: 'last',
        handler: () => jumpFocus('last')
    },
    {
        mode: 'select',
        key: [' ', 'Enter'],
        label: 'toggle select',
        handler: () => toggleSelectFocused()
    },
    {
        mode: 'select',
        key: ['d', 'Delete'],
        label: 'delete',
        handler: () => deleteSelectedEvents()
    },
    {
        mode: 'select',
        key: ['o', 'c'],
        prefix: 'a',
        label: 'select overlapping',
        handler: () => toggleSelectGroup(buildOverlapGroups)
    },
    {
        mode: 'select',
        key: ['b', 'p'],
        prefix: 'a',
        label: 'select cluster',
        handler: () => toggleSelectGroup(buildClusters)
    },
    {
        mode: ['select', 'move'],
        key: 'r',
        label: 'snap to 5m grid',
        handler: () => snapToGrid()
    },
    {
        mode: 'select',
        key: 'a',
        label: 'filter: all',
        handler: () => handleFilterChange('all'),
        prefix: 'f'
    },
    {
        mode: 'select',
        key: 'f',
        label: 'filter: finished',
        handler: () => handleFilterChange('finished'),
        prefix: 'f'
    },
    {
        mode: 'select',
        key: 'u',
        label: 'filter: unfinished',
        handler: () => handleFilterChange('unfinished'),
        prefix: 'f'
    },
    {
        mode: 'select',
        key: 'p',
        label: 'push mode',
        handler: () => enterMoveMode('push')
    },
    {
        mode: 'select',
        key: ['m', 'o'],
        label: 'overlap mode',
        handler: () => enterMoveMode('overlap')
    },
    {
        mode: 'select',
        key: 's',
        label: 'swap mode',
        handler: () => enterMoveMode('swap')
    },
    {
        mode: 'select',
        key: 'e',
        prefix: 't',
        label: 'resize end',
        handler: () => enterResizeMode('end')
    },
    {
        mode: 'select',
        key: 's',
        prefix: 't',
        label: 'resize start',
        handler: () => enterResizeMode('start')
    },
    {
        mode: 'select',
        key: 'c',
        label: 'clear selection',
        handler: () => clearSelection()
    },
    {
        mode: 'select',
        key: [EXIT_KEY, 'v'],
        label: 'exit',
        handler: () => {
            focusEvent(null)
            setEventFilter('all')
            setKeyboardMode('normal')
        }
    },

    {
        mode: ['select', 'move'],
        key: EXIT_KEY,
        shift: true,
        label: 'exit + deselect',
        handler: () => {
            clearSelection()
            focusEvent(null)
            setEventFilter('all')
            setKeyboardMode('normal')
        }
    },

    // --- Arrow key scrolling (select + move) ---
    {
        mode: ['select', 'move'],
        key: 'ArrowDown',
        label: 'scroll down',
        handler: () => {
            const wrapper = document.getElementById('calendar-wrapper')
            if (wrapper) wrapper.scrollTop += 100
        }
    },
    {
        mode: ['select', 'move'],
        key: 'ArrowUp',
        label: 'scroll up',
        handler: () => {
            const wrapper = document.getElementById('calendar-wrapper')
            if (wrapper) wrapper.scrollTop -= 100
        }
    },

    // --- Scroll positioning (zz/zt/zb) ---
    {
        mode: 'select',
        key: 'z',
        prefix: 'z',
        label: 'center on focus',
        handler: () => {
            const id = focusedEventId()
            if (!id) return
            const el = document.querySelector(`[data-event-id="${id}"]`)
            if (!el) return
            const wrapper = document.getElementById('calendar-wrapper')
            if (!wrapper) return
            const elRect = el.getBoundingClientRect()
            const wrapperRect = wrapper.getBoundingClientRect()
            const elCenter = elRect.top + elRect.height / 2
            const wrapperCenter = wrapperRect.top + wrapperRect.height / 2
            wrapper.scrollTop += elCenter - wrapperCenter
        }
    },
    {
        mode: 'select',
        key: 't',
        prefix: 'z',
        label: 'scroll focus to top',
        handler: () => {
            const id = focusedEventId()
            if (!id) return
            const el = document.querySelector(`[data-event-id="${id}"]`)
            if (!el) return
            const wrapper = document.getElementById('calendar-wrapper')
            if (!wrapper) return
            const elRect = el.getBoundingClientRect()
            const wrapperRect = wrapper.getBoundingClientRect()
            wrapper.scrollTop += elRect.top - wrapperRect.top
        }
    },
    {
        mode: 'select',
        key: 'b',
        prefix: 'z',
        label: 'scroll focus to bottom',
        handler: () => {
            const id = focusedEventId()
            if (!id) return
            const el = document.querySelector(`[data-event-id="${id}"]`)
            if (!el) return
            const wrapper = document.getElementById('calendar-wrapper')
            if (!wrapper) return
            const elRect = el.getBoundingClientRect()
            const wrapperRect = wrapper.getBoundingClientRect()
            const elBottom = elRect.top + elRect.height
            const wrapperBottom = wrapperRect.top + wrapperRect.height
            wrapper.scrollTop += elBottom - wrapperBottom
        }
    },
    {
        mode: 'move',
        key: 'z',
        prefix: 'z',
        label: 'center on selection',
        handler: () => {
            const block = getSelectionBlock()
            if (!block) return
            const midMs = (block.blockStart + block.blockEnd) / 2
            // Find the event element closest to midpoint
            const midnight = new Date()
            midnight.setHours(0, 0, 0, 0)
            const midTimeMs = midMs - midnight.getTime()
            if (state.scrollToTime) {
                // scrollToTime puts time at top; offset by half wrapper height
                const wrapper = document.getElementById('calendar-wrapper')
                if (!wrapper) return
                state.scrollToTime(midTimeMs)
                wrapper.scrollTop -= wrapper.clientHeight / 2
            }
        }
    },
    {
        mode: 'move',
        key: 't',
        prefix: 'z',
        label: 'scroll selection to top',
        handler: () => {
            const block = getSelectionBlock()
            if (!block) return
            const midnight = new Date()
            midnight.setHours(0, 0, 0, 0)
            const startTimeMs = block.blockStart - midnight.getTime()
            if (state.scrollToTime) {
                const wrapper = document.getElementById('calendar-wrapper')
                if (!wrapper) return
                state.scrollToTime(startTimeMs)
            }
        }
    },
    {
        mode: 'move',
        key: 'b',
        prefix: 'z',
        label: 'scroll selection to bottom',
        handler: () => {
            const block = getSelectionBlock()
            if (!block) return
            const midnight = new Date()
            midnight.setHours(0, 0, 0, 0)
            const endTimeMs = block.blockEnd - midnight.getTime()
            if (state.scrollToTime) {
                const wrapper = document.getElementById('calendar-wrapper')
                if (!wrapper) return
                state.scrollToTime(endTimeMs)
                wrapper.scrollTop -= wrapper.clientHeight
            }
        }
    },

    // --- Legend toggle (select + move) ---
    {
        mode: ['select', 'move'],
        key: 'h',
        label: 'toggle legend',
        handler: () => setLegendHidden(!legendHidden())
    },

    // --- Move mode ---
    {
        mode: 'move',
        key: 'j',
        label: () => {
            const sub = moveSubMode()
            if (sub === 'resize') return resizeEdge() === 'end' ? 'extend end' : 'shrink start'
            return sub === 'push' ? 'push down' : sub === 'overlap' ? 'overlap down' : 'swap down'
        },
        handler: () => {
            const sub = moveSubMode()
            if (sub === 'push') movePush(1, false)
            else if (sub === 'overlap') movePush(1, true)
            else if (sub === 'resize') moveResize(1)
            else moveSwap(1)
        }
    },
    {
        mode: 'move',
        key: 'k',
        label: () => {
            const sub = moveSubMode()
            if (sub === 'resize') return resizeEdge() === 'end' ? 'shrink end' : 'extend start'
            return sub === 'push' ? 'push up' : sub === 'overlap' ? 'overlap up' : 'swap up'
        },
        handler: () => {
            const sub = moveSubMode()
            if (sub === 'push') movePush(-1, false)
            else if (sub === 'overlap') movePush(-1, true)
            else if (sub === 'resize') moveResize(-1)
            else moveSwap(-1)
        }
    },
    {
        mode: 'move',
        key: ['j', 'J'],
        shift: true,
        label: () => {
            if (moveSubMode() !== 'resize') return ''
            return resizeEdge() === 'end' ? 'extend end + push' : 'shrink start + pull'
        },
        handler: () => {
            if (moveSubMode() === 'resize') moveResizeWithPush(1)
        }
    },
    {
        mode: 'move',
        key: ['k', 'K'],
        shift: true,
        label: () => {
            if (moveSubMode() !== 'resize') return ''
            return resizeEdge() === 'end' ? 'shrink end + pull' : 'extend start + push'
        },
        handler: () => {
            if (moveSubMode() === 'resize') moveResizeWithPush(-1)
        }
    },
    {
        mode: 'move',
        key: 'p',
        label: 'push mode',
        handler: () => setMoveSubMode('push')
    },
    {
        mode: 'move',
        key: ['m', 'o'],
        label: 'overlap mode',
        handler: () => setMoveSubMode('overlap')
    },
    {
        mode: 'move',
        key: 's',
        label: () => (moveSubMode() === 'resize' ? 'start edge' : 'swap mode'),
        handler: () => {
            if (moveSubMode() === 'resize') setResizeEdge('start')
            else setMoveSubMode('swap')
        }
    },
    {
        mode: 'move',
        key: 'e',
        prefix: 't',
        label: 'resize end',
        handler: () => {
            setMoveSubMode('resize')
            setResizeEdge('end')
        }
    },
    {
        mode: 'move',
        key: 's',
        prefix: 't',
        label: 'resize start',
        handler: () => {
            setMoveSubMode('resize')
            setResizeEdge('start')
        }
    },
    {
        mode: 'move',
        key: 'e',
        label: () => (moveSubMode() === 'resize' ? 'end edge' : ''),
        handler: () => {
            if (moveSubMode() === 'resize') setResizeEdge('end')
        }
    },
    {
        mode: 'move',
        key: 'c',
        label: 'clear + select mode',
        handler: () => {
            clearSelection()
            setKeyboardMode('select')
        }
    },
    {
        mode: 'move',
        key: [EXIT_KEY, 'v'],
        label: 'back to select',
        handler: () => setKeyboardMode('select')
    },

    // --- Undo/Redo (all modes) ---
    {
        mode: ['select', 'move'],
        key: 'u',
        label: 'undo',
        handler: () => {
            if (state.calendar) undo(state.calendar)
        }
    },
    {
        mode: ['normal', 'select', 'move'],
        key: 'z',
        ctrl: true,
        label: 'undo',
        handler: () => {
            if (state.calendar) undo(state.calendar)
        }
    },
    {
        mode: ['select', 'move'],
        key: 'r',
        ctrl: true,
        label: 'redo',
        handler: () => {
            if (state.calendar) redo(state.calendar)
        }
    },
    {
        mode: ['normal', 'select', 'move'],
        key: 'z',
        ctrl: true,
        shift: true,
        label: 'redo',
        handler: () => {
            if (state.calendar) redo(state.calendar)
        }
    }
]

// --- Legend export ---

export interface LegendEntry {
    keys: string[]
    label: string
}

export function getLegend(): LegendEntry[] {
    const mode = keyboardMode()
    const seen = new Set<string>()
    const entries: LegendEntry[] = []

    for (const b of bindings) {
        const modes = Array.isArray(b.mode) ? b.mode : [b.mode]
        if (!modes.includes(mode)) continue

        const label = typeof b.label === 'function' ? b.label() : b.label

        // Build display key (vim-style notation)
        const rawKeys = Array.isArray(b.key) ? b.key : [b.key]
        // Dedupe keys that differ only by case (e.g. ['j', 'J'] with shift)
        const keys = [...new Set(rawKeys.map(k => k.toLowerCase()))]
        const prefix = b.prefix ? b.prefix : ''
        const displayKeys = keys.map(k => {
            // Shorten key names
            let name = k
            if (k === ' ') name = 'Spc'
            else if (k === 'escape') name = 'Esc'
            else if (k === 'backspace') name = 'Bksp'
            else if (k === 'delete') name = 'Del'
            else if (k === 'enter') name = 'CR'
            else if (k === 'arrowup') name = '↑'
            else if (k === 'arrowdown') name = '↓'
            else if (k === 'arrowleft') name = '←'
            else if (k === 'arrowright') name = '→'

            // Vim-style modifier notation: <C-z>, <C-S-z>, etc.
            const mods: string[] = []
            if (b.ctrl) mods.push('C')
            if (b.alt) mods.push('A')
            if (b.shift) mods.push('S')

            if (mods.length > 0) return `<${mods.join('-')}-${name}>`
            return prefix + name
        })

        // Dedupe by label
        if (seen.has(label)) continue
        seen.add(label)

        entries.push({ keys: displayKeys, label })
    }

    return entries
}

// --- Keydown dispatcher ---

function matchBinding(b: KeyBinding, e: KeyboardEvent, mode: KeyboardMode): boolean {
    const modes = Array.isArray(b.mode) ? b.mode : [b.mode]
    if (!modes.includes(mode)) return false

    const keys = Array.isArray(b.key) ? b.key : [b.key]
    if (!keys.includes(e.key)) return false

    if (b.shift && !e.shiftKey) return false
    if (b.alt && !e.altKey) return false
    if (b.ctrl && !e.ctrlKey) return false

    // Don't match a non-shift binding when shift is held (except for keys that are themselves uppercase)
    if (!b.shift && e.shiftKey && e.key === e.key.toLowerCase()) return false

    // Don't match a non-alt binding when alt is held
    if (!b.alt && e.altKey) return false

    // Don't match a non-ctrl binding when ctrl/meta is held
    if (!b.ctrl && (e.ctrlKey || e.metaKey)) return false

    return true
}

let pendingPrefix: string | null = null

function handleKeydown(e: KeyboardEvent): void {
    const tag = (e.target as HTMLElement)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

    const mode = keyboardMode()

    // If a prefix is pending, look for bindings with that prefix
    if (pendingPrefix) {
        const prefix = pendingPrefix
        pendingPrefix = null
        for (const b of bindings) {
            if (b.prefix === prefix && matchBinding(b, e, mode)) {
                e.preventDefault()
                b.handler(e)
                return
            }
        }
        // No match — prefix consumed, fall through (key is ignored)
        return
    }

    // Check if this key starts a prefix sequence
    const prefixBindings = bindings.filter(b => {
        const modes = Array.isArray(b.mode) ? b.mode : [b.mode]
        return b.prefix && modes.includes(mode) && b.prefix === e.key
    })
    if (prefixBindings.length > 0 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        pendingPrefix = e.key
        return
    }

    for (const b of bindings) {
        if (!b.prefix && matchBinding(b, e, mode)) {
            e.preventDefault()
            b.handler(e)
            return
        }
    }
}

// --- Setup and cleanup ---

export function setupKeyboardHandlers(): () => void {
    const handler = (e: KeyboardEvent) => handleKeydown(e)
    document.addEventListener('keydown', handler)

    return () => {
        document.removeEventListener('keydown', handler)
        pendingPrefix = null
        setKeyboardMode('normal')
        setFocusedEventId(null)
        setEventFilter('all')
    }
}
