import { createSignal } from 'solid-js'
import { render } from 'solid-js/web'
import { getPanel, showToast } from '@violentmonkey/ui'
// global CSS
import globalCss from './style.css'
// CSS modules
import styles, { stylesheet } from './style.module.css'
import { hm, observe } from '@violentmonkey/dom'

observe(document.body, () => {
	const row = document.querySelector('.col-undefined > .row')

	console.error('row', row)

	if (row) {
		const phonesList = row.children

		function SortButton() {
			function sortPrices() {
				const frag = document.createDocumentFragment()
				const sortedList = Array.from(phonesList).sort(function (a, b) {
					const getPrice = (el: Element) => {
						const elDollars = el.querySelector('.ds-price__amountDollars')
						const elCents = el.querySelector('.ds-price__amountCents')

						if (!elDollars || !elCents) return 0

						return Number(elDollars.textContent) + Number(elCents.textContent)
					}

					const aPrice = getPrice(a)
					const bPrice = getPrice(b)

					return aPrice < bPrice ? -1 : aPrice > bPrice ? 1 : 0
				})
				for (let item of sortedList) {
					frag.appendChild(item)
				}
				row.appendChild(frag)
			}

			return (
				<button
					onClick={sortPrices}
					class="ds-button ds-corners ds-pointer text-center mw-100 d-inline-block -secondary -large text-no-decoration ng-star-inserted my-3"
				>
					Sort by Price
				</button>
			)
		}

		const el = hm('div', {})
		row.parentElement.prepend(el)
		render(SortButton, el)

		return true
	}
})
