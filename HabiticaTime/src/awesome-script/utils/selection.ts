import { Calendar, EventApi } from '@fullcalendar/core'
import Color from 'color'
import { colors, state } from '../global'

export interface SelectionArea {
	left: number
	top: number
	right: number
	bottom: number
}

export function selectEvents(events: EventApi[]) {
	for (const event of events) {
		const originalColor = event.extendedProps.original.backgroundColor
		const newColor = Color(originalColor).lighten(0.3).hsl().string()

		event.setProp('backgroundColor', newColor)
		event.setProp('borderColor', newColor)
		event.setExtendedProp('selected', true)

		// Have to set groupId LAST
		event.setProp('groupId', 'selected')
	}
}
function deselectEvents(events: EventApi[]) {
	for (const event of events) {
		const originalColor = event.extendedProps.original.backgroundColor
		// Have to remove groupId FIRST
		event.setProp('groupId', '')
		event.setProp('borderColor', originalColor)
		event.setProp('backgroundColor', originalColor)
		event.setExtendedProp('selected', false)
	}
}
export function updateSelectedEvents(
	container: HTMLElement,
	selectionArea: SelectionArea,
	calendar: Calendar
) {
	const selectedEvents = [] as EventApi[]
	const deselectedEvents = [] as EventApi[]

	// Convert selection area to client coordinates
	const containerRect = container.getBoundingClientRect()
	const clientSelectionArea = {
		left: selectionArea.left + containerRect.left - container.scrollLeft,
		top: selectionArea.top + containerRect.top - container.scrollTop,
		right: selectionArea.right + containerRect.left - container.scrollLeft,
		bottom: selectionArea.bottom + containerRect.top - container.scrollTop
	}

	container.querySelectorAll('.fc-event').forEach(el => {
		const event = calendar.getEventById(el.getAttribute('data-event-id'))
		if (!event) return

		const eventRect = el.getBoundingClientRect()
		const isNowSelected =
			eventRect.left < clientSelectionArea.right &&
			eventRect.right > clientSelectionArea.left &&
			eventRect.top < clientSelectionArea.bottom &&
			eventRect.bottom > clientSelectionArea.top

		const wasAlreadySelected = event.extendedProps.selected

		// Deselect ALL events first
		if (wasAlreadySelected) deselectedEvents.push(event)

		// Then select events
		if (isNowSelected) selectedEvents.push(event)
	})

	state.calendar.pauseRendering()

	deselectEvents(deselectedEvents)
	selectEvents(selectedEvents)

	state.calendar.resumeRendering()
}

export function addSelectionStyles() {
	const style = document.createElement('style')
	style.innerHTML = `
        #selection-rect {
            position: absolute;
            border: 1px dashed #000;
            background-color: rgba(0, 0, 255, 0.1);
            pointer-events: none;
            z-index: 1000;
        }
    `
	document.head.appendChild(style)
}
export function updateSelectionRect(rect: HTMLElement, area: SelectionArea) {
	rect.style.position = 'absolute'
	rect.style.left = `${area.left}px`
	rect.style.top = `${area.top}px`
	rect.style.width = `${area.right - area.left}px`
	rect.style.height = `${area.bottom - area.top}px`
}

const SCROLL_THRESHOLD = 50 // pixels from edge to start scrolling
const SCROLL_SPEED = 15 // pixels per frame

function autoScroll(container: HTMLElement, mouseY: number) {
	const { height: viewportHeight } = window.visualViewport || { height: window.innerHeight }
	const { scrollTop } = container

	// Check viewport boundaries
	if (mouseY < SCROLL_THRESHOLD) {
		// Scroll up when near top of viewport
		container.scrollTop = scrollTop - SCROLL_SPEED
		return true
	} else if (mouseY > viewportHeight - SCROLL_THRESHOLD) {
		// Scroll down when near bottom of viewport
		container.scrollTop = scrollTop + SCROLL_SPEED
		return true
	}
	return false
}

export function setupSelectionHandlers(calendarEl: HTMLElement, calendar: Calendar): () => void {
	let isSelecting = false
	let scrollAnimationId: number | null = null
	const selectionRect = document.createElement('div')
	selectionRect.id = 'selection-rect'

	const state = {
		startX: 0,
		startY: 0,
		selectionArea: {} as SelectionArea
	}

	const onMouseDown = (e: MouseEvent) => {
		if (e.button !== 0 || (e.target.closest('.fc-event') && !e.shiftKey)) return

		const scrollContainer = document.querySelector(
			'.fc-scroller.fc-scroller-liquid-absolute'
		) as HTMLElement

		isSelecting = true
		const rect = scrollContainer.getBoundingClientRect()

		const scrollLeft = scrollContainer.scrollLeft
		const scrollTop = scrollContainer.scrollTop
		const offsetLeft = rect.left + window.scrollX
		const offsetTop = rect.top + window.scrollY

		state.startX = e.pageX - offsetLeft + scrollLeft
		state.startY = e.pageY - offsetTop + scrollTop

		state.selectionArea = {
			left: state.startX,
			top: state.startY,
			right: state.startX,
			bottom: state.startY
		}

		updateSelectionRect(selectionRect, state.selectionArea)

		scrollContainer.appendChild(selectionRect)
	}

	const onMouseMove = (e: MouseEvent) => {
		if (!isSelecting) return

		const scrollContainer = document.querySelector(
			'.fc-scroller.fc-scroller-liquid-absolute'
		) as HTMLElement

		const rect = scrollContainer.getBoundingClientRect()
		const scrollLeft = scrollContainer.scrollLeft
		const scrollTop = scrollContainer.scrollTop
		const offsetLeft = rect.left + window.pageXOffset
		const offsetTop = rect.top + window.pageYOffset

		const currentX = e.pageX - offsetLeft + scrollLeft
		const currentY = e.pageY - offsetTop + scrollTop

		state.selectionArea = {
			left: Math.min(state.startX, currentX),
			top: Math.min(state.startY, currentY),
			right: Math.max(state.startX, currentX),
			bottom: Math.max(state.startY, currentY)
		}

		updateSelectionRect(selectionRect, state.selectionArea)

		// Handle auto-scrolling
		if (autoScroll(scrollContainer, e.clientY)) {
			if (!scrollAnimationId) {
				const animate = () => {
					if (isSelecting && autoScroll(scrollContainer, e.clientY)) {
						onMouseMove(e) // Update selection while scrolling
						scrollAnimationId = requestAnimationFrame(animate)
					}
				}
				scrollAnimationId = requestAnimationFrame(animate)
			}
		} else if (scrollAnimationId) {
			cancelAnimationFrame(scrollAnimationId)
			scrollAnimationId = null
		}
	}

	const onMouseUp = () => {
		if (!isSelecting) return

		const scrollContainer = document.querySelector(
			'.fc-scroller.fc-scroller-liquid-absolute'
		) as HTMLElement

		isSelecting = false
		if (scrollAnimationId) {
			cancelAnimationFrame(scrollAnimationId)
			scrollAnimationId = null
		}
		selectionRect.remove()

		updateSelectedEvents(scrollContainer, state.selectionArea, calendar)
	}

	calendarEl.addEventListener('mousedown', onMouseDown)
	document.addEventListener('mousemove', onMouseMove)
	document.addEventListener('mouseup', onMouseUp)

	return () => {
		calendarEl.removeEventListener('mousedown', onMouseDown)
		document.removeEventListener('mousemove', onMouseMove)
		document.removeEventListener('mouseup', onMouseUp)
		if (selectionRect.parentNode) {
			selectionRect.remove()
		}
	}
}
