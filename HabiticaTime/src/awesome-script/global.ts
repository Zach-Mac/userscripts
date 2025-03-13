import { Calendar } from '@fullcalendar/core'
import Color from 'color'

export const state = {
	currZoomLevel: 2,
	calendar: null as Calendar | null
}

const overheadHeight = 84.39080000000013
function getDayHeight(slotMins: number): number {
	const minSlotHeight = 21.2667
	const slotsPerHour = 60 / slotMins
	const hourHeight = minSlotHeight * slotsPerHour
	return hourHeight * 23 + overheadHeight
}

const dayHeights: Record<number, number> = {
	1: 29348.046,
	5: 5869.6092,
	10: 2934.8046,
	15: 1956.5364,
	30: 978.2682,
	60: 489.1341
}

const realDayHeights = Object.entries(dayHeights).reduce(
	(acc, [key, value]) => {
		acc[Number(key)] = value + overheadHeight
		return acc
	},
	{} as Record<number, number>
)

const minHeights = {
	'1': 29432.4368,
	'5': 5954,
	'10': 3019.1954,
	'15': 2040.9272,
	'30': 1062.659,
	'60': 573.5249000000001
}
export const zoomLevels = [
	{ slotDuration: '00:00:15', slotLabelInterval: { minutes: 1 }, minHeight: getDayHeight(0.25) },
	{ slotDuration: '00:01:00', slotLabelInterval: { minutes: 5 }, minHeight: 29432.4368 },
	{ slotDuration: '00:05:00', slotLabelInterval: { minutes: 30 }, minHeight: 5954 },
	{ slotDuration: '00:10:00', slotLabelInterval: { minutes: 30 }, minHeight: 3019.1954 },
	{ slotDuration: '00:15:00', slotLabelInterval: { minutes: 30 }, minHeight: 2040.9272 },
	{ slotDuration: '00:30:00', slotLabelInterval: { minutes: 30 }, minHeight: 1062.659 }
]
// 5 minutes (default)

export const colors: Record<string, Color> = {
	customEvent: Color.hsl('purple').desaturate(0.6).lighten(1), // Purple
	blueEvent: Color.hsl(200, 78, 61), // Habitica blue
	finishedEvent: Color.hsl(264, 6, 54), // Habitica gray
	fullMinMix: Color('green'),
	selectedBorderColor: Color('black')
}
colors.defaultFullMin = colors.blueEvent.mix(colors.fullMinMix, 0.3)
