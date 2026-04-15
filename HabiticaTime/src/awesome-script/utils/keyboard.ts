import { EventApi } from '@fullcalendar/core'
import {
    state,
    KeyboardMode,
    keyboardMode,
    setKeyboardMode,
    moveSubMode,
    setMoveSubMode,
    eventFilter,
    setEventFilter,
    focusedEventId,
    setFocusedEventId
} from '../global'
import { selectEvents, deselectEvents } from './selection'
import { isFinished } from './reschedule'
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

let rangeAnchorId: string | null = null

function getSelectedEvents(): EventApi[] {
    if (!state.calendar) return []
    return state.calendar.getEvents().filter(e => e.extendedProps.selected)
}

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
        if (!rangeAnchorId) rangeAnchorId = id
    }
    state.calendar.resumeRendering()
}

function rangeSelect(direction: 1 | -1): void {
    if (!state.calendar) return
    const sorted = getSortedEvents()
    const filtered = getFilteredEvents(sorted)
    if (filtered.length === 0) return

    moveFocus(direction)

    const focusId = focusedEventId()
    if (!focusId) return

    if (!rangeAnchorId) rangeAnchorId = focusId

    const anchorIndex = filtered.findIndex(e => e.id === rangeAnchorId)
    const focusIndex = filtered.findIndex(e => e.id === focusId)
    if (anchorIndex === -1 || focusIndex === -1) return

    const start = Math.min(anchorIndex, focusIndex)
    const end = Math.max(anchorIndex, focusIndex)

    const inRange = new Set(filtered.slice(start, end + 1).map(e => e.id))

    state.calendar.pauseRendering()
    const toSelect = filtered.slice(start, end + 1).filter(e => !e.extendedProps.selected)
    if (toSelect.length > 0) selectEvents(toSelect)
    const toDeselect = filtered.filter(e => e.extendedProps.selected && !inRange.has(e.id))
    if (toDeselect.length > 0) deselectEvents(toDeselect)
    state.calendar.resumeRendering()
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
    rangeAnchorId = null
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

// --- Ensure selection (select focused if nothing selected) ---

function ensureSelection(): boolean {
    if (getSelectedEvents().length > 0) return true
    toggleSelectFocused()
    return getSelectedEvents().length > 0
}

// --- Snap to 5m grid ---

function snapToGrid(): void {
    if (!state.calendar) return
    if (!ensureSelection()) return
    const selected = getSelectedEvents()

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
    if (!ensureSelection()) return
    const selected = getSelectedEvents()

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
    }
}

// --- Enter move mode (select focused if nothing selected) ---

function enterMoveMode(subMode: 'push' | 'swap' | 'overlap'): void {
    if (!ensureSelection()) return
    setKeyboardMode('move')
    setMoveSubMode(subMode)
}

// --- Move helpers ---

const FIVE_MIN = 5 * 60 * 1000

function getSelectionBlock(): {
    events: EventApi[]
    blockStart: number
    blockEnd: number
} | null {
    const events = getSelectedEvents().sort((a, b) => a.start.getTime() - b.start.getTime())
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

    if (direction === 1) {
        pushable.sort((a, b) => a.start.getTime() - b.start.getTime())
        let wavefront = newBlockEnd
        for (const event of pushable) {
            const eStart = event.start.getTime()
            const eEnd = event.end.getTime()
            if (eStart < wavefront && eEnd > newBlockStart) {
                if (event.extendedProps.pinType === 'solid') {
                    calendar.resumeRendering()
                    undo(calendar)
                    return
                }
                const pushAmount = wavefront - eStart
                const newEnd = eEnd + pushAmount
                if (newEnd > bounds.maxMs) {
                    calendar.resumeRendering()
                    undo(calendar)
                    return
                }
                event.setDates(new Date(eStart + pushAmount), new Date(newEnd))
                wavefront = newEnd
            }
        }
    } else {
        pushable.sort((a, b) => b.end.getTime() - a.end.getTime())
        let wavefront = newBlockStart
        for (const event of pushable) {
            const eStart = event.start.getTime()
            const eEnd = event.end.getTime()
            if (eEnd > wavefront && eStart < newBlockEnd) {
                if (event.extendedProps.pinType === 'solid') {
                    calendar.resumeRendering()
                    undo(calendar)
                    return
                }
                const pushAmount = eEnd - wavefront
                const newStart = eStart - pushAmount
                if (newStart < bounds.minMs) {
                    calendar.resumeRendering()
                    undo(calendar)
                    return
                }
                event.setDates(new Date(newStart), new Date(eEnd - pushAmount))
                wavefront = newStart
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
        label: 'range next',
        handler: () => rangeSelect(1)
    },
    {
        mode: 'select',
        key: ['k', 'K'],
        shift: true,
        label: 'range prev',
        handler: () => rangeSelect(-1)
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
        key: 'c',
        label: 'clear selection',
        handler: () => clearSelection()
    },
    {
        mode: 'select',
        key: EXIT_KEY,
        label: 'exit',
        handler: () => {
            focusEvent(null)
            setEventFilter('all')
            setKeyboardMode('normal')
        }
    },

    // --- Move mode ---
    {
        mode: 'move',
        key: 'j',
        label: () => {
            const sub = moveSubMode()
            return sub === 'push' ? 'push down' : sub === 'overlap' ? 'overlap down' : 'swap down'
        },
        handler: () => {
            const sub = moveSubMode()
            if (sub === 'push') movePush(1, false)
            else if (sub === 'overlap') movePush(1, true)
            else moveSwap(1)
        }
    },
    {
        mode: 'move',
        key: 'k',
        label: () => {
            const sub = moveSubMode()
            return sub === 'push' ? 'push up' : sub === 'overlap' ? 'overlap up' : 'swap up'
        },
        handler: () => {
            const sub = moveSubMode()
            if (sub === 'push') movePush(-1, false)
            else if (sub === 'overlap') movePush(-1, true)
            else moveSwap(-1)
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
        label: 'swap mode',
        handler: () => setMoveSubMode('swap')
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
    key: string
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

        // Build display key
        const keys = Array.isArray(b.key) ? b.key : [b.key]
        const prefix = b.prefix ? b.prefix : ''
        const displayKey = keys
            .map(k => {
                const parts: string[] = []
                if (b.ctrl) parts.push('Ctrl')
                if (b.alt) parts.push('Alt')
                if (b.shift) parts.push('Shift')
                if (k === ' ') parts.push(prefix + 'Space')
                else if (k === 'Escape') parts.push(prefix + 'Esc')
                else parts.push(prefix + k)
                return parts.join('+')
            })
            .join('/')

        // Dedupe by label
        if (seen.has(label)) continue
        seen.add(label)

        entries.push({ key: displayKey, label })
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
