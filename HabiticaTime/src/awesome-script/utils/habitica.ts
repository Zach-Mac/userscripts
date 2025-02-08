import { EventApi, EventInput } from '@fullcalendar/core'
import Color from 'color'
import { getRoundedNow } from './utils'
import { createEvent, setEventExtendedProp, setEventProp } from './events'
import { colors } from '../global'

function getTaskColor(task: Element) {
	const leftControl = task.querySelector('.left-control') as HTMLElement
	const style = window.getComputedStyle(leftControl)
	return style.backgroundColor
}
function getTaskTitle(task: Element) {
	const taskTitle = task.querySelector('.task-title')
	return taskTitle.textContent.trim()
}
function getTaskNotes(task: Element) {
	const taskNotes = task.querySelector('.task-notes')
	return taskNotes.textContent.trim()
}
function getTaskMinutes(task: Element): number {
	const taskNotes = task.querySelector('.task-notes')
	const noteText = taskNotes.textContent

	let minMatch = noteText.match(/^(\d+)m/)

	if (minMatch) return parseInt(minMatch[1])

	return 0
}
function getTaskFullMinutes(task: Element): number {
	const taskNotes = task.querySelector('.task-notes')
	const noteText = taskNotes.textContent

	let fullMatch = noteText.match(/^(\d+)fm/)

	if (fullMatch) return parseInt(fullMatch[1])

	return 0
}

function getEventColor(taskColor: string, taskFullMinutes: number) {
	let backgroundColor = Color(taskColor)

	if (taskFullMinutes) backgroundColor = backgroundColor.mix(colors.fullMinMix, 0.3)

	return backgroundColor.hsl().string()
}

function setEventColor(event: EventApi, color: string) {
	setEventProp(event, 'backgroundColor', color)
	setEventProp(event, 'borderColor', color)
	setEventExtendedProp(event, 'original.backgroundColor', color)
	setEventExtendedProp(event, 'original.borderColor', color)
}

export function refreshEventColors(column: Element, events: EventApi[]) {
	const taskWrapper = column.querySelectorAll('.task-wrapper')

	const tasks = Array.from(taskWrapper)

	for (const event of events) {
		if (event.extendedProps.selected) continue

		if (event.extendedProps.customEvent) {
			const customEventColor = colors.customEvent.hsl().string()
			setEventColor(event, customEventColor)

			continue
		}

		const task = tasks.find(task => getTaskTitle(task) === event.title)
		if (!task) {
			const finishedEventColor = colors.finishedEvent.hsl().string()
			setEventColor(event, finishedEventColor)

			continue
		}

		const taskColor = getTaskColor(task)
		const taskFullMinutes = getTaskFullMinutes(task)
		const eventColor = getEventColor(taskColor, taskFullMinutes)
		setEventColor(event, eventColor)
	}
}

export function getEventsFromColumn(column: Element): EventInput[] {
	const events = [] as EventInput[]
	const taskWrapper = column.querySelectorAll('.task-wrapper')

	// Sum task minutes
	let totalMinutes = 0
	let totalFullMinutes = 0

	const now = getRoundedNow(5)

	for (const task of taskWrapper) {
		console.log(task)
		const titleText = getTaskTitle(task)
		const taskColor = getTaskColor(task)

		const taskMinutes = getTaskMinutes(task)
		const taskFullMinutes = getTaskFullMinutes(task)

		const eventColor = getEventColor(taskColor, taskFullMinutes)

		console.log('asdf')
		if (!taskMinutes && !taskFullMinutes) continue
		console.log('asdf2')

		const start = new Date(now.getTime())
		start.setSeconds(0)
		start.setMinutes(start.getMinutes() + totalMinutes + totalFullMinutes)

		// if start minutes is not divisible by 5, round it up
		if (start.getMinutes() % 5 !== 0) {
			start.setMinutes(start.getMinutes() + 5 - (start.getMinutes() % 5))
		}

		const end = new Date(start.getTime())
		end.setMinutes(end.getMinutes() + taskMinutes + taskFullMinutes)

		totalMinutes += taskMinutes
		totalFullMinutes += taskFullMinutes

		const newEvent = createEvent({
			title: titleText,
			start,
			end,
			backgroundColor: eventColor,
			borderColor: eventColor
		})

		console.log('pushing', newEvent)

		events.push(newEvent)
	}

	return events
}

export function clickSaveButton() {
	console.debug('clicking save')
	const buttons = document.querySelectorAll('button.btn.btn-secondary')
	for (const button of buttons as NodeListOf<HTMLButtonElement>) {
		console.debug('button', button)
		if (button.textContent.trim() === 'Save') {
			button.click()
			return true
		}
	}
}
