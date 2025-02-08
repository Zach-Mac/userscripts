import { createEffect, createSignal } from 'solid-js'
import { observe } from '@violentmonkey/dom'
import { register } from '@violentmonkey/shortcut'
import { clickSaveButton } from './utils/habitica'
import { render } from 'solid-js/web'

const [showEditButtons, setShowEditButtons] = createSignal(false)

register('ctrl-alt-e', () => {
	console.debug('clicked ctrl-alt-e')
	setShowEditButtons(!showEditButtons())
})

function setRepeatEveryValue(value: string) {
	observe(document.body, () => {
		const optionDivs = document.querySelectorAll('.option')
		if (!optionDivs) return false

		optionDivs.forEach(function (optionDiv) {
			const label = optionDiv.querySelector('label')
			if (label && label.textContent.trim() === 'Repeat Every') {
				const input = optionDiv.querySelector('input[type="number"]') as HTMLInputElement
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
				const input = optionDiv.querySelector('input[type="number"]') as HTMLInputElement
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
	const taskClickableAreas = dailiesColumn.querySelectorAll('.task-clickable-area')
	for (const taskClickableArea of taskClickableAreas as NodeListOf<HTMLElement>) {
		if (taskClickableArea.parentElement.querySelector('.taskEditButtonsContainer')) continue

		const Container = () => (
			<div class="taskEditButtonsContainer">
				<button
					onClick={() => {
						enableTask(taskClickableArea)
					}}
				>
					Enable
				</button>
				<button
					onClick={() => {
						disableTask(taskClickableArea)
					}}
				>
					Disable
				</button>
				<button
					onClick={() => {
						skipTask(taskClickableArea)
					}}
				>
					Skip
				</button>
			</div>
		)
		const containerElement = document.createElement('div')
		render(() => <Container />, containerElement)
		taskClickableArea.insertAdjacentElement('afterend', containerElement)
		createdButtons.push(containerElement)
	}
}

function removeCreatedButtons() {
	createdButtons.forEach(btn => btn.remove())
	createdButtons = []
}

let showButtonsObserver: () => void

const EditDailiesToggle = () => {
	createEffect(() => {
		if (showEditButtons()) {
			if (!showButtonsObserver) {
				createTaskEditButtons()
				showButtonsObserver = observe(document.body, () => {
					createTaskEditButtons()
				})
			}
		} else if (showButtonsObserver) {
			showButtonsObserver()
			showButtonsObserver = undefined
			removeCreatedButtons()
		}
	})

	return (
		<button
			onClick={() => {
				setShowEditButtons(!showEditButtons())
			}}
		>
			{showEditButtons() ? 'Stop editing dailies' : 'Edit dailies'}
		</button>
	)
}
// const SkipDailiesToggle = () => {
// 	return (
// 		<button
// 			onClick={() => {
//                 setShowSkipButtons(!showSkipButtons())
// 				if (showSkipButtons()) {
//                     createSkipButtons()
//                 } else {
// 					removeCreatedButtons()
// 				}
// 			}}
// 		>
// 			{showSkipButtons() ? 'Stop skipping dailies' : 'Skip daily'}
// 		</button>
// 	)
// }

export const TaskTools = () => (
	<div>
		<EditDailiesToggle />
	</div>
)
