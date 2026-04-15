import { Calendar } from '@fullcalendar/core'
import { createSignal } from 'solid-js'
import { refreshSelectedCount } from './selection'

type EventSnapshot = Record<string, unknown>[]

const MAX_HISTORY = 20
const undoStack: EventSnapshot[] = []
const redoStack: EventSnapshot[] = []
let restoring = false

const [undoCount, setUndoCount] = createSignal(0)
const [redoCount, setRedoCount] = createSignal(0)
export { undoCount, redoCount }

function updateCounts(): void {
    setUndoCount(undoStack.length)
    setRedoCount(redoStack.length)
}

function snapshotEvents(calendar: Calendar): EventSnapshot {
    return calendar.getEvents().map(e => e.toJSON())
}

function restoreSnapshot(calendar: Calendar, snapshot: EventSnapshot): void {
    restoring = true
    calendar.pauseRendering()
    calendar.getEvents().forEach(e => e.remove())
    for (const eventData of snapshot) {
        calendar.addEvent(eventData)
    }
    calendar.resumeRendering()
    localStorage.setItem('events', JSON.stringify(snapshot))
    restoring = false
}

export function isRestoring(): boolean {
    return restoring
}

export function pushUndo(calendar: Calendar): void {
    undoStack.push(snapshotEvents(calendar))
    if (undoStack.length > MAX_HISTORY) undoStack.shift()
    redoStack.length = 0
    updateCounts()
}

export function undo(calendar: Calendar): void {
    const snapshot = undoStack.pop()
    if (!snapshot) return
    redoStack.push(snapshotEvents(calendar))
    restoreSnapshot(calendar, snapshot)
    updateCounts()
    refreshSelectedCount()
}

export function redo(calendar: Calendar): void {
    const snapshot = redoStack.pop()
    if (!snapshot) return
    undoStack.push(snapshotEvents(calendar))
    restoreSnapshot(calendar, snapshot)
    updateCounts()
    refreshSelectedCount()
}
