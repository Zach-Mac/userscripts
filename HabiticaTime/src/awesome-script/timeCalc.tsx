import { createSignal, createEffect } from 'solid-js'
import { colors } from './global'
import { observe } from '@violentmonkey/dom'

function minsToDuration(totalMinutes: number) {
	let hours = Math.floor(totalMinutes / 60)
	let minutes = totalMinutes % 60
	const maybeZero = minutes < 10 ? '0' : ''
	return `${hours}h${maybeZero}${minutes}m`
}

function minsToHHMMSS(totalMinutes: number) {
	let hours = Math.floor(totalMinutes / 60)
	let minutes = totalMinutes % 60
	const ampm = hours >= 12 ? 'PM' : 'AM'
	hours = hours % 12 || 12
	const maybeZero = minutes < 10 ? '0' : ''
	return `${hours}:${maybeZero}${minutes} ${ampm}`
}

function parseTaskTimes() {
	let total = 0
	let totalFull = 0
	const taskNotes = document.querySelectorAll('.task-notes')
	taskNotes.forEach(note => {
		const minMatch = note.textContent.match(/^(\d+)m/)
		if (minMatch) total += parseInt(minMatch[1], 10)
		const fullMatch = note.textContent.match(/^(\d+)fm/)
		if (fullMatch) totalFull += parseInt(fullMatch[1], 10)
	})
	return { total, totalFull }
}

const labelStyle = {
	'font-weight': 'bold',
	'margin-right': '0.25rem'
}

export function TimeCalc() {
	const [currentTime, setCurrentTime] = createSignal('')
	const [totalTime, setTotalTime] = createSignal('')
	const [fullTime, setFullTime] = createSignal('')
	const [newTime, setNewTime] = createSignal('')
	const [newFullTime, setNewFullTime] = createSignal('')

	function updateTime() {
		const now = new Date()
		const currentMinutes = now.getHours() * 60 + now.getMinutes()
		setCurrentTime(minsToHHMMSS(currentMinutes))

		const { total, totalFull } = parseTaskTimes()
		setTotalTime(minsToDuration(total))
		setFullTime(minsToDuration(totalFull))

		setNewTime(minsToHHMMSS(currentMinutes + total))
		setNewFullTime(minsToHHMMSS(currentMinutes + total + totalFull))
	}

	createEffect(() => {
		updateTime()
		const timer = setInterval(updateTime, 30_000)
		return () => clearInterval(timer)
	})

	observe(document.body, () => {
		updateTime()
	})

	const mobile = screen.width < 600
	const boxStyle = {
		display: 'flex',
		'flex-direction': 'column',
		'align-items': 'center'
	}
	const labelStyle = {
		'font-size': mobile ? '0.8em' : '1em',
		'font-weight': 'bold'
	}
	const numberStyle = {
		'font-size': mobile ? '1.4em' : '2em'
	}
	const outerStyle = {
		display: 'flex',
		'align-items': 'flex-end',
		'justify-content': 'center',
		gap: mobile ? '0.5rem' : '1rem',
		padding: mobile ? '0.5rem' : '1rem'
	}

	// Add color styles:
	// const currentColor = { color: colors.blueEvent.darken(0.5).hsl().string() }
	const durationDarken = 0.25
	const timeDarken = 0.5

	const currentColor = {}
	const durationColor = { color: colors.blueEvent.darken(durationDarken).string() }
	const newTimeColor = { color: colors.blueEvent.darken(timeDarken).string() }

	const fullDurationColor = { color: colors.defaultFullMin.darken(durationDarken).string() }
	const newFullTimeColor = { color: colors.defaultFullMin.darken(timeDarken).string() }

	return (
		<div style={outerStyle} id="timecalc">
			<div style={boxStyle}>
				<span style={{ ...labelStyle, ...currentColor }}>Current</span>
				<span style={{ ...numberStyle, ...currentColor }}>{currentTime()}</span>
			</div>
			<span style={numberStyle}>+</span>
			<div style={boxStyle}>
				<span style={{ ...labelStyle, ...durationColor }}>Task</span>
				<span style={{ ...numberStyle, ...durationColor }}>{totalTime()}</span>
			</div>
			<span style={numberStyle}>=</span>
			<div style={boxStyle}>
				<span style={{ ...labelStyle, ...newTimeColor }}>End</span>
				<span style={{ ...numberStyle, ...newTimeColor }}>{newTime()}</span>
			</div>
			<span style={numberStyle}>+</span>
			<div style={boxStyle}>
				<span style={{ ...labelStyle, ...fullDurationColor }}>Full</span>
				<span style={{ ...numberStyle, ...fullDurationColor }}>{fullTime()}</span>
			</div>
			<span style={numberStyle}>=</span>
			<div style={boxStyle}>
				<span style={{ ...labelStyle, ...newFullTimeColor }}>Full End</span>
				<span style={{ ...numberStyle, ...newFullTimeColor }}>{newFullTime()}</span>
			</div>
		</div>
	)
}
