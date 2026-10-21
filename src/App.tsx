
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
  date: string
  exercises: Exercise[]
}

type WorkoutPreset = {
  id: number
  name: string
  folder: string
  exercises: Exercise[]
}

const NEW_FOLDER_OPTION = '__new_folder__'

type View = 'home' | 'training' | 'history' | 'progress' | 'settings'
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
  const enteredWeight = Number(weight)
  const enteredReps = Number(reps)
  const isValidInput =
    Number.isFinite(enteredWeight) &&
    enteredWeight > 0 &&
    Number.isInteger(enteredReps) &&
    enteredReps >= 1 &&
    enteredReps <= 36

  const estimates = isValidInput
    ? [
        {
          name: 'Epley',
          value:
            enteredReps === 1
              ? enteredWeight
              : enteredWeight * (1 + enteredReps / 30),
        },
        {
          name: 'Brzycki',
          value:
            enteredReps === 1
              ? enteredWeight
              : (enteredWeight * 36) / (37 - enteredReps),
        },
        {
          name: 'Lombardi',
          value:
            enteredReps === 1
              ? enteredWeight
              : enteredWeight * enteredReps ** 0.1,
        },
      ]
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
      </div>

      {estimates.length > 0 ? (
        <div className="one-rep-max-results" aria-live="polite">
          {estimates.map((estimate) => (
            <article className="one-rep-max-result" key={estimate.name}>
              <span>{estimate.name}</span>
              <strong>
                {estimate.value.toLocaleString('nl-NL', {
                  maximumFractionDigits: 1,
                })}{' '}
                kg
              </strong>
            </article>
          ))}
        </div>
      ) : (
        <p className="one-rep-max-hint">
          Vul een gewicht en 1 tot en met 36 herhalingen in.
        </p>
      )}
      <p className="one-rep-max-note">
        Dit zijn schattingen; de uitkomst kan per formule verschillen.
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
        options: { redirectTo: window.location.origin },
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
  custom?: boolean
}

const exerciseLibrary: ExerciseOption[] = [
  { name: 'Arnold Press', muscleGroup: 'Schouders' },
  { name: 'Barbell Row', muscleGroup: 'Rug' },
  { name: 'Barbell Bench Press', muscleGroup: 'Borst' },
  { name: 'Bicep Curl', muscleGroup: 'Biceps' },
  { name: 'Bulgarian Split Squat', muscleGroup: 'Benen' },
  { name: 'Cable Crossover', muscleGroup: 'Borst' },
  { name: 'Cable Fly', muscleGroup: 'Borst' },
  { name: 'Cable Curl', muscleGroup: 'Biceps' },
  { name: 'Chest Press Machine', muscleGroup: 'Borst' },
  { name: 'Calf Raise', muscleGroup: 'Benen' },
  { name: 'Chest-Supported Row', muscleGroup: 'Rug' },
  { name: 'Close-Grip Lat Pulldown', muscleGroup: 'Rug' },
  { name: 'Decline Bench Press', muscleGroup: 'Borst' },
  { name: 'Concentration Curl', muscleGroup: 'Biceps' },
  { name: 'Deadlift', muscleGroup: 'Rug' },
  { name: 'Dumbbell Bench Press', muscleGroup: 'Borst' },
  { name: 'Dumbbell Fly', muscleGroup: 'Borst' },
  { name: 'Dumbbell Shoulder Press', muscleGroup: 'Schouders' },
  { name: 'Face Pull', muscleGroup: 'Schouders' },
  { name: 'Front Raise', muscleGroup: 'Schouders' },
  { name: 'Glute Bridge', muscleGroup: 'Benen' },
  { name: 'Hammer Curl', muscleGroup: 'Biceps' },
  { name: 'Hip Thrust', muscleGroup: 'Benen' },
  { name: 'Incline Barbell Bench Press', muscleGroup: 'Borst' },
  { name: 'Incline Dumbbell Bench Press', muscleGroup: 'Borst' },
  { name: 'Lat Pulldown', muscleGroup: 'Rug' },
  { name: 'Leg Press', muscleGroup: 'Benen' },
  { name: 'Leg Curl', muscleGroup: 'Benen' },
  { name: 'Leg Extension', muscleGroup: 'Benen' },
  { name: 'Lateral Raise', muscleGroup: 'Schouders' },
  { name: 'Lunge', muscleGroup: 'Benen' },
  { name: 'Pec Deck', muscleGroup: 'Borst' },
  { name: 'Preacher Curl', muscleGroup: 'Biceps' },
  { name: 'Pull-Up', muscleGroup: 'Rug' },
  { name: 'Push-Up', muscleGroup: 'Borst' },
  { name: 'Romanian Deadlift', muscleGroup: 'Benen' },
  { name: 'Reverse Fly', muscleGroup: 'Schouders' },
  { name: 'Seated Calf Raise', muscleGroup: 'Benen' },
  { name: 'Overhead Triceps Extension', muscleGroup: 'Triceps' },
  { name: 'Seated Cable Row', muscleGroup: 'Rug' },
  { name: 'Squat', muscleGroup: 'Benen' },
  { name: 'Straight-Arm Pulldown', muscleGroup: 'Rug' },
  { name: 'Triceps Dip', muscleGroup: 'Triceps' },
  { name: 'Triceps Skull Crusher', muscleGroup: 'Triceps' },
  { name: 'Triceps Pushdown', muscleGroup: 'Triceps' },
  { name: 'Walking Lunge', muscleGroup: 'Benen' },
]

function ExerciseLibraryPanel({
  exercises,
  onSelect,
  onBack,
  onAddExercise,
}: {
  exercises: ExerciseOption[]
  onSelect?: (exerciseName: string) => void
  onBack: () => void
  onAddExercise: (name: string, muscleGroup: string) => void
}) {
  const [search, setSearch] = useState('')
  const [selectedGroup, setSelectedGroup] = useState('Alle')
  const [showMenu, setShowMenu] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newExerciseName, setNewExerciseName] = useState('')
  const [newExerciseGroup, setNewExerciseGroup] = useState('Borst')
  const [formError, setFormError] = useState('')
  const muscleGroups = [
    'Alle',
    'Borst',
    'Rug',
    'Schouders',
    'Biceps',
    'Triceps',
    'Benen',
    'Overig',
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

    onAddExercise(trimmedName, newExerciseGroup)
    setNewExerciseName('')
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
            Spiergroep
            <select
              value={newExerciseGroup}
              onChange={(event) => setNewExerciseGroup(event.target.value)}
            >
              {muscleGroups
                .filter((group) => group !== 'Alle')
                .map((group) => (
                  <option key={group} value={group}>{group}</option>
                ))}
            </select>
          </label>
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
                disabled={!onSelect}
                onClick={() => onSelect?.(exercise.name)}
              >
                <span>{exercise.name}</span>
                <span>{exercise.muscleGroup}{onSelect ? '　＋' : ''}</span>
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
      return JSON.parse(
        localStorage.getItem('strongjan-custom-exercises') || '[]',
      ) as ExerciseOption[]
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
  const [activeWorkout, setActiveWorkout] = useState<Workout | null>(null)
  const [workoutStartedAt, setWorkoutStartedAt] = useState<number | null>(null)
  const [workoutElapsedSeconds, setWorkoutElapsedSeconds] = useState(0)
  const [showWorkoutSummary, setShowWorkoutSummary] = useState(false)
  const [isBuildingPreset, setIsBuildingPreset] = useState(false)
  const [editingPresetId, setEditingPresetId] = useState<number | null>(null)
  const [presetName, setPresetName] = useState('')
  const [presetFolder, setPresetFolder] = useState('')
  const [presetNewFolder, setPresetNewFolder] = useState('')
  const [saveAsPreset, setSaveAsPreset] = useState(false)
  const [summaryPresetName, setSummaryPresetName] = useState('')
  const [summaryPresetFolder, setSummaryPresetFolder] = useState('')
  const [summaryPresetNewFolder, setSummaryPresetNewFolder] = useState('')
  const [exerciseName, setExerciseName] = useState('Bench press')
  const [message, setMessage] = useState('')
  const [view, setView] = useState<View>('home')
  const [selectedExercise, setSelectedExercise] = useState('')
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
  () => [...exerciseLibrary, ...customExercises],
  [customExercises],
)
  useEffect(() => {
    localStorage.setItem('fitnessai-workouts', JSON.stringify(workouts))
  }, [workouts])

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
          setCustomExercises(data.customExercises)
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
        setCustomExercises(fitnessData.customExercises)
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
      ['squat', 'Benen'],
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
          'Overig',
      }))
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
          date: workout.date,
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
      exercises: [],
    })
    setWorkoutStartedAt(startedAt)
    setWorkoutElapsedSeconds(0)
    setIsBuildingPreset(false)
    setEditingPresetId(null)
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
    setShowExerciseLibrary(false)
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
      setMessage('Preset bijgewerkt.')
      return
    }
    if (!storePreset(activeWorkout, presetName, folder)) return

    setActiveWorkout(null)
    setWorkoutStartedAt(null)
    setWorkoutElapsedSeconds(0)
    setIsBuildingPreset(false)
    setEditingPresetId(null)
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

  function addCustomExercise(name: string, muscleGroup: string) {
    setCustomExercises((previous) => [
      ...previous,
      { name, muscleGroup, custom: true },
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

  if (activeWorkout.exercises.length === 0) {
    setMessage('Voeg eerst een oefening toe.')
    return
  }

  setMessage('')
  setSaveAsPreset(false)
  setSummaryPresetName(`Training ${activeWorkout.date}`)
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
      summaryPresetName || `Training ${activeWorkout.date}`,
      summaryPresetFolder === NEW_FOLDER_OPTION
        ? summaryPresetNewFolder.trim()
        : summaryPresetFolder,
    )
  ) {
    return
  }

  setWorkouts((previous) => [activeWorkout, ...previous])
  setActiveWorkout(null)
  setWorkoutStartedAt(null)
  setWorkoutElapsedSeconds(0)
  setIsBuildingPreset(false)
  setSaveAsPreset(false)
  setSummaryPresetFolder('')
  setSummaryPresetNewFolder('')
  setShowWorkoutSummary(false)
  setMessage(
    saveAsPreset
      ? 'Training en preset opgeslagen.'
      : 'Training opgeslagen in je geschiedenis.',
  )
  setExpandedWorkout(activeWorkout.id)
  setView('history')
}
function getWorkoutSummaryPRs(exercise: Exercise) {
  const previousSets = workouts
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
    onClick={() => setView('progress')}
  >
    <span className="nav-icon">↗</span>
    <span>Progressie</span>
  </button>
</nav>
{view === 'settings' && (
  <section className="settings-page">
    <button
      className="secondary-button"
      onClick={() => setView('home')}
    >
      ← Terug naar home
    </button>

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
          <h2 id="workout-summary-title">Trainingsoverzicht</h2>
          <p>{activeWorkout.date}</p>
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
        ✓ {saveAsPreset ? 'Training en preset opslaan' : 'Alleen opslaan'}
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
      <div className="hero-decoration">FITNESS<span>AI</span></div>
    </div>

    <GymAttendanceDashboard workouts={workouts} />

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
          <strong>{workouts[0].date}</strong>
          <p>
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

    <div className="home-section-heading">
      <div>
        <h2>Jouw volgende stap</h2>
        <p>Blijf bouwen aan je kracht.</p>
      </div>
    </div>

    <button
      className="home-progress-card"
      onClick={() => setView('progress')}
    >
      <div>
        <span className="home-progress-label">PROGRESSIE</span>
        <h3>Bekijk hoe je sterker wordt</h3>
        <p>Volg je werkgewichten, geschatte 1RM en trainingsvolume.</p>
      </div>
      <span className="home-progress-arrow">↗</span>
    </button>
    
    <button
      className="home-settings-button"
      onClick={() => setView('settings')}
    >
      <span>⚙</span>
      <span>
        <strong>Instellingen</strong>
        <small>Pas het uiterlijk van StrongJan aan</small>
      </span>
      <span className="home-settings-arrow">→</span>
    </button>

  </section>
)}

      {view === 'training' && (
        <section className="workout-panel">
          {!activeWorkout && manageExerciseLibrary ? (
            <ExerciseLibraryPanel
              exercises={allExerciseOptions}
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
                {editingPresetId !== null
                  ? 'Preset bewerken'
                  : isBuildingPreset
                    ? 'Nieuw preset maken'
                    : 'Nieuwe training'}
              </h2>
              {!isBuildingPreset && (
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
      aria-label={`Rusttijd instellen voor ${exercise.name}`}
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
    </div>
  )}

              
                  <div className="set-heading">
  <span>Klaar</span>
  <span>Set</span>
  <span>Herhalingen</span>
  <span>Gewicht (kg)</span>
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
                {editingPresetId !== null
                  ? 'Wijzigingen opslaan'
                  : isBuildingPreset
                    ? 'Preset opslaan'
                    : 'Training opslaan'}
              </button>

              <button className="cancel-button" onClick={cancelWorkout}>
                {isBuildingPreset ? 'Preset maken annuleren' : 'Training annuleren'}
              </button>
            </>
          )}
        </section>
      )}

      {view === 'history' && (
        <section className="history">
          <h2>Trainingsgeschiedenis</h2>
          <p className="subtitle">Klik op een training om de details te bekijken.</p>

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
                      <strong>{workout.date}</strong>
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
        <section className="history">
          <h2>Progressie per oefening</h2>
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

          <section className="body-progress-section">
            <h2>Lichaamsprogressie</h2>
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

    </main>
  )
}

export default App
