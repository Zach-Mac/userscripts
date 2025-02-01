import { EventSourceInput, Calendar, DateSelectArg, CalendarOptions } from '@fullcalendar/core'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import { addSelectionStyles, selectEvents, setupSelectionHandlers } from './selection'
import { parseTime, msToHHMMSS, getRoundedNow, getMinutesAgoString, throttle } from './utils'
import { colors, zoomLevels, state } from '../global'
import { createEvent } from './events'

export function createCalendar(initialEvents: EventSourceInput, height: number): Calendar {
	const calendarEl = document.getElementById('calendar')

	let calendar: Calendar

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

	function zoomZoom(level: number) {
		const timeGridBody = calendarEl.querySelector('.fc-timegrid-body') as HTMLElement
		const currentZoomLevel = parseFloat(timeGridBody.style.zoom) || 1

		const newZoomLevel = currentZoomLevel + level

		timeGridBody.style.zoom = `${newZoomLevel}`

		const timeGridSlots = calendarEl.querySelector('.fc-timegrid-slots table') as HTMLElement
		const timeGridCols = calendarEl.querySelector('.fc-timegrid-cols table') as HTMLElement

		const newWidth = 100 / newZoomLevel

		timeGridSlots.style.width = `${newWidth}%`
		timeGridCols.style.width = `${newWidth}%`

		// change font size
		// const oldFontSize = parseFloat(window.getComputedStyle(timeGridSlots).fontSize)
		// const newFontSize = 1 / newZoomLevel
		// timeGridSlots.style.fontSize = `${newFontSize}em`
		// timeGridCols.style.fontSize = `${newFontSize}em`

		// console.log('oldFontSize', oldFontSize, 'newFontSize', newFontSize)

		calendar.render()
	}

	function adjustScroll(mouseTimeBefore: number, mouseY: number) {
		const oldScrollTime = getScrollTime()
		const mouseTimeAfter = getTimeAtMousePosition(mouseY)
		const diff = mouseTimeBefore - mouseTimeAfter
		const newScrollTime = oldScrollTime + diff

		calendar.scrollToTime(msToHHMMSS(newScrollTime))

		return { mouseTimeAfter, newScrollTime }
	}

	function slotDurationZoom(value: number, mouseY?: number) {
		const newZoomLevel = state.currentZoomLevel + value

		if (newZoomLevel < 0 || newZoomLevel >= zoomLevels.length) return

		state.currentZoomLevel = newZoomLevel

		console.debug('slotDurationZoom', newZoomLevel, zoomLevels[newZoomLevel])

		const mouseTimeBefore = getTimeAtMousePosition(mouseY)

		calendar.setOption('slotDuration', zoomLevels[state.currentZoomLevel])
		// TODO: with levels have a zoom value to zoom as well (only for some levels prob just to add some between 1-5m)
		// also first check with changing fontsize with zoomzoom

		if (mouseY !== undefined) {
			adjustScroll(mouseTimeBefore, mouseY)
		}
	}

	function zoomIn(mouseY?: number) {
		console.debug('zoomIn', mouseY)
		slotDurationZoom(-1, mouseY)
		// zoomZoom(0.1)
	}

	function zoomOut(mouseY?: number) {
		console.debug('zoomOut', mouseY)
		slotDurationZoom(1, mouseY)
		// zoomZoom(-0.1)
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
				zoomOut()
			} else if (event.key === '+' || event.key === '=' || event.key === '+') {
				event.preventDefault()
				zoomIn()
			}
		}
	})

	const throttledZoom = throttle((mouseY: number, shouldZoomIn: boolean) => {
		if (shouldZoomIn) {
			zoomIn(mouseY)
		} else {
			zoomOut(mouseY)
		}
	}, 10)

	calendarEl.addEventListener('wheel', event => {
		if (event.ctrlKey) {
			event.preventDefault()
			const mouseY = event.clientY
			throttledZoom(mouseY, event.deltaY < 0)
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

	const calendarOptions: CalendarOptions = {
		plugins: [timeGridPlugin, interactionPlugin],
		initialView: 'timeGridDay',
		customButtons: {
			zoomIn: {
				text: '+',
				click: () => zoomIn(),
				hint: 'Zoom in'
			},
			zoomOut: {
				text: '-',
				click: () => zoomOut(),
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
			}
		},
		titleFormat: { month: 'short', day: 'numeric' },
		headerToolbar: {
			// left: 'prev,next timeGridWeek,timeGridDay',
			left: 'prev,next',
			center: 'title',
			right: 'addEvent,selectAll zoomOut,zoomIn'
		},
		editable: true,
		height,
		slotDuration: zoomLevels[state.currentZoomLevel],
		slotLabelInterval: { minutes: 30 },
		slotMinTime: '03:00:00',
		slotMaxTime: '26:00:00',
		expandRows: true,
		scrollTime: getMinutesAgoString(now, 30, false),
		nowIndicator: true,
		selectable: true,
		select: info => {
			if (!shiftPressed) addEvent(info)
			calendar.unselect()
		},
		allDaySlot: false,
		events: initialEvents,
		eventsSet: events => {
			console.log('eventsSet', events)
			localStorage.setItem('events', JSON.stringify(events))
		},
		eventDidMount: info => {
			info.el.setAttribute('data-event-id', info.event.id)
		},
		eventClick: info => {
			if (info.jsEvent.shiftKey) return
			if (info.jsEvent.ctrlKey) return

			if (confirm(`Delete event "${info.event.title}"?`)) {
				info.event.remove()
			}
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

	return calendar
}
