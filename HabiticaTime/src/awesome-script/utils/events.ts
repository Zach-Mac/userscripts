import { EventApi, EventInput } from '@fullcalendar/core'

export function createEvent(event: {
	title: string
	start: Date
	end?: Date
	backgroundColor: string
	borderColor?: string
	customEvent?: boolean
}): EventInput {
	const uniqueId = Math.random().toString(36).substring(10)
	return {
		id: uniqueId,
		title: event.title,
		start: event.start,
		end: event.end,
		backgroundColor: event.backgroundColor,
		borderColor: event.borderColor,
		extendedProps: {
			original: {
				title: event.title,
				start: event.start,
				end: event.end,
				backgroundColor: event.backgroundColor,
				borderColor: event.borderColor
			},
			customEvent: event.customEvent,
			selected: false
		}
	}
}

export function setEventProp(event: EventApi, key: string, value: any) {
	if (event[key] !== value) {
		event.setProp(key as any, value)
	}
}
export function setEventExtendedProp(event: EventApi, key: string, value: any) {
	const keys = key.split('.')
	let currentValue = event.extendedProps
	for (let i = 0; i < keys.length - 1; i++) {
		currentValue = currentValue[keys[i]]
	}
	const lastKey = keys[keys.length - 1]

	if (currentValue[lastKey] !== value) {
		if (keys.length === 1) {
			event.setExtendedProp(key as any, value)
		} else {
			Object.entries(event.extendedProps).forEach(([propKey, propValue]) => {
				if (propKey === keys[0]) {
					event.setExtendedProp(propKey, {
						...(propValue as object),
						[keys.slice(1).join('.')]: value
					})
				} else {
					event.setExtendedProp(propKey, propValue)
				}
			})
		}
	}
}
export function setEventProps(
	event: EventApi,
	props: Record<string, any>,
	extendedProps: Record<string, any> = {}
) {
	Object.entries(props).forEach(([key, value]) => {
		setEventProp(event, key, value)
	})
	Object.entries(extendedProps).forEach(([key, value]) => {
		setEventExtendedProp(event, key, value)
	})
}
export function setEventsProps(
	events: EventApi[],
	getProps: (event: EventApi) => Record<string, any>,
	getExtendedProps: (event: EventApi) => Record<string, any> = () => ({})
) {
	const propsToSet = [] as [EventApi, string, any][]
	const extendedPropsToSet = [] as [EventApi, string, any][]
	for (const [i, event] of events.entries()) {
		const props = getProps(event)
		const extendedProps = getExtendedProps(event)
		Object.entries(props).forEach(([key, value]) => {
			if (event[key] !== value) {
				propsToSet.push([event, key, value])
			}
		})
		Object.entries(extendedProps).forEach(([key, value]) => {
			if (event.extendedProps[key] !== value) {
				extendedPropsToSet.push([event, key, value])
			}
		})
	}
	for (const [event, key, value] of propsToSet) {
		event.setProp(key as any, value)
	}
	for (const [event, key, value] of extendedPropsToSet) {
		event.setExtendedProp(key as any, value)
	}
}
