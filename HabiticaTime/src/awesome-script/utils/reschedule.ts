import { Calendar, EventApi } from '@fullcalendar/core'
import { colors } from '../global'
import { getRoundedNow } from './utils'
import { deselectEvents } from './selection'

function isFinished(event: EventApi): boolean {
    const finishedColor = colors.finishedEvent.hsl().string()
    if (event.backgroundColor === finishedColor) return true
    if (event.extendedProps.original?.backgroundColor === finishedColor) return true
    return false
}

function isPinned(event: EventApi): boolean {
    return event.extendedProps.pinType === 'solid' || event.extendedProps.pinType === 'ghost'
}

function findPlacementAvoidingSolidPins(
    proposedStart: number,
    duration: number,
    solidPins: Array<{ start: number; end: number }>
): number {
    let start = proposedStart
    let end = start + duration
    for (const pin of solidPins) {
        if (end <= pin.start || start >= pin.end) continue
        start = pin.end
        end = start + duration
    }
    return start
}

type Cluster = EventApi[]

function buildOverlapGroups(sortedEvents: EventApi[]): Cluster[] {
    if (sortedEvents.length === 0) return []

    const groups: Cluster[] = [[sortedEvents[0]]]
    let groupMaxEnd = sortedEvents[0].end.getTime()

    for (let i = 1; i < sortedEvents.length; i++) {
        const event = sortedEvents[i]
        if (event.start.getTime() < groupMaxEnd) {
            groups[groups.length - 1].push(event)
        } else {
            groups.push([event])
        }
        groupMaxEnd = Math.max(groupMaxEnd, event.end.getTime())
    }

    return groups
}

function getClusterStart(cluster: Cluster): number {
    return Math.min(...cluster.map(e => e.start.getTime()))
}

function getClusterEnd(cluster: Cluster): number {
    return Math.max(...cluster.map(e => e.end.getTime()))
}

function roundUpTo5(date: Date): Date {
    const ms = date.getTime()
    const fiveMin = 5 * 60 * 1000
    const rounded = Math.ceil(ms / fiveMin) * fiveMin
    return new Date(rounded)
}

function roundDownTo5(date: Date): Date {
    const ms = date.getTime()
    const fiveMin = 5 * 60 * 1000
    const rounded = Math.floor(ms / fiveMin) * fiveMin
    return new Date(rounded)
}

function clusterHasLongEvent(cluster: Cluster): boolean {
    return cluster.some(e => e.end.getTime() - e.start.getTime() >= 5 * 60 * 1000)
}

function shiftCluster(cluster: Cluster, newStart: Date): void {
    const oldStart = getClusterStart(cluster)
    const offset = newStart.getTime() - oldStart

    for (const event of cluster) {
        const newEventStart = new Date(event.start.getTime() + offset)
        const newEventEnd = new Date(event.end.getTime() + offset)
        event.setDates(newEventStart, newEventEnd)
    }
}

export type FinishedMode = 'none' | 'move' | 'cascade'

export function catchupEvents(calendar: Calendar, finishedMode: FinishedMode = 'move'): void {
    const now = getRoundedNow(5)
    const nowMs = now.getTime()
    const nowRoundedDown = roundDownTo5(new Date())
    const nowRoundedDownMs = nowRoundedDown.getTime()

    const allEvents = calendar.getEvents()

    // Deselect all selected events first
    const selected = allEvents.filter(e => e.extendedProps.selected)
    if (selected.length > 0) deselectEvents(selected)

    // Separate into finished and unfinished (excluding pinned events)
    const finished = allEvents
        .filter(e => isFinished(e) && !isPinned(e))
        .sort((a, b) => a.start.getTime() - b.start.getTime())
    const unfinished = allEvents
        .filter(e => !isFinished(e) && !isPinned(e))
        .sort((a, b) => a.start.getTime() - b.start.getTime())

    // Collect solid pins as obstacles for forward packing
    const solidPins = allEvents
        .filter(e => e.extendedProps.pinType === 'solid')
        .map(e => ({ start: e.start!.getTime(), end: e.end!.getTime() }))
        .sort((a, b) => a.start - b.start)

    const finishedAfterNow = finished.filter(e => e.end.getTime() > nowRoundedDownMs)
    const finishedBeforeNow = finished.filter(e => e.end.getTime() <= nowRoundedDownMs)
    const shouldMoveFinished = finishedMode !== 'none'
    const hasFinishedAfterNow = shouldMoveFinished && finishedAfterNow.length > 0

    // Build overlap groups from ALL unfinished events so overlapping events stay together
    const unfinishedGroups = buildOverlapGroups(unfinished)

    // A group needs moving if any event in it starts before now
    const hasPastEvent = (group: Cluster) => group.some(e => e.start.getTime() < nowMs)
    const hasUnfinishedToMove = unfinishedGroups.some(hasPastEvent)

    if (!hasFinishedAfterNow && !hasUnfinishedToMove) return

    calendar.pauseRendering()

    // --- Move finished-after-now overlap groups backwards from now ---
    if (hasFinishedAfterNow) {
        const finishedAfterNowGroups = buildOverlapGroups(
            finishedAfterNow.sort((a, b) => a.start.getTime() - b.start.getTime())
        )

        let endTime = nowRoundedDownMs

        for (let i = finishedAfterNowGroups.length - 1; i >= 0; i--) {
            const group = finishedAfterNowGroups[i]
            const groupDuration = getClusterEnd(group) - getClusterStart(group)
            let newStartMs = endTime - groupDuration

            if (clusterHasLongEvent(group)) {
                newStartMs = roundDownTo5(new Date(newStartMs)).getTime()
            }

            shiftCluster(group, new Date(newStartMs))
            endTime = newStartMs
        }

        // --- Cascade finished-before-now overlap groups if toggle is on ---
        if (finishedMode === 'cascade') {
            const finishedBeforeNowGroups = buildOverlapGroups(
                finishedBeforeNow.sort((a, b) => a.start.getTime() - b.start.getTime())
            )

            for (let i = finishedBeforeNowGroups.length - 1; i >= 0; i--) {
                const group = finishedBeforeNowGroups[i]
                const groupEnd = getClusterEnd(group)

                if (groupEnd > endTime) {
                    const groupDuration = groupEnd - getClusterStart(group)
                    let newStartMs = endTime - groupDuration

                    if (clusterHasLongEvent(group)) {
                        newStartMs = roundDownTo5(new Date(newStartMs)).getTime()
                    }

                    shiftCluster(group, new Date(newStartMs))
                    endTime = newStartMs
                } else {
                    break
                }
            }
        }
    }

    // --- Pack unfinished overlap groups forwards from now ---
    if (hasUnfinishedToMove) {
        let placementTime = new Date(nowMs)
        let runningEnd = nowMs

        for (const group of unfinishedGroups) {
            const groupDuration = getClusterEnd(group) - getClusterStart(group)

            if (hasPastEvent(group)) {
                // Move this group to placementTime
                if (clusterHasLongEvent(group)) {
                    placementTime = roundUpTo5(placementTime)
                }
                const adjustedStart = findPlacementAvoidingSolidPins(
                    placementTime.getTime(),
                    groupDuration,
                    solidPins
                )
                shiftCluster(group, new Date(adjustedStart))
                placementTime = new Date(getClusterEnd(group))
                runningEnd = placementTime.getTime()
            } else {
                // Future group — only push if it overlaps with runningEnd
                const groupStart = getClusterStart(group)
                if (groupStart < runningEnd) {
                    let newStart = new Date(runningEnd)
                    if (clusterHasLongEvent(group)) {
                        newStart = roundUpTo5(newStart)
                    }
                    const adjustedStart = findPlacementAvoidingSolidPins(
                        newStart.getTime(),
                        groupDuration,
                        solidPins
                    )
                    shiftCluster(group, new Date(adjustedStart))
                    runningEnd = getClusterEnd(group)
                } else {
                    runningEnd = Math.max(runningEnd, getClusterEnd(group))
                }
            }
        }
    }

    calendar.resumeRendering()
}

function buildClusters(sortedEvents: EventApi[]): Cluster[] {
    if (sortedEvents.length === 0) return []
    const FIVE_MIN = 5 * 60 * 1000
    const ONE_MIN = 1 * 60 * 1000
    const clusters: Cluster[] = [[sortedEvents[0]]]
    let clusterMaxEnd = sortedEvents[0].end.getTime()
    for (let i = 1; i < sortedEvents.length; i++) {
        const event = sortedEvents[i]
        const eventDuration = event.end.getTime() - event.start.getTime()
        const tolerance =
            eventDuration >= FIVE_MIN
                ? roundUpTo5(new Date(clusterMaxEnd)).getTime() - clusterMaxEnd
                : ONE_MIN
        if (event.start.getTime() <= clusterMaxEnd + tolerance) {
            clusters[clusters.length - 1].push(event)
        } else {
            clusters.push([event])
        }
        clusterMaxEnd = Math.max(clusterMaxEnd, event.end.getTime())
    }
    return clusters
}

export function squeezeEvents(calendar: Calendar): void {
    const now = getRoundedNow(5)
    const nowMs = now.getTime()
    const allEvents = calendar.getEvents()

    // Deselect all selected events first (prevents groupId move bug)
    const selected = allEvents.filter(e => e.extendedProps.selected)
    if (selected.length > 0) deselectEvents(selected)

    const movable = allEvents
        .filter(e => !isPinned(e))
        .sort((a, b) => {
            const startDiff = a.start.getTime() - b.start.getTime()
            if (startDiff !== 0) return startDiff
            // Longer events first so they set the tolerance in buildClusters
            const aDur = a.end.getTime() - a.start.getTime()
            const bDur = b.end.getTime() - b.start.getTime()
            return bDur - aDur
        })

    const clusters = buildClusters(movable)
    if (clusters.length === 0) return

    const nowGroupIdx = clusters.findIndex(
        c => getClusterStart(c) <= nowMs && getClusterEnd(c) >= nowMs
    )

    console.debug('squeeze:', {
        now: now.toLocaleTimeString(),
        nowMs,
        numClusters: clusters.length,
        nowGroupIdx,
        clusters: clusters.map((c, i) => ({
            i,
            start: new Date(getClusterStart(c)).toLocaleTimeString(),
            end: new Date(getClusterEnd(c)).toLocaleTimeString(),
            events: c.length
        }))
    })

    calendar.pauseRendering()

    if (nowGroupIdx !== -1) {
        const nextIdx = nowGroupIdx + 1
        if (nextIdx < clusters.length) {
            let newStart = new Date(getClusterEnd(clusters[nowGroupIdx]))
            if (clusterHasLongEvent(clusters[nextIdx])) {
                newStart = roundUpTo5(newStart)
            }
            shiftCluster(clusters[nextIdx], newStart)
        }
    } else {
        const firstAfter = clusters.find(c => getClusterStart(c) > nowMs)
        if (firstAfter) {
            shiftCluster(firstAfter, now)
        }
    }

    calendar.resumeRendering()
}
