import { EventSourceInput, Calendar, DateSelectArg, CalendarOptions } from '@fullcalendar/core'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import { addSelectionStyles, selectEvents, setupSelectionHandlers } from './selection'
import { parseTime, msToHHMMSS, getRoundedNow, getMinutesAgoString, throttle } from './utils'
import { colors, zoomLevels, state } from '../global'
import { createEvent } from './events'

export function createCalendar(initialEvents: EventSourceInput, height: number): Calendar {
	const calendarEl = document.getElementById('calendar')
	const wrapperEl = document.getElementById('calendar-wrapper')

	let calendar: Calendar

	let currentHeight = height

	const calendarHeaderSize = 64.3

	// FOR 3AM TO 2AM
	// const minHeight = 5954
	// this has timePerPixel: 14108.025217243143

	function getTimeAtMousePosition(mouseY: number): number {
		const timeGridEl = calendarEl.querySelector('.fc-timegrid-slots')

		const rect = timeGridEl.getBoundingClientRect()
		const yOffset = mouseY - rect.top

		const slotMinTimeStr = calendar.getOption('slotMinTime').toString()
		const slotMaxTimeStr = calendar.getOption('slotMaxTime').toString()
		const slotMinTimeMs = parseTime(slotMinTimeStr)
		const slotMaxTimeMs = parseTime(slotMaxTimeStr)

		const totalDurationMs = slotMaxTimeMs - slotMinTimeMs
		const timePerPixel = totalDurationMs / timeGridEl.clientHeight

		const mouseTimeMs = slotMinTimeMs + yOffset * timePerPixel

		return mouseTimeMs
	}

	function getScrollTime(): number {
		const scrollEl = calendarEl.querySelector('.fc-scroller.fc-scroller-liquid-absolute')
		const rect = scrollEl.getBoundingClientRect()
		return getTimeAtMousePosition(rect.top)
	}

	function getCalendarCenterY(): number {
		const timeGridEl = calendarEl.querySelector('.fc-timegrid-slots')
		if (!timeGridEl) return 0
		const rect = timeGridEl.getBoundingClientRect()
		return rect.top + rect.height / 2
	}

	function adjustScroll(mouseTimeBefore: number, mouseY: number) {
		const oldScrollTime = getScrollTime()
		const mouseTimeAfter = getTimeAtMousePosition(mouseY)
		const diff = mouseTimeBefore - mouseTimeAfter
		const newScrollTime = oldScrollTime + diff

		calendar.scrollToTime(msToHHMMSS(newScrollTime))

		return { mouseTimeAfter, newScrollTime }
	}

	function getScrollOffsetForTime(msToScroll: number) {
		const slotMinTimeStr = calendar.getOption('slotMinTime').toString()
		const slotMaxTimeStr = calendar.getOption('slotMaxTime').toString()
		const slotMinTimeMs = parseTime(slotMinTimeStr)
		const slotMaxTimeMs = parseTime(slotMaxTimeStr)
		const totalDurationMs = slotMaxTimeMs - slotMinTimeMs

		const calendarHeight = wrapperEl.scrollHeight + calendarHeaderSize

		const pxPerMs = calendarHeight / totalDurationMs
		const offsetMs = msToScroll - slotMinTimeMs
		return offsetMs * pxPerMs
	}

	function scrollToTime(timeInput: number | string) {
		console.log('scrollToTime', timeInput)

		// Convert string time to ms
		let msToScroll: number
		if (typeof timeInput === 'string') {
			msToScroll = parseTime(timeInput)
		} else {
			msToScroll = timeInput
		}

		console.log('msToScroll', msToScroll)
		console.log('wrapperEl.scrollHeight', wrapperEl.scrollHeight)

		const offsetPx = getScrollOffsetForTime(msToScroll)

		console.log('offsetPx', offsetPx)

		// Scroll the wrapper
		wrapperEl.scrollTop = offsetPx
	}

	function adjustWrapperScroll(mouseTimeBefore: number, mouseY: number) {
		if (!wrapperEl) return

		const mouseTimeAfter = getTimeAtMousePosition(mouseY)
		const beforePx = getScrollOffsetForTime(mouseTimeBefore)
		const afterPx = getScrollOffsetForTime(mouseTimeAfter)
		wrapperEl.scrollTop += beforePx - afterPx
	}

	function slotDurationZoom(value: number, mouseY?: number) {
		const newZoomLevel = state.currZoomLevel + value

		if (newZoomLevel < 0 || newZoomLevel >= zoomLevels.length) return

		state.currZoomLevel = newZoomLevel

		calendar.pauseRendering()

		calendar.setOption('slotDuration', zoomLevels[state.currZoomLevel].slotDuration)
		calendar.setOption('slotLabelInterval', zoomLevels[state.currZoomLevel].slotLabelInterval)

		calendar.resumeRendering()
	}

	function zoom(shouldZoomIn: boolean, mouseY?: number) {
		const minHeight = zoomLevels[state.currZoomLevel].minHeight

		const lastLevelZoomIndex = state.currZoomLevel - 1
		const lastLevelMinHeight = zoomLevels[lastLevelZoomIndex]
			? zoomLevels[lastLevelZoomIndex].minHeight
			: zoomLevels[0].minHeight

		const mouseTimeBefore = getTimeAtMousePosition(mouseY)

		// const heightDelta = lastLevelMinHeight / 5 || minHeight / 5
		// slot height delta = 10% of current slot height
		// const heightDelta = currentHeight / 5
		const heightDelta = (currentHeight / 17) ** 1.27
		// https://www.desmos.com/calculator/umut86azby

		console.debug(
			'BEFORE zoom',
			'currentHeight',
			currentHeight,
			'zoomLevel',
			state.currZoomLevel,
			'minHeight',
			minHeight,
			'lastLevelMinHeight',
			lastLevelMinHeight,
			'heightDelta',
			heightDelta
		)

		if (shouldZoomIn) {
			if (currentHeight + heightDelta > (lastLevelMinHeight * 8) / 10) {
				console.log(
					'currentHeight',
					currentHeight,
					'heightDelta',
					heightDelta,
					'currentHeight + heightDelta',
					currentHeight + heightDelta,
					'(lastLevelMinHeight * 9) / 10',
					(lastLevelMinHeight * 9) / 10
				)
				slotDurationZoom(-1, mouseY)
				currentHeight = lastLevelMinHeight
			} else {
				currentHeight += heightDelta
			}
		} else {
			if (currentHeight - heightDelta < minHeight) {
				slotDurationZoom(1, mouseY)
				currentHeight = minHeight - minHeight / 10
			} else {
				currentHeight -= heightDelta
			}
		}

		if (currentHeight != calendar.getOption('height'))
			calendar.setOption('height', currentHeight)

		if (mouseY !== undefined) {
			adjustWrapperScroll(mouseTimeBefore, mouseY)
		}

		console.timeLog('zoom', 'after adjustWrapperScroll')
	}

	function selectAllEvents() {
		const allEvents = calendar.getEvents()
		selectEvents(allEvents)
	}

	function addEvent(info?: DateSelectArg) {
		const title = prompt('Enter event title')
		if (!title) return

		const eventInput = createEvent({
			title,
			start: info?.start || calendar.getDate(),
			end: info?.end || undefined,
			backgroundColor: colors.customEvent.hsl().string(),
			borderColor: colors.customEvent.hsl().string(),
			customEvent: true
		})
		if (info?.end) {
			eventInput.end = info.end
		}
		calendar.addEvent(eventInput)
	}

	calendarEl.tabIndex = 0
	calendarEl.addEventListener('keydown', event => {
		if (event.ctrlKey) {
			if (event.key === '-' || event.key === '_') {
				event.preventDefault()
				zoom(false)
			} else if (event.key === '+' || event.key === '=' || event.key === '+') {
				event.preventDefault()
				zoom(true)
			}
		}
	})

	const throttledZoom = throttle((shouldZoomIn: boolean, mouseY: number) => {
		if (shouldZoomIn) {
			zoom(true, mouseY)
		} else {
			zoom(false, mouseY)
		}
	}, 5)

	calendarEl.addEventListener('wheel', event => {
		if (event.ctrlKey) {
			event.preventDefault()
			const mouseY = event.clientY
			throttledZoom(event.deltaY < 0, mouseY)
		}
	})

	let shiftPressed = false
	let ctrlPressed = false
	document.addEventListener('keydown', e => {
		if (e.key === 'Shift') {
			shiftPressed = true
			state.calendar.setOption('editable', false)
		}
		if (e.key === 'Control') ctrlPressed = true
	})
	document.addEventListener('keyup', e => {
		if (e.key === 'Shift') {
			shiftPressed = false
			state.calendar.setOption('editable', true)
		}
		if (e.key === 'Control') ctrlPressed = false
	})

	const now = getRoundedNow(5)
	const scrollTime = getMinutesAgoString(now, 30, false)

	const calendarOptions: CalendarOptions = {
		plugins: [timeGridPlugin, interactionPlugin],
		initialView: 'timeGridDay',
		customButtons: {
			zoomIn: {
				text: '+',
				click: () => zoom(true),
				hint: 'Zoom in'
			},
			zoomOut: {
				text: '-',
				click: () => zoom(false),
				hint: 'Zoom out'
			},
			selectAll: {
				text: '*',
				click: selectAllEvents,
				hint: 'Select all events'
			},
			addEvent: {
				text: 'Add',
				click: () => addEvent(),
				hint: 'Add event'
			},
			scroll: {
				text: 'Scroll',
				click: () => scrollToTime(getMinutesAgoString(getRoundedNow(5), 30, false)),
				hint: 'Scroll to 9am'
			}
		},
		titleFormat: { month: 'short', day: 'numeric' },
		headerToolbar: {
			// left: 'prev,next timeGridWeek,timeGridDay',
			left: 'prev,next scroll',
			center: 'title',
			right: 'addEvent,selectAll zoomOut,zoomIn'
		},
		editable: true,
		height,
		slotDuration: zoomLevels[state.currZoomLevel].slotDuration,
		slotLabelInterval: zoomLevels[state.currZoomLevel].slotLabelInterval,
		slotMinTime: '03:00:00',
		slotMaxTime: '26:00:00',
		expandRows: true,
		scrollTime,
		nowIndicator: true,
		selectable: true,
		select: info => {
			if (!shiftPressed) addEvent(info)
			calendar.unselect()
		},
		allDaySlot: false,
		events: initialEvents,
		eventsSet: events => {
			console.debug('eventsSet', events)
			localStorage.setItem('events', JSON.stringify(events))
		},
		eventDidMount: info => {
			const eventId = info.event.id
			info.el.setAttribute('data-event-id', eventId)

			// Handle event right click - delete event
			info.el.addEventListener('contextmenu', jsEvent => {
				jsEvent.preventDefault()
				console.debug('contextMenu', eventId)

				if (confirm(`Delete event "${info.event.title}"?`)) {
					info.event.remove()
				}
			})
		},
		eventClick: info => {
			console.debug('eventClick', info)

			if (info.jsEvent.shiftKey) return
			if (info.jsEvent.ctrlKey) return

			// Handle left click - toggle finished
			const finished = info.event.extendedProps.finished
			info.event.setExtendedProp('finished', !finished)
		},
		eventAllow: (dropInfo, draggedEvent) => {
			return !shiftPressed
		}
	}

	calendar = new Calendar(calendarEl, calendarOptions)

	addSelectionStyles()

	const cleanupSelectionHandlers = setupSelectionHandlers(calendarEl, calendar)
	// Override the destroy method to include cleanup
	const originalDestroy = calendar.destroy.bind(calendar)
	calendar.destroy = () => {
		console.debug('destroying calendar')
		// Call the cleanup function
		cleanupSelectionHandlers()
		// Call the original destroy method
		originalDestroy()
		// Cleanup the calendarEl
		calendarEl.innerHTML = ''
		calendarEl.removeEventListener('keydown', () => {})
		calendarEl.removeEventListener('wheel', () => {})
		// delete state.calendar
		state.calendar = null
	}

	calendar.render()
	console.debug('calendar.render() complete')

	// scrollToTime(scrollTime)
	scrollToTime('09:00:00')

	return calendar
}
