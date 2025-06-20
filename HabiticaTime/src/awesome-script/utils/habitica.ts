import { EventApi, EventInput } from '@fullcalendar/core'
import Color from 'color'
import { getRoundedNow } from './utils'
import { createEvent, setEventExtendedProp, setEventProp } from './events'
import { colors } from '../global'

const SAVED_HABIT_TASK_TITLE = 'Saved'

interface TaskTimeData {
	minutes: number
	fullMinutes: number
	preferredTime: string
	preferredTimeOffset: number
}

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
function getTaskTimeData(task: Element): TaskTimeData {
	const taskNotes = task.querySelector('.task-notes')
	const noteText = taskNotes.textContent

	const minMatch = noteText.match(/^(\d+)m/)
	const fullMatch = noteText.match(/^(\d+)fm/)
	const preferredTimeMatch = noteText.match(/pt=([0-9:apm]+)/i)
	const preferredTimeOffsetMatch = noteText.match(/pto=([+-]?\d+)m/i)
	let preferredTime = ''
	if (preferredTimeMatch) {
		preferredTime = preferredTimeMatch[1]
		// if it contains am or pm, ad a space before it
		if (preferredTime.match(/am|pm/i)) {
			preferredTime = preferredTime.replace(/(am|pm)/i, ' $1')
		}
	}

	if (preferredTime && preferredTimeOffsetMatch) {
		// Alert user with details of task
		alert(
			`Error: Task "${getTaskTitle(task)}" has both a preferred time of "${preferredTime}" and an offset of ${preferredTimeOffsetMatch[1]} minutes. Task can either have a preferred time or an offset, not both.`
		)
		preferredTime = ''
	}

	return {
		minutes: minMatch ? parseInt(minMatch[1]) : 0,
		fullMinutes: fullMatch ? parseInt(fullMatch[1]) : 0,
		preferredTime: preferredTime,
		preferredTimeOffset: preferredTimeOffsetMatch ? parseInt(preferredTimeOffsetMatch[1]) : 0
	}
}
function getTaskFullMinutes(task: Element): number {
	const taskNotes = task.querySelector('.task-notes')
	const noteText = taskNotes.textContent

	const fullMatch = noteText.match(/^(\d+)fm/)

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

	const customEventColor = colors.customEvent.hsl().string()
	const finishedEventColor = colors.finishedEvent.hsl().string()

	for (const event of events) {
		if (event.extendedProps.selected) continue

		if (event.extendedProps.customEvent) {
			if (event.extendedProps.finished) {
				setEventColor(event, finishedEventColor)
				console.debug('setting finished event color', event.title)
			} else {
				setEventColor(event, customEventColor)
				console.debug('setting custom event color', event.title, event)
			}

			continue
		}

		const task = tasks.find(task => getTaskTitle(task) === event.title)
		if (!task) {
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

	let startTime = getRoundedNow(5)

	for (const task of taskWrapper) {
		const titleText = getTaskTitle(task)
		const taskColor = getTaskColor(task)

		const taskTimeData = getTaskTimeData(task)

		const eventColor = getEventColor(taskColor, taskTimeData.fullMinutes)

		if (!taskTimeData.minutes && !taskTimeData.fullMinutes) continue

		console.debug(
			titleText,
			taskTimeData.minutes,
			taskTimeData.fullMinutes,
			taskTimeData.preferredTime
		)

		const start = new Date(startTime.getTime())
		// start.setMinutes(start.getMinutes())
		if (taskTimeData.preferredTime) {
			const preferredTime = new Date(
				startTime.toLocaleDateString() + ' ' + taskTimeData.preferredTime
			)
			console.log('preferredTime', preferredTime)
			console.log('startbefore', start, start.getMinutes())
			console.log('preferredTime.getMinutes()', preferredTime.setTime)
			start.setTime(preferredTime.getTime())
			console.log('startafter', start)
		}
		if (taskTimeData.preferredTimeOffset) {
			start.setMinutes(start.getMinutes() + taskTimeData.preferredTimeOffset)
		}

		const durationOver5m = taskTimeData.minutes >= 5 || taskTimeData.fullMinutes >= 5

		console.debug(
			'start',
			start,
			'durationOver5m',
			durationOver5m,
			'start.getMinutes()',
			start.getMinutes(),
			'start.getMinutes() % 5',
			start.getMinutes() % 5
		)

		// if start minutes is not divisible by 5, round it up
		if (durationOver5m && start.getMinutes() % 5 !== 0) {
			start.setMinutes(start.getMinutes() + 5 - (start.getMinutes() % 5))
		}

		const end = new Date(start.getTime())
		end.setMinutes(end.getMinutes() + taskTimeData.minutes + taskTimeData.fullMinutes)

		startTime = new Date(end.getTime())

		// totalMinutes += taskTimeData.minutes
		// totalFullMinutes += taskTimeData.fullMinutes

		const newEvent = createEvent({
			title: titleText,
			start,
			end,
			backgroundColor: eventColor,
			borderColor: eventColor
		})

		console.debug('pushing', newEvent)

		events.push(newEvent)
	}

	return events
}

export function getSavedHabitElement(column: Element): Element {
	const taskWrapper = column.querySelectorAll('.task-wrapper')

	for (const task of taskWrapper) {
		const titleText = getTaskTitle(task)
		if (titleText !== SAVED_HABIT_TASK_TITLE) continue

		return task
	}
}

export function getEventsFromSavedHabitNote(column: Element): EventInput[] {
	const task = getSavedHabitElement(column)
	if (!task) return []

	const taskNotes = getTaskNotes(task)

	const events = JSON.parse(taskNotes) as EventInput[]

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
