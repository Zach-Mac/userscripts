import { EventApi } from '@fullcalendar/core'
import {
    state,
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
import { pushUndo, undo } from './history'
import { parseTime } from './utils'

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
        // Focused event was filtered out — find nearest in direction
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

    // Move focus first
    moveFocus(direction)

    const focusId = focusedEventId()
    if (!focusId) return

    // Determine anchor
    if (!rangeAnchorId) rangeAnchorId = focusId

    const anchorIndex = filtered.findIndex(e => e.id === rangeAnchorId)
    const focusIndex = filtered.findIndex(e => e.id === focusId)
    if (anchorIndex === -1 || focusIndex === -1) return

    const start = Math.min(anchorIndex, focusIndex)
    const end = Math.max(anchorIndex, focusIndex)

    const inRange = new Set(filtered.slice(start, end + 1).map(e => e.id))

    state.calendar.pauseRendering()
    // Select events in range that aren't selected
    const toSelect = filtered.slice(start, end + 1).filter(e => !e.extendedProps.selected)
    if (toSelect.length > 0) selectEvents(toSelect)
    // Deselect events outside range that are selected
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
    // Re-validate focus
    const sorted = getSortedEvents()
    const filtered = getFilteredEvents(sorted)
    const currentId = focusedEventId()
    if (currentId && filtered.some(e => e.id === currentId)) return // still valid
    // Focus nearest visible event
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

function enterMoveMode(subMode: 'push' | 'swap'): void {
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
    // parseTime returns ms-since-midnight; convert to epoch timestamps for today
    const midnight = new Date()
    midnight.setHours(0, 0, 0, 0)
    const base = midnight.getTime()
    return { minMs: base + parseTime(minStr), maxMs: base + parseTime(maxStr) }
}

function shiftEvents(events: EventApi[], offsetMs: number): void {
    for (const event of events) {
        event.setDates(
            new Date(event.start.getTime() + offsetMs),
            new Date(event.end.getTime() + offsetMs)
        )
    }
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

    // Boundary check
    if (newBlockStart < bounds.minMs || newBlockEnd > bounds.maxMs) return

    pushUndo(calendar)
    calendar.pauseRendering()

    if (overlap) {
        shiftEvents(block.events, offset)
        calendar.resumeRendering()
        return
    }

    // Get non-selected events for collision detection
    const selectedIds = new Set(block.events.map(e => e.id))
    const others = getSortedEvents().filter(e => !selectedIds.has(e.id))

    // Check for solid pin collision in the path of movement
    const solidPinHit = others.find(e => {
        if (e.extendedProps.pinType !== 'solid') return false
        const eStart = e.start.getTime()
        const eEnd = e.end.getTime()
        return eStart < newBlockEnd && eEnd > newBlockStart
    })

    if (solidPinHit) {
        // Jump to other side of pin
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

    // Move the selected block
    shiftEvents(block.events, offset)

    // Wavefront push: sweep in direction of movement
    const pushable = others.filter(e => e.extendedProps.pinType !== 'ghost')

    if (direction === 1) {
        // Sort by start ascending for forward sweep
        pushable.sort((a, b) => a.start.getTime() - b.start.getTime())
        let wavefront = newBlockEnd
        for (const event of pushable) {
            const eStart = event.start.getTime()
            const eEnd = event.end.getTime()
            if (eStart < wavefront && eEnd > newBlockStart) {
                if (event.extendedProps.pinType === 'solid') {
                    // Chain hit a solid pin — abort
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
        // Sort by end descending for backward sweep
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

    // Get non-selected, non-ghost events sorted chronologically
    const selectedIds = new Set(block.events.map(e => e.id))
    const others = getSortedEvents()
        .filter(e => !selectedIds.has(e.id))
        .filter(e => e.extendedProps.pinType !== 'ghost')

    // Find neighbor in direction
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

    // Compute gap
    const gap =
        direction === 1
            ? neighbor.start.getTime() - block.blockEnd
            : block.blockStart - neighbor.end.getTime()

    if (gap >= FIVE_MIN) {
        // Jump: close the gap, become adjacent to neighbor
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
        // Swap: exchange positions
        const neighborDuration = neighbor.end.getTime() - neighbor.start.getTime()

        if (direction === 1) {
            // Neighbor goes to block's old start, block shifts right by neighbor duration
            neighbor.setDates(
                new Date(block.blockStart),
                new Date(block.blockStart + neighborDuration)
            )
            shiftEvents(block.events, neighborDuration)
        } else {
            // Neighbor goes to block's old end minus its duration, block shifts left by neighbor duration
            neighbor.setDates(new Date(block.blockEnd - neighborDuration), new Date(block.blockEnd))
            shiftEvents(block.events, -neighborDuration)
        }

        // Check bounds after swap
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

// --- Main keydown handler ---

function handleKeydown(e: KeyboardEvent): void {
    // Skip if typing in an input
    const tag = (e.target as HTMLElement)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

    const mode = keyboardMode()

    if (mode === 'normal') {
        switch (e.key) {
            case 'v': {
                const sorted = getSortedEvents()
                const filtered = getFilteredEvents(sorted)
                if (filtered.length === 0) return
                e.preventDefault()
                setKeyboardMode('select')
                const closest = findClosestEventToNow(filtered)
                if (closest) focusEvent(closest.id)
                break
            }
            case 'm':
            case 's':
                if (getSelectedEvents().length > 0) {
                    e.preventDefault()
                    enterMoveMode(e.key === 'm' ? 'push' : 'swap')
                }
                break
            case 'Escape':
                if (getSelectedEvents().length > 0) {
                    e.preventDefault()
                    clearSelection()
                }
                break
        }
        return
    }

    if (mode === 'select') {
        switch (e.key) {
            case 'j':
                e.preventDefault()
                if (e.shiftKey) {
                    rangeSelect(1)
                } else {
                    moveFocus(1)
                }
                break
            case 'k':
                e.preventDefault()
                if (e.shiftKey) {
                    rangeSelect(-1)
                } else {
                    moveFocus(-1)
                }
                break
            case 'J':
                e.preventDefault()
                rangeSelect(1)
                break
            case 'K':
                e.preventDefault()
                rangeSelect(-1)
                break
            case 'g':
                e.preventDefault()
                jumpFocus('first')
                break
            case 'G':
                e.preventDefault()
                jumpFocus('last')
                break
            case ' ':
            case 'Enter':
                e.preventDefault()
                toggleSelectFocused()
                break
            case 'd':
            case 'Delete':
                e.preventDefault()
                deleteSelectedEvents()
                break
            case 'a':
                e.preventDefault()
                handleFilterChange('all')
                break
            case 'u':
                e.preventDefault()
                handleFilterChange('unfinished')
                break
            case 'f':
                e.preventDefault()
                handleFilterChange('finished')
                break
            case 'm':
                e.preventDefault()
                enterMoveMode('push')
                break
            case 's':
                e.preventDefault()
                enterMoveMode('swap')
                break
            case 'Escape':
                e.preventDefault()
                focusEvent(null)
                setEventFilter('all')
                setKeyboardMode('normal')
                break
        }
        return
    }

    if (mode === 'move') {
        switch (e.key) {
            case 'j':
                e.preventDefault()
                if (moveSubMode() === 'push') {
                    movePush(1, e.altKey)
                } else {
                    moveSwap(1)
                }
                break
            case 'k':
                e.preventDefault()
                if (moveSubMode() === 'push') {
                    movePush(-1, e.altKey)
                } else {
                    moveSwap(-1)
                }
                break
            case 'm':
                e.preventDefault()
                setMoveSubMode('push')
                break
            case 's':
                e.preventDefault()
                setMoveSubMode('swap')
                break
            case 'Escape':
            case 'v':
                e.preventDefault()
                setKeyboardMode('select')
                break
        }
        return
    }
}

// --- Setup and cleanup ---

export function setupKeyboardHandlers(): () => void {
    const handler = (e: KeyboardEvent) => handleKeydown(e)
    document.addEventListener('keydown', handler)

    return () => {
        document.removeEventListener('keydown', handler)
        setKeyboardMode('normal')
        setFocusedEventId(null)
        setEventFilter('all')
    }
}
