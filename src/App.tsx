
import { useEffect, useMemo, useState } from 'react'
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

type View = 'home' | 'training' | 'history' | 'progress' | 'settings'
type Metric = 'weight' | 'oneRepMax' | 'volume'


type ProgressEntry = {
  id: number
  date: string
  bestWeight: number
  bestSet: {
    reps: number
    weight: number
  }
  estimatedOneRepMax: number
  volume: number
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

function ProgressChart({
  entries,
  metric,
}: {
  entries: ProgressEntry[]
  metric: Metric
}) {
  const width = 600
  const height = 250
  const paddingLeft = 52
  const paddingRight = 20
  const paddingTop = 24
  const paddingBottom = 42

  const values = entries.map((entry) => {
    if (metric === 'weight') return entry.bestWeight
    if (metric === 'oneRepMax') return entry.estimatedOneRepMax
    return entry.volume
  })

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
        aria-label="Grafiek van je trainingsprogressie"
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
}

const exerciseLibrary: ExerciseOption[] = [
  { name: 'Barbell Bench Press', muscleGroup: 'Borst' },
  { name: 'Bicep Curl', muscleGroup: 'Biceps' },
  { name: 'Cable Fly', muscleGroup: 'Borst' },
  { name: 'Calf Raise', muscleGroup: 'Benen' },
  { name: 'Close-Grip Lat Pulldown', muscleGroup: 'Rug' },
  { name: 'Concentration Curl', muscleGroup: 'Biceps' },
  { name: 'Deadlift', muscleGroup: 'Rug' },
  { name: 'Dumbbell Shoulder Press', muscleGroup: 'Schouders' },
  { name: 'Leg Curl', muscleGroup: 'Benen' },
  { name: 'Leg Extension', muscleGroup: 'Benen' },
  { name: 'Lateral Raise', muscleGroup: 'Schouders' },
  { name: 'Lat Pulldown', muscleGroup: 'Rug' },
  { name: 'Overhead Triceps Extension', muscleGroup: 'Triceps' },
  { name: 'Seated Cable Row', muscleGroup: 'Rug' },
  { name: 'Squat', muscleGroup: 'Benen' },
  { name: 'Triceps Pushdown', muscleGroup: 'Triceps' },
]

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

  const [activeWorkout, setActiveWorkout] = useState<Workout | null>(null)
  const [exerciseName, setExerciseName] = useState('Bench press')
  const [message, setMessage] = useState('')
  const [view, setView] = useState<View>('home')
  const [selectedExercise, setSelectedExercise] = useState('')
  const [selectedMetric, setSelectedMetric] = useState<Metric>('weight')
  const [openRestMenuExerciseId, setOpenRestMenuExerciseId] =
  useState<number | null>(null)
  const restDuration = 120
  const [showExerciseLibrary, setShowExerciseLibrary] = useState(false)
const [exerciseSearch, setExerciseSearch] = useState('')
const [selectedMuscleGroup, setSelectedMuscleGroup] = useState('Alle')
const [timerRemaining, setTimerRemaining] = useState(120)
const [timerRunning, setTimerRunning] = useState(false)
const [restAfterSet, setRestAfterSet] = useState<{
  exerciseId: number
  setIndex: number
} | null>(null)

const [themeColor, setThemeColor] = useState(() => {
  return localStorage.getItem('strongjan-theme') || 'green'
})

  const [expandedWorkout, setExpandedWorkout] = useState<number | null>(null)
const muscleGroups = [
  'Alle',
  'Borst',
  'Rug',
  'Schouders',
  'Biceps',
  'Triceps',
  'Benen',
]

const filteredExercises = exerciseLibrary
  .filter((exercise) =>
    exercise.name
      .toLowerCase()
      .includes(exerciseSearch.toLowerCase()),
  )
  .filter(
    (exercise) =>
      selectedMuscleGroup === 'Alle' ||
      exercise.muscleGroup === selectedMuscleGroup,
  )
  .sort((a, b) => a.name.localeCompare(b.name))
  useEffect(() => {
    localStorage.setItem('fitnessai-workouts', JSON.stringify(workouts))
  }, [workouts])

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
  localStorage.setItem('strongjan-theme', themeColor)
  document.documentElement.dataset.theme = themeColor
}, [themeColor])

  const exerciseNames = useMemo(() => {
    const names = workouts.flatMap((workout) =>
      workout.exercises.map((exercise) => exercise.name),
    )
    return [...new Set([...starterExercises, ...names])].sort()
  }, [workouts])

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
    setActiveWorkout({
      id: Date.now(),
      date: new Date().toLocaleDateString('nl-NL'),
      exercises: [],
    })
    setMessage('')
    setView('training')
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
  setExerciseSearch('')
  setSelectedMuscleGroup('Alle')
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

    setWorkouts((previous) => [activeWorkout, ...previous])
    setActiveWorkout(null)
    setMessage('Training opgeslagen!')
    setView('history')
  }

  function cancelWorkout() {
    setActiveWorkout(null)
    setMessage('Training geannuleerd. Niet opgeslagen.')
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
  </section>
)}

      {message && <p className="message">{message}</p>}

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
          {!activeWorkout ? (
            <>
              <h2>Klaar om te trainen?</h2>
              <p className="subtitle">
                Leg je oefeningen, sets, herhalingen en gewichten vast.
              </p>
              <button className="start-button" onClick={startWorkout}>
                + Start training
              </button>
            </>
          ) : (
            <>
              <h2>Nieuwe training</h2>


              {showExerciseLibrary && (
  <div className="exercise-library">
    <button
      type="button"
      className="secondary-button"
      onClick={() => setShowExerciseLibrary(false)}
    >
      ← Terug naar training
    </button>

    <h2>Oefening toevoegen</h2>

    <input
      type="search"
      value={exerciseSearch}
      onChange={(event) => setExerciseSearch(event.target.value)}
      placeholder="Zoek een oefening..."
      aria-label="Zoek een oefening"
    />

    <div className="muscle-filters">
      {muscleGroups.map((group) => (
        <button
          key={group}
          type="button"
          className={
            selectedMuscleGroup === group
              ? 'muscle-filter active'
              : 'muscle-filter'
          }
          onClick={() => setSelectedMuscleGroup(group)}
        >
          {group}
        </button>
      ))}
    </div>

    <div className="exercise-library-list">
      {filteredExercises.map((exercise) => (
        <button
          key={exercise.name}
          type="button"
          className="library-exercise"
          onClick={() => addExercise(exercise.name)}
        >
          <span>{exercise.name}</span>
          <span>{exercise.muscleGroup}　＋</span>
        </button>
      ))}

      {filteredExercises.length === 0 && (
        <p>Geen oefeningen gevonden.</p>
      )}
    </div>
  </div>
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
    <div className="set-block" key={index}>
      <div className={`set-row ${set.completed ? 'set-completed' : ''}`}>
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

              <button className="start-button" onClick={finishWorkout}>
                Training opslaan
              </button>

              <button className="cancel-button" onClick={cancelWorkout}>
                Training annuleren
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

          <label htmlFor="progress-exercise">Kies een oefening</label>
          <select
            id="progress-exercise"
            value={selectedExercise}
            onChange={(event) => setSelectedExercise(event.target.value)}
          >
            <option value="">Selecteer een oefening</option>
            {exerciseNames
              .filter((name) =>
                workouts.some((workout) =>
                  workout.exercises.some((exercise) => exercise.name === name),
                ),
              )
              .map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
          </select>

          {!selectedExercise ? (
            <p className="subtitle">Selecteer een oefening om je resultaten te bekijken.</p>
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
                  entries={selectedExerciseHistory}
                  metric={selectedMetric}
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
        </section>
      )}

    </main>
  )
}

export default App
