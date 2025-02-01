import { createSignal } from 'solid-js'
import { render } from 'solid-js/web'
import { getPanel, showToast } from '@violentmonkey/ui'
import { hm, observe } from '@violentmonkey/dom'
// global CSS
import globalCss from './style.css'
// CSS modules
import styles, { stylesheet } from './style.module.css'

function injectStyles(css: string) {
	const style = document.createElement('style')
	style.textContent = css
	document.head.appendChild(style)
}

injectStyles(globalCss)

// TODO: highlight lowest values in each stat
// TODO: show num games
// TODO: modify num lowest

const disconnect = observe(document.body, () => {
	const existingRow = document.querySelector('#myRow')
	if (existingRow) return

	// get player status. if status !== 'Active', highlight it and return
	const playerStatus = document.querySelector('.TextStatus').textContent
	if (playerStatus !== 'Active') {
		document.querySelector('.PlayerHeader').style.backgroundColor = 'yellow'
		return
	}

	const tableTitles = document.querySelectorAll('.Table__Title')
	const regularSeasonTables = []

	for (const title of tableTitles) {
		if (title.textContent.includes('Regular Season')) {
			let sibling = title.nextElementSibling
			while (sibling) {
				const table = sibling.querySelector('table')
				if (table && !table.textContent.includes('Preseason')) {
					const table = sibling.querySelector('table')
					regularSeasonTables.push(table)
				}
				sibling = sibling.nextElementSibling
			}
		}
	}

	console.log('TABLES: ', regularSeasonTables)

	if (regularSeasonTables.length === 0) {
		console.error('Regular season tables not found.')
		return
	}

	// Get all stat names from the header of the first table
	const headerCells = regularSeasonTables[0].querySelectorAll('thead th')
	const statNames = []
	headerCells.forEach(cell => {
		const statName = cell.textContent.trim()
		if (statName && !['Date', 'OPP', 'Result'].includes(statName)) {
			statNames.push(statName)
		}
	})

	function getLowestValuesForAllStats(numValues) {
		const statValuesMap = {} // Map of statName to array of {value, row}

		for (const statName of statNames) {
			statValuesMap[statName] = []
		}

		for (const regularSeasonTable of regularSeasonTables) {
			console.log('TABLE: ', regularSeasonTable)

			const headerCells = regularSeasonTable.querySelectorAll('thead th')
			const statIndices = {}

			headerCells.forEach((cell, index) => {
				const statName = cell.textContent.trim()
				if (statNames.includes(statName)) {
					statIndices[statName] = index
				}
			})

			const rows = regularSeasonTable.querySelectorAll('tbody tr')

			rows.forEach(row => {
				if (row.classList.contains('note-row') || row.classList.contains('totals_row')) {
					return
				}
				const cells = row.querySelectorAll('td')
				for (const statName of statNames) {
					const statIndex = statIndices[statName]
					if (typeof statIndex !== 'undefined') {
						const statCell = cells[statIndex]
						if (statCell) {
							const statValue = parseFloat(statCell.textContent.trim())
							if (!isNaN(statValue)) {
								statValuesMap[statName].push({
									value: statValue,
									row: row,
									highlighted: false
								})
							}
						}
					}
				}
			})
		}

		console.log('statValuesMap', statValuesMap)

		const firstTableBody = regularSeasonTables[0].querySelector('tbody')
		if (!firstTableBody) {
			console.error('First table body not found.')
			return
		}

		function toggleHighlightedClass(statValueItem) {
			const sourceRow = statValueItem?.row
			const highlighted = statValueItem?.highlighted
			if (sourceRow) {
				if (highlighted) {
					sourceRow.classList.remove('highlighted')
					statValueItem.highlighted = false
				} else {
					sourceRow.classList.add('highlighted')
					statValueItem.highlighted = true
				}
			}
		}

		const LowestRows = () => {
			return Array.from({ length: numValues }).map((_, index) => (
				<tr
					id={`myRow`}
					class="totals_row fw-bold ttu Table__TR Table__TR--sm Table__even highlighted"
				>
					<td class="Table__TD" colSpan="3">
						LOWEST #{index + 1}
					</td>
					{statNames.map(statName => {
						const statRows = statValuesMap[statName]
						if (statRows.length === 0) {
							return
						}

						// Sort and get lowest values
						statRows.sort((a, b) => a.value - b.value)
						const lowestRows = statRows.slice(0, numValues)

						return (
							<td
								class="Table__TD"
								style="font-weight: bold; cursor: pointer"
								onClick={() => toggleHighlightedClass(lowestRows[index])}
								// onMouseOver={() => addHighlightedClass(lowestRows[index]?.row)}
								// onMouseOut={() => {
								//   const sourceRow = lowestRows[index]?.row;
								//   if (sourceRow) {
								//     sourceRow.classList.remove('highlighted');
								//   }
								// }}
							>
								{lowestRows[index]?.value ?? '-'}
							</td>
						)
					})}
				</tr>
			))
		}

		const lowestRows = <LowestRows />
		lowestRows.forEach(row => firstTableBody.appendChild(row))
	}

	getLowestValuesForAllStats(10)
})
