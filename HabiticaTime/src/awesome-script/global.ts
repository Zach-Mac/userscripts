import { Calendar } from '@fullcalendar/core'
import Color from 'color'

export const state = {
	currentZoomLevel: 1,
	calendar: null as Calendar | null
}

export const zoomLevels = [
	'00:01:00',
	'00:05:00', // 5 minutes (default)
	'00:10:00',
	'00:15:00',
	'00:30:00'
]

export const colors: Record<string, Color> = {
	customEvent: Color.hsl('purple').desaturate(0.6).lighten(1), // Purple
	blueEvent: Color.hsl(200, 78, 61), // Habitica blue
	finishedEvent: Color.hsl(264, 6, 54), // Habitica gray
	fullMinMix: Color('green'),
	selectedBorderColor: Color('black')
}
colors.defaultFullMin = colors.blueEvent.mix(colors.fullMinMix, 0.3)
