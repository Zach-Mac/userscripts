import { createSignal } from 'solid-js'
import { observe } from '@violentmonkey/dom'

const [showEditButtons, setShowEditButtons] = createSignal(false)
const [showSkipButtons, setShowSkipButtons] = createSignal(false)

function clickSaveButton() {
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
function setRepeatEveryValue(value: string) {
	observe(document.body, () => {
		const optionDivs = document.querySelectorAll('.option')
		if (!optionDivs) return false

		optionDivs.forEach(function (optionDiv) {
			const label = optionDiv.querySelector('label')
			if (label && label.textContent.trim() === 'Repeat Every') {
				const input = optionDiv.querySelector(
					'input[type="number"]'
				) as HTMLInputElement
				if (input) {
					// Update the input value using Vue.js data binding
					input.value = value

					// Trigger the input event to notify Vue.js of the change
					const event = new Event('input', { bubbles: true })
					input.dispatchEvent(event)

					clickSaveButton()

					return true
				}
			}
		})

		return true
	})
}
function decrementStreak() {
	observe(document.body, () => {
		const optionDivs = document.querySelectorAll('.option')
		if (!optionDivs) return false

		optionDivs.forEach(function (optionDiv) {
			const label = optionDiv.querySelector('label')
			if (label && label.textContent.trim() === 'Adjust Streak') {
				const input = optionDiv.querySelector(
					'input[type="number"]'
				) as HTMLInputElement
				if (input) {
					// Update the input value using Vue.js data binding
					const oldValue = parseInt(input.value)
					input.value = (oldValue - 1).toString()

					// Trigger the input event to notify Vue.js of the change
					const event = new Event('input', { bubbles: true })
					input.dispatchEvent(event)

					clickSaveButton()

					return true
				}
			}
		})

		return true
	})
}

function enableTask(taskClickableArea: HTMLElement) {
	taskClickableArea.click()
	setRepeatEveryValue('1')
}
function disableTask(taskClickableArea: HTMLElement) {
	taskClickableArea.click()
	setRepeatEveryValue('0')
}

function skipTask(taskClickableArea: HTMLElement) {
	taskClickableArea.click()
	decrementStreak()
	// TODO: click complete task button
}

let createdButtons: HTMLElement[] = []

function createTaskEditButtons() {
	const dailiesColumn = document.querySelector('.tasks-column.daily')
	const taskClickableAreas = dailiesColumn.querySelectorAll(
		'.task-clickable-area'
	)
	taskClickableAreas.forEach(taskClickableArea => {
		const Container = () => (
			<div>
				<button
					onClick={() => {
						enableTask(taskClickableArea as HTMLElement)
					}}
				>
					Enable
				</button>
				<button
					onClick={() => {
						disableTask(taskClickableArea as HTMLElement)
					}}
				>
					Disable
				</button>
			</div>
		)
		const container = Container()
		taskClickableArea.insertAdjacentElement('afterend', container)
		createdButtons.push(container)
	})
}

function createSkipButtons() {
	const dailiesColumn = document.querySelector('.tasks-column.daily')
	const taskClickableAreas = dailiesColumn.querySelectorAll(
		'.task-clickable-area'
	)
	taskClickableAreas.forEach(taskClickableArea => {
		const Container = () => (
			<button
				onClick={() => {
					skipTask(taskClickableArea as HTMLElement)
				}}
			>
				Skip
			</button>
		)
		const container = Container()
		taskClickableArea.insertAdjacentElement('afterend', container)
		createdButtons.push(container)
	})
}

function removeCreatedButtons() {
	createdButtons.forEach(btn => btn.remove())
	createdButtons = []
}

const EditDailiesToggle = () => {
	return (
		<button
			onClick={() => {
				if (showEditButtons()) {
					removeCreatedButtons()
				} else {
					createTaskEditButtons()
				}
				setShowEditButtons(!showEditButtons())
			}}
		>
			{showEditButtons() ? 'Stop editing dailies' : 'Edit dailies'}
		</button>
	)
}
const SkipDailiesToggle = () => {
	return (
		<button
			onClick={() => {
				if (showSkipButtons()) {
					removeCreatedButtons()
				} else {
					createSkipButtons()
				}
				setShowSkipButtons(!showSkipButtons())
			}}
		>
			{showSkipButtons() ? 'Stop skipping dailies' : 'Skip daily'}
		</button>
	)
}

export const TaskTools = () => (
	<div>
		<EditDailiesToggle />
		<SkipDailiesToggle />
	</div>
)
