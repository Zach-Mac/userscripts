import { register } from '@violentmonkey/shortcut'
import { getPanel } from '@violentmonkey/ui'
import { createSignal } from 'solid-js'
import { render } from 'solid-js/web'

const [highlightTasks, setHighlightTasks] = createSignal(false)
const [numHighlightedTasks, setNumHighlightedTasks] = createSignal(0)

const panel = getPanel({
	theme: 'dark'
	// style: [globalCss, stylesheet].join('\n'),
})
Object.assign(panel.wrapper.style, {
	top: '10vh',
	left: '10vw'
})
panel.setMovable(true)
panel.hide()

function toggleHighlightTasks(highlight: boolean) {
	// highlight tasks with note that contains %
	setNumHighlightedTasks(0)
	const taskNotes = document.querySelectorAll('.task-notes')
	taskNotes.forEach(note => {
		if (note.textContent.includes('%')) {
			setNumHighlightedTasks(numHighlightedTasks() + 1)
			note.parentElement.style.backgroundColor = highlight ? 'yellow' : ''
		}
	})
}
function NumHighlightedTasksDisplay() {
	// floating div with number of highlighted tasks
	return (
		<div
			style={{
				padding: '1em',
				'font-size': '4em',
				'font-weight': 'bold',
				color: 'red'
			}}
		>
			{numHighlightedTasks()}
		</div>
	)
}
render(NumHighlightedTasksDisplay, panel.body)

function onClickToggleHighlightTasks() {
	setHighlightTasks(!highlightTasks())

	toggleHighlightTasks(highlightTasks())

	if (highlightTasks()) panel.show()
	else panel.hide()
}

register('ctrl-alt-h', () => {
	console.debug('clicked ctrl-alt-h')
	onClickToggleHighlightTasks()
})

const HighlightTasksToggle = () => {
	return (
		<button onClick={onClickToggleHighlightTasks}>
			{highlightTasks() ? 'Disable' : 'Enable'} Highlight Tasks w/ %
		</button>
	)
}
export const TaskHighlighter = HighlightTasksToggle
