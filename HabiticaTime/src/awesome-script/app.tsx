import { render } from 'solid-js/web'
import { observe } from '@violentmonkey/dom'

import { createCalendar } from './utils/calendar.js'
import { state } from './global.js'
import { getEventsFromColumn, refreshEventColors } from './utils/habitica.js'
import { msToHHMM } from './utils/utils.js'
import { createSignal } from 'solid-js'
import { TimeCalc } from './timeCalc.jsx'
import { TaskTools } from './taskTools.jsx'

const [dupeEvents, setDupeEvents] = createSignal<Record<string, number>>({})

const initCalendar = observe(document.body, () => {
	const dailiesColumn = document.querySelector('.tasks-column.daily')
	if (!dailiesColumn) return false

	let timeColumn = document.querySelector('.tasks-column.time')
	if (timeColumn) return false

	timeColumn = document.createElement('div')
	timeColumn.className = 'tasks-column col-lg-3 col-md-6 time'
	dailiesColumn.after(timeColumn)

	const handleCreateCal = () => {
		const initialEvents = getEventsFromColumn(dailiesColumn)
		state.calendar = createCalendar(
			initialEvents,
			dailiesColumn.clientHeight
		)
	}
	const handleDeleteCal = () => {
		state.calendar?.destroy()
		localStorage.removeItem('events')
	}
	const printEvents = () => {
		for (const event of state.calendar.getEvents()) {
			console.log('event', event.title, event)
		}
	}

	const Wrapper = () => (
		<div>
			{/* display dupeEvents */}
			{Object.entries(dupeEvents()).map(([eventName, duration]) => (
				<div>
					{eventName}: {msToHHMM(duration)}
				</div>
			))}
			<button onClick={handleCreateCal}>Create Calendar</button>
			<button onClick={handleDeleteCal}>Delete Calendar</button>
			<button onClick={printEvents}>Print Events</button>
			<button
				onClick={() => {
					const currentHeight = state.calendar.getOption('height')
					state.calendar.setOption(
						'height',
						(typeof currentHeight === 'number'
							? currentHeight
							: parseInt(currentHeight)) + 100
					)
					// increase #wrapper height
					// const wrapper = document.getElementById('wrapper')
					// const currentHeight = wrapper.clientHeight
					// wrapper.style.height = `${currentHeight + 100}px`
				}}
			>
				Height++
			</button>
			<button
				onClick={() => {
					const currentHeight = state.calendar.getOption('height')
					state.calendar.setOption(
						'height',
						(typeof currentHeight === 'number'
							? currentHeight
							: parseInt(currentHeight)) - 100
					)
					// const wrapper = document.getElementById('wrapper')
					// const currentHeight = wrapper.clientHeight
					// wrapper.style.height = `${currentHeight - 100}px`
				}}
			>
				Height--
			</button>
			{/* <div id="wrapper" style="height: 90vh; overflow: scroll;"> */}
			<div id="calendar"></div>
			{/* </div> */}
		</div>
	)
	render(Wrapper, timeColumn)

	const savedEvents = JSON.parse(localStorage.getItem('events') || '[]')
	if (savedEvents.length > 0) {
		state.calendar = createCalendar(savedEvents, dailiesColumn.clientHeight)
		// state.calendar = createCalendar(savedEvents, 5000)
	}

	return true
})

const initTimeDisplay = observe(document.body, () => {
	const navDiv = document.querySelector('.tasks-navigation')
	if (!navDiv) return false
	if (!document.querySelector('#timeCalcContainer')) {
		const container = document.createElement('div')
		container.id = 'timeCalcContainer'
		navDiv.parentNode.insertBefore(container, navDiv.nextSibling)
		render(() => <TimeCalc />, container)
	}

	return true
})

const initTaskTools = observe(document.body, () => {
	const dailiesColumn = document.querySelector('.tasks-column.daily')
	if (!dailiesColumn) return false

	dailiesColumn.appendChild(TaskTools())

	return true
})

observe(document.body, () => {
	// hide habits column if screen is small
	if (window.innerWidth < 1000) {
		const habits = document.querySelector(
			'.tasks-column.habit'
		) as HTMLElement
		if (habits) habits.style.display = 'none'
	} else {
		const habits = document.querySelector(
			'.tasks-column.habit'
		) as HTMLElement
		if (habits) habits.style.display = 'block'
	}

	// hide rewards column
	const rewards = document.querySelector(
		'.tasks-column.reward'
	) as HTMLElement
	if (rewards) rewards.style.display = 'none'

	// Update calendar display
	const dailiesColumn = document.querySelector('.tasks-column.daily')
	if (dailiesColumn && state.calendar) {
		// Update event colors
		const events = state.calendar.getEvents()

		state.calendar.pauseRendering()
		refreshEventColors(dailiesColumn, events)
		state.calendar.resumeRendering()

		// if more than one event have the same name, sum their durations and print total duration in console
		const eventDurations: Record<string, number> = {}
		const duplicateEvents: string[] = []
		for (const event of events) {
			const start = event.start
			const end = event.end
			const duration = end.getTime() - start.getTime()
			if (eventDurations[event.title]) {
				eventDurations[event.title] += duration
				duplicateEvents.push(event.title)
			} else {
				eventDurations[event.title] = duration
			}
		}
		for (const eventName of duplicateEvents) {
			// add eventduration to dupeEvents[title]
			if (dupeEvents()[eventName] !== eventDurations[eventName]) {
				setDupeEvents({
					...dupeEvents(),
					[eventName]: eventDurations[eventName]
				})
			}
		}

		// Set calendar height
		const sortableTasks = dailiesColumn.querySelector('.sortable-tasks')
		const calendarEl = document.querySelector('#calendar') as HTMLElement
		if (calendarEl) {
			const currentHeight = state.calendar.getOption('height')
			const idealHeight = Math.max(
				sortableTasks.clientHeight,
				window.innerHeight * 0.9
			)
			if (currentHeight !== idealHeight) {
				state.calendar.setOption('height', idealHeight)
			}
		}
	}

	// TODO: track dailies finishes

	// TODO: right click menu

	// TODO: ctrl click to multi select

	// BUG: sometimes certain events not selectable??

	// BUG: zoom in/out keyboard shortcuts don't work well. focus seems to only be on calendar button click

	// TODO: set color for late events
	// TODO: set color for current event

	// TODO: don't make deleting calendar necessary. if delete, then delete for just today

	// TODO: edit toggle to add/delete events

	// TODO: zoom in and out separate from slot duration
})
