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

type Cluster = EventApi[]

function buildClusters(sortedEvents: EventApi[]): Cluster[] {
	if (sortedEvents.length === 0) return []

	const clusters: Cluster[] = [[sortedEvents[0]]]
	let clusterMaxEnd = sortedEvents[0].end.getTime()

	for (let i = 1; i < sortedEvents.length; i++) {
		const event = sortedEvents[i]
		if (event.start.getTime() < clusterMaxEnd) {
			clusters[clusters.length - 1].push(event)
		} else {
			clusters.push([event])
		}
		clusterMaxEnd = Math.max(clusterMaxEnd, event.end.getTime())
	}

	return clusters
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

export function rescheduleEvents(calendar: Calendar): void {
	const now = getRoundedNow(5)
	const nowMs = now.getTime()

	const allEvents = calendar.getEvents()

	// Deselect all selected events first
	const selected = allEvents.filter(e => e.extendedProps.selected)
	if (selected.length > 0) deselectEvents(selected)

	const unfinished = allEvents
		.filter(e => !isFinished(e))
		.sort((a, b) => a.start.getTime() - b.start.getTime())

	// Build clusters from ALL unfinished events so overlapping events stay together
	const allClusters = buildClusters(unfinished)

	// A cluster needs moving if any event in it starts before now
	const hasPastEvent = (cluster: Cluster) =>
		cluster.some(e => e.start.getTime() < nowMs)

	if (!allClusters.some(hasPastEvent)) return

	calendar.pauseRendering()

	let placementTime = new Date(nowMs)
	let runningEnd = nowMs

	for (const cluster of allClusters) {
		if (hasPastEvent(cluster)) {
			// Move this cluster to placementTime
			if (clusterHasLongEvent(cluster)) {
				placementTime = roundUpTo5(placementTime)
			}
			shiftCluster(cluster, placementTime)
			placementTime = new Date(getClusterEnd(cluster))
			runningEnd = placementTime.getTime()
		} else {
			// Future cluster — only push if it overlaps with runningEnd
			const clusterStart = getClusterStart(cluster)
			if (clusterStart < runningEnd) {
				let newStart = new Date(runningEnd)
				if (clusterHasLongEvent(cluster)) {
					newStart = roundUpTo5(newStart)
				}
				shiftCluster(cluster, newStart)
				runningEnd = getClusterEnd(cluster)
			} else {
				runningEnd = Math.max(runningEnd, getClusterEnd(cluster))
			}
		}
	}

	calendar.resumeRendering()
}
