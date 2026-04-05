import { render } from 'solid-js/web'
import { observe } from '@violentmonkey/dom'
import globalCss from './style.css'

import { createCalendar } from './utils/calendar.js'
import { state } from './global.js'
import {
    getEventsFromColumn,
    getEventsFromSavedHabitNote,
    getSavedHabitElement,
    refreshEventColors
} from './utils/habitica.js'
import { getMinutesAgoString, getRoundedNow, msToHHMM } from './utils/utils.js'
import { createSignal } from 'solid-js'
import { TimeCalc } from './timeCalc.jsx'
import { TaskTools } from './taskTools.jsx'
import { TaskHighlighter } from './taskHighlighter.jsx'
import { EventInput } from '@fullcalendar/core'
import { register } from '@violentmonkey/shortcut'
import { catchupEvents, squeezeEvents, FinishedMode } from './utils/reschedule.js'

const MOBILE_BREAKPOINT_WIDTH = 770

const [dupeEvents, setDupeEvents] = createSignal<Record<string, number>>({})
const [showMore, setShowMore] = createSignal(false)
const [wrapperHeight, setWrapperHeight] = createSignal(0)
const [finishedMode, setFinishedMode] = createSignal<FinishedMode>(
    (localStorage.getItem('finishedMode') as FinishedMode) || 'move'
)
const [ghostOpacity, setGhostOpacity] = createSignal(state.ghostOpacity)

function playSound(url) {
    const audio = new Audio(url)
    audio.play()
}

function playNotification() {
    playSound('https://habitica.com/static/audio/spacePenguinTheme/Chat.ogg')
}

GM_addStyle(globalCss)

function scrollToNow() {
    // scroll window to top of timecalc
    const timeCalc = document.querySelector('#timecalc')
    if (timeCalc) timeCalc.scrollIntoView({ behavior: 'smooth' })
    else console.error('timeCalc not found')

    const now = getRoundedNow(5)
    const scrollTime = getMinutesAgoString(now, 30, false)
    state.scrollToTime(scrollTime)
}

function handleSqueeze() {
    if (!state.calendar) return
    squeezeEvents(state.calendar)
}

function handleCatchup() {
    if (!state.calendar) return
    catchupEvents(state.calendar, finishedMode())
    scrollToNow()
}

const initCalendar = observe(document.body, () => {
    const dailiesColumn = document.querySelector('.tasks-column.daily')
    if (!dailiesColumn) return false

    const habitColumn = document.querySelector('.tasks-column.habit')
    if (!habitColumn) return false

    let timeColumn = document.querySelector('.tasks-column.time')
    if (timeColumn) return false

    timeColumn = document.createElement('div')
    timeColumn.className = 'tasks-column col-lg-3 col-md-6 time'
    dailiesColumn.after(timeColumn)

    setWrapperHeight(dailiesColumn.clientHeight)

    const handleCreateCal = () => {
        const initialEvents = getEventsFromColumn(dailiesColumn)
        createCalendar(initialEvents)
    }
    const handleDeleteCal = () => {
        state.calendar?.destroy()
        localStorage.removeItem('events')
    }
    const handleSaveCal = () => {
        // localStorage.setItem('events', JSON.stringify(state.calendar.getEvents()))
        const eventsString = JSON.stringify(state.calendar.getEvents())
        console.log('SAVING EVENTS:')
        console.log(eventsString)

        // save to clipboard
        navigator.clipboard.writeText(eventsString)
    }
    const handleLoadCal = () => {
        const savedEvents = getEventsFromSavedHabitNote(habitColumn)
        console.debug(savedEvents)
        createCalendar(savedEvents)
    }
    const printEvents = () => {
        for (const event of state.calendar.getEvents()) {
            console.log('event', event.title, event)
        }
    }

    function handleMinTimeChange(e: Event) {
        const input = e.target as HTMLInputElement
        state.calendar?.setOption('slotMinTime', input.value + ':00')
    }
    function handleMaxTimeChange(e: Event) {
        const input = e.target as HTMLInputElement
        const plus24hours = parseInt(input.value.split(':')[0]) + 24
        input.value = plus24hours.toString().padStart(2, '0') + ':' + input.value.split(':')[1]
        state.calendar?.setOption('slotMaxTime', input.value + ':00')
    }

    const Wrapper = () => {
        let wrapperEl: HTMLDivElement
        return (
            <div>
                <div style={{ display: 'flex', 'align-items': 'center' }}>
                    <h2
                        style={{
                            'margin-bottom': '0',
                            overflow: 'hidden',
                            'text-overflow': 'ellipsis',
                            'white-space': 'nowrap',
                            padding: '2px 0'
                        }}
                    >
                        Calendar
                    </h2>
                    <div style={{ 'margin-left': 'auto', display: 'flex', 'flex-wrap': 'wrap' }}>
                        <button class="cal-header-btn" onClick={handleCreateCal}>
                            Create
                        </button>
                        <button class="cal-header-btn" onClick={handleDeleteCal}>
                            Delete
                        </button>
                        <button class="cal-header-btn" onClick={handleSaveCal}>
                            Copy
                        </button>
                        <button class="cal-header-btn" onClick={handleLoadCal}>
                            Load
                        </button>
                        <button
                            class="cal-header-btn"
                            onClick={handleCatchup}
                            title="Ctrl+Shift+Space"
                        >
                            Catchup
                        </button>
                        <button class="cal-header-btn" onClick={handleSqueeze} title="Ctrl+Shift+S">
                            Squeeze
                        </button>
                        <button class="cal-header-btn" onClick={() => setShowMore(!showMore())}>
                            {showMore() ? 'Less' : 'More'}
                        </button>
                    </div>
                </div>
                {showMore() && (
                    <>
                        {/* Moved time inputs and print events here */}
                        <label>Min Time</label>
                        <input type="time" value="03:00" onInput={handleMinTimeChange} />
                        <label>Max Time</label>
                        <input type="time" value="02:00" onInput={handleMaxTimeChange} />
                        <button onClick={printEvents}>Print Events</button>
                        <br />
                        <label>
                            Finished events:{' '}
                            <select
                                value={finishedMode()}
                                onChange={e => {
                                    const val = e.currentTarget.value as FinishedMode
                                    setFinishedMode(val)
                                    localStorage.setItem('finishedMode', val)
                                }}
                            >
                                <option value="none">Don't move</option>
                                <option value="move">Move</option>
                                <option value="cascade">Move + cascade</option>
                            </select>
                        </label>
                        <br />
                        <label>
                            Ghost opacity: {ghostOpacity().toFixed(2)}
                            <input
                                type="range"
                                min="0.1"
                                max="1"
                                step="0.05"
                                value={ghostOpacity()}
                                onInput={e => {
                                    const val = parseFloat(e.currentTarget.value)
                                    setGhostOpacity(val)
                                    state.ghostOpacity = val
                                    localStorage.setItem('ghostOpacity', val.toString())
                                    const calEl = document.getElementById('calendar')
                                    calEl?.style.setProperty('--ghost-opacity', String(val))
                                }}
                            />
                        </label>
                        <br />

                        {/* display dupeEvents */}
                        {Object.entries(dupeEvents()).map(([eventName, duration]) => (
                            <div>
                                {eventName}: {msToHHMM(duration)}
                            </div>
                        ))}
                    </>
                )}

                <div
                    id="calendar-wrapper"
                    ref={wrapperEl}
                    style={{ height: wrapperHeight() + 'px', overflow: 'auto' }}
                >
                    <div id="calendar"></div>
                </div>
            </div>
        )
    }
    render(Wrapper, timeColumn)

    console.log('wrapperEl')

    const savedEvents = JSON.parse(localStorage.getItem('events') || '[]')
    if (savedEvents.length > 0) {
        createCalendar(savedEvents)
    }

    return true
})

const initTimeDisplay = observe(document.body, () => {
    const navDiv = document.querySelector('.tasks-navigation')
    if (!navDiv) return false
    if (!document.querySelector('#timeCalcContainer')) {
        const container = document.createElement('div')
        container.id = 'timeCalcContainer'
        navDiv.parentNode.insertBefore(container, navDiv.nextSibling)
        render(() => <TimeCalc />, container)
    }

    return true
})

const initTaskTools = observe(document.body, () => {
    const dailiesColumn = document.querySelector('.tasks-column.daily')
    if (!dailiesColumn) return false

    render(
        () => (
            <div>
                <TaskTools />
                <TaskHighlighter />
            </div>
        ),
        dailiesColumn
    )

    return true
})

register('ctrl-shift-space', () => {
    handleCatchup()
})

register('ctrl-shift-s', () => {
    handleSqueeze()
})

register('ctrl-space', () => {
    console.debug('pressed ctrl-space')

    scrollToNow()

    Notification.requestPermission().then(result => {
        console.log(result)
    })

    // const text = `HEY! Your task is now overdue.`
    // const notification = new Notification('To do list', { body: text })

    // playNotification()
})

observe(document.body, () => {
    // hide habits column if screen is small
    if (window.innerWidth < 1000) {
        const habits = document.querySelector('.tasks-column.habit') as HTMLElement
        if (habits) habits.style.display = 'none'
    } else {
        const habits = document.querySelector('.tasks-column.habit') as HTMLElement
        if (habits) habits.style.display = 'block'
    }

    // hide rewards column
    const rewards = document.querySelector('.tasks-column.reward') as HTMLElement
    if (rewards) rewards.style.display = 'none'

    // Update calendar display
    const dailiesColumn = document.querySelector('.tasks-column.daily')
    if (dailiesColumn && state.calendar) {
        // Update event colors
        const events = state.calendar.getEvents()

        state.calendar.pauseRendering()
        refreshEventColors(dailiesColumn, events)
        state.calendar.resumeRendering()

        // if more than one event have the same name, sum their durations and print total duration in console
        const eventDurations: Record<string, number> = {}
        const duplicateEvents: string[] = []
        for (const event of events) {
            const start = event.start
            const end = event.end
            const duration = end.getTime() - start.getTime()
            if (eventDurations[event.title]) {
                eventDurations[event.title] += duration
                duplicateEvents.push(event.title)
            } else {
                eventDurations[event.title] = duration
            }
        }
        for (const eventName of duplicateEvents) {
            // add eventduration to dupeEvents[title]
            if (dupeEvents()[eventName] !== eventDurations[eventName]) {
                setDupeEvents({
                    ...dupeEvents(),
                    [eventName]: eventDurations[eventName]
                })
            }
        }

        const sortableTasks = dailiesColumn.querySelector('.sortable-tasks')
        const calendarEl = document.querySelector('#calendar') as HTMLElement
        if (calendarEl && sortableTasks) {
            let idealHeight = window.innerHeight * 0.9
            if (window.innerWidth > MOBILE_BREAKPOINT_WIDTH) {
                idealHeight = Math.max(sortableTasks.clientHeight, idealHeight)
            }

            if (wrapperHeight() !== idealHeight) {
                setWrapperHeight(idealHeight)
            }
        }
    }

    // Hide Saved habit note
    const habitsColumn = document.querySelector('.tasks-column.habit')
    console.debug('habitsColumn', habitsColumn)
    if (habitsColumn) {
        const savedHabitElement = getSavedHabitElement(habitsColumn)
        console.debug('savedHabitElement', savedHabitElement)
        if (savedHabitElement) {
            const taskNotes = savedHabitElement.querySelector('.task-notes') as HTMLElement
            console.debug('taskNotes', taskNotes)
            taskNotes.style.display = 'none'
        }
    }

    // Set overflow for inner calendar fc-scroller
    const fcScroller = document.querySelector(
        '.fc-scroller.fc-scroller-liquid-absolute'
    ) as HTMLElement
    if (fcScroller) {
        fcScroller.style.overflow = 'hidden'
    }

    // TODO: track dailies finishes

    // TODO: right click menu

    // TODO: ctrl click to multi select

    // BUG: zoom in/out keyboard shortcuts don't work well. focus seems to only be on calendar button click

    // TODO: set color for late events
    // TODO: set color for current event

    // TODO: don't make deleting calendar necessary. if delete, then delete for just today

    // TODO: edit toggle to add events?
})
