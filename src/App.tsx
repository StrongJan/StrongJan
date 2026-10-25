
import {
  Fragment,
  type FormEvent,
  type MouseEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import type { User } from '@supabase/supabase-js'
import { supabase, supabaseConfigured } from './supabase'
import './App.css'
type SetEntry = {
  reps: string
  weight: string
  rpe?: string
  completed?: boolean
}

type Exercise = {
  id: number
  name: string
  sets: SetEntry[]
  restDuration?: number
}

type Workout = {
  id: number
  name?: string
  date: string
  time?: string
  endTime?: string
  exercises: Exercise[]
  muscleGroupWorkload?: Record<string, MuscleGroupWorkload>
}

type PersistedWorkoutSession = {
  activeWorkout: Workout
  workoutStartedAt: number | null
  isBuildingPreset: boolean
  editingPresetId: number | null
  editingWorkoutId: number | null
  presetName: string
  presetFolder: string
  presetNewFolder: string
}

type MuscleGroupWorkload = {
  primarySets: number
  primaryReps: number
  primaryVolume: number
  secondarySets: number
  secondaryReps: number
  secondaryVolume: number
}

type MuscleRecovery = {
  muscleGroup: string
  percentage: number
}

type TrainingLoadPeriod = 'week' | 'month' | 'year' | 'all'

type MuscleTrainingLoad = {
  muscleGroup: string
  effectiveSets: number
}

type WorkoutPreset = {
  id: number
  name: string
  folder: string
  exercises: Exercise[]
}

const NEW_FOLDER_OPTION = '__new_folder__'
const ACTIVE_WORKOUT_STORAGE_KEY = 'strongjan-active-workout'

function loadPersistedWorkoutSession(): PersistedWorkoutSession | null {
  try {
    const savedSession = localStorage.getItem(ACTIVE_WORKOUT_STORAGE_KEY)
    if (!savedSession) return null

    const parsed = JSON.parse(savedSession) as Partial<PersistedWorkoutSession>
    if (
      !parsed.activeWorkout ||
      typeof parsed.activeWorkout !== 'object' ||
      !Array.isArray(parsed.activeWorkout.exercises)
    ) {
      return null
    }

    return {
      activeWorkout: parsed.activeWorkout,
      workoutStartedAt:
        typeof parsed.workoutStartedAt === 'number'
          ? parsed.workoutStartedAt
          : null,
      isBuildingPreset: Boolean(parsed.isBuildingPreset),
      editingPresetId:
        typeof parsed.editingPresetId === 'number'
          ? parsed.editingPresetId
          : null,
      editingWorkoutId:
        typeof parsed.editingWorkoutId === 'number'
          ? parsed.editingWorkoutId
          : null,
      presetName: typeof parsed.presetName === 'string' ? parsed.presetName : '',
      presetFolder:
        typeof parsed.presetFolder === 'string' ? parsed.presetFolder : '',
      presetNewFolder:
        typeof parsed.presetNewFolder === 'string'
          ? parsed.presetNewFolder
          : '',
    }
  } catch {
    return null
  }
}

type View = 'home' | 'training' | 'history' | 'progress'
type Metric = 'weight' | 'oneRepMax' | 'volume'


type BodyMetric = {
  id: string
  name: string
  unit: string
}

type BodyMeasurement = {
  id: number
  metricId: string
  date: string
  value: number
}

const bodyMetrics: BodyMetric[] = [
  { id: 'weight', name: 'Lichaamsgewicht', unit: 'kg' },
  { id: 'chest', name: 'Borstomtrek', unit: 'cm' },
  { id: 'waist', name: 'Buikomtrek', unit: 'cm' },
  { id: 'hips', name: 'Heupomtrek', unit: 'cm' },
  { id: 'left-bicep', name: 'Linker bicep', unit: 'cm' },
  { id: 'right-bicep', name: 'Rechter bicep', unit: 'cm' },
  { id: 'left-thigh', name: 'Linker bovenbeen', unit: 'cm' },
  { id: 'right-thigh', name: 'Rechter bovenbeen', unit: 'cm' },
  { id: 'left-calf', name: 'Linker kuit', unit: 'cm' },
  { id: 'right-calf', name: 'Rechter kuit', unit: 'cm' },
]

function parseWorkoutDate(value: string) {
  const dateParts = value.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/)
  if (dateParts) {
    const date = new Date(
      Number(dateParts[3]),
      Number(dateParts[2]) - 1,
      Number(dateParts[1]),
    )
    return Number.isNaN(date.getTime()) ? null : date
  }

  const isoParts = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoParts) {
    const date = new Date(
      Number(isoParts[1]),
      Number(isoParts[2]) - 1,
      Number(isoParts[3]),
    )
    return Number.isNaN(date.getTime()) ? null : date
  }

  return null
}

function formatWorkoutDate(value: string) {
  return parseWorkoutDate(value)?.toLocaleDateString('nl-NL') ?? value
}

function workoutDateInputValue(value: string) {
  const date = parseWorkoutDate(value)
  return date ? dateKey(date) : ''
}

function formatWorkoutTime(date: Date) {
  return `${date.getHours().toString().padStart(2, '0')}:${date
    .getMinutes()
    .toString()
    .padStart(2, '0')}`
}

function getWorkoutTime(workout: Workout) {
  if (workout.time !== undefined) {
    return workout.time
  }

  const idTimestamp = Number(workout.id)
  if (idTimestamp > 1_000_000_000_000) {
    return formatWorkoutTime(new Date(idTimestamp))
  }

  return ''
}

function isValidWorkoutTime(value: string) {
  const match = value.match(/^(\d{2}):(\d{2})$/)
  return Boolean(
    match &&
      Number(match[1]) < 24 &&
      Number(match[2]) < 60,
  )
}

function getWorkoutDurationMinutes(startTime: string, endTime: string) {
  if (!isValidWorkoutTime(startTime) || !isValidWorkoutTime(endTime)) {
    return null
  }

  const toMinutes = (value: string) => {
    const [hours, minutes] = value.split(':').map(Number)
    return hours * 60 + minutes
  }

  return (toMinutes(endTime) - toMinutes(startTime) + 24 * 60) % (24 * 60)
}

function formatWorkoutDurationMinutes(duration: number) {
  const hours = Math.floor(duration / 60)
  const minutes = duration % 60
  if (hours === 0) return `${minutes} min`
  if (minutes === 0) return `${hours} uur`
  return `${hours} uur ${minutes} min`
}

function formatWorkoutTimeRange(workout: Workout) {
  const startTime = getWorkoutTime(workout)
  if (!isValidWorkoutTime(startTime)) return ''
  if (!workout.endTime || !isValidWorkoutTime(workout.endTime)) {
    return startTime
  }

  const duration = getWorkoutDurationMinutes(startTime, workout.endTime)
  return `${startTime}–${workout.endTime}${
    duration === null ? '' : ` · ${formatWorkoutDurationMinutes(duration)}`
  }`
}

function getWorkoutSortTimestamp(workout: Workout) {
  const date = parseWorkoutDate(workout.date)
  if (!date) return Number(workout.id) || 0

  const time = getWorkoutTime(workout)
  const [hours, minutes] = time.split(':').map(Number)
  if (Number.isInteger(hours) && Number.isInteger(minutes)) {
    date.setHours(hours, minutes, 0, 0)
  }

  return date.getTime()
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${(date.getMonth() + 1)
    .toString()
    .padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`
}

function addCalendarDays(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount)
}

function getWeekStart(date: Date) {
  const weekdayFromMonday = (date.getDay() + 6) % 7
  return addCalendarDays(date, -weekdayFromMonday)
}

function getIsoWeekNumber(date: Date) {
  const thursday = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  thursday.setDate(thursday.getDate() + 3 - ((thursday.getDay() + 6) % 7))
  const firstThursday = new Date(thursday.getFullYear(), 0, 4)
  firstThursday.setDate(
    firstThursday.getDate() + 3 - ((firstThursday.getDay() + 6) % 7),
  )
  return 1 + Math.round(
    (thursday.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000),
  )
}

function GymAttendanceDashboard({ workouts }: { workouts: Workout[] }) {
  const [showHistory, setShowHistory] = useState(false)
  const [showGoalSettings, setShowGoalSettings] = useState(false)
  const [weeklyGoal, setWeeklyGoal] = useState(() => {
    const savedGoal = Number(localStorage.getItem('strongjan-weekly-goal'))
    return Number.isInteger(savedGoal) && savedGoal >= 1 && savedGoal <= 14
      ? savedGoal
      : 3
  })
  const [goalDraft, setGoalDraft] = useState(weeklyGoal)
  const today = new Date()
  const todayKey = dateKey(today)
  const countsByDay = new Map<string, number>()

  workouts.forEach((workout) => {
    const workoutDate = parseWorkoutDate(workout.date)
    if (!workoutDate) return
    const key = dateKey(workoutDate)
    countsByDay.set(key, (countsByDay.get(key) ?? 0) + 1)
  })

  const currentWeekStart = getWeekStart(today)
  const lastFiveWeeks = Array.from({ length: 5 }, (_, index) => {
    const weekStart = addCalendarDays(currentWeekStart, (index - 4) * 7)
    const days = Array.from({ length: 7 }, (_, dayIndex) =>
      addCalendarDays(weekStart, dayIndex),
    )
    const visitCount = days.reduce(
      (count, day) => count + (countsByDay.get(dateKey(day)) ?? 0),
      0,
    )
    return { weekStart, days, visitCount }
  })

  useEffect(() => {
    localStorage.setItem('strongjan-weekly-goal', String(weeklyGoal))
  }, [weeklyGoal])

  const datesWithWorkouts = workouts
    .map((workout) => parseWorkoutDate(workout.date))
    .filter((date): date is Date => date !== null)
    .sort((left, right) => left.getTime() - right.getTime())
  const firstWorkoutDate = datesWithWorkouts[0]
  const historyWeeks: {
    weekStart: Date
    days: Date[]
    visitCount: number
  }[] = []

  if (firstWorkoutDate) {
    const firstWeek = getWeekStart(firstWorkoutDate)
    for (
      let weekStart = firstWeek;
      weekStart <= currentWeekStart;
      weekStart = addCalendarDays(weekStart, 7)
    ) {
      const days = Array.from({ length: 7 }, (_, dayIndex) =>
        addCalendarDays(weekStart, dayIndex),
      )
      historyWeeks.push({
        weekStart,
        days,
        visitCount: days.reduce(
          (count, day) => count + (countsByDay.get(dateKey(day)) ?? 0),
          0,
        ),
      })
    }
  }

  const totalVisits = [...countsByDay.values()].reduce(
    (total, visits) => total + visits,
    0,
  )
  const chartMax = Math.max(
    weeklyGoal,
    ...lastFiveWeeks.map((week) => week.visitCount),
    1,
  )
  const chartTickStep = Math.max(1, Math.ceil(chartMax / 4))
  const chartTicks = [
    ...Array.from(
      { length: Math.floor(chartMax / chartTickStep) + 1 },
      (_, index) => index * chartTickStep,
    ),
  ]
  if (chartTicks[chartTicks.length - 1] !== chartMax) {
    chartTicks.push(chartMax)
  }
  const chartHeight = 150
  const chartTop = 18
  const chartBottom = chartTop + chartHeight

  return (
    <section className="gym-attendance">
      <div className="gym-attendance-header">
        <button
          type="button"
          className="gym-attendance-toggle"
          aria-expanded={showHistory}
          onClick={() => setShowHistory((current) => !current)}
        >
          <span className="gym-attendance-summary">
            <span className="gym-attendance-icon" aria-hidden="true">▦</span>
            <span>
              <strong>Gymbezoeken</strong>
              <small>{totalVisits} trainingen in totaal</small>
            </span>
          </span>
          <span className="gym-attendance-action">
            {showHistory ? 'Verberg overzicht' : 'Bekijk weekoverzicht'}
            <span aria-hidden="true">{showHistory ? '⌃' : '⌄'}</span>
          </span>
        </button>
        <button
          type="button"
          className="gym-goal-menu-button"
          aria-label="Trainingsdoel instellen"
          aria-expanded={showGoalSettings}
          onClick={() => {
            setGoalDraft(weeklyGoal)
            setShowGoalSettings((current) => !current)
          }}
        >
          ⋮
        </button>
        {showGoalSettings && (
          <form
            className="gym-goal-menu"
            onSubmit={(event) => {
              event.preventDefault()
              setWeeklyGoal(goalDraft)
              setShowGoalSettings(false)
            }}
          >
            <label htmlFor="gym-weekly-goal">Trainingsdoel per week</label>
            <div className="gym-goal-input-row">
              <input
                id="gym-weekly-goal"
                type="number"
                min="1"
                max="14"
                step="1"
                required
                value={goalDraft}
                onChange={(event) =>
                  setGoalDraft(
                    Math.max(1, Math.min(14, Number(event.target.value) || 1)),
                  )
                }
              />
              <span>keer per week</span>
            </div>
            <button type="submit">Doel opslaan</button>
          </form>
        )}
      </div>

      <div className="gym-week-chart">
        <div className="gym-chart-axis-title">Aantal trainingen</div>
        <svg
          className="gym-chart-svg"
          viewBox="0 0 560 236"
          role="img"
          aria-label={`Staafdiagram van trainingen per week, met een doel van ${weeklyGoal}`}
        >
          {chartTicks.map((tick) => {
            const y = chartBottom - (tick / chartMax) * chartHeight
            return (
              <g key={tick}>
                <line
                  x1="48"
                  y1={y}
                  x2="548"
                  y2={y}
                  className="gym-chart-grid-line"
                />
                <text
                  x="38"
                  y={y + 4}
                  textAnchor="end"
                  className="gym-chart-tick"
                >
                  {tick}
                </text>
              </g>
            )
          })}
          <line
            x1="48"
            y1={chartBottom - (weeklyGoal / chartMax) * chartHeight}
            x2="548"
            y2={chartBottom - (weeklyGoal / chartMax) * chartHeight}
            className="gym-chart-goal-line"
          />
          {lastFiveWeeks.map(({ weekStart, visitCount }, index) => {
            const slotWidth = 100
            const barWidth = 46
            const x = 62 + index * slotWidth + (slotWidth - barWidth) / 2
            const barHeight = (visitCount / chartMax) * chartHeight
            return (
              <g key={dateKey(weekStart)}>
                <rect
                  x={x}
                  y={chartBottom - barHeight}
                  width={barWidth}
                  height={Math.max(barHeight, 1)}
                  rx="7"
                  className={
                    visitCount >= weeklyGoal
                      ? 'gym-chart-bar goal-met'
                      : 'gym-chart-bar'
                  }
                />
                <text
                  x={x + barWidth / 2}
                  y={Math.max(chartBottom - barHeight - 7, 12)}
                  textAnchor="middle"
                  className="gym-chart-value"
                >
                  {visitCount}
                </text>
                <text
                  x={x + barWidth / 2}
                  y="192"
                  textAnchor="middle"
                  className="gym-chart-week-label"
                >
                  {weekStart.toLocaleDateString('nl-NL', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </text>
              </g>
            )
          })}
          <text
            x="298"
            y="222"
            textAnchor="middle"
            className="gym-chart-week-label"
          >
            Week (vanaf maandag)
          </text>
        </svg>
        <div className="gym-chart-legend">
          <span><i className="gym-chart-legend-bar" /> Trainingen per week</span>
          <span><i className="gym-chart-legend-goal" /> Doel: {weeklyGoal} per week</span>
        </div>
      </div>

      {showHistory && (
        <div className="gym-full-history">
          <div className="gym-history-legend">
            <span><i className="gym-day-dot visited" /> Training</span>
            <span><i className="gym-day-dot" /> Geen training</span>
          </div>
          {historyWeeks.length === 0 ? (
            <p className="subtitle">
              Je opgeslagen trainingen verschijnen hier als je je eerste training afrondt.
            </p>
          ) : (
            <div className="gym-history-scroll">
              <div
                className="gym-history-grid"
                style={{
                  gridTemplateColumns: `56px repeat(${historyWeeks.length}, 24px)`,
                }}
              >
                <span className="gym-history-corner">Dag / week</span>
                {historyWeeks.map(({ weekStart, visitCount }) => (
                  <span
                    className="gym-history-column-heading"
                    key={dateKey(weekStart)}
                    title={`Week ${getIsoWeekNumber(weekStart)} · start ${weekStart.toLocaleDateString('nl-NL')}`}
                  >
                    <strong>W{getIsoWeekNumber(weekStart)}</strong>
                    <small className={visitCount >= weeklyGoal ? 'met' : ''}>
                      {visitCount}/{weeklyGoal}
                    </small>
                  </span>
                ))}

                {['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'].map(
                  (weekday, dayIndex) => (
                    <Fragment key={weekday}>
                      <strong className="gym-history-row-heading">{weekday}</strong>
                      {historyWeeks.map(({ days }) => {
                        const day = days[dayIndex]
                        const isFuture = dateKey(day) > todayKey
                        const visited = (countsByDay.get(dateKey(day)) ?? 0) > 0
                        return (
                          <span
                            key={dateKey(day)}
                            className={`gym-history-day${isFuture ? ' future' : ''}`}
                            title={`${day.toLocaleDateString('nl-NL')}: ${
                              visited ? 'training' : isFuture ? 'nog niet geweest' : 'geen training'
                            }`}
                          >
                            <i
                              className={`gym-day-dot${visited ? ' visited' : ''}`}
                            />
                          </span>
                        )
                      })}
                    </Fragment>
                  ),
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function OneRepMaxCalculator() {
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('')
  const [rpe, setRpe] = useState('10')
  const enteredWeight = Number(weight)
  const enteredReps = Number(reps)
  const enteredRpe = Number(rpe)
  const estimatedRepsToFailure = enteredReps + (10 - enteredRpe)
  const isValidInput =
    Number.isFinite(enteredWeight) &&
    enteredWeight > 0 &&
    Number.isInteger(enteredReps) &&
    enteredReps >= 1 &&
    Number.isFinite(enteredRpe) &&
    enteredRpe >= 1 &&
    enteredRpe <= 10 &&
    estimatedRepsToFailure <= 36

  const repMaxEstimates = isValidInput
    ? Array.from({ length: 8 }, (_, index) => {
        const targetReps = index + 1
        const epleyOneRepMax =
          enteredWeight * (1 + estimatedRepsToFailure / 30)
        const lombardiOneRepMax =
          enteredWeight * estimatedRepsToFailure ** 0.1
        const epleyEstimate =
          targetReps === 1
            ? epleyOneRepMax
            : epleyOneRepMax / (1 + targetReps / 30)
        const lombardiEstimate =
          targetReps === 1
            ? lombardiOneRepMax
            : lombardiOneRepMax / targetReps ** 0.1
        const estimatedWeight = (epleyEstimate + lombardiEstimate) / 2
        const oneRepMax = (epleyOneRepMax + lombardiOneRepMax) / 2

        return {
          reps: targetReps,
          weight: estimatedWeight,
          percentage: targetReps === 1 ? 100 : (estimatedWeight / oneRepMax) * 100,
        }
      })
    : []

  return (
    <section className="one-rep-max-calculator">
      <div className="home-section-heading">
        <div>
          <h2>1RM-calculator</h2>
          <p>Bereken je geschatte maximale gewicht voor één herhaling.</p>
        </div>
      </div>

      <div className="one-rep-max-inputs">
        <label>
          Gewicht (kg)
          <input
            type="number"
            min="0.1"
            step="0.1"
            value={weight}
            onChange={(event) => setWeight(event.target.value)}
            placeholder="Bijv. 60"
          />
        </label>
        <label>
          Herhalingen
          <input
            type="number"
            min="1"
            max="36"
            step="1"
            value={reps}
            onChange={(event) => setReps(event.target.value)}
            placeholder="Bijv. 8"
          />
        </label>
        <label>
          RPE (1-10)
          <input
            type="number"
            min="1"
            max="10"
            step="0.5"
            value={rpe}
            onChange={(event) => setRpe(event.target.value)}
          />
        </label>
      </div>

      {repMaxEstimates.length > 0 ? (
        <div className="rep-max-section" aria-live="polite">
          <h3>Geschatte rep maxes</h3>
          <div className="rep-max-results">
            {repMaxEstimates.map((estimate) => (
              <div className="rep-max-result" key={estimate.reps}>
                <div className="rep-max-result-heading">
                  <strong>{estimate.reps}RM</strong>
                  <span>
                    {estimate.weight.toLocaleString('nl-NL', {
                      maximumFractionDigits: 1,
                    })}{' '}
                    kg
                  </span>
                  <span>{Math.round(estimate.percentage)}%</span>
                </div>
                <div
                  className="rep-max-bar"
                  role="progressbar"
                  aria-label={`${estimate.reps}RM is ${Math.round(estimate.percentage)} procent van je 1RM`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(estimate.percentage)}
                >
                  <span style={{ width: `${estimate.percentage}%` }} />
                </div>
              </div>
            ))}
          </div>
          <p className="one-rep-max-note">
            Gemiddelde van de Epley- en Lombardi-formule. RPE is meegerekend.
          </p>
        </div>
      ) : (
        <p className="one-rep-max-hint">
          {estimatedRepsToFailure > 36
            ? 'Het aantal herhalingen inclusief RPE-correctie mag niet hoger zijn dan 36.'
            : 'Vul een gewicht, 1 tot en met 36 herhalingen en een RPE van 1 tot 10 in.'}
        </p>
      )}
      <p className="one-rep-max-note">
        RPE wordt omgerekend naar herhalingen over: RPE 10 is maximaal, RPE 9
        betekent ongeveer 1 herhaling over. Dit zijn schattingen; de uitkomst
        kan per formule verschillen.
      </p>
    </section>
  )
}


const starterExercises = [
  'Bench press',
  'Squat',
  'Deadlift',
  'Overhead press',
  'Lat pulldown',
  'Seated row',
  'Bicep curl',
  'Tricep pushdown',
  'Log press',
  'Sandbag to shoulder',
  'Tire flip',
]

function getEstimatedOneRepMax(weight: number, reps: number) {
  if (weight <= 0 || reps <= 0) return 0
  if (reps === 1) return weight
  return weight * (1 + reps / 30)
}

function formatWorkoutDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const formattedMinutes = minutes.toString().padStart(2, '0')
  const formattedSeconds = seconds.toString().padStart(2, '0')

  return hours > 0
    ? `${hours.toString().padStart(2, '0')}:${formattedMinutes}:${formattedSeconds}`
    : `${formattedMinutes}:${formattedSeconds}`
}

function getValidSets(exercise: Exercise) {
  return exercise.sets
    .map((set) => ({
      reps: Number(set.reps),
      weight: Number(set.weight),
    }))
    .filter(
      (set) =>
        Number.isFinite(set.reps) &&
        Number.isFinite(set.weight) &&
        set.reps > 0 &&
        set.weight > 0,
    )
}

function loadSelectedRecordExercises() {
  try {
    const saved = JSON.parse(
      localStorage.getItem('strongjan-record-exercises') || '[]',
    ) as unknown
    return Array.isArray(saved)
      ? saved
          .filter((name): name is string => typeof name === 'string')
      : []
  } catch {
    return []
  }
}

function PersonalRecordBar({
  workouts,
  exerciseOptions,
  selectedExercises,
  onAddExercise,
  onRemoveExercise,
}: {
  workouts: Workout[]
  exerciseOptions: ExerciseOption[]
  selectedExercises: string[]
  onAddExercise: (name: string) => void
  onRemoveExercise: (name: string) => void
}) {
  const [showExerciseSettings, setShowExerciseSettings] = useState(false)
  const [exerciseSearch, setExerciseSearch] = useState('')
  const featuredExercises = selectedExercises.map((name) => ({
    names: [name],
    label: name,
  }))
  const availableExercises = exerciseOptions
    .filter(
      (exercise) =>
        !selectedExercises.includes(exercise.name) &&
        exercise.name
          .toLocaleLowerCase()
          .includes(exerciseSearch.toLocaleLowerCase().trim()),
    )
    .sort((left, right) => left.name.localeCompare(right.name))

  const exerciseResults = featuredExercises.map(({ names, label }) => {
    const sets = workouts
      .flatMap((workout) =>
        workout.exercises
          .filter((exercise) =>
            names.some(
              (name) =>
                exercise.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
            ),
          )
          .flatMap(getValidSets),
      )
    const record = Math.max(0, ...sets.map((set) => set.weight))
    const predictedOneRepMax = Math.max(
      0,
      ...sets.map((set) => getEstimatedOneRepMax(set.weight, set.reps)),
    )

    return { label, record, predictedOneRepMax }
  })

  return (
    <section className="personal-record-bar" aria-label="Persoonlijke records">
      <div className="personal-record-heading">
        <div>
          <h2>Records &amp; voorspelde 1RM</h2>
          <p>Op basis van je zwaarste geregistreerde sets.</p>
        </div>
        <button
          type="button"
          className="personal-record-menu-button"
          aria-label="Oefeningen kiezen"
          aria-expanded={showExerciseSettings}
          onClick={() => setShowExerciseSettings((visible) => !visible)}
        >
          ⋮
        </button>
      </div>
      <div className="personal-record-cards">
        {exerciseResults.map((result) => (
          <article className="personal-record-card" key={result.label}>
            <strong className="personal-record-exercise">{result.label}</strong>
            <span>Record</span>
            <strong>
              {result.record > 0
                ? `${result.record.toLocaleString('nl-NL')} kg`
                : '—'}
            </strong>
            <span>Voorspelde 1RM</span>
            <strong>
              {result.predictedOneRepMax > 0
                ? `${result.predictedOneRepMax.toLocaleString('nl-NL', {
                    maximumFractionDigits: 1,
                  })} kg`
                : '—'}
            </strong>
          </article>
        ))}
        {exerciseResults.length === 0 && (
          <p className="personal-record-empty">
            Kies oefeningen via ⋮ om je records hier te zien.
          </p>
        )}
      </div>
      {showExerciseSettings && (
        <div className="personal-record-selectors">
          <div className="personal-record-selected-exercises">
            {selectedExercises.map((name) => (
              <button
                type="button"
                className="personal-record-selected-exercise"
                key={name}
                onClick={() => onRemoveExercise(name)}
                aria-label={`Verwijder ${name} uit je records`}
              >
                {name} <span aria-hidden="true">×</span>
              </button>
            ))}
          </div>
          <label>
            Oefening zoeken
            <input
              type="search"
              aria-label="Zoek een oefening om toe te voegen"
              placeholder="Typ een oefening..."
              value={exerciseSearch}
              onChange={(event) => setExerciseSearch(event.target.value)}
            />
          </label>
          <div className="personal-record-exercise-options">
            {availableExercises.map((exercise) => (
              <button
                type="button"
                key={exercise.name}
                onClick={() => onAddExercise(exercise.name)}
              >
                {exercise.name}
                <span aria-hidden="true">＋</span>
              </button>
            ))}
            {availableExercises.length === 0 && (
              <p>
                {exerciseSearch
                  ? 'Geen oefeningen gevonden.'
                  : 'Je hebt alle beschikbare oefeningen toegevoegd.'}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

type CloudFitnessData = {
  workouts: Workout[]
  presets: WorkoutPreset[]
  customExercises: ExerciseOption[]
  presetFolders: string[]
  bodyMeasurements: BodyMeasurement[]
}

type CloudSyncStatus =
  | 'unavailable'
  | 'signed-out'
  | 'loading'
  | 'synced'
  | 'syncing'
  | 'error'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isCloudFitnessData(value: unknown): value is CloudFitnessData {
  if (!isRecord(value)) return false

  return (
    Array.isArray(value.workouts) &&
    Array.isArray(value.presets) &&
    Array.isArray(value.customExercises) &&
    Array.isArray(value.presetFolders) &&
    value.presetFolders.every((folder) => typeof folder === 'string') &&
    Array.isArray(value.bodyMeasurements)
  )
}

function getCloudDataSignature(data: CloudFitnessData) {
  return JSON.stringify(data, (_key, value: unknown) => {
    if (!isRecord(value) || Array.isArray(value)) return value

    return Object.keys(value)
      .sort()
      .reduce<Record<string, unknown>>((sorted, key) => {
        sorted[key] = value[key]
        return sorted
      }, {})
  })
}

function ProfileSettings({
  syncStatus,
  syncError,
}: {
  syncStatus: CloudSyncStatus
  syncError: string
}) {
    const [user, setUser] = useState<User | null>(null)
    const [isLoading, setIsLoading] = useState(supabaseConfigured)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [authMode, setAuthMode] = useState<'sign-in' | 'sign-up'>('sign-in')
    const [name, setName] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [feedback, setFeedback] = useState('')
    const [feedbackIsError, setFeedbackIsError] = useState(false)

    useEffect(() => {
      if (!supabase) return

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user ?? null)
        setIsLoading(false)
      })

      return () => subscription.unsubscribe()
    }, [])

    async function submitCredentials(event: FormEvent<HTMLFormElement>) {
      event.preventDefault()
      const client = supabase
      if (!client) return

      setIsSubmitting(true)
      setFeedback('')
      setFeedbackIsError(false)

      const result =
        authMode === 'sign-up'
          ? await client.auth.signUp({
              email,
              password,
              options: { data: { full_name: name.trim() } },
            })
          : await client.auth.signInWithPassword({ email, password })

      setIsSubmitting(false)

      if (result.error) {
        setFeedback(result.error.message)
        setFeedbackIsError(true)
        return
      }

      setPassword('')
      setFeedback(
        authMode === 'sign-up' && !result.data.session
          ? 'Account aangemaakt. Controleer je e-mail om je account te bevestigen.'
          : authMode === 'sign-up'
            ? 'Je account is aangemaakt en je bent ingelogd.'
            : 'Je bent ingelogd.',
      )
    }

    async function signInWithGoogle() {
      const client = supabase
      if (!client) return

      setIsSubmitting(true)
      setFeedback('')
      setFeedbackIsError(false)
      const { error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}`,
        },
      })
      setIsSubmitting(false)

      if (error) {
        setFeedback(error.message)
        setFeedbackIsError(true)
      }
    }

    async function signOut() {
      const client = supabase
      if (!client) return

      setIsSubmitting(true)
      setFeedback('')
      const { error } = await client.auth.signOut()
      setIsSubmitting(false)

      if (error) {
        setFeedback(error.message)
        setFeedbackIsError(true)
      }
    }

    return (
      <section className="profile-settings">
        <div>
          <h3>Profiel en account</h3>
          <p>Bekijk je profiel of meld je aan om een account te maken.</p>
        </div>
        {!supabaseConfigured ? (
          <p className="auth-feedback auth-feedback-error" role="alert">
            Accountaanmelding is nog niet ingesteld. Configureer de Supabase-gegevens
            volgens <code>SUPABASE_SETUP.md</code> en herstart de app.
          </p>
        ) : isLoading ? (
          <p className="subtitle" role="status">Account laden...</p>
        ) : user ? (
          <div className="profile-card">
            {user.user_metadata.avatar_url && (
              <img
                className="profile-avatar"
                src={user.user_metadata.avatar_url}
                alt=""
              />
            )}
            <div className="profile-details">
              <strong>
                {user.user_metadata.full_name ??
                  user.user_metadata.name ??
                  'StrongJan-gebruiker'}
              </strong>
              <span>{user.email}</span>
              <span>
                Ingelogd met{' '}
                {user.app_metadata.provider === 'google' ? 'Google' : 'e-mail'}
              </span>
            </div>
            <button
              type="button"
              className="secondary-button"
              onClick={signOut}
              disabled={isSubmitting}
            >
              Uitloggen
            </button>
            <p className="profile-storage-note">
              Je trainingen, presets, oefeningen en lichaamsmetingen worden
              voor dit account in Supabase bewaard en tussen apparaten
              gesynchroniseerd.
            </p>
          </div>
        ) : (
          <>
            <div className="auth-mode-switch" aria-label="Accountactie">
              <button
                type="button"
                className={authMode === 'sign-in' ? 'active' : ''}
                onClick={() => {
                  setAuthMode('sign-in')
                  setFeedback('')
                }}
              >
                Inloggen
              </button>
              <button
                type="button"
                className={authMode === 'sign-up' ? 'active' : ''}
                onClick={() => {
                  setAuthMode('sign-up')
                  setFeedback('')
                }}
              >
                Account aanmaken
              </button>
            </div>

            <form className="auth-form" onSubmit={submitCredentials}>
              {authMode === 'sign-up' && (
                <label>
                  Naam
                  <input
                    autoComplete="name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                  />
                </label>
              )}
              <label>
                E-mailadres
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </label>
              <label>
                Wachtwoord
                <input
                  type="password"
                  autoComplete={
                    authMode === 'sign-up' ? 'new-password' : 'current-password'
                  }
                  minLength={6}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </label>
              <button type="submit" disabled={isSubmitting}>
                {authMode === 'sign-up' ? 'Account aanmaken' : 'Inloggen'}
              </button>
            </form>

            <div className="auth-divider"><span>of</span></div>
            <button
              type="button"
              className="google-sign-in-button"
              onClick={signInWithGoogle}
              disabled={isSubmitting}
            >
              <span aria-hidden="true">G</span>
              Doorgaan met Google
            </button>
          </>
        )}

        <div
          className={
            syncStatus === 'error'
              ? 'cloud-sync-status cloud-sync-status-error'
              : 'cloud-sync-status'
          }
          role={syncStatus === 'error' ? 'alert' : 'status'}
        >
          <strong>Gegevenssynchronisatie</strong>
          <span>
            {syncStatus === 'unavailable'
              ? 'Stel eerst Supabase in.'
              : syncStatus === 'signed-out'
                ? 'Log in om je gegevens tussen apparaten te synchroniseren.'
                : syncStatus === 'loading'
                  ? 'Gegevens ophalen...'
                  : syncStatus === 'syncing'
                    ? 'Wijzigingen opslaan...'
                    : syncStatus === 'error'
                      ? `Synchronisatie mislukt: ${syncError}`
                      : 'Je gegevens zijn gesynchroniseerd.'}
          </span>
        </div>

        {feedback && (
          <p
            className={
              feedbackIsError
                ? 'auth-feedback auth-feedback-error'
                : 'auth-feedback'
            }
            role={feedbackIsError ? 'alert' : 'status'}
          >
            {feedback}
          </p>
        )}
      </section>
    )
}

function ProgressChart({
  entries,
  ariaLabel = 'Grafiek van je trainingsprogressie',
}: {
  entries: { date: string; value: number }[]
  ariaLabel?: string
}) {
  const width = 600
  const height = 250
  const paddingLeft = 52
  const paddingRight = 20
  const paddingTop = 24
  const paddingBottom = 42

  const values = entries.map((entry) => entry.value)

  const maximum = Math.max(...values)
  const minimum = Math.min(...values)
  const range = maximum - minimum || maximum * 0.15 || 1
  const chartMin = Math.max(0, minimum - range * 0.15)
  const chartMax = maximum + range * 0.15
  const chartHeight = height - paddingTop - paddingBottom
  const chartWidth = width - paddingLeft - paddingRight

  const points = values.map((value, index) => {
    const x =
      entries.length === 1
        ? paddingLeft + chartWidth / 2
        : paddingLeft + (index / (entries.length - 1)) * chartWidth

    const y =
      paddingTop +
      ((chartMax - value) / (chartMax - chartMin || 1)) * chartHeight

    return { x, y, value, date: entries[index].date }
  })

  const line = points
    .map((point, index) =>
      `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`,
    )
    .join(' ')

  const formatValue = (value: number) =>
    value.toLocaleString('nl-NL', {
      maximumFractionDigits: 1,
    })

  return (
    <div className="chart-container">
      <svg
        className="progress-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={ariaLabel}
      >
        {[0, 1, 2, 3].map((step) => {
          const y = paddingTop + (step / 3) * chartHeight
          const value = chartMax - (step / 3) * (chartMax - chartMin)

          return (
            <g key={step}>
              <line
                x1={paddingLeft}
                y1={y}
                x2={width - paddingRight}
                y2={y}
                className="chart-grid-line"
              />
              <text
                x={paddingLeft - 9}
                y={y + 4}
                textAnchor="end"
                className="chart-axis-label"
              >
                {formatValue(value)}
              </text>
            </g>
          )
        })}

        <path d={line} className="chart-line" />

        {points.map((point, index) => (
          <g key={`${point.date}-${index}`}>
            <circle
              cx={point.x}
              cy={point.y}
              r="5"
              className="chart-point"
            />
            <text
              x={point.x}
              y={height - 15}
              textAnchor="middle"
              className="chart-axis-label"
            >
              {point.date}
            </text>
          </g>
        ))}
      </svg>

      <div className="chart-values">
        {points.map((point, index) => (
          <div className="chart-value" key={`${point.date}-value-${index}`}>
            <span>{point.date}</span>
            <strong>{formatValue(point.value)}</strong>
          </div>
        ))}
      </div>
    </div>
  )
}


type ExerciseOption = {
  name: string
  muscleGroup: string
  secondaryMuscleGroups?: string[]
  custom?: boolean
}

const exerciseMuscleGroupOptions = [
  'Borst',
  'Rug',
  'Schouders',
  'Biceps',
  'Triceps',
  'Quadriceps',
  'Hamstrings',
  'Bilspieren',
  'Heupadductoren',
  'Heupabductoren',
  'Kuiten',
  'Buik',
  'Onderarmen',
  'Trapezius',
]

function defineExercise(
  name: string,
  muscleGroup: string,
  secondaryMuscleGroups: string[] = [],
): ExerciseOption {
  return { name, muscleGroup, secondaryMuscleGroups }
}

function normalizeExerciseOption(exercise: ExerciseOption): ExerciseOption {
  const legacyPrimaryGroup = exercise.muscleGroup === 'Benen'
  const legacySecondaryGroup = exercise.secondaryMuscleGroups?.includes('Benen')
  if (!legacyPrimaryGroup && !legacySecondaryGroup) return exercise

  const muscleGroup = legacyPrimaryGroup
    ? 'Quadriceps'
    : exercise.muscleGroup
  const secondaryMuscleGroups = new Set(
    exercise.secondaryMuscleGroups?.filter((group) => group !== 'Benen') ?? [],
  )

  if (legacyPrimaryGroup || legacySecondaryGroup) {
    secondaryMuscleGroups.add('Quadriceps')
    secondaryMuscleGroups.add('Hamstrings')
    secondaryMuscleGroups.add('Bilspieren')
  }
  secondaryMuscleGroups.delete(muscleGroup)

  return {
    ...exercise,
    muscleGroup,
    secondaryMuscleGroups: [...secondaryMuscleGroups],
  }
}

const exerciseLibrary: ExerciseOption[] = [
  defineExercise('Ab Wheel Rollout', 'Buik'),
  defineExercise('Arnold Press', 'Schouders', ['Triceps']),
  defineExercise('Back Extension', 'Rug', ['Bilspieren', 'Hamstrings']),
  defineExercise('Barbell Row', 'Rug', ['Biceps', 'Schouders']),
  defineExercise('Barbell Bench Press', 'Borst', ['Schouders', 'Triceps']),
  defineExercise('Bicep Curl', 'Biceps', ['Onderarmen']),
  defineExercise('Bulgarian Split Squat', 'Quadriceps', ['Bilspieren', 'Hamstrings']),
  defineExercise('Cable Chest Press', 'Borst', ['Schouders', 'Triceps']),
  defineExercise('Cable Hip Abduction', 'Heupabductoren'),
  defineExercise('Cable Hip Adduction', 'Heupadductoren'),
  defineExercise('Cable Lateral Raise', 'Schouders'),
  defineExercise('Cable Crossover', 'Borst', ['Schouders']),
  defineExercise('Cable Fly', 'Borst', ['Schouders']),
  defineExercise('Cable Curl', 'Biceps', ['Onderarmen']),
  defineExercise('Cable Rear Delt Fly', 'Schouders', ['Rug']),
  defineExercise('Chest Press Machine', 'Borst', ['Schouders', 'Triceps']),
  defineExercise('Calf Raise', 'Kuiten'),
  defineExercise('Chest-Supported Row', 'Rug', ['Biceps', 'Schouders']),
  defineExercise('Close-Grip Lat Pulldown', 'Rug', ['Biceps']),
  defineExercise('Close-Grip Bench Press', 'Triceps', ['Borst', 'Schouders']),
  defineExercise('Decline Bench Press', 'Borst', ['Triceps', 'Schouders']),
  defineExercise('Concentration Curl', 'Biceps', ['Onderarmen']),
  defineExercise('Deadlift', 'Rug', ['Bilspieren', 'Hamstrings', 'Trapezius']),
  defineExercise('Dumbbell Bench Press', 'Borst', ['Schouders', 'Triceps']),
  defineExercise('Dumbbell Fly', 'Borst', ['Schouders']),
  defineExercise('Dumbbell Shoulder Press', 'Schouders', ['Triceps']),
  defineExercise('Face Pull', 'Schouders', ['Rug']),
  defineExercise('Front Squat', 'Quadriceps', ['Bilspieren']),
  defineExercise('Front Raise', 'Schouders'),
  defineExercise('Glute Bridge', 'Bilspieren', ['Hamstrings']),
  defineExercise('Glute Kickback', 'Bilspieren', ['Hamstrings']),
  defineExercise('Goblet Squat', 'Quadriceps', ['Bilspieren']),
  defineExercise('Hack Squat', 'Quadriceps', ['Bilspieren']),
  defineExercise('Hammer Curl', 'Biceps', ['Onderarmen']),
  defineExercise('Hanging Knee Raise', 'Buik'),
  defineExercise('Hip Abduction Machine', 'Heupabductoren'),
  defineExercise('Hip Adduction Machine', 'Heupadductoren'),
  defineExercise('Hip Thrust', 'Bilspieren', ['Hamstrings']),
  defineExercise('Incline Dumbbell Curl', 'Biceps', ['Onderarmen']),
  defineExercise('Incline Barbell Bench Press', 'Borst', ['Schouders', 'Triceps']),
  defineExercise('Incline Dumbbell Bench Press', 'Borst', ['Schouders', 'Triceps']),
  defineExercise('Incline Machine Chest Press', 'Borst', ['Schouders', 'Triceps']),
  defineExercise('Lat Pulldown', 'Rug', ['Biceps']),
  defineExercise('Leg Press', 'Quadriceps', ['Bilspieren', 'Hamstrings']),
  defineExercise('Leg Curl', 'Hamstrings'),
  defineExercise('Leg Extension', 'Quadriceps'),
  defineExercise('Lateral Raise', 'Schouders'),
  defineExercise('Lunge', 'Quadriceps', ['Bilspieren', 'Hamstrings']),
  defineExercise('Nordic Hamstring Curl', 'Hamstrings'),
  defineExercise('Pec Deck', 'Borst', ['Schouders']),
  defineExercise('Plank', 'Buik'),
  defineExercise('Preacher Curl', 'Biceps', ['Onderarmen']),
  defineExercise('Pull-Up', 'Rug', ['Biceps']),
  defineExercise('Push-Up', 'Borst', ['Schouders', 'Triceps']),
  defineExercise('Reverse Curl', 'Onderarmen', ['Biceps']),
  defineExercise('Reverse-Grip Lat Pulldown', 'Rug', ['Biceps']),
  defineExercise('Romanian Deadlift', 'Hamstrings', ['Bilspieren', 'Rug']),
  defineExercise('Reverse Fly', 'Schouders', ['Rug']),
  defineExercise('Russian Twist', 'Buik'),
  defineExercise('Rope Triceps Pushdown', 'Triceps'),
  defineExercise('Seated Calf Raise', 'Kuiten'),
  defineExercise('Single-Arm Dumbbell Row', 'Rug', ['Biceps', 'Schouders']),
  defineExercise('Smith Machine Bench Press', 'Borst', ['Schouders', 'Triceps']),
  defineExercise('Overhead Triceps Extension', 'Triceps', ['Schouders']),
  defineExercise('Seated Cable Row', 'Rug', ['Biceps', 'Schouders']),
  defineExercise('Standing Calf Raise', 'Kuiten'),
  defineExercise('Step-Up', 'Quadriceps', ['Bilspieren', 'Hamstrings']),
  defineExercise('Squat', 'Quadriceps', ['Bilspieren', 'Hamstrings']),
  defineExercise('Straight-Arm Pulldown', 'Rug', ['Triceps']),
  defineExercise('T-Bar Row', 'Rug', ['Biceps', 'Schouders']),
  defineExercise('Triceps Dip', 'Triceps', ['Borst', 'Schouders']),
  defineExercise('Triceps Skull Crusher', 'Triceps'),
  defineExercise('Triceps Pushdown', 'Triceps'),
  defineExercise('Upright Row', 'Schouders', ['Trapezius']),
  defineExercise('Walking Lunge', 'Quadriceps', ['Bilspieren', 'Hamstrings']),
]

function getWorkoutMuscleGroupWorkload(
  workout: Workout,
  exerciseOptions: ExerciseOption[],
): Record<string, MuscleGroupWorkload> {
  const optionsByName = new Map(
    exerciseOptions.map((exercise) => [
      exercise.name.toLocaleLowerCase(),
      exercise,
    ]),
  )
  const workload: Record<string, MuscleGroupWorkload> = {}

  workout.exercises.forEach((exercise) => {
    const exerciseOption = optionsByName.get(exercise.name.toLocaleLowerCase())
    if (!exerciseOption) return
    const primaryMuscleGroup = exerciseOption.muscleGroup
    const secondaryMuscleGroups = exerciseOption?.secondaryMuscleGroups ?? []

    const addWorkload = (muscleGroup: string, role: 'primary' | 'secondary') => {
      const groupWorkload = workload[muscleGroup] ??= {
        primarySets: 0,
        primaryReps: 0,
        primaryVolume: 0,
        secondarySets: 0,
        secondaryReps: 0,
        secondaryVolume: 0,
      }

      exercise.sets.forEach((set) => {
        const reps = Number(set.reps)
        const weight = Number(set.weight)
        const validReps = Number.isFinite(reps) && reps > 0 ? reps : 0
        const validWeight =
          Number.isFinite(weight) && weight >= 0 ? weight : 0
        const setKey = role === 'primary' ? 'primary' : 'secondary'

        groupWorkload[`${setKey}Sets`] += 1
        groupWorkload[`${setKey}Reps`] += validReps
        groupWorkload[`${setKey}Volume`] += validReps * validWeight
      })
    }

    addWorkload(primaryMuscleGroup, 'primary')
    new Set(secondaryMuscleGroups)
      .forEach((muscleGroup) => {
        if (muscleGroup !== primaryMuscleGroup) {
          addWorkload(muscleGroup, 'secondary')
        }
      })
  })

  return workload
}

function getMuscleRecovery(
  workouts: Workout[],
  exerciseOptions: ExerciseOption[],
  now: number,
): MuscleRecovery[] {
  const normalizeMuscleGroup = (muscleGroup: string) =>
    muscleGroup === 'Trapezius'
      ? 'Rug'
      : muscleGroup === 'Overig'
        ? ''
        : muscleGroup
  const recoveryHours = 48
  const maxEffortSetsToZeroScore = 10
  const muscleGroups = new Set(
    exerciseMuscleGroupOptions.map(normalizeMuscleGroup),
  )
  const fatigueByMuscle = new Map<string, number>()
  const optionsByName = new Map(
    exerciseOptions.map((exercise) => [
      exercise.name.toLocaleLowerCase(),
      exercise,
    ]),
  )

  exerciseOptions.forEach((exercise) => {
    const primaryGroup = normalizeMuscleGroup(exercise.muscleGroup)
    if (primaryGroup) muscleGroups.add(primaryGroup)
    exercise.secondaryMuscleGroups?.forEach((group) =>
      {
        const normalizedGroup = normalizeMuscleGroup(group)
        if (normalizedGroup) muscleGroups.add(normalizedGroup)
      },
    )
  })

  workouts.forEach((workout) => {
    const idTimestamp = Number(workout.id)
    const workoutDate = parseWorkoutDate(workout.date)
    if (workoutDate && workout.endTime && isValidWorkoutTime(workout.endTime)) {
      const [hours, minutes] = workout.endTime.split(':').map(Number)
      const startMinutes = getWorkoutTime(workout)
      const duration = getWorkoutDurationMinutes(startMinutes, workout.endTime)
      if (
        duration !== null &&
        duration > 0 &&
        startMinutes &&
        Number(workout.endTime.replace(':', '')) <
          Number(startMinutes.replace(':', ''))
      ) {
        workoutDate.setDate(workoutDate.getDate() + 1)
      }
      workoutDate.setHours(hours, minutes, 0, 0)
    } else if (workoutDate && isValidWorkoutTime(workout.time ?? '')) {
      const [hours, minutes] = workout.time!.split(':').map(Number)
      workoutDate.setHours(hours, minutes, 0, 0)
    }
    const dateTimestamp = workoutDate?.getTime() ?? now
    const workoutTimestamp =
      !workout.time && !workout.endTime && idTimestamp > 1_000_000_000_000 && idTimestamp <= now
        ? idTimestamp
        : dateTimestamp
    const recoveryRemaining = Math.max(
      0,
      1 - (now - workoutTimestamp) / (recoveryHours * 60 * 60 * 1000),
    )
    if (recoveryRemaining === 0) return

    workout.exercises.forEach((exercise) => {
      const option = optionsByName.get(exercise.name.toLocaleLowerCase())
      if (!option) return
      const primaryGroup = normalizeMuscleGroup(option.muscleGroup)
      if (!primaryGroup) return
      const secondaryGroups = new Set(
        (option.secondaryMuscleGroups ?? [])
          .map(normalizeMuscleGroup)
          .filter(Boolean),
      )

      exercise.sets.forEach((set) => {
        const reps = Number(set.reps)
        if (!Number.isFinite(reps) || reps <= 0) return

        const parsedRpe = Number(set.rpe)
        const rpe =
          Number.isFinite(parsedRpe) && parsedRpe >= 1
            ? Math.min(10, parsedRpe)
            : 8
        const effort = rpe / 10
        const primaryFatigue =
          (100 / maxEffortSetsToZeroScore) * effort * recoveryRemaining
        fatigueByMuscle.set(
          primaryGroup,
          (fatigueByMuscle.get(primaryGroup) ?? 0) + primaryFatigue,
        )

        secondaryGroups.forEach((group) => {
          if (group === primaryGroup) return
          const secondaryFatigue = primaryFatigue * 0.5
          fatigueByMuscle.set(
            group,
            (fatigueByMuscle.get(group) ?? 0) + secondaryFatigue,
          )
        })
      })
    })
  })

  const priorityGroups = [
    'Borst',
    'Schouders',
    'Triceps',
    'Biceps',
    'Rug',
    'Onderarmen',
  ]

  return [...muscleGroups]
    .sort((left, right) => {
      const leftPriority = priorityGroups.indexOf(left)
      const rightPriority = priorityGroups.indexOf(right)
      if (leftPriority !== -1 || rightPriority !== -1) {
        if (leftPriority === -1) return 1
        if (rightPriority === -1) return -1
        return leftPriority - rightPriority
      }
      return left.localeCompare(right, 'nl')
    })
    .map((muscleGroup) => ({
      muscleGroup,
      percentage: Math.round(
        Math.max(0, 100 - (fatigueByMuscle.get(muscleGroup) ?? 0)),
      ),
    }))
}

function getRecoveryColor(percentage: number) {
  const clampedPercentage = Math.min(100, Math.max(0, percentage))
  const hue = (clampedPercentage / 100) * 120
  return `hsl(${hue} 85% 42%)`
}

function getMuscleTrainingLoad(
  workouts: Workout[],
  exerciseOptions: ExerciseOption[],
  period: TrainingLoadPeriod,
  now: number,
): MuscleTrainingLoad[] {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  let periodStart: Date | null = null

  if (period === 'week') {
    periodStart = getWeekStart(today)
  } else if (period === 'month') {
    periodStart = new Date(today.getFullYear(), today.getMonth(), 1)
  } else if (period === 'year') {
    periodStart = new Date(today.getFullYear(), 0, 1)
  }

  const optionsByName = new Map(
    exerciseOptions.map((exercise) => [
      exercise.name.toLocaleLowerCase(),
      exercise,
    ]),
  )
  const loadByMuscle = new Map<string, number>()
  const normalizeMuscleGroup = (muscleGroup: string) =>
    muscleGroup === 'Trapezius'
      ? 'Rug'
      : muscleGroup === 'Overig'
        ? ''
        : muscleGroup

  workouts.forEach((workout) => {
    const workoutDate = parseWorkoutDate(workout.date)
    if (
      !workoutDate ||
      (periodStart && dateKey(workoutDate) < dateKey(periodStart)) ||
      dateKey(workoutDate) > dateKey(today)
    ) {
      return
    }

    workout.exercises.forEach((exercise) => {
      const option = optionsByName.get(exercise.name.toLocaleLowerCase())
      if (!option) return
      const primaryGroup = normalizeMuscleGroup(option.muscleGroup)
      if (!primaryGroup) return

      const workSetCount = exercise.sets.filter((set) => {
        const reps = Number(set.reps)
        return Number.isFinite(reps) && reps > 0
      }).length
      if (!workSetCount) return

      loadByMuscle.set(
        primaryGroup,
        (loadByMuscle.get(primaryGroup) ?? 0) + workSetCount,
      )
      new Set(option.secondaryMuscleGroups ?? []).forEach((secondaryGroup) => {
        const normalizedGroup = normalizeMuscleGroup(secondaryGroup)
        if (!normalizedGroup || normalizedGroup === primaryGroup) return
        loadByMuscle.set(
          normalizedGroup,
          (loadByMuscle.get(normalizedGroup) ?? 0) + workSetCount * 0.5,
        )
      })
    })
  })

  return [...loadByMuscle]
    .map(([muscleGroup, effectiveSets]) => ({ muscleGroup, effectiveSets }))
    .sort((left, right) => right.effectiveSets - left.effectiveSets)
}

function MuscleLoadVisualizations({
  muscleLoads,
  maxLoad,
}: {
  muscleLoads: MuscleTrainingLoad[]
  maxLoad: number
}) {
  const muscleLoadByGroup = new Map(
    muscleLoads.map(({ muscleGroup, effectiveSets }) => [
      muscleGroup,
      effectiveSets,
    ]),
  )
  const radarCenter = { x: 180, y: 160 }
  const radarRadius = 104
  const radarPoint = (index: number, scale: number) => {
    const angle =
      -Math.PI / 2 + (2 * Math.PI * index) / muscleLoads.length
    return {
      x: radarCenter.x + Math.cos(angle) * radarRadius * scale,
      y: radarCenter.y + Math.sin(angle) * radarRadius * scale,
      labelX: radarCenter.x + Math.cos(angle) * (radarRadius + 30),
      labelY: radarCenter.y + Math.sin(angle) * (radarRadius + 30),
    }
  }
  const radarPolygon = (scale: number) =>
    muscleLoads
      .map((_, index) => {
        const point = radarPoint(index, scale)
        return `${point.x},${point.y}`
      })
      .join(' ')
  const loadRatio = (muscleGroup: string) =>
    Math.min(1, (muscleLoadByGroup.get(muscleGroup) ?? 0) / maxLoad)
  const muscleOpacity = (muscleGroup: string) =>
    (0.12 + loadRatio(muscleGroup) * 0.78).toFixed(2)

  return (
    <div className="muscle-load-visuals">
      <div className="muscle-radar-wrap">
        <svg
          className="muscle-radar"
          viewBox="0 0 360 320"
          role="img"
          aria-label={`Radar diagram van trainingsbelasting per spiergroep. ${muscleLoads
            .map(
              ({ muscleGroup, effectiveSets }) =>
                `${muscleGroup}: ${effectiveSets} effectieve sets`,
            )
            .join('; ')}`}
        >
          {[0.25, 0.5, 0.75, 1].map((scale) => (
            <polygon
              key={scale}
              points={radarPolygon(scale)}
              className="muscle-radar-grid"
            />
          ))}
          {muscleLoads.map(({ muscleGroup }, index) => {
            const point = radarPoint(index, 1)
            return (
              <g key={muscleGroup}>
                <line
                  x1={radarCenter.x}
                  y1={radarCenter.y}
                  x2={point.x}
                  y2={point.y}
                  className="muscle-radar-axis"
                />
                <text
                  x={point.labelX}
                  y={point.labelY}
                  className="muscle-radar-label"
                  textAnchor={
                    point.labelX < radarCenter.x - 12
                      ? 'end'
                      : point.labelX > radarCenter.x + 12
                        ? 'start'
                        : 'middle'
                  }
                  dominantBaseline="middle"
                >
                  {muscleGroup}
                  <title>
                    {muscleGroup}: {muscleLoadByGroup.get(muscleGroup) ?? 0}{' '}
                    effectieve sets
                  </title>
                </text>
              </g>
            )
          })}
          <polygon
            points={muscleLoads
              .map(({ muscleGroup }, index) => {
                const point = radarPoint(
                  index,
                  loadRatio(muscleGroup),
                )
                return `${point.x},${point.y}`
              })
              .join(' ')}
            className="muscle-radar-data"
          />
          {muscleLoads.map(({ muscleGroup }, index) => {
            const point = radarPoint(index, loadRatio(muscleGroup))
            return (
              <circle
                key={muscleGroup}
                cx={point.x}
                cy={point.y}
                r="3"
                className="muscle-radar-point"
              />
            )
          })}
        </svg>
      </div>

      <svg
        className="muscle-body-map"
        viewBox="0 0 420 370"
        role="img"
        aria-label="Voor- en achteraanzicht van de belangrijkste spiergroepen. Rood geeft de relatieve trainingsbelasting aan."
      >
        <defs>
          <linearGradient id="body-base" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#f6f3f0" />
            <stop offset=".5" stopColor="#d9d4d0" />
            <stop offset="1" stopColor="#c7c2be" />
          </linearGradient>
          <linearGradient id="muscle-shade" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#ff7777" />
            <stop offset="1" stopColor="#b51221" />
          </linearGradient>
          <filter id="body-shadow" x="-30%" y="-15%" width="160%" height="145%">
            <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#526158" floodOpacity=".16" />
          </filter>
        </defs>
        <text x="105" y="18" className="muscle-body-caption">VOORAANZICHT</text>
        <text x="315" y="18" className="muscle-body-caption">ACHTERAANZICHT</text>
        <g filter="url(#body-shadow)">
          <g className="muscle-body-silhouette">
            <ellipse cx="105" cy="48" rx="17" ry="21" />
            <path d="M98 67h14l5 15-12 8-12-8z" />
            <path d="M89 76q-14-5-23 4L48 91q-6 4-8 12l-12 40q-2 7 4 9t9-5l16-31 11-22 16-5z" />
            <path d="M121 76q14-5 23 4l18 11q6 4 8 12l12 40q2 7-4 9t-9-5l-16-31-11-22-16-5z" />
            <path d="M90 77q8-7 15-7t15 7q17-2 24 8l-6 36-4 42q-1 14-12 20l-2 13H90l-2-13q-11-6-12-20l-4-42-6-36q7-10 24-8z" />
            <path d="M90 193q15 5 30 0l5 19-4 65q-1 11-5 22l-3 29q-1 6-7 6t-6-7l2-32-4-34-4 34 2 32q0 7-6 7t-7-6l-3-29q-4-11-5-22l-4-65z" />
            <ellipse cx="315" cy="48" rx="17" ry="21" />
            <path d="M308 67h14l5 15-12 8-12-8z" />
            <path d="M299 76q-16-6-29 1l-21 12q-7 4-9 13l-11 41q-2 7 4 9t9-5l15-30 12-20 16-5z" />
            <path d="M331 76q16-6 29 1l21 12q7 4 9 13l11 41q2 7-4 9t-9-5l-15-30-12-20-16-5z" />
            <path d="M299 76q16-7 32 0 15-3 24 8l-7 40-3 39q-1 17-15 24l-2 13h-27l-2-13q-14-7-15-24l-3-39-7-40q9-11 24-8z" />
            <path d="M300 200q15-5 30 0l5 18-6 63q-1 11-5 22l-3 29q-1 6-7 6t-6-7l2-32-4-34-4 34 2 32q0 7-6 7t-7-6l-3-29q-4-11-5-22l-4-63z" />
          </g>
          <g className="muscle-body-regions">
            <path d="M76 91q12-12 27-5l-1 25q-12 4-24-5z" fillOpacity={muscleOpacity('Borst')} />
            <path d="M134 91q-12-12-27-5l1 25q12 4 24-5z" fillOpacity={muscleOpacity('Borst')} />
            <path d="M75 80q-12-7-21 5l7 13q11-2 17-11z" fillOpacity={muscleOpacity('Schouders')} />
            <path d="M135 80q12-7 21 5l-7 13q-11-2-17-11z" fillOpacity={muscleOpacity('Schouders')} />
            <path d="M58 98q-7 15-12 36l9 5 15-37z" fillOpacity={muscleOpacity('Biceps')} />
            <path d="M152 98q7 15 12 36l-9 5-15-37z" fillOpacity={muscleOpacity('Biceps')} />
            <path d="M33 133q-5 11-8 22l10 4 10-18zM177 133q5 11 8 22l-10 4-10-18z" fillOpacity={muscleOpacity('Onderarmen')} />
            <path d="M88 117q8 5 17 1v16H88zM107 118q7 4 15-1v17h-15zM88 138h17v16H89zM107 138h15v16h-15zM89 158h16v17q-9 3-16-4zM107 158h15v13q-7 7-15 4z" fillOpacity={muscleOpacity('Buik')} />
            <path d="M77 180q11-4 19 3l-3 47q-2 15-12 26l-6-13-4-43z" fillOpacity={muscleOpacity('Quadriceps')} />
            <path d="M133 180q-11-4-19 3l3 47q2 15 12 26l6-13 4-43z" fillOpacity={muscleOpacity('Quadriceps')} />
            <path d="M82 263q8 0 13 5l-4 33-10 1-4-16zM128 263q-8 0-13 5l4 33 10 1 4-16z" fillOpacity={muscleOpacity('Kuiten')} />
            <path d="M286 84q13-13 29-8l-10 29-14 5zM344 84q-13-13-29-8l10 29 14 5z" fillOpacity={muscleOpacity('Schouders')} />
            <path d="M295 79q20-12 39 0l-6 21-13 12-14-12z" fillOpacity={muscleOpacity('Rug')} />
            <path d="M283 105q-9 5-12 20l-7 29 18 14 18-11v-45zM347 105q9 5 12 20l7 29-18 14-18-11v-45z" fillOpacity={muscleOpacity('Rug')} />
            <path d="M276 91q-15-8-22 8l12 20 14-9zM354 91q15-8 22 8l-12 20-14-9z" fillOpacity={muscleOpacity('Triceps')} />
            <path d="M245 102q-8 16-12 34l9 5 15-35zM385 102q8 16 12 34l-9 5-15-35z" fillOpacity={muscleOpacity('Onderarmen')} />
            <path d="M287 161q12-9 28 0v18q-14 7-28 0zM315 161q14-9 28 0v18q-16 7-28 0z" fillOpacity={muscleOpacity('Bilspieren')} />
            <path d="M291 183q10-5 17 2l-2 42q-2 16-12 26l-7-16zM339 183q-10-5-17 2l2 42q2 16 12 26l7-16z" fillOpacity={muscleOpacity('Hamstrings')} />
            <path d="M296 263q8 0 13 5l-4 33-10 1-4-16zM342 263q-8 0-13 5l4 33 10 1 4-16z" fillOpacity={muscleOpacity('Kuiten')} />
          </g>
          <g className="muscle-body-contours">
            <path d="M105 87v91m-30-57q30 14 60 0M88 116q17 6 34 0M88 137q17 5 34 0M89 158q16 5 32 0M105 117v57M76 177q29 12 58 0M105 199v23M105 224v25" />
            <path d="M315 91v68m-28-43q28 13 56 0M287 137q28 12 56 0M287 158q28 13 56 0M315 106v66M289 181q26 13 52 0M315 204v22M315 230v20" />
            <path d="M61 95q7 12 11 26M149 95q-7 12-11 26M48 117l-8 26M162 117l8 26M86 250l-5 13M124 250l5 13M276 118l-8 24M354 118l8 24M301 250l-5 13M339 250l5 13" />
          </g>
        </g>
      </svg>
    </div>
  )
}

function ExerciseLibraryExerciseDetails({
  exercise,
  workouts,
  onBack,
}: {
  exercise: ExerciseOption
  workouts: Workout[]
  onBack: () => void
}) {
  const [selectedMetric, setSelectedMetric] = useState<Metric>('weight')
  const exerciseWorkouts = workouts
    .map((workout) => {
      const matchingExercises = workout.exercises.filter(
        (item) => item.name === exercise.name,
      )
      const sets = matchingExercises
        .flatMap((item) =>
          item.sets.map((set) => ({
            reps: Number(set.reps),
            weight: Number(set.weight),
          })),
        )
        .filter(
          (set) =>
            Number.isFinite(set.reps) &&
            set.reps > 0 &&
            Number.isFinite(set.weight) &&
            set.weight >= 0,
        )
      if (sets.length === 0) return null

      return {
        workout,
        sets,
        reps: sets.reduce((total, set) => total + set.reps, 0),
        volume: sets.reduce(
          (total, set) => total + set.reps * set.weight,
          0,
        ),
        topWeight: Math.max(...sets.map((set) => set.weight)),
      }
    })
    .filter(
      (
        entry,
      ): entry is {
        workout: Workout
        sets: ReturnType<typeof getValidSets>
        reps: number
        volume: number
        topWeight: number
      } => entry !== null,
    )
    .sort(
      (left, right) =>
        getWorkoutSortTimestamp(left.workout) -
        getWorkoutSortTimestamp(right.workout),
    )
  const totalSets = exerciseWorkouts.reduce(
    (total, entry) => total + entry.sets.length,
    0,
  )
  const totalReps = exerciseWorkouts.reduce(
    (total, entry) => total + entry.reps,
    0,
  )
  const totalVolume = exerciseWorkouts.reduce(
    (total, entry) => total + entry.volume,
    0,
  )
  const bestWeight = Math.max(
    0,
    ...exerciseWorkouts.map((entry) => entry.topWeight),
  )
  const bestEstimatedOneRepMax = Math.max(
    0,
    ...exerciseWorkouts.flatMap((entry) =>
      entry.sets.map((set) => getEstimatedOneRepMax(set.weight, set.reps)),
    ),
  )
  const lastWorkout = exerciseWorkouts.at(-1)

  return (
    <section className="exercise-detail">
      <div className="exercise-detail-heading">
        <div>
          <h3>{exercise.name}</h3>
          <p>Hoofdspiergroep: {exercise.muscleGroup}</p>
          <p>
            Subgroep(en):{' '}
            {exercise.secondaryMuscleGroups?.length
              ? exercise.secondaryMuscleGroups.join(', ')
              : 'Geen geregistreerd'}
          </p>
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={onBack}
        >
          Terug naar oefeningen
        </button>
      </div>

      {exerciseWorkouts.length === 0 ? (
        <p className="subtitle">
          Er zijn nog geen werksets met gewicht voor deze oefening. Log een
          training om je statistieken te zien.
        </p>
      ) : (
        <>
          <div className="exercise-fun-facts">
            <article className="stat-card">
              <p>Werksets</p>
              <strong>{totalSets}</strong>
            </article>
            <article className="stat-card">
              <p>Hoeveel trainingen</p>
              <strong>{exerciseWorkouts.length}</strong>
            </article>
            <article className="stat-card">
              <p>Totaal herhalingen</p>
              <strong>{totalReps.toLocaleString('nl-NL')}</strong>
            </article>
            <article className="stat-card">
              <p>Totaal volume</p>
              <strong>{totalVolume.toLocaleString('nl-NL')} kg</strong>
            </article>
            <article className="stat-card">
              <p>Zwaarste werkgewicht</p>
              <strong>{bestWeight.toLocaleString('nl-NL')} kg</strong>
            </article>
            <article className="stat-card">
              <p>Beste geschatte 1RM</p>
              <strong>
                {bestEstimatedOneRepMax.toLocaleString('nl-NL', {
                  maximumFractionDigits: 1,
                })}{' '}
                kg
              </strong>
            </article>
          </div>

          {lastWorkout && (
            <p className="exercise-detail-last-workout">
              Laatst gedaan: {formatWorkoutDate(lastWorkout.workout.date)}
              {formatWorkoutTimeRange(lastWorkout.workout) &&
                ` · ${formatWorkoutTimeRange(lastWorkout.workout)}`}
            </p>
          )}

          <article className="history-card chart-card">
            <h3>
              {selectedMetric === 'weight'
                ? 'Progressie zwaarste werkgewicht'
                : selectedMetric === 'oneRepMax'
                  ? 'Geschatte 1RM'
                  : 'Trainingsvolume'}
            </h3>
            <label htmlFor="exercise-detail-chart-metric">
              Toon in grafiek
            </label>
            <select
              id="exercise-detail-chart-metric"
              value={selectedMetric}
              onChange={(event) =>
                setSelectedMetric(event.target.value as Metric)
              }
            >
              <option value="oneRepMax">Geschatte 1RM (kg)</option>
              <option value="weight">Zwaarste werkgewicht (kg)</option>
              <option value="volume">Volume (kg × herhalingen)</option>
            </select>
            <ProgressChart
              ariaLabel={`${
                selectedMetric === 'weight'
                  ? 'Progressie zwaarste werkgewicht'
                  : selectedMetric === 'oneRepMax'
                    ? 'Geschatte 1RM'
                    : 'Trainingsvolume'
              } voor ${exercise.name}`}
              entries={exerciseWorkouts.map((entry) => ({
                date: formatWorkoutDate(entry.workout.date),
                value:
                  selectedMetric === 'weight'
                    ? entry.topWeight
                    : selectedMetric === 'oneRepMax'
                      ? Math.max(
                          ...entry.sets.map((set) =>
                            getEstimatedOneRepMax(set.weight, set.reps),
                          ),
                        )
                      : entry.volume,
              }))}
            />
          </article>
        </>
      )}
    </section>
  )
}

function ExerciseLibraryPanel({
  exercises,
  workouts,
  onSelect,
  onBack,
  onAddExercise,
}: {
  exercises: ExerciseOption[]
  workouts: Workout[]
  onSelect?: (exerciseName: string) => void
  onBack: () => void
  onAddExercise: (
    name: string,
    muscleGroup: string,
    secondaryMuscleGroups: string[],
  ) => void
}) {
  const [search, setSearch] = useState('')
  const [selectedGroup, setSelectedGroup] = useState('Alle')
  const [showMenu, setShowMenu] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newExerciseName, setNewExerciseName] = useState('')
  const [newExerciseGroup, setNewExerciseGroup] = useState('Borst')
  const [newExerciseSecondaryGroups, setNewExerciseSecondaryGroups] =
    useState<string[]>([])
  const [selectedExerciseName, setSelectedExerciseName] = useState<string | null>(
    null,
  )
  const [formError, setFormError] = useState('')
  const muscleGroups = [
    'Alle',
    ...new Set(exercises.map((exercise) => exercise.muscleGroup)),
  ]

  const filteredExercises = exercises
    .filter((exercise) =>
      exercise.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
    )
    .filter(
      (exercise) =>
        selectedGroup === 'Alle' || exercise.muscleGroup === selectedGroup,
    )
    .sort((left, right) => left.name.localeCompare(right.name))
  const selectedExercise = exercises.find(
    (exercise) => exercise.name === selectedExerciseName,
  )

  if (!onSelect && selectedExercise) {
    return (
      <div className="exercise-library">
        <div className="exercise-library-heading">
          <button type="button" className="secondary-button" onClick={onBack}>
            ← Terug
          </button>
          <h2>Oefeningdetails</h2>
        </div>
        <ExerciseLibraryExerciseDetails
          exercise={selectedExercise}
          workouts={workouts}
          onBack={() => setSelectedExerciseName(null)}
        />
      </div>
    )
  }

  function submitExercise(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedName = newExerciseName.trim()
    if (!trimmedName) {
      setFormError('Vul een naam in voor de oefening.')
      return
    }
    if (
      exercises.some(
        (exercise) =>
          exercise.name.toLocaleLowerCase() === trimmedName.toLocaleLowerCase(),
      )
    ) {
      setFormError('Deze oefening staat al in de bibliotheek.')
      return
    }

    onAddExercise(trimmedName, newExerciseGroup, newExerciseSecondaryGroups)
    setNewExerciseName('')
    setNewExerciseSecondaryGroups([])
    setFormError('')
    setShowAddForm(false)
    setShowMenu(false)
  }

  return (
    <div className="exercise-library">
      <div className="exercise-library-heading">
        <button type="button" className="secondary-button" onClick={onBack}>
          ← Terug
        </button>
        <h2>{onSelect ? 'Oefening toevoegen' : 'Oefeningen beheren'}</h2>
        <div className="exercise-library-menu-wrap">
          <button
            type="button"
            className="exercise-library-menu-button"
            aria-label="Oefeningenbibliotheek opties"
            aria-expanded={showMenu}
            onClick={() => setShowMenu((current) => !current)}
          >
            ⋮
          </button>
          {showMenu && (
            <div className="exercise-library-menu">
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(true)
                  setShowMenu(false)
                  setFormError('')
                }}
              >
                + Zelf oefening toevoegen
              </button>
            </div>
          )}
        </div>
      </div>

      <input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Zoek een oefening..."
        aria-label="Zoek een oefening"
      />

      {showAddForm && (
        <form className="exercise-create-form" onSubmit={submitExercise}>
          <h3>Eigen oefening toevoegen</h3>
          <label>
            Naam
            <input
              autoFocus
              value={newExerciseName}
              onChange={(event) => setNewExerciseName(event.target.value)}
              placeholder="Bijv. Cable wood chop"
              maxLength={60}
            />
          </label>
          <label>
            Hoofdspiergroep
            <select
              value={newExerciseGroup}
              onChange={(event) => setNewExerciseGroup(event.target.value)}
            >
              {exerciseMuscleGroupOptions.map((group) => (
                <option key={group} value={group}>{group}</option>
              ))}
            </select>
          </label>
          <fieldset className="exercise-secondary-groups">
            <legend>Subspiergroepen (optioneel)</legend>
            <div>
              {exerciseMuscleGroupOptions
                .filter((group) => group !== newExerciseGroup)
                .map((group) => (
                  <label key={group}>
                    <input
                      type="checkbox"
                      checked={newExerciseSecondaryGroups.includes(group)}
                      onChange={(event) =>
                        setNewExerciseSecondaryGroups((current) =>
                          event.target.checked
                            ? [...current, group]
                            : current.filter((item) => item !== group),
                        )
                      }
                    />
                    {group}
                  </label>
                ))}
            </div>
          </fieldset>
          {formError && <p className="exercise-form-error">{formError}</p>}
          <div className="exercise-create-actions">
            <button type="submit">Toevoegen</button>
            <button
              type="button"
              onClick={() => {
                setShowAddForm(false)
                setFormError('')
              }}
            >
              Annuleren
            </button>
          </div>
        </form>
      )}

      <div className="muscle-filters">
        {muscleGroups.map((group) => (
          <button
            key={group}
            type="button"
            className={selectedGroup === group ? 'muscle-filter active' : 'muscle-filter'}
            onClick={() => setSelectedGroup(group)}
          >
            {group}
          </button>
        ))}
      </div>

      <div className="exercise-library-list">
        {filteredExercises.map((exercise, index) => {
          const letter = exercise.name.charAt(0).toLocaleUpperCase('nl-NL')
          const previousLetter = filteredExercises[index - 1]?.name
            .charAt(0)
            .toLocaleUpperCase('nl-NL')

          return (
            <Fragment key={exercise.name}>
              {letter !== previousLetter && (
                <h3 className="exercise-library-letter">{letter}</h3>
              )}
              <button
                type="button"
                className="library-exercise"
                onClick={() => {
                  if (onSelect) {
                    onSelect(exercise.name)
                  } else {
                    setSelectedExerciseName(exercise.name)
                  }
                }}
              >
                <span>{exercise.name}</span>
                <span>{exercise.muscleGroup}{onSelect ? '　＋' : '　→'}</span>
              </button>
            </Fragment>
          )
        })}
        {filteredExercises.length === 0 && (
          <p>Geen oefeningen gevonden.</p>
        )}
      </div>
    </div>
  )
}

function FolderPicker({
  folders,
  value,
  newFolderName,
  onChange,
  onNewFolderNameChange,
}: {
  folders: string[]
  value: string
  newFolderName: string
  onChange: (value: string) => void
  onNewFolderNameChange: (value: string) => void
}) {
  return (
    <>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label="Kies een map"
      >
        <option value="">Geen map</option>
        {folders.map((folder) => (
          <option key={folder} value={folder}>
            {folder}
          </option>
        ))}
        <option value={NEW_FOLDER_OPTION}>+ Nieuwe map maken</option>
      </select>
      {value === NEW_FOLDER_OPTION && (
        <input
          value={newFolderName}
          onChange={(event) => onNewFolderNameChange(event.target.value)}
          placeholder="Naam van de nieuwe map"
          aria-label="Naam van de nieuwe map"
        />
      )}
    </>
  )
}

function PresetLibrary({
  presets,
  folders,
  onStart,
  onCreate,
  onCreateFolder,
  onDelete,
  onEdit,
  onRenamePreset,
  onRenameFolder,
  onMovePreset,
  onDeleteFolder,
}: {
  presets: WorkoutPreset[]
  folders: string[]
  onStart: (preset: WorkoutPreset) => void
  onCreate: () => void
  onCreateFolder: (name: string) => void
  onDelete: (presetId: number) => void
  onEdit: (preset: WorkoutPreset) => void
  onRenamePreset: (presetId: number, name: string) => void
  onRenameFolder: (folder: string, name: string) => void
  onMovePreset: (presetId: number, folder: string) => void
  onDeleteFolder: (folder: string) => void
}) {
  const [openFolder, setOpenFolder] = useState<string | null>(null)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [menuPosition, setMenuPosition] = useState({ top: 8, left: 8 })
  const menuAnchorRef = useRef<DOMRect | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null)
  const [folderNameDraft, setFolderNameDraft] = useState('')
  const [renamingPreset, setRenamingPreset] = useState<number | null>(null)
  const [presetNameDraft, setPresetNameDraft] = useState('')
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [newFolderDraft, setNewFolderDraft] = useState('')
  const [movingPreset, setMovingPreset] = useState<number | null>(null)
  const [moveFolder, setMoveFolder] = useState('')
  const [swipedPreset, setSwipedPreset] = useState<{
    id: number
    offset: number
  } | null>(null)
  const [presetTouchStart, setPresetTouchStart] = useState<{
    id: number
    x: number
  } | null>(null)
  const suppressPresetClick = useRef(false)
  const folderNames = [...new Set([
    ...folders,
    ...presets.map((preset) => preset.folder || ''),
  ])].sort((a, b) => a.localeCompare(b))

  function toggleActionMenu(
    event: MouseEvent<HTMLButtonElement>,
    menuId: string,
  ) {
    if (openMenu === menuId) {
      setOpenMenu(null)
      return
    }

    menuAnchorRef.current = event.currentTarget.getBoundingClientRect()
    setMenuPosition({ top: 8, left: 8 })
    setOpenMenu(menuId)
  }

  useLayoutEffect(() => {
    const bounds = menuAnchorRef.current
    const menu = menuRef.current
    if (!openMenu || !bounds || !menu) return

    const margin = 8
    const gap = 4
    const viewportWidth = document.documentElement.clientWidth
    const viewportHeight = document.documentElement.clientHeight
    const menuWidth = menu.getBoundingClientRect().width
    const menuHeight = menu.getBoundingClientRect().height
    const belowTop = bounds.bottom + gap
    const spaceBelow = viewportHeight - margin - belowTop
    const spaceAbove = bounds.top - gap - margin
    const top =
      menuHeight <= spaceBelow
        ? belowTop
        : menuHeight <= spaceAbove
          ? bounds.top - menuHeight - gap
          : Math.max(
              margin,
              Math.min(belowTop, viewportHeight - margin - menuHeight),
            )
    const left = Math.max(
      margin,
      Math.min(bounds.right - menuWidth, viewportWidth - menuWidth - margin),
    )

    setMenuPosition((current) =>
      current.top === top && current.left === left
        ? current
        : { top, left },
    )
  }, [openMenu])

  useEffect(() => {
    if (!openMenu) return
    const closeMenu = () => setOpenMenu(null)
    window.addEventListener('scroll', closeMenu, true)
    window.addEventListener('resize', closeMenu)
    window.visualViewport?.addEventListener('scroll', closeMenu)
    window.visualViewport?.addEventListener('resize', closeMenu)
    return () => {
      window.removeEventListener('scroll', closeMenu, true)
      window.removeEventListener('resize', closeMenu)
      window.visualViewport?.removeEventListener('scroll', closeMenu)
      window.visualViewport?.removeEventListener('resize', closeMenu)
    }
  }, [openMenu])

  return (
    <section className="preset-library">
      <div className="preset-library-heading">
        <div>
          <h3>Mijn presets</h3>
          <p>Start snel met een opgeslagen trainingsindeling.</p>
        </div>
        <div className="preset-library-actions">
          <button
            type="button"
            className="preset-create-button"
            onClick={onCreate}
          >
            + Nieuwe preset
          </button>
          <button
            type="button"
            className="preset-create-button"
            onClick={() => setCreatingFolder((current) => !current)}
          >
            + Nieuwe map
          </button>
        </div>
      </div>

      {creatingFolder && (
        <form
          className="preset-rename-form preset-new-folder-form"
          onSubmit={(event) => {
            event.preventDefault()
            onCreateFolder(newFolderDraft)
            setNewFolderDraft('')
            setCreatingFolder(false)
          }}
        >
          <input
            autoFocus
            required
            value={newFolderDraft}
            onChange={(event) => setNewFolderDraft(event.target.value)}
            placeholder="Naam van de nieuwe map"
            aria-label="Naam van de nieuwe map"
          />
          <button type="submit">Aanmaken</button>
          <button type="button" onClick={() => setCreatingFolder(false)}>
            Annuleren
          </button>
        </form>
      )}

      {folderNames.length === 0 ? (
        <p className="preset-empty">
          Nog geen presets. Maak er een zelf of sla er een op na je training.
        </p>
      ) : (
        folderNames.map((folder) => (
          <div className="preset-folder" key={folder || 'no-folder'}>
            <div className="preset-folder-heading">
              <button
                type="button"
                className="preset-folder-toggle"
                aria-expanded={openFolder === folder}
                onClick={() => {
                  setOpenMenu(null)
                  setOpenFolder((current) => current === folder ? null : folder)
                }}
              >
                <span className="preset-folder-icon" aria-hidden="true">▰</span>
                <span className="preset-folder-name">{folder || 'Zonder map'}</span>
                <span className="preset-folder-count">
                  {presets.filter((preset) => (preset.folder || '') === folder).length}
                </span>
                <span className="preset-folder-chevron" aria-hidden="true">
                  {openFolder === folder ? '⌄' : '›'}
                </span>
              </button>
              {folder && (
                <button
                  type="button"
                  className="preset-menu-trigger"
                  aria-label={`Opties voor map ${folder}`}
                  aria-expanded={openMenu === `folder:${folder}`}
                  onClick={(event) =>
                    toggleActionMenu(event, `folder:${folder}`)
                  }
                >
                  ⋮
                </button>
              )}
              {openMenu === `folder:${folder}` && (
                createPortal(
                  <div
                    ref={menuRef}
                    className="preset-action-menu"
                    style={{ top: menuPosition.top, left: menuPosition.left }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setRenamingFolder(folder)
                        setFolderNameDraft(folder)
                        setOpenMenu(null)
                      }}
                    >
                      Map hernoemen
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onDeleteFolder(folder)
                        setOpenMenu(null)
                        setOpenFolder(null)
                      }}
                    >
                      Map verwijderen
                    </button>
                  </div>,
                  document.body,
                )
              )}
            </div>
            {renamingFolder === folder && (
              <form
                className="preset-rename-form"
                onSubmit={(event) => {
                  event.preventDefault()
                  onRenameFolder(folder, folderNameDraft)
                  setRenamingFolder(null)
                }}
              >
                <input
                  autoFocus
                  required
                  value={folderNameDraft}
                  onChange={(event) => setFolderNameDraft(event.target.value)}
                  aria-label="Nieuwe mapnaam"
                />
                <button type="submit">Opslaan</button>
                <button type="button" onClick={() => setRenamingFolder(null)}>
                  Annuleren
                </button>
              </form>
            )}
            {openFolder === folder && (
              <div className="preset-folder-content">
                {presets
                  .filter((preset) => (preset.folder || '') === folder)
                  .map((preset) => (
                    <div className="preset-item" key={preset.id}>
                      {renamingPreset === preset.id ? (
                        <form
                          className="preset-rename-form"
                          onSubmit={(event) => {
                            event.preventDefault()
                            onRenamePreset(preset.id, presetNameDraft)
                            setRenamingPreset(null)
                          }}
                        >
                          <input
                            autoFocus
                            required
                            value={presetNameDraft}
                            onChange={(event) =>
                              setPresetNameDraft(event.target.value)
                            }
                            aria-label="Nieuwe presetnaam"
                          />
                          <button type="submit">Opslaan</button>
                          <button
                            type="button"
                            onClick={() => setRenamingPreset(null)}
                          >
                            Annuleren
                          </button>
                        </form>
                      ) : (
                        <>
                        <div className="preset-swipe-container">
                          <button
                            type="button"
                            className="preset-swipe-delete"
                            aria-label={`${preset.name} verwijderen`}
                            onClick={() => {
                              onDelete(preset.id)
                              setSwipedPreset(null)
                            }}
                          >
                            <span aria-hidden="true">🗑</span>
                          </button>
                      <button
                        type="button"
                        className="preset-start-button"
                        style={{
                          transform: `translateX(${
                            swipedPreset?.id === preset.id
                              ? swipedPreset.offset
                              : 0
                          }px)`,
                        }}
                        onTouchStart={(event) =>
                          setPresetTouchStart({
                            id: preset.id,
                            x: event.touches[0].clientX,
                          })
                        }
                        onTouchMove={(event) => {
                          if (presetTouchStart?.id !== preset.id) return
                          const delta =
                            event.touches[0].clientX - presetTouchStart.x
                          setSwipedPreset({
                            id: preset.id,
                            offset: Math.max(-130, Math.min(0, delta)),
                          })
                        }}
                        onTouchEnd={() => {
                          const didSwipe =
                            presetTouchStart?.id === preset.id &&
                            swipedPreset?.id === preset.id &&
                            swipedPreset.offset <= -60
                          suppressPresetClick.current =
                            presetTouchStart?.id === preset.id &&
                            swipedPreset?.id === preset.id &&
                            swipedPreset.offset < -12
                          setSwipedPreset(
                            didSwipe ? { id: preset.id, offset: -130 } : null,
                          )
                          setPresetTouchStart(null)
                          window.setTimeout(() => {
                            suppressPresetClick.current = false
                          }, 500)
                        }}
                        onClick={(event) => {
                          if (suppressPresetClick.current) {
                            event.preventDefault()
                            suppressPresetClick.current = false
                            return
                          }
                          onStart(preset)
                        }}
                      >
                        <strong>{preset.name}</strong>
                        <span>
                          {preset.exercises.length}{' '}
                          {preset.exercises.length === 1
                            ? 'oefening'
                            : 'oefeningen'}{' '}
                          · Start →
                        </span>
                      </button>
                        </div>
                        <div className="preset-item-menu-wrap">
                          <button
                            type="button"
                            className="preset-menu-trigger"
                            aria-label={`Opties voor preset ${preset.name}`}
                            aria-expanded={openMenu === `preset:${preset.id}`}
                            onClick={(event) =>
                              toggleActionMenu(event, `preset:${preset.id}`)
                            }
                          >
                            ⋮
                          </button>
                          {openMenu === `preset:${preset.id}` && (
                            createPortal(
                              <div
                                ref={menuRef}
                                className="preset-action-menu"
                                style={{
                                  top: menuPosition.top,
                                  left: menuPosition.left,
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    onEdit(preset)
                                    setOpenMenu(null)
                                  }}
                                >
                                  Preset bewerken
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRenamingPreset(preset.id)
                                    setPresetNameDraft(preset.name)
                                    setOpenMenu(null)
                                  }}
                                >
                                  Preset hernoemen
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setMovingPreset(preset.id)
                                    setMoveFolder(preset.folder)
                                    setOpenMenu(null)
                                  }}
                                >
                                  Verplaatsen naar map
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    onDelete(preset.id)
                                    setOpenMenu(null)
                                  }}
                                >
                                  Preset verwijderen
                                </button>
                              </div>,
                              document.body,
                            )
                          )}
                        </div>
                        {movingPreset === preset.id && (
                          <form
                            className="preset-move-form"
                            onSubmit={(event) => {
                              event.preventDefault()
                              onMovePreset(preset.id, moveFolder)
                              setMovingPreset(null)
                            }}
                          >
                            <label>
                              Verplaatsen naar
                              <select
                                value={moveFolder}
                                onChange={(event) =>
                                  setMoveFolder(event.target.value)
                                }
                              >
                                <option value="">Zonder map</option>
                                {folderNames
                                  .filter((name) => name !== '')
                                  .map((name) => (
                                    <option key={name} value={name}>
                                      {name}
                                    </option>
                                  ))}
                              </select>
                            </label>
                            <button type="submit">Verplaatsen</button>
                            <button
                              type="button"
                              onClick={() => setMovingPreset(null)}
                            >
                              Annuleren
                            </button>
                          </form>
                        )}
                        </>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </div>
        ))
      )}
    </section>
  )
}

function App() {
  const [workouts, setWorkouts] = useState<Workout[]>(() => {
    try {
      return JSON.parse(
        localStorage.getItem('fitnessai-workouts') || '[]',
      ) as Workout[]
    } catch {
      return []
    }
  })

  const [presets, setPresets] = useState<WorkoutPreset[]>(() => {
    try {
      return JSON.parse(
        localStorage.getItem('strongjan-presets') || '[]',
      ) as WorkoutPreset[]
    } catch {
      return []
    }
  })
  const [customExercises, setCustomExercises] = useState<ExerciseOption[]>(() => {
    try {
      const exercises = JSON.parse(
        localStorage.getItem('strongjan-custom-exercises') || '[]',
      ) as ExerciseOption[]
      return exercises.map(normalizeExerciseOption)
    } catch {
      return []
    }
  })
  const [presetFolders, setPresetFolders] = useState<string[]>(() => {
    try {
      const savedFolders = JSON.parse(
        localStorage.getItem('strongjan-preset-folders') || '[]',
      ) as string[]
      return [...new Set([
        ...savedFolders,
        ...presets.map((preset) => preset.folder.trim()).filter(Boolean),
      ])]
    } catch {
      return [...new Set(
        presets.map((preset) => preset.folder.trim()).filter(Boolean),
      )]
    }
  })
  const [savedWorkoutSession] = useState(loadPersistedWorkoutSession)
  const [activeWorkout, setActiveWorkout] = useState<Workout | null>(
    savedWorkoutSession?.activeWorkout ?? null,
  )
  const [workoutStartedAt, setWorkoutStartedAt] = useState<number | null>(
    savedWorkoutSession?.workoutStartedAt ?? null,
  )
  const [workoutElapsedSeconds, setWorkoutElapsedSeconds] = useState(() =>
    savedWorkoutSession?.workoutStartedAt && !savedWorkoutSession.isBuildingPreset
      ? Math.max(
          0,
          Math.floor((Date.now() - savedWorkoutSession.workoutStartedAt) / 1000),
        )
      : 0,
  )
  const [showWorkoutSummary, setShowWorkoutSummary] = useState(false)
  const [isBuildingPreset, setIsBuildingPreset] = useState(
    savedWorkoutSession?.isBuildingPreset ?? false,
  )
  const [editingPresetId, setEditingPresetId] = useState<number | null>(
    savedWorkoutSession?.editingPresetId ?? null,
  )
  const [editingWorkoutId, setEditingWorkoutId] = useState<number | null>(
    savedWorkoutSession?.editingWorkoutId ?? null,
  )
  const [presetName, setPresetName] = useState(
    savedWorkoutSession?.presetName ?? '',
  )
  const [presetFolder, setPresetFolder] = useState(
    savedWorkoutSession?.presetFolder ?? '',
  )
  const [presetNewFolder, setPresetNewFolder] = useState(
    savedWorkoutSession?.presetNewFolder ?? '',
  )
  const [saveAsPreset, setSaveAsPreset] = useState(false)
  const [summaryPresetName, setSummaryPresetName] = useState('')
  const [summaryPresetFolder, setSummaryPresetFolder] = useState('')
  const [summaryPresetNewFolder, setSummaryPresetNewFolder] = useState('')
  const [exerciseName, setExerciseName] = useState('Bench press')
  const [message, setMessage] = useState('')
  const [view, setView] = useState<View>(() =>
    activeWorkout ? 'training' : 'home',
  )
  const [selfSection, setSelfSection] = useState<
    'overview' | 'exercise' | 'measurements' | 'settings'
  >('overview')
  const [selectedExercise, setSelectedExercise] = useState('')
  const [selectedRecordExercises, setSelectedRecordExercises] = useState(
    loadSelectedRecordExercises,
  )
  const [progressExerciseSearch, setProgressExerciseSearch] = useState('')
  const [progressMuscleGroup, setProgressMuscleGroup] = useState('Alle')
  const [showProgressExercisePicker, setShowProgressExercisePicker] =
    useState(false)
  const [showExerciseProgress, setShowExerciseProgress] = useState(true)
  const [selectedMetric, setSelectedMetric] = useState<Metric>('weight')
  const [bodyMeasurements, setBodyMeasurements] = useState<BodyMeasurement[]>(
    () => {
      try {
        return JSON.parse(
          localStorage.getItem('strongjan-body-measurements') || '[]',
        ) as BodyMeasurement[]
      } catch {
        return []
      }
    },
  )
  const [selectedBodyMetric, setSelectedBodyMetric] = useState('weight')
  const [bodyMeasurementDate, setBodyMeasurementDate] = useState(() =>
    dateKey(new Date()),
  )
  const [bodyMeasurementValue, setBodyMeasurementValue] = useState('')
  const [cloudUser, setCloudUser] = useState<User | null>(null)
  const [cloudSyncStatus, setCloudSyncStatus] = useState<CloudSyncStatus>(
    supabaseConfigured ? 'loading' : 'unavailable',
  )
  const [cloudSyncError, setCloudSyncError] = useState('')
  const [recoveryNow, setRecoveryNow] = useState(() => Date.now())
  const [trainingLoadPeriod, setTrainingLoadPeriod] =
    useState<TrainingLoadPeriod>('month')
  const currentAuthUserId = useRef<string | null>(null)
  const hydratedCloudUserId = useRef<string | null>(null)
  const lastSyncedCloudSignature = useRef('')
  const cloudSaveQueue = useRef<Promise<void>>(Promise.resolve())
  const cloudFitnessData = useMemo<CloudFitnessData>(
    () => ({
      workouts,
      presets,
      customExercises,
      presetFolders,
      bodyMeasurements,
    }),
    [workouts, presets, customExercises, presetFolders, bodyMeasurements],
  )
  const currentCloudFitnessData = useRef(cloudFitnessData)
  const [openRestMenuExerciseId, setOpenRestMenuExerciseId] =
  useState<number | null>(null)
  const restDuration = 120
  const [showExerciseLibrary, setShowExerciseLibrary] = useState(false)
const [manageExerciseLibrary, setManageExerciseLibrary] = useState(false)
const [timerRemaining, setTimerRemaining] = useState(120)
const [timerRunning, setTimerRunning] = useState(false)
const [restAfterSet, setRestAfterSet] = useState<{
  exerciseId: number
  setIndex: number
} | null>(null)
const [swipedSet, setSwipedSet] = useState<{
  key: string
  offset: number
} | null>(null)

const [touchStart, setTouchStart] = useState<{
  key: string
  x: number
} | null>(null)
const [themeColor, setThemeColor] = useState(() => {
  return localStorage.getItem('strongjan-theme') || 'green'
})

  const [expandedWorkout, setExpandedWorkout] = useState<number | null>(null)
const allExerciseOptions = useMemo(
  () => [...exerciseLibrary, ...customExercises.map(normalizeExerciseOption)],
  [customExercises],
)
const muscleRecovery = useMemo(
  () => getMuscleRecovery(workouts, allExerciseOptions, recoveryNow),
  [workouts, allExerciseOptions, recoveryNow],
)
const muscleTrainingLoad = useMemo(
  () =>
    getMuscleTrainingLoad(
      workouts,
      allExerciseOptions,
      trainingLoadPeriod,
      recoveryNow,
    ),
  [workouts, allExerciseOptions, trainingLoadPeriod, recoveryNow],
)
const maxMuscleTrainingLoad = Math.max(
  1,
  ...muscleTrainingLoad.map(({ effectiveSets }) => effectiveSets),
)
const averageMuscleRecovery = muscleRecovery.length
  ? Math.round(
      muscleRecovery.reduce((total, muscle) => total + muscle.percentage, 0) /
        muscleRecovery.length,
    )
  : 100
  useEffect(() => {
    localStorage.setItem('fitnessai-workouts', JSON.stringify(workouts))
  }, [workouts])

  useEffect(() => {
    localStorage.setItem(
      'strongjan-record-exercises',
      JSON.stringify(selectedRecordExercises),
    )
  }, [selectedRecordExercises])

  useEffect(() => {
    if (!activeWorkout) {
      localStorage.removeItem(ACTIVE_WORKOUT_STORAGE_KEY)
      return
    }

    localStorage.setItem(
      ACTIVE_WORKOUT_STORAGE_KEY,
      JSON.stringify({
        activeWorkout,
        workoutStartedAt,
        isBuildingPreset,
        editingPresetId,
        editingWorkoutId,
        presetName,
        presetFolder,
        presetNewFolder,
      } satisfies PersistedWorkoutSession),
    )
  }, [
    activeWorkout,
    workoutStartedAt,
    isBuildingPreset,
    editingPresetId,
    editingWorkoutId,
    presetName,
    presetFolder,
    presetNewFolder,
  ])

  useEffect(() => {
    localStorage.setItem(
      'strongjan-custom-exercises',
      JSON.stringify(customExercises),
    )
  }, [customExercises])

  useEffect(() => {
    localStorage.setItem('strongjan-presets', JSON.stringify(presets))
  }, [presets])

  useEffect(() => {
    localStorage.setItem(
      'strongjan-body-measurements',
      JSON.stringify(bodyMeasurements),
    )
  }, [bodyMeasurements])

  useEffect(() => {
    localStorage.setItem(
      'strongjan-preset-folders',
      JSON.stringify(presetFolders),
    )
  }, [presetFolders])

  useEffect(() => {
    const intervalId = window.setInterval(() => setRecoveryNow(Date.now()), 60_000)
    return () => window.clearInterval(intervalId)
  }, [])

  useEffect(() => {
    currentCloudFitnessData.current = cloudFitnessData
  }, [cloudFitnessData])

  useEffect(() => {
    if (!supabase) return

    let receivedAuthEvent = false
    const applySession = (user: User | null) => {
      const userId = user?.id ?? null
      if (currentAuthUserId.current !== userId) {
        currentAuthUserId.current = userId
        hydratedCloudUserId.current = null
        lastSyncedCloudSignature.current = ''
        setCloudSyncError('')
        setCloudSyncStatus(userId ? 'loading' : 'signed-out')
      }
      setCloudUser(user)
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      receivedAuthEvent = true
      applySession(session?.user ?? null)
    })

    void supabase.auth.getSession().then(({ data, error }) => {
      if (receivedAuthEvent) return
      if (error) {
        setCloudSyncError(error.message)
        setCloudSyncStatus('error')
        return
      }
      applySession(data.session?.user ?? null)
    }).catch((error: unknown) => {
      setCloudSyncError(
        error instanceof Error ? error.message : 'Sessie kon niet worden geladen.',
      )
      setCloudSyncStatus('error')
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!cloudUser) return
    const client = supabase
    if (!client) return

    let active = true
    const userId = cloudUser.id
    const channel = client
      .channel(`user-data-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_data',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (!active || currentAuthUserId.current !== userId) return
          const newRow = isRecord(payload.new) ? payload.new : null
          const data = newRow?.data
          if (!isCloudFitnessData(data)) return

          const signature = getCloudDataSignature(data)
          if (signature === lastSyncedCloudSignature.current) return
          if (
            lastSyncedCloudSignature.current &&
            getCloudDataSignature(currentCloudFitnessData.current) !==
              lastSyncedCloudSignature.current
          ) {
            return
          }

          lastSyncedCloudSignature.current = signature
          setWorkouts(data.workouts)
          setPresets(data.presets)
          setCustomExercises(data.customExercises.map(normalizeExerciseOption))
          setPresetFolders(data.presetFolders)
          setBodyMeasurements(data.bodyMeasurements)
          setCloudSyncError('')
          setCloudSyncStatus('synced')
        },
      )
      .subscribe((status, error) => {
        if (!active || currentAuthUserId.current !== userId) return
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setCloudSyncError(
            error?.message ?? 'Realtimeverbinding met Supabase mislukt.',
          )
          setCloudSyncStatus('error')
        }
      })

    async function loadCloudData(client: NonNullable<typeof supabase>) {
      const { data, error } = await client
        .from('user_data')
        .select('data')
        .eq('user_id', userId)
        .maybeSingle()

      if (!active || currentAuthUserId.current !== userId) return
      if (error) {
        setCloudSyncError(error.message)
        setCloudSyncStatus('error')
        return
      }

      if (data && !isCloudFitnessData(data.data)) {
        setCloudSyncError('De opgeslagen accountgegevens hebben een ongeldig formaat.')
        setCloudSyncStatus('error')
        return
      }

      const fitnessData = data?.data ?? currentCloudFitnessData.current
      const signature = getCloudDataSignature(fitnessData)
      if (data) {
        setWorkouts(fitnessData.workouts)
        setPresets(fitnessData.presets)
        setCustomExercises(
          fitnessData.customExercises.map(normalizeExerciseOption),
        )
        setPresetFolders(fitnessData.presetFolders)
        setBodyMeasurements(fitnessData.bodyMeasurements)
      } else {
        const { error: saveError } = await client.from('user_data').upsert({
          user_id: userId,
          data: fitnessData,
          updated_at: new Date().toISOString(),
        })
        if (!active || currentAuthUserId.current !== userId) return
        if (saveError) {
          setCloudSyncError(saveError.message)
          setCloudSyncStatus('error')
          return
        }
      }

      lastSyncedCloudSignature.current = signature
      hydratedCloudUserId.current = userId
      setCloudSyncError('')
      setCloudSyncStatus('synced')
    }

    void loadCloudData(client).catch((error: unknown) => {
      if (!active || currentAuthUserId.current !== userId) return
      setCloudSyncError(
        error instanceof Error ? error.message : 'Gegevens konden niet worden geladen.',
      )
      setCloudSyncStatus('error')
    })

    return () => {
      active = false
      void client.removeChannel(channel)
    }
  }, [cloudUser])

  useEffect(() => {
    const client = supabase
    if (!client) return
    const userId = cloudUser?.id
    if (
      !userId ||
      hydratedCloudUserId.current !== userId
    ) {
      return
    }

    const signature = getCloudDataSignature(cloudFitnessData)
    if (signature === lastSyncedCloudSignature.current) return

    const timeoutId = window.setTimeout(() => {
      cloudSaveQueue.current = cloudSaveQueue.current
        .then(async () => {
          if (
            currentAuthUserId.current !== userId ||
            hydratedCloudUserId.current !== userId
          ) {
            return
          }

          const latestData = currentCloudFitnessData.current
          const latestSignature = getCloudDataSignature(latestData)
          if (latestSignature === lastSyncedCloudSignature.current) return

          setCloudSyncStatus('syncing')
          const { error } = await client.from('user_data').upsert({
            user_id: userId,
            data: latestData,
            updated_at: new Date().toISOString(),
          })

          if (currentAuthUserId.current !== userId) return
          if (error) {
            setCloudSyncError(error.message)
            setCloudSyncStatus('error')
            return
          }

          lastSyncedCloudSignature.current = latestSignature
          setCloudSyncError('')
          setCloudSyncStatus('synced')
        })
        .catch((error: unknown) => {
          if (currentAuthUserId.current !== userId) return
          setCloudSyncError(
            error instanceof Error ? error.message : 'Gegevens konden niet worden opgeslagen.',
          )
          setCloudSyncStatus('error')
        })
    }, 700)

    return () => window.clearTimeout(timeoutId)
  }, [cloudUser, cloudFitnessData])

useEffect(() => {
  if (!timerRunning) return

  if (timerRemaining <= 0) {
    setTimerRunning(false)
    return
  }

  const intervalId = window.setInterval(() => {
    setTimerRemaining((remaining) => Math.max(0, remaining - 1))
  }, 1000)

  return () => window.clearInterval(intervalId)
}, [timerRunning, timerRemaining])

useEffect(() => {
  if (activeWorkout === null || isBuildingPreset || workoutStartedAt === null) {
    return
  }

  const intervalId = window.setInterval(() => {
    setWorkoutElapsedSeconds(
      Math.floor((Date.now() - workoutStartedAt) / 1000),
    )
  }, 1000)

  return () => window.clearInterval(intervalId)
}, [activeWorkout, isBuildingPreset, workoutStartedAt])

useEffect(() => {
  localStorage.setItem('strongjan-theme', themeColor)
  document.documentElement.dataset.theme = themeColor
}, [themeColor])

  const exerciseNames = useMemo(() => {
    const names = workouts.flatMap((workout) =>
      workout.exercises.map((exercise) => exercise.name),
    )
    return [...new Set([...starterExercises, ...names])].sort()
  }, [workouts])

  const progressExerciseOptions = useMemo(() => {
    const trainedNames = new Set(
      workouts.flatMap((workout) =>
        workout.exercises.map((exercise) => exercise.name),
      ),
    )
    const categories = new Map(
      allExerciseOptions.map((exercise) => [
        exercise.name.toLocaleLowerCase(),
        exercise.muscleGroup,
      ]),
    )
    const starterCategories = new Map<string, string>([
      ['bench press', 'Borst'],
      ['squat', 'Quadriceps'],
      ['deadlift', 'Rug'],
      ['overhead press', 'Schouders'],
      ['lat pulldown', 'Rug'],
      ['seated row', 'Rug'],
      ['bicep curl', 'Biceps'],
      ['tricep pushdown', 'Triceps'],
      ['log press', 'Schouders'],
    ])

    return exerciseNames
      .filter((name) => trainedNames.has(name))
      .map((name) => ({
        name,
        muscleGroup:
          categories.get(name.toLocaleLowerCase()) ??
          starterCategories.get(name.toLocaleLowerCase()) ??
          '',
      }))
      .filter((exercise) => exercise.muscleGroup)
  }, [allExerciseOptions, exerciseNames, workouts])

  const progressMuscleGroups = [
    'Alle',
    ...new Set(progressExerciseOptions.map((exercise) => exercise.muscleGroup)),
  ]

  const filteredProgressExercises = progressExerciseOptions
    .filter((exercise) =>
      exercise.name
        .toLowerCase()
        .includes(progressExerciseSearch.toLowerCase()),
    )
    .filter(
      (exercise) =>
        progressMuscleGroup === 'Alle' ||
        exercise.muscleGroup === progressMuscleGroup,
    )

  const selectedExerciseHistory = useMemo(() => {
    return workouts
      .flatMap((workout) => {
        const exercises = workout.exercises.filter(
          (item) => item.name === selectedExercise,
        )
        if (exercises.length === 0) return []

        const validSets = exercises.flatMap(getValidSets)
        if (validSets.length === 0) return []

        const bestSet = validSets.reduce((best, set) =>
          getEstimatedOneRepMax(set.weight, set.reps) >
          getEstimatedOneRepMax(best.weight, best.reps)
            ? set
            : best,
        )

        return [{
          id: workout.id,
          date: formatWorkoutDate(workout.date),
          bestWeight: Math.max(...validSets.map((set) => set.weight)),
          bestSet,
          estimatedOneRepMax: getEstimatedOneRepMax(
            bestSet.weight,
            bestSet.reps,
          ),
          volume: validSets.reduce(
            (total, set) => total + set.weight * set.reps,
            0,
          ),
        }]
      })
      .reverse()
  }, [workouts, selectedExercise])

  const personalRecord = selectedExerciseHistory.reduce(
    (best, entry) => Math.max(best, entry.bestWeight),
    0,
  )

  const bestEstimatedOneRepMax = selectedExerciseHistory.reduce(
    (best, entry) => Math.max(best, entry.estimatedOneRepMax),
    0,
  )

  const activeBodyMetric =
    bodyMetrics.find((metric) => metric.id === selectedBodyMetric) ??
    bodyMetrics[0]
  const selectedBodyMetricHistory = bodyMeasurements
    .filter((measurement) => measurement.metricId === activeBodyMetric.id)
    .sort((left, right) => left.date.localeCompare(right.date))

  function saveBodyMeasurement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = Number(bodyMeasurementValue.replace(',', '.'))
    if (!Number.isFinite(value) || value <= 0 || !bodyMeasurementDate) return

    setBodyMeasurements((measurements) => [
      ...measurements,
      {
        id: Date.now(),
        metricId: activeBodyMetric.id,
        date: bodyMeasurementDate,
        value,
      },
    ])
    setBodyMeasurementValue('')
  }

  
const personalRecordsByWorkout = useMemo(() => {
  return workouts.map((workout, index) => {
    const olderWorkouts = workouts.slice(index + 1)

    const exerciseRecords = workout.exercises.map((exercise) => {
      const olderSets = olderWorkouts.flatMap((olderWorkout) =>
        olderWorkout.exercises
          .filter((item) => item.name === exercise.name)
          .flatMap(getValidSets),
      )

      const currentSets = getValidSets(exercise)
      const labels: string[] = []

      // Een eerste training legt een uitgangspunt vast.
      // Een PR wordt pas gemeld zodra er eerdere resultaten zijn.
      if (olderSets.length > 0 && currentSets.length > 0) {
        const previousBestWeight = Math.max(
          ...olderSets.map((set) => set.weight),
        )

        const previousBestOneRepMax = Math.max(
          ...olderSets.map((set) =>
            getEstimatedOneRepMax(set.weight, set.reps),
          ),
        )

        const weightRecord = currentSets.some(
          (set) => set.weight > previousBestWeight,
        )

        const repsRecord = currentSets.some((set) => {
          const previousRepsAtSameWeight = olderSets
            .filter((oldSet) => oldSet.weight === set.weight)
            .map((oldSet) => oldSet.reps)

          return (
            previousRepsAtSameWeight.length > 0 &&
            set.reps > Math.max(...previousRepsAtSameWeight)
          )
        })

        const oneRepMaxRecord = currentSets.some(
          (set) =>
            getEstimatedOneRepMax(set.weight, set.reps) >
            previousBestOneRepMax,
        )

        if (weightRecord) labels.push('Gewicht-PR')
        if (repsRecord) labels.push('Herhalingen-PR')
        if (oneRepMaxRecord) labels.push('1RM-PR')
      }

      return {
        exerciseId: exercise.id,
        labels,
      }
    })

    return {
      workoutId: workout.id,
      records: exerciseRecords.flatMap((exercise) => exercise.labels),
      exerciseRecords,
    }
  })
}, [workouts])


  function startWorkout() {
    const startedAt = Date.now()
    setActiveWorkout({
      id: startedAt,
      date: new Date().toLocaleDateString('nl-NL'),
      time: formatWorkoutTime(new Date(startedAt)),
      exercises: [],
    })
    setWorkoutStartedAt(startedAt)
    setWorkoutElapsedSeconds(0)
    setIsBuildingPreset(false)
    setEditingPresetId(null)
    setEditingWorkoutId(null)
    setMessage('')
    setView('training')
  }

  function startPresetBuilder() {
    setWorkoutStartedAt(null)
    setWorkoutElapsedSeconds(0)
    setActiveWorkout({
      id: Date.now(),
      date: new Date().toLocaleDateString('nl-NL'),
      exercises: [],
    })
    setIsBuildingPreset(true)
    setEditingPresetId(null)
    setEditingWorkoutId(null)
    setShowExerciseLibrary(false)
    setPresetName('')
    setPresetFolder('')
    setPresetNewFolder('')
    setMessage('')
    setView('training')
  }

  function startPreset(preset: WorkoutPreset) {
    if (activeWorkout) {
      setMessage('Rond eerst je huidige training af of annuleer deze.')
      setView('training')
      return
    }

    const startedAt = Date.now()
    setActiveWorkout({
      id: startedAt,
      date: new Date().toLocaleDateString('nl-NL'),
      time: formatWorkoutTime(new Date(startedAt)),
      exercises: preset.exercises.map((exercise) => ({
        ...exercise,
        id: Date.now() + Math.random(),
        sets: exercise.sets.map((set) => ({
          reps: set.reps,
          weight: set.weight,
          completed: false,
        })),
      })),
    })
    setWorkoutStartedAt(startedAt)
    setWorkoutElapsedSeconds(0)
    setIsBuildingPreset(false)
    setEditingWorkoutId(null)
    setShowExerciseLibrary(false)
    setRestAfterSet(null)
    setTimerRunning(false)
    setMessage('')
    setView('training')
  }

  function editWorkout(workout: Workout) {
    if (activeWorkout) {
      setMessage('Sla je huidige training op of annuleer deze voordat je een andere bewerkt.')
      setView('training')
      return
    }

    setActiveWorkout({
      ...workout,
      time: getWorkoutTime(workout),
      exercises: workout.exercises.map((exercise) => ({
        ...exercise,
        sets: exercise.sets.map((set) => ({ ...set })),
      })),
    })
    setWorkoutStartedAt(null)
    setWorkoutElapsedSeconds(0)
    setIsBuildingPreset(false)
    setEditingPresetId(null)
    setEditingWorkoutId(workout.id)
    setShowExerciseLibrary(false)
    setShowWorkoutSummary(false)
    setRestAfterSet(null)
    setTimerRunning(false)
    setMessage('')
    setView('training')
  }

  function storePreset(workout: Workout, name: string, folder: string) {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setMessage('Geef je preset een naam.')
      return false
    }
    if (workout.exercises.length === 0) {
      setMessage('Voeg eerst een oefening toe aan je preset.')
      return false
    }
    if (folder.trim()) {
      setPresetFolders((previous) =>
        previous.includes(folder.trim())
          ? previous
          : [...previous, folder.trim()].sort((a, b) => a.localeCompare(b)),
      )
    }

    setPresets((previous) => [
      ...previous,
      {
        id: Date.now(),
        name: trimmedName,
        folder: folder.trim(),
        exercises: workout.exercises.map((exercise) => ({
          ...exercise,
          sets: exercise.sets.map((set) => ({
            reps: set.reps,
            weight: set.weight,
            completed: false,
          })),
        })),
      },
    ])
    return true
  }

  function savePresetBuilder() {
    if (!activeWorkout) return
    const folder =
      presetFolder === NEW_FOLDER_OPTION
        ? presetNewFolder.trim()
        : presetFolder
    if (presetFolder === NEW_FOLDER_OPTION && !folder) {
      setMessage('Geef je nieuwe map een naam.')
      return
    }
    if (editingPresetId !== null) {
      const name = presetName.trim()
      if (!name) {
        setMessage('Geef je preset een naam.')
        return
      }
      if (activeWorkout.exercises.length === 0) {
        setMessage('Voeg eerst een oefening toe aan je preset.')
        return
      }
      setPresets((previous) =>
        previous.map((preset) =>
          preset.id === editingPresetId
            ? {
                ...preset,
                name,
                folder: folder.trim(),
                exercises: activeWorkout.exercises.map((exercise) => ({
                  ...exercise,
                  sets: exercise.sets.map((set) => ({
                    reps: set.reps,
                    weight: set.weight,
                    completed: false,
                  })),
                })),
              }
            : preset,
        ),
      )
      if (folder.trim()) {
        setPresetFolders((previous) =>
          previous.includes(folder.trim())
            ? previous
            : [...previous, folder.trim()].sort((a, b) => a.localeCompare(b)),
        )
      }
      setActiveWorkout(null)
      setWorkoutStartedAt(null)
      setWorkoutElapsedSeconds(0)
      setIsBuildingPreset(false)
      setEditingPresetId(null)
      setEditingWorkoutId(null)
      setMessage('Preset bijgewerkt.')
      return
    }
    if (!storePreset(activeWorkout, presetName, folder)) return

    setActiveWorkout(null)
    setWorkoutStartedAt(null)
    setWorkoutElapsedSeconds(0)
    setIsBuildingPreset(false)
    setEditingPresetId(null)
    setEditingWorkoutId(null)
    setMessage('Preset opgeslagen.')
  }

  function editPreset(preset: WorkoutPreset) {
    const now = Date.now()
    setActiveWorkout({
      id: now,
      date: new Date().toLocaleDateString('nl-NL'),
      exercises: preset.exercises.map((exercise, index) => ({
        ...exercise,
        id: now + index + 1,
        sets: exercise.sets.map((set) => ({
          reps: set.reps,
          weight: set.weight,
          completed: false,
        })),
      })),
    })
    setWorkoutStartedAt(null)
    setWorkoutElapsedSeconds(0)
    setIsBuildingPreset(true)
    setEditingPresetId(preset.id)
    setEditingWorkoutId(null)
    setPresetName(preset.name)
    setPresetFolder(preset.folder)
    setPresetNewFolder('')
    setShowExerciseLibrary(false)
    setMessage('')
    setView('training')
  }

  function renamePreset(presetId: number, name: string) {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setMessage('Geef je preset een naam.')
      return
    }
    setPresets((previous) =>
      previous.map((preset) =>
        preset.id === presetId ? { ...preset, name: trimmedName } : preset,
      ),
    )
  }

  function renamePresetFolder(folder: string, name: string) {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setMessage('Geef de map een naam.')
      return
    }
    setPresets((previous) =>
      previous.map((preset) =>
        (preset.folder || '') === folder
          ? { ...preset, folder: trimmedName }
          : preset,
      ),
    )
    setPresetFolders((previous) =>
      [...new Set(previous.map((item) => item === folder ? trimmedName : item))]
        .sort((a, b) => a.localeCompare(b)),
    )
  }

  function deletePresetFolder(folder: string) {
    setPresets((previous) =>
      previous.filter((preset) => (preset.folder || '') !== folder),
    )
    setPresetFolders((previous) => previous.filter((item) => item !== folder))
  }

  function createPresetFolder(name: string) {
    const trimmedName = name.trim()
    if (!trimmedName) return
    setPresetFolders((previous) =>
      previous.includes(trimmedName)
        ? previous
        : [...previous, trimmedName].sort((a, b) => a.localeCompare(b)),
    )
  }

  function movePreset(presetId: number, folder: string) {
    setPresets((previous) =>
      previous.map((preset) =>
        preset.id === presetId ? { ...preset, folder } : preset,
      ),
    )
  }

  function deletePreset(presetId: number) {
    setPresets((previous) =>
      previous.filter((preset) => preset.id !== presetId),
    )
  }

  function addCustomExercise(
    name: string,
    muscleGroup: string,
    secondaryMuscleGroups: string[],
  ) {
    setCustomExercises((previous) => [
      ...previous,
      { name, muscleGroup, secondaryMuscleGroups, custom: true },
    ])
  }

  

function addExercise(selectedName?: string) {
  if (!activeWorkout) return

  const name = (selectedName ?? exerciseName).trim()
  if (!name) return

  const previousWorkout = workouts.find((workout) =>
    workout.exercises.some(
      (exercise) => exercise.name === name,
    ),
  )

  const previousExercise = previousWorkout?.exercises.find(
    (exercise) => exercise.name === name,
  )

  const previousSet =
    previousExercise?.sets[0] ??
    previousExercise?.sets[previousExercise.sets.length - 1]

  const firstSet = previousSet
    ? {
        reps: previousSet.reps,
        weight: previousSet.weight,
      }
    : {
        reps: '8',
        weight: '0',
      }

  setActiveWorkout({
    ...activeWorkout,
    exercises: [
      ...activeWorkout.exercises,
      {
        id: Date.now(),
        name,
        sets: [firstSet],
      },
    ],
  })

  setExerciseName('')
  setShowExerciseLibrary(false)
}



  
function addSet(exerciseId: number) {
  if (!activeWorkout) return

  const currentExercise = activeWorkout.exercises.find(
    (exercise) => exercise.id === exerciseId,
  )

  if (!currentExercise) return

  const previousWorkout = workouts.find((workout) =>
    workout.exercises.some(
      (exercise) => exercise.name === currentExercise.name,
    ),
  )

  const previousExercise = previousWorkout?.exercises.find(
    (exercise) => exercise.name === currentExercise.name,
  )

  const setIndex = currentExercise.sets.length

  const previousSet =
    previousExercise?.sets[setIndex] ??
    previousExercise?.sets[previousExercise.sets.length - 1]

  const newSet = previousSet
    ? {
        reps: previousSet.reps,
        weight: previousSet.weight,
      }
    : {
        reps: '8',
        weight: '0',
      }

  setActiveWorkout({
    ...activeWorkout,
    exercises: activeWorkout.exercises.map((exercise) =>
      exercise.id === exerciseId
        ? {
            ...exercise,
            sets: [...exercise.sets, newSet],
          }
        : exercise,
    ),
  })
}


  function updateSet(
    exerciseId: number,
    setIndex: number,
    field: keyof SetEntry,
    value: string,
  ) {
    if (!activeWorkout) return

    setActiveWorkout({
      ...activeWorkout,
      exercises: activeWorkout.exercises.map((exercise) =>
        exercise.id === exerciseId
          ? {
              ...exercise,
              sets: exercise.sets.map((set, index) =>
                index === setIndex ? { ...set, [field]: value } : set,
              ),
            }
          : exercise,
      ),
    })
  }
  function updateExerciseRestDuration(
  exerciseId: number,
  duration: number,
) {
  if (!activeWorkout) return

  const safeDuration = Math.max(0, Math.min(5999, duration))

  setActiveWorkout({
    ...activeWorkout,
    exercises: activeWorkout.exercises.map((exercise) =>
      exercise.id === exerciseId
        ? { ...exercise, restDuration: safeDuration }
        : exercise,
    ),
  })
}
function toggleSetCompleted(
  exerciseId: number,
  setIndex: number,
  completed: boolean,
) {
  if (!activeWorkout) return

  setActiveWorkout({
    ...activeWorkout,
    exercises: activeWorkout.exercises.map((exercise) =>
      exercise.id === exerciseId
        ? {
            ...exercise,
            sets: exercise.sets.map((set, index) =>
              index === setIndex ? { ...set, completed } : set,
            ),
          }
        : exercise,
    ),
  })

  if (completed) {
  const exercise = activeWorkout.exercises.find(
    (item) => item.id === exerciseId,
  )

  const duration = exercise?.restDuration ?? restDuration

  setRestAfterSet({ exerciseId, setIndex })
  setTimerRemaining(duration)
  setTimerRunning(duration > 0)
} else {
    setRestAfterSet((current) =>
      current?.exerciseId === exerciseId &&
      current?.setIndex === setIndex
        ? null
        : current,
    )

    setTimerRunning(false)
    setTimerRemaining(restDuration)
  }
}
  function finishWorkout() {
  if (!activeWorkout) return

    const completedWorkout = {
      ...activeWorkout,
      endTime:
        activeWorkout.endTime ||
        (editingWorkoutId === null ? formatWorkoutTime(new Date()) : ''),
  }

    if (!parseWorkoutDate(completedWorkout.date)) {
      setMessage('Kies een geldige trainingsdatum.')
      return
    }

    const workoutTime = getWorkoutTime(completedWorkout)
    if (!isValidWorkoutTime(workoutTime)) {
      setMessage('Vul een geldige starttijd in 24-uursnotatie in, bijvoorbeeld 18:30.')
    return
  }

    if (
      completedWorkout.endTime &&
      !isValidWorkoutTime(completedWorkout.endTime)
    ) {
      setMessage('Vul een geldige eindtijd in 24-uursnotatie in, bijvoorbeeld 19:45.')
      return
    }

    if (completedWorkout.exercises.length === 0) {
      setMessage('Voeg eerst een oefening toe.')
      return
    }

    setMessage('')
    setActiveWorkout(completedWorkout)
  setSaveAsPreset(false)
  setSummaryPresetName(`Training ${formatWorkoutDate(activeWorkout.date)}`)
  setSummaryPresetFolder('')
  setSummaryPresetNewFolder('')
  setShowWorkoutSummary(true)
}
function saveWorkoutOnly() {
  if (!activeWorkout) return

  if (
    saveAsPreset &&
    summaryPresetFolder === NEW_FOLDER_OPTION &&
    !summaryPresetNewFolder.trim()
  ) {
    setMessage('Geef je nieuwe map een naam.')
    return
  }

  if (
    saveAsPreset &&
    !storePreset(
      activeWorkout,
      summaryPresetName || `Training ${formatWorkoutDate(activeWorkout.date)}`,
      summaryPresetFolder === NEW_FOLDER_OPTION
        ? summaryPresetNewFolder.trim()
        : summaryPresetFolder,
    )
  ) {
    return
  }

  const savedWorkout: Workout = {
    ...activeWorkout,
    name: activeWorkout.name?.trim() || undefined,
    time: getWorkoutTime(activeWorkout),
    exercises: activeWorkout.exercises.map((exercise) => ({
      ...exercise,
      sets: exercise.sets.map((set) => ({
        ...set,
        rpe: set.rpe || '8',
      })),
    })),
    muscleGroupWorkload: getWorkoutMuscleGroupWorkload(
      activeWorkout,
      allExerciseOptions,
    ),
  }
  if (
    editingWorkoutId !== null &&
    !workouts.some((workout) => workout.id === editingWorkoutId)
  ) {
    setMessage('Deze training is niet meer gevonden in je geschiedenis.')
    return
  }
  setWorkouts((previous) =>
    editingWorkoutId === null
      ? [savedWorkout, ...previous]
      : previous
          .map((workout) =>
            workout.id === editingWorkoutId ? savedWorkout : workout,
          )
          .sort(
            (left, right) =>
              getWorkoutSortTimestamp(right) - getWorkoutSortTimestamp(left),
          ),
  )
  setActiveWorkout(null)
  setWorkoutStartedAt(null)
  setWorkoutElapsedSeconds(0)
  setIsBuildingPreset(false)
  setEditingWorkoutId(null)
  setSaveAsPreset(false)
  setSummaryPresetFolder('')
  setSummaryPresetNewFolder('')
  setShowWorkoutSummary(false)
  setMessage(
    editingWorkoutId !== null
      ? saveAsPreset
        ? 'Training aangepast en als preset opgeslagen.'
        : 'Training aangepast in je geschiedenis.'
      : saveAsPreset
        ? 'Training en preset opgeslagen.'
        : 'Training opgeslagen in je geschiedenis.',
  )
  setExpandedWorkout(activeWorkout.id)
  setView('history')
}
function getWorkoutSummaryPRs(exercise: Exercise) {
  const previousSets = workouts
    .filter((workout) => workout.id !== editingWorkoutId)
    .flatMap((workout) =>
      workout.exercises
        .filter((item) => item.name === exercise.name)
        .flatMap(getValidSets),
    )

  const currentSets = getValidSets(exercise)

  if (previousSets.length === 0 || currentSets.length === 0) {
    return []
  }

  const labels: string[] = []

  const previousBestWeight = Math.max(
    ...previousSets.map((set) => set.weight),
  )

  const previousBestOneRepMax = Math.max(
    ...previousSets.map((set) =>
      getEstimatedOneRepMax(set.weight, set.reps),
    ),
  )

  if (currentSets.some((set) => set.weight > previousBestWeight)) {
    labels.push('Gewicht-PR')
  }

  if (
    currentSets.some(
      (set) =>
        getEstimatedOneRepMax(set.weight, set.reps) >
        previousBestOneRepMax,
    )
  ) {
    labels.push('1RM-PR')
  }

  if (
    currentSets.some((set) =>
      previousSets.some(
        (oldSet) =>
                    oldSet.weight === set.weight && oldSet.reps < set.reps,
      ),
    )
  ) {
    labels.push('Herhalingen-PR')
  }

  return labels
}

  function cancelWorkout() {
    setActiveWorkout(null)
    setWorkoutStartedAt(null)
    setWorkoutElapsedSeconds(0)
    setMessage(
      isBuildingPreset
        ? 'Preset maken geannuleerd. Niet opgeslagen.'
        : 'Training geannuleerd. Niet opgeslagen.',
    )
    setIsBuildingPreset(false)
    setEditingPresetId(null)
    setEditingWorkoutId(null)
  }
function deleteSet(exerciseId: number, setIndex: number) {
  if (!activeWorkout) return

  setActiveWorkout({
    ...activeWorkout,
    exercises: activeWorkout.exercises.map((exercise) =>
      exercise.id === exerciseId
        ? {
            ...exercise,
            sets: exercise.sets.filter((_, index) => index !== setIndex),
          }
        : exercise,
    ),
  })
}

function deleteExercise(exerciseId: number) {
  if (!activeWorkout) return

  setActiveWorkout({
    ...activeWorkout,
    exercises: activeWorkout.exercises.filter(
      (exercise) => exercise.id !== exerciseId,
    ),
  })
  setOpenRestMenuExerciseId(null)

  if (restAfterSet?.exerciseId === exerciseId) {
    setRestAfterSet(null)
    setTimerRunning(false)
    setTimerRemaining(restDuration)
  }
}

function addSelectedRecordExercise(name: string) {
  setSelectedRecordExercises((current) =>
    current.includes(name) ? current : [...current, name],
  )
}

function removeSelectedRecordExercise(name: string) {
  setSelectedRecordExercises((current) =>
    current.filter((exercise) => exercise !== name),
  )
}

  return (
    <main className="dashboard">

<header className="brand-header">
  <h1>StrongJan</h1>
</header>

      
<nav className="navigation">
  <button
    className={view === 'home' ? 'nav-button active' : 'nav-button'}
    onClick={() => setView('home')}

  >
    <span className="nav-icon">⌂</span>
    <span>Home</span>
  </button>

  <button
    className={view === 'training' ? 'nav-button active' : 'nav-button'}
    onClick={() => setView('training')}
  >
    <span className="nav-icon">＋</span>
    <span>Training</span>
  </button>

  <button
    className={view === 'history' ? 'nav-button active' : 'nav-button'}
    onClick={() => setView('history')}
  >
    <span className="nav-icon">◷</span>
    <span>Geschiedenis</span>
  </button>

  <button
    className={view === 'progress' ? 'nav-button active' : 'nav-button'}
    aria-label="Oefeningprogressie en metingen"
    onClick={() => setView('progress')}
  >
    <svg
      className="nav-icon nav-user-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5.5 20v-1.5a6.5 6.5 0 0 1 13 0V20z" />
    </svg>
    <span>Jij</span>
  </button>
</nav>
      {message && <p className="message">{message}</p>}
{showWorkoutSummary && activeWorkout && (
  <div className="summary-overlay">
    <section
      className="workout-summary-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="workout-summary-title"
    >
      <button
        type="button"
        className="summary-close"
        aria-label="Terug naar training"
        onClick={() => setShowWorkoutSummary(false)}
      >
        ×
      </button>

      <div className="summary-heading">
        <span className="summary-check">✓</span>
        <div>
          <h2 id="workout-summary-title">
            {activeWorkout.name?.trim() || 'Trainingsoverzicht'}
          </h2>
          <p>
            {formatWorkoutDate(activeWorkout.date)}
            {formatWorkoutTimeRange(activeWorkout) &&
              ` · ${formatWorkoutTimeRange(activeWorkout)}`}
          </p>
        </div>
      </div>

      <div className="summary-exercises">
        {activeWorkout.exercises.map((exercise) => {
          const prs = getWorkoutSummaryPRs(exercise)

          return (
            <article
              className="summary-exercise"
              key={exercise.id}
            >
              <div className="summary-exercise-heading">
                <strong>{exercise.name}</strong>

                {prs.length > 0 && (
                  <span className="summary-pr">
                    🏆 {prs.length} PR
                  </span>
                )}
              </div>

              <p>
                {exercise.sets.length}{' '}
                {exercise.sets.length === 1 ? 'set' : 'sets'}
                {' · '}
                {exercise.sets
                  .map((set) =>
                    set.reps ? `${set.reps} reps` : '— reps',
                  )
                  .join(', ')}
              </p>

              <p>
                {exercise.sets
                  .map((set) =>
                    set.weight ? `${set.weight} kg` : '— kg',
                  )
                  .join(' · ')}
              </p>

              {prs.length > 0 && (
                <div className="summary-pr-labels">
                  {prs.map((pr) => (
                    <span key={pr}>{pr}</span>
                  ))}
                </div>
              )}
            </article>
          )
        })}

        <div className="summary-total">
          <strong>Totaal</strong>
          <strong>
            {activeWorkout.exercises.length} oefeningen ·{' '}
            {activeWorkout.exercises.reduce(
              (total, exercise) => total + exercise.sets.length,
              0,
            )}{' '}
            sets
          </strong>
        </div>
      </div>

      <label className="summary-preset-toggle">
        <input
          type="checkbox"
          checked={saveAsPreset}
          onChange={(event) => setSaveAsPreset(event.target.checked)}
        />
        <span>Ook als preset bewaren</span>
      </label>

      {saveAsPreset && (
        <div className="summary-preset-fields">
          <label>
            Naam preset
            <input
              value={summaryPresetName}
              onChange={(event) => setSummaryPresetName(event.target.value)}
              placeholder="Bijv. Push day"
            />
          </label>
          <label>
            Map
            <FolderPicker
              folders={presetFolders}
              value={summaryPresetFolder}
              newFolderName={summaryPresetNewFolder}
              onChange={setSummaryPresetFolder}
              onNewFolderNameChange={setSummaryPresetNewFolder}
            />
          </label>
        </div>
      )}

      {message && <p className="summary-preset-error">{message}</p>}

      <button
        type="button"
        className="summary-save-button"
        onClick={saveWorkoutOnly}
      >
        ✓ {saveAsPreset
          ? editingWorkoutId !== null
            ? 'Wijzigingen en preset opslaan'
            : 'Training en preset opslaan'
          : editingWorkoutId !== null
            ? 'Wijzigingen opslaan'
            : 'Alleen opslaan'}
      </button>

      <button
        type="button"
        className="summary-back-button"
        onClick={() => setShowWorkoutSummary(false)}
      >
        Terug naar training
      </button>

      <p className="summary-footnote">
        Je training wordt bewaard in je geschiedenis.
      </p>
    </section>
  </div>
)}
{view === 'home' && (
  <section className="home-page">
    <div className="home-hero">
      <p className="home-eyebrow">JOUW FITNESS OVERZICHT</p>
      <h2>Elke training telt.</h2>
      <p>
        Houd je progressie bij, bouw kracht op en blijf vooruitgaan.
      </p>
      <button
        className="home-start-button"
        onClick={() => {
          if (activeWorkout) {
            setView('training')
          } else {
            startWorkout()
          }
        }}
      >
        {activeWorkout ? 'Ga verder met trainen' : 'Start je training'}
        <span>→</span>
      </button>
      <div className="hero-decoration" aria-hidden="true">🏋</div>
    </div>

    <div className="home-section-heading">
      <div>
        <h2>Jouw statistieken</h2>
        <p>Dit heb je tot nu toe opgebouwd.</p>
      </div>
    </div>

    <div className="home-stats">
      <article className="home-stat-card">
        <div className="home-stat-icon">▦</div>
        <p>Trainingen</p>
        <strong>{workouts.length}</strong>
        <span>Opgeslagen sessies</span>
      </article>

      <article className="home-stat-card">
        <div className="home-stat-icon">↗</div>
        <p>Oefeningen</p>
        <strong>
          {new Set(
            workouts.flatMap((workout) =>
              workout.exercises.map((exercise) => exercise.name),
            ),
          ).size}
        </strong>
        <span>Unieke oefeningen</span>
      </article>

      <article className="home-stat-card">
        <div className="home-stat-icon">▤</div>
        <p>Werksets</p>
        <strong>
          {workouts.reduce(
            (total, workout) =>
              total +
              workout.exercises.reduce(
                (count, exercise) =>
                  count +
                  exercise.sets.filter(
                    (set) =>
                      Number(set.reps) > 0 &&
                      Number(set.weight) > 0,
                  ).length,
                0,
              ),
            0,
          )}
        </strong>
        <span>Geregistreerd met gewicht</span>
      </article>

      <article className="home-stat-card">
        <div className="home-stat-icon">★</div>
        <p>Persoonlijke records</p>
        <strong>
          {personalRecordsByWorkout.reduce(
            (total, workout) => total + workout.records.length,
            0,
          )}
        </strong>
        <span>PR-meldingen in je logboek</span>
      </article>
    </div>

    <PersonalRecordBar
      workouts={workouts}
      exerciseOptions={allExerciseOptions}
      selectedExercises={selectedRecordExercises}
      onAddExercise={addSelectedRecordExercise}
      onRemoveExercise={removeSelectedRecordExercise}
    />

    <div className="home-section-heading">
      <div>
        <h2>Laatste training</h2>
        <p>Je meest recente sessie.</p>
      </div>
      {workouts.length > 0 && (
        <button
          className="home-text-button"
          onClick={() => setView('history')}
        >
          Alles bekijken →
        </button>
      )}
    </div>

    {workouts.length === 0 ? (
      <article className="home-empty-card">
        <div className="home-empty-icon">🏋</div>
        <h3>Hier begint je progressie</h3>
        <p>
          Je hebt nog geen trainingen opgeslagen. Rond je eerste training
          af en je statistieken verschijnen hier automatisch.
        </p>
      </article>
    ) : (
      <article className="home-last-workout">
        <div className="home-last-icon">✓</div>
        <div className="home-last-details">
          <strong>
            {workouts[0].name?.trim() || formatWorkoutDate(workouts[0].date)}
          </strong>
          <p>
            {workouts[0].name?.trim() &&
              `${formatWorkoutDate(workouts[0].date)} · `}
            {formatWorkoutTimeRange(workouts[0]) &&
              `${formatWorkoutTimeRange(workouts[0])} · `}
            {workouts[0].exercises.length} oefeningen ·{' '}
            {workouts[0].exercises.reduce(
              (total, exercise) => total + exercise.sets.length,
              0,
            )}{' '}
            sets
          </p>
        </div>
        <button
          className="home-open-button"
          onClick={() => {
            setExpandedWorkout(workouts[0].id)
            setView('history')
          }}
        >
          Bekijk →
        </button>
      </article>
    )}

    <OneRepMaxCalculator />

  </section>
)}

      {view === 'training' && (
        <section className="workout-panel">
          {!activeWorkout && manageExerciseLibrary ? (
            <ExerciseLibraryPanel
              exercises={allExerciseOptions}
              workouts={workouts}
              onBack={() => setManageExerciseLibrary(false)}
              onAddExercise={addCustomExercise}
            />
          ) : !activeWorkout ? (
            <>
              <h2>Klaar om te trainen?</h2>
              <p className="subtitle">
                Leg je oefeningen, sets, herhalingen en gewichten vast.
              </p>
              <button className="start-button" onClick={startWorkout}>
                + Start training
              </button>
              <button
                type="button"
                className="secondary-button manage-exercises-button"
                onClick={() => setManageExerciseLibrary(true)}
              >
                Oefeningen beheren
              </button>
              <PresetLibrary
                presets={presets}
                folders={presetFolders}
                onStart={startPreset}
                onCreate={startPresetBuilder}
                onCreateFolder={createPresetFolder}
                onDelete={deletePreset}
                onEdit={editPreset}
                onRenamePreset={renamePreset}
                onRenameFolder={renamePresetFolder}
                onMovePreset={movePreset}
                onDeleteFolder={deletePresetFolder}
              />
            </>
          ) : (
            <>
              <h2>
                {editingWorkoutId !== null
                  ? 'Training aanpassen'
                  : editingPresetId !== null
                  ? 'Preset bewerken'
                  : isBuildingPreset
                    ? 'Nieuw preset maken'
                    : 'Nieuwe training'}
              </h2>
              {!isBuildingPreset && (
                <label className="workout-name-field">
                  Naam training
                  <input
                    type="text"
                    value={activeWorkout.name ?? ''}
                    onChange={(event) =>
                      setActiveWorkout((current) =>
                        current
                          ? { ...current, name: event.target.value }
                          : current,
                      )
                    }
                    placeholder="Bijv. Push day"
                    maxLength={60}
                  />
                </label>
              )}
              {!isBuildingPreset && (
                <div className="workout-date-time">
                  <label>
                    Datum
                    <input
                      type="date"
                      aria-label="Trainingsdatum"
                      value={workoutDateInputValue(activeWorkout.date)}
                      required
                      onChange={(event) =>
                        setActiveWorkout((current) =>
                          current
                            ? { ...current, date: event.target.value }
                            : current,
                        )
                      }
                    />
                  </label>
                  <label>
                    Starttijd
                    <input
                      type="time"
                      step="60"
                      aria-label="Starttijd"
                      value={getWorkoutTime(activeWorkout)}
                      required
                      onChange={(event) =>
                        setActiveWorkout((current) =>
                          current
                            ? { ...current, time: event.target.value }
                            : current,
                        )
                      }
                    />
                  </label>
                  <label>
                    Eindtijd
                    <input
                      type="time"
                      step="60"
                      aria-label="Eindtijd"
                      value={activeWorkout.endTime ?? ''}
                      required
                      onChange={(event) =>
                        setActiveWorkout((current) =>
                          current
                            ? { ...current, endTime: event.target.value }
                            : current,
                        )
                      }
                    />
                  </label>
                </div>
              )}
              {!isBuildingPreset && (
                <p className="workout-duration-preview" aria-live="polite">
                  {(() => {
                    const duration = getWorkoutDurationMinutes(
                      getWorkoutTime(activeWorkout),
                      activeWorkout.endTime ?? '',
                    )
                    return duration === null
                      ? editingWorkoutId === null
                        ? 'Eindtijd wordt ingevuld bij afronden.'
                        : 'Vul start- en eindtijd in als UU:MM.'
                      : `Duur: ${formatWorkoutDurationMinutes(duration)}`
                  })()}
                </p>
              )}
              {!isBuildingPreset && editingWorkoutId === null && (
                <div className="workout-duration" aria-live="off">
                  <span className="workout-duration-dot" aria-hidden="true" />
                  <span>Trainingstijd</span>
                  <strong>{formatWorkoutDuration(workoutElapsedSeconds)}</strong>
                </div>
              )}

              {isBuildingPreset && (
                <div className="preset-builder-fields">
                  <label>
                    Naam preset
                    <input
                      value={presetName}
                      onChange={(event) => setPresetName(event.target.value)}
                      placeholder="Bijv. Push day"
                    />
                  </label>
                  <label>
                    Map
                    <FolderPicker
                      folders={presetFolders}
                      value={presetFolder}
                      newFolderName={presetNewFolder}
                      onChange={setPresetFolder}
                      onNewFolderNameChange={setPresetNewFolder}
                    />
                  </label>
                  <p>Voeg hieronder oefeningen en sets toe aan je preset.</p>
                </div>
              )}


              {showExerciseLibrary && (
                <ExerciseLibraryPanel
                  exercises={allExerciseOptions}
                  workouts={workouts}
                  onSelect={addExercise}
                  onBack={() => setShowExerciseLibrary(false)}
                  onAddExercise={addCustomExercise}
                />
              )}

              {!showExerciseLibrary &&
  activeWorkout.exercises.map((exercise) => ( 
                
<article className="exercise-card" key={exercise.id}>
  <div className="exercise-title-row">
    <h3>{exercise.name}</h3>

    <button
      type="button"
      className="rest-menu-button"
      aria-label={`Meer opties voor ${exercise.name}`}
      aria-expanded={openRestMenuExerciseId === exercise.id}
      onClick={() =>
        setOpenRestMenuExerciseId((current) =>
          current === exercise.id ? null : exercise.id,
        )
      }
    >
      ⋮
    </button>
  </div>

  {openRestMenuExerciseId === exercise.id && (
    <div className="exercise-rest-settings">
      <label>Rusttijd voor deze oefening</label>

      <div className="exercise-rest-inputs">
        <div>
          <label htmlFor={`rest-min-${exercise.id}`}>Minuten</label>
          <input
            id={`rest-min-${exercise.id}`}
            type="number"
            min="0"
            max="99"
            value={Math.floor(
              (exercise.restDuration ?? restDuration) / 60,
            )}
            onChange={(event) => {
              const minutes = Math.max(
                0,
                Math.min(99, Number(event.target.value) || 0),
              )
              const seconds =
                (exercise.restDuration ?? restDuration) % 60

              updateExerciseRestDuration(
                exercise.id,
                minutes * 60 + seconds,
              )
            }}
          />
        </div>

        <span>:</span>

        <div>
          <label htmlFor={`rest-sec-${exercise.id}`}>Seconden</label>
          <input
            id={`rest-sec-${exercise.id}`}
            type="number"
            min="0"
            max="59"
            value={(exercise.restDuration ?? restDuration) % 60}
            onChange={(event) => {
              const seconds = Math.max(
                0,
                Math.min(59, Number(event.target.value) || 0),
              )
              const minutes = Math.floor(
                (exercise.restDuration ?? restDuration) / 60,
              )

              updateExerciseRestDuration(
                exercise.id,
                minutes * 60 + seconds,
              )
            }}
          />
        </div>
      </div>

      <button
        type="button"
        className="secondary-button"
        onClick={() => setOpenRestMenuExerciseId(null)}
      >
        Gereed
      </button>

      <button
        type="button"
        className="exercise-delete-button"
        onClick={() => deleteExercise(exercise.id)}
      >
        Oefening verwijderen
      </button>
    </div>
  )}

              
                  <div className="set-heading">
  <span>Klaar</span>
  <span>Set</span>
  <span>Herhalingen</span>
  <span>Gewicht (kg)</span>
  <span>RPE</span>
</div>

                  


{exercise.sets.map((set, index) => {
  const previousWorkout = workouts.find(
    (workout) =>
      workout.id !== activeWorkout?.id &&
      workout.exercises.some(
        (item) => item.name === exercise.name,
      ),
  )

  const previousExercise = previousWorkout?.exercises.find(
    (item) => item.name === exercise.name,
  )

  const previousSet = previousExercise?.sets[index]

  const showTimer =
    restAfterSet?.exerciseId === exercise.id &&
    restAfterSet?.setIndex === index

  
return (
  <div className="set-block" key={`${exercise.id}-${index}`}>
    <div className="set-swipe-container">
      <button
        type="button"
        className="set-delete-button"
        aria-label={`Set ${index + 1} verwijderen`}
        onClick={() => {
          deleteSet(exercise.id, index)
          setSwipedSet(null)
        }}
      >
        <span>🗑</span>
      </button>

      <div
        className={`set-row ${set.completed ? 'set-completed' : ''}`}
        style={{
          transform: `translateX(${
            swipedSet?.key === `${exercise.id}-${index}`
              ? swipedSet.offset
              : 0
          }px)`,
        }}
     
onTouchStart={(event) => {
  setTouchStart({
    key: `${exercise.id}-${index}`,
    x: event.touches[0].clientX,
  })
}}
onTouchMove={(event) => {
  if (!touchStart) return

  const key = `${exercise.id}-${index}`
  if (touchStart.key !== key) return

  const delta = event.touches[0].clientX - touchStart.x

  setSwipedSet({
    key,
    offset: Math.max(-130, Math.min(0, delta)),
  })
}}
onTouchEnd={() => {
  if (!touchStart) return

  const key = `${exercise.id}-${index}`

  if (
    touchStart.key === key &&
    swipedSet?.key === key &&
    swipedSet.offset <= -100
  ) {
    deleteSet(exercise.id, index)
  }

  setSwipedSet(null)
  setTouchStart(null)
}}

      >
        <input
          className="set-checkbox"
          type="checkbox"
          aria-label={`Set ${index + 1} afgerond`}
          checked={Boolean(set.completed)}
          onChange={(event) =>
            toggleSetCompleted(
              exercise.id,
              index,
              event.target.checked,
            )
          }
        />

        <span>{index + 1}</span>

        <input
          aria-label={`Herhalingen set ${index + 1}`}
          type="number"
          min="1"
          placeholder={previousSet?.reps || 'Reps'}
          value={set.reps}
          onChange={(event) =>
            updateSet(
              exercise.id,
              index,
              'reps',
              event.target.value,
            )
          }
        />

        <input
          aria-label={`Gewicht set ${index + 1}`}
          type="number"
          min="0"
          step="0.5"
          placeholder={previousSet?.weight || 'kg'}
          value={set.weight}
          onChange={(event) =>
            updateSet(
              exercise.id,
              index,
              'weight',
              event.target.value,
            )
          }
        />

        <input
          aria-label={`RPE set ${index + 1}, van 1 tot 10`}
          type="number"
          min="1"
          max="10"
          step="0.5"
          placeholder="8"
          value={set.rpe ?? '8'}
          onChange={(event) =>
            updateSet(
              exercise.id,
              index,
              'rpe',
              event.target.value,
            )
          }
        />
      </div>
    </div>

    {showTimer && (
      <div className="inline-rest-timer">
        <span>
          <span className="rest-timer-icon">◷</span>
          {' '}Rusttimer
        </span>

        <strong>
          {Math.floor(timerRemaining / 60)
            .toString()
            .padStart(2, '0')}
          :
          {(timerRemaining % 60)
            .toString()
            .padStart(2, '0')}
        </strong>

        {timerRemaining === 0 && (
          <span className="rest-done">Rust voorbij!</span>
        )}
      </div>
    )}
  </div>
)
})}

                  <button
                    className="text-button"
                    onClick={() => addSet(exercise.id)}
                  >
                    + Set toevoegen
                  </button>
               
                </article>
              ))}

              {!showExerciseLibrary && (
                <button
                  type="button"
                  className="secondary-button add-exercise-button"
                  onClick={() => setShowExerciseLibrary(true)}
                >
                  + Oefening toevoegen
                </button>
              )}

              <button
                className="start-button"
                onClick={isBuildingPreset ? savePresetBuilder : finishWorkout}
              >
                {editingWorkoutId !== null || editingPresetId !== null
                  ? 'Wijzigingen opslaan'
                  : isBuildingPreset
                    ? 'Preset opslaan'
                    : 'Training opslaan'}
              </button>

              <button className="cancel-button" onClick={cancelWorkout}>
                {isBuildingPreset
                  ? 'Preset maken annuleren'
                  : editingWorkoutId !== null
                    ? 'Bewerken annuleren'
                    : 'Training annuleren'}
              </button>
            </>
          )}
        </section>
      )}

      {view === 'history' && (
        <section className="history">
          <h2>Trainingsgeschiedenis</h2>
          <p className="subtitle">
            Open een training voor details en om de gegevens aan te passen.
          </p>

          {workouts.length === 0 ? (
            <p className="subtitle">Je opgeslagen trainingen verschijnen hier.</p>
          ) : (
            workouts.map((workout) => {
              const setCount = workout.exercises.reduce(
                (total, exercise) => total + exercise.sets.length,
                0,
              )
              const recordCount =
  personalRecordsByWorkout.find(
    (entry) => entry.workoutId === workout.id,
  )?.records.length || 0
              const isExpanded = expandedWorkout === workout.id

              return (
                <article className="history-card compact-history-card" key={workout.id}>
                  <button
                    className="history-summary"
                    aria-expanded={isExpanded}
                    onClick={() =>
                      setExpandedWorkout(isExpanded ? null : workout.id)
                    }
                  >
                    <span className="history-summary-main">
                      {workout.name?.trim() && (
                        <strong>{workout.name}</strong>
                      )}
                      <strong>
                        {formatWorkoutDate(workout.date)}
                        {formatWorkoutTimeRange(workout) &&
                          ` · ${formatWorkoutTimeRange(workout)}`}
                      </strong>
                      <span className="history-meta">
                        {workout.exercises.length} oefeningen · {setCount} sets
                      </span>
                      <span className="history-pr">
                        {recordCount} {recordCount === 1 ? 'PR' : 'PRs'}
                      </span>
                    </span>
                    <span className="history-chevron">
                      {isExpanded ? '−' : '+'}
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="history-details">
                      <button
                        type="button"
                        className="secondary-button history-edit-button"
                        onClick={() => editWorkout(workout)}
                      >
                        Training aanpassen
                      </button>
                      {workout.exercises.map((exercise) => (
                        <div className="history-exercise" key={exercise.id}>
                          
<strong>{exercise.name}</strong>

<div className="exercise-pr-badges">
  {(
    personalRecordsByWorkout
      .find((entry) => entry.workoutId === workout.id)
      ?.exerciseRecords.find(
        (record) => record.exerciseId === exercise.id,
      )?.labels || []
  ).map((label) => (
    <span className="pr-badge" key={label}>
      {label}
    </span>
  ))}
</div>

<div className="history-set-list">

                            {exercise.sets.map((set, index) => (
                              <div className="history-set-row" key={index}>
                                <span>Set {index + 1}</span>
                                <span>{set.reps} herhalingen</span>
                                <strong>{set.weight} kg</strong>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              )
            })
          )}
        </section>
      )}

      {view === 'progress' && (
        <section className="self-page">
          <header className="self-page-header">
            <button
              type="button"
              className="self-settings-button"
              aria-label="Instellingen"
              title="Instellingen"
              aria-pressed={selfSection === 'settings'}
              onClick={() =>
                setSelfSection((current) =>
                  current === 'settings' ? 'overview' : 'settings',
                )
              }
            >
              ⚙
            </button>
          </header>

          <div className="self-tabs" role="tablist" aria-label="Jij">
            <button
              type="button"
              role="tab"
              aria-selected={selfSection === 'overview'}
              className={selfSection === 'overview' ? 'active' : ''}
              onClick={() => setSelfSection('overview')}
            >
              Overzicht
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={selfSection === 'exercise'}
              className={selfSection === 'exercise' ? 'active' : ''}
              onClick={() => setSelfSection('exercise')}
            >
              Oefeningen
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={selfSection === 'measurements'}
              className={selfSection === 'measurements' ? 'active' : ''}
              onClick={() => setSelfSection('measurements')}
            >
              Metingen
            </button>
          </div>

          {selfSection === 'settings' && (
            <section className="settings-page">
              <h2>Instellingen</h2>
              <ProfileSettings
                syncStatus={cloudSyncStatus}
                syncError={cloudSyncError}
              />

              <div className="settings-theme-section">
                <h3>Uiterlijk</h3>
                <p>Kies de kleur van StrongJan.</p>
                <div className="theme-options">
                  {[
                    { id: 'green', name: 'Groen', color: '#285943' },
                    { id: 'red', name: 'Rood', color: '#c0392b' },
                    { id: 'blue', name: 'Blauw', color: '#2471a3' },
                    { id: 'purple', name: 'Paars', color: '#7950a0' },
                    { id: 'gray', name: 'Grijs', color: '#626b73' },
                    { id: 'orange', name: 'Oranje', color: '#d97726' },
                    { id: 'black', name: 'Zwart', color: '#252525' },
                    { id: 'turquoise', name: 'Turquoise', color: '#168a83' },
                  ].map((theme) => (
                    <button
                      key={theme.id}
                      type="button"
                      className={
                        themeColor === theme.id
                          ? 'theme-option selected'
                          : 'theme-option'
                      }
                      onClick={() => setThemeColor(theme.id)}
                    >
                      <span
                        className="theme-swatch"
                        style={{ backgroundColor: theme.color }}
                      />
                      <span>{theme.name}</span>
                      {themeColor === theme.id && <span>✓</span>}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          )}

          {selfSection === 'overview' && (
            <section className="self-overview">
              <GymAttendanceDashboard workouts={workouts} />
              <section className="muscle-recovery">
                <div className="muscle-recovery-heading">
                  <div className="muscle-recovery-title">
                    <h2>Spierherstel</h2>
                  </div>
                  <div className="muscle-recovery-total">
                    <strong>Gemiddelde score / 100</strong>
                    <div
                      className="muscle-recovery-circle muscle-recovery-average"
                      role="img"
                      aria-label={`Gemiddelde herstelscore: ${averageMuscleRecovery} van 100`}
                      style={{
                        background: `conic-gradient(${getRecoveryColor(averageMuscleRecovery)} ${averageMuscleRecovery}%, var(--theme-light) 0)`,
                      }}
                    >
                      <span>{averageMuscleRecovery}</span>
                    </div>
                  </div>
                </div>
                <div className="muscle-recovery-grid">
                  {muscleRecovery.map(({ muscleGroup, percentage }) => {
                    const recoveryColor = getRecoveryColor(percentage)
                    const advice = percentage >= 90
                      ? 'Normale training lijkt prima'
                      : percentage >= 70
                        ? 'Train waarschijnlijk; pas zo nodig aan'
                        : percentage >= 40
                          ? 'Overweeg lichter of train een andere spiergroep'
                          : 'Rust deze spier of train een andere spiergroep'

                    return (
                      <article
                        className="muscle-recovery-card"
                        key={muscleGroup}
                      >
                        <div
                          className="muscle-recovery-circle"
                          role="img"
                          aria-label={`${muscleGroup}: indicatieve score ${percentage} van 100. Advies: ${advice}`}
                          style={{
                            background: `conic-gradient(${recoveryColor} ${percentage}%, var(--theme-light) 0)`,
                          }}
                        >
                          <span>{percentage}</span>
                        </div>
                        <strong>{muscleGroup}</strong>
                        <span className="muscle-recovery-advice">{advice}</span>
                      </article>
                    )
                  })}
                </div>
                <details className="muscle-recovery-guide">
                  <summary>Hoe lees ik deze score?</summary>
                  <div className="muscle-recovery-guide-content">
                    <p>
                      De kleur loopt geleidelijk van groen (hogere score), via
                      geel, naar rood (lagere score). De zones zijn praktische
                      richtlijnen:
                    </p>
                    <div className="muscle-recovery-guide-items">
                      <div className="muscle-recovery-guide-item">
                        <span
                          className="muscle-recovery-guide-dot"
                          style={{ backgroundColor: getRecoveryColor(100) }}
                        />
                        <span><strong>90–100</strong> Trainen lijkt prima</span>
                      </div>
                      <div className="muscle-recovery-guide-item">
                        <span
                          className="muscle-recovery-guide-dot"
                          style={{ backgroundColor: getRecoveryColor(80) }}
                        />
                        <span><strong>70–89</strong> Train, pas zo nodig aan</span>
                      </div>
                      <div className="muscle-recovery-guide-item">
                        <span
                          className="muscle-recovery-guide-dot"
                          style={{ backgroundColor: getRecoveryColor(55) }}
                        />
                        <span><strong>40–69</strong> Overweeg lichter</span>
                      </div>
                      <div className="muscle-recovery-guide-item">
                        <span
                          className="muscle-recovery-guide-dot"
                          style={{ backgroundColor: getRecoveryColor(20) }}
                        />
                        <span><strong>0–39</strong> Rust of train iets anders</span>
                      </div>
                    </div>
                    <p>
                      Dit is een voorzichtige richtlijn op basis van sets en RPE,
                      geen gemeten herstel of garantie. De zones zijn niet
                      wetenschappelijk gevalideerd. Let ook op spierpijn, kracht
                      en energie; forceer geen training als je je niet goed voelt.
                    </p>
                  </div>
                </details>
              </section>
              <section className="muscle-training-load">
                <div className="muscle-training-load-heading">
                  <div>
                    <h2>Trainingsbelasting per spiergroep</h2>
                    <p>
                      Een set telt volledig voor de hoofdspier en half voor een
                      subspier. Meer rood betekent meer trainingsbelasting.
                    </p>
                  </div>
                  <label className="muscle-load-period">
                    <span>Periode</span>
                    <select
                      value={trainingLoadPeriod}
                      onChange={(event) =>
                        setTrainingLoadPeriod(
                          event.target.value as TrainingLoadPeriod,
                        )
                      }
                    >
                      <option value="week">Deze week</option>
                      <option value="month">Deze maand</option>
                      <option value="year">Dit jaar</option>
                      <option value="all">Alles</option>
                    </select>
                  </label>
                </div>
                {muscleTrainingLoad.length === 0 ? (
                  <p className="muscle-training-load-empty">
                    Geen opgeslagen trainingssets in deze periode.
                  </p>
                ) : (
                  <MuscleLoadVisualizations
                    muscleLoads={muscleTrainingLoad}
                    maxLoad={maxMuscleTrainingLoad}
                  />
                )}
              </section>
              <PersonalRecordBar
                workouts={workouts}
                exerciseOptions={allExerciseOptions}
                selectedExercises={selectedRecordExercises}
                onAddExercise={addSelectedRecordExercise}
                onRemoveExercise={removeSelectedRecordExercise}
              />
            </section>
          )}

          {selfSection === 'exercise' && (
          <section className="history">
          <h2>Oefeningprogressie</h2>
          <p className="subtitle">
            Bekijk hoe je kracht en trainingsvolume zich ontwikkelen.
          </p>

          {selectedExercise && (
            <button
              type="button"
              className="secondary-button exercise-progress-toggle"
              aria-expanded={showExerciseProgress}
              onClick={() =>
                setShowExerciseProgress((current) => !current)
              }
            >
              {showExerciseProgress
                ? 'Oefeningprogressie verbergen'
                : 'Oefeningprogressie tonen'}
            </button>
          )}

          {showExerciseProgress && (
            <>
          <div className="progress-exercise-library">
            <button
              type="button"
              className="secondary-button progress-exercise-picker-button"
              aria-expanded={showProgressExercisePicker}
              onClick={() =>
                setShowProgressExercisePicker((current) => !current)
              }
            >
              <span>{selectedExercise || 'Oefening selecteren'}</span>
              <span aria-hidden="true">{showProgressExercisePicker ? '⌃' : '⌄'}</span>
            </button>

            {showProgressExercisePicker && (
              <>
                <input
                  id="progress-exercise-search"
                  type="search"
                  value={progressExerciseSearch}
                  onChange={(event) =>
                    setProgressExerciseSearch(event.target.value)
                  }
                  placeholder="Zoek een oefening..."
                  aria-label="Zoek een oefening"
                />

                <div className="muscle-filters">
                  {progressMuscleGroups.map((group) => (
                    <button
                      key={group}
                      type="button"
                      className={
                        progressMuscleGroup === group
                          ? 'muscle-filter active'
                          : 'muscle-filter'
                      }
                      onClick={() => setProgressMuscleGroup(group)}
                    >
                      {group}
                    </button>
                  ))}
                </div>

                <div className="exercise-library-list progress-exercise-list">
                  {filteredProgressExercises.map((exercise, index) => {
                    const letter = exercise.name
                      .charAt(0)
                      .toLocaleUpperCase('nl-NL')
                    const previousLetter = filteredProgressExercises[index - 1]
                      ?.name.charAt(0).toLocaleUpperCase('nl-NL')

                    return (
                      <Fragment key={exercise.name}>
                        {letter !== previousLetter && (
                          <h3 className="exercise-library-letter">{letter}</h3>
                        )}
                        <button
                          type="button"
                          className={
                            selectedExercise === exercise.name
                              ? 'library-exercise selected'
                              : 'library-exercise'
                          }
                          onClick={() => {
                            setSelectedExercise(exercise.name)
                            setShowProgressExercisePicker(false)
                          }}
                        >
                          <span>{exercise.name}</span>
                          <span>
                            {exercise.muscleGroup}
                            {selectedExercise === exercise.name ? ' ✓' : ''}
                          </span>
                        </button>
                      </Fragment>
                    )
                  })}
                  {filteredProgressExercises.length === 0 && (
                    <p className="subtitle">
                      {progressExerciseOptions.length === 0
                        ? 'Sla eerst een training met oefeningen op.'
                        : 'Geen oefeningen gevonden.'}
                    </p>
                  )}
                </div>
              </>
            )}
          </div>

          {!selectedExercise ? (
            <p className="subtitle">
              Selecteer een oefening om je resultaten te bekijken.
            </p>
          ) : selectedExerciseHistory.length === 0 ? (
            <p className="subtitle">
              Er zijn nog geen sets met een gewicht boven 0 kg geregistreerd.
            </p>
          ) : (
            <>
              <div className="stats progress-stats">
                <article className="stat-card">
                  <p>Zwaarste werkgewicht</p>
                  <strong>{personalRecord} kg</strong>
                </article>
                <article className="stat-card">
                  <p>Beste geschatte 1RM</p>
                  <strong>{bestEstimatedOneRepMax.toFixed(1)} kg</strong>
                </article>
              </div>

              <article className="history-card chart-card">
                <h3>
                  {selectedMetric === 'weight'
                    ? 'Gewichtsprogressie'
                    : selectedMetric === 'oneRepMax'
                      ? 'Geschatte 1RM'
                      : 'Trainingsvolume'}
                </h3>

                <label htmlFor="chart-metric">Toon in grafiek</label>
                <select
                  id="chart-metric"
                  value={selectedMetric}
                  onChange={(event) =>
                    setSelectedMetric(event.target.value as Metric)
                  }
                >
                  <option value="weight">Zwaarste werkgewicht (kg)</option>
                  <option value="oneRepMax">Geschatte 1RM (kg)</option>
                  <option value="volume">Volume (kg × herhalingen)</option>
                </select>

                {selectedExerciseHistory.length === 1 && (
                  <p className="subtitle">
                    Sla meer trainingen op om je ontwikkeling over tijd te zien.
                  </p>
                )}

                <ProgressChart
                  entries={selectedExerciseHistory.map((entry) => ({
                    date: entry.date,
                    value:
                      selectedMetric === 'weight'
                        ? entry.bestWeight
                        : selectedMetric === 'oneRepMax'
                          ? entry.estimatedOneRepMax
                          : entry.volume,
                  }))}
                />
              </article>

              <h3>Resultaten per training</h3>
              {selectedExerciseHistory.map((entry) => (
                <article className="history-card progress-entry" key={entry.id}>
                  <strong>{entry.date}</strong>
                  <p>
                    Zwaarste set: {entry.bestSet.weight} kg × {entry.bestSet.reps}
                  </p>
                  <p>Geschatte 1RM: {entry.estimatedOneRepMax.toFixed(1)} kg</p>
                  <p>Volume: {entry.volume.toLocaleString('nl-NL')} kg</p>
                </article>
              ))}
            </>
          )}
          </>
          )}

          </section>
          )}

          {selfSection === 'measurements' && (
          <section className="history">
          <section className="body-progress-section">
            <h2>Metingen</h2>
            <p className="subtitle">
              Houd je gewicht en lichaamsomtrek bij. Kies een meting om je
              voortgang te bekijken of een nieuwe waarde toe te voegen.
            </p>

            <div className="body-metric-library">
              {bodyMetrics.map((metric) => {
                const latestMeasurement = bodyMeasurements
                  .filter((measurement) => measurement.metricId === metric.id)
                  .sort((left, right) => right.date.localeCompare(left.date))[0]

                return (
                  <button
                    key={metric.id}
                    type="button"
                    className={
                      selectedBodyMetric === metric.id
                        ? 'body-metric-card selected'
                        : 'body-metric-card'
                    }
                    aria-pressed={selectedBodyMetric === metric.id}
                    onClick={() => setSelectedBodyMetric(metric.id)}
                  >
                    <strong>{metric.name}</strong>
                    <span>
                      {latestMeasurement
                        ? `${latestMeasurement.value.toLocaleString('nl-NL')} ${metric.unit}`
                        : `Nog geen metingen · ${metric.unit}`}
                    </span>
                  </button>
                )
              })}
            </div>

            <article className="history-card body-measurement-card">
              <h3>{activeBodyMetric.name}</h3>
              <form
                className="body-measurement-form"
                onSubmit={saveBodyMeasurement}
              >
                <label>
                  Datum
                  <input
                    type="date"
                    value={bodyMeasurementDate}
                    max={dateKey(new Date())}
                    onChange={(event) =>
                      setBodyMeasurementDate(event.target.value)
                    }
                    required
                  />
                </label>
                <label>
                  Waarde ({activeBodyMetric.unit})
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={bodyMeasurementValue}
                    onChange={(event) =>
                      setBodyMeasurementValue(event.target.value)
                    }
                    placeholder={`Bijv. ${activeBodyMetric.id === 'weight' ? '75' : '90'}`}
                    required
                  />
                </label>
                <button type="submit">Meting opslaan</button>
              </form>

              {selectedBodyMetricHistory.length === 0 ? (
                <p className="subtitle">
                  Nog geen metingen voor {activeBodyMetric.name.toLowerCase()}.
                </p>
              ) : (
                <>
                  {selectedBodyMetricHistory.length > 1 && (
                    <ProgressChart
                      entries={selectedBodyMetricHistory.map((measurement) => ({
                        date: measurement.date,
                        value: measurement.value,
                      }))}
                      ariaLabel={`Grafiek van je ${activeBodyMetric.name.toLowerCase()}`}
                    />
                  )}
                  <div className="body-measurement-history">
                    {[...selectedBodyMetricHistory]
                      .reverse()
                      .map((measurement) => (
                        <article
                          className="progress-entry"
                          key={measurement.id}
                        >
                          <strong>
                            {new Date(
                              `${measurement.date}T00:00:00`,
                            ).toLocaleDateString('nl-NL')}
                          </strong>
                          <span>
                            {measurement.value.toLocaleString('nl-NL')}{' '}
                            {activeBodyMetric.unit}
                          </span>
                        </article>
                      ))}
                  </div>
                </>
              )}
            </article>
          </section>
          </section>
          )}
        </section>
      )}

    </main>
  )
}

export default App
