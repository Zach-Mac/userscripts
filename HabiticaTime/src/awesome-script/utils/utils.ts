import Color from 'color'

export function getMinutesAgoString(now: Date, minutes: number, rounded = true) {
	const date = new Date(now.getTime() - minutes * 60 * 1000)
	if (rounded) {
		date.setMinutes(Math.floor(date.getMinutes() / minutes) * minutes)
	}
	return date.toTimeString().split(' ')[0]
}

export function getRoundedNow(roundNum: number) {
	const now = new Date()
	now.setMinutes(Math.ceil(now.getMinutes() / roundNum) * roundNum)
	now.setSeconds(0)
	return now
}

export function parseTime(timeStr: string): number {
	// Parses "HH:MM:SS" and returns milliseconds since midnight in local time
	const [hours, minutes, seconds] = timeStr.split(':').map(Number)
	const date = new Date()
	date.setHours(hours, minutes, seconds, 0)
	const midnight = new Date()
	midnight.setHours(0, 0, 0, 0)
	return date.getTime() - midnight.getTime()
}

export function msToHHMMSS(ms: number): string {
	const date = new Date(ms)
	return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}:${String(date.getUTCSeconds()).padStart(2, '0')}`
}
export function msToHHMM(ms: number): string {
	const date = new Date(ms)
	return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`
}

export function sameHS(color1: Color, color2: Color) {
	return color1.hue() === color2.hue() && color1.saturationl() === color2.saturationl()
}

export function throttle<T extends (...args: any[]) => any>(
	func: T,
	delay: number
): (...args: Parameters<T>) => void {
	let waiting = false
	return (...args: Parameters<T>) => {
		if (!waiting) {
			func(...args)
			waiting = true
			setTimeout(() => {
				waiting = false
			}, delay)
		}
	}
}
