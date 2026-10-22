
import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, supabaseConfigured } from './supabase'

export default function GoogleLogin() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(supabaseConfigured)
  const [error, setError] = useState('')

  useEffect(() => {
    const client = supabase
    if (!client) return

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    void client.auth
      .getSession()
      .then(({ data, error: sessionError }) => {
        if (sessionError) {
          setError(sessionError.message)
        } else {
          setUser(data.session?.user ?? null)
        }
        setLoading(false)
      })
      .catch((sessionError: unknown) => {
        setError(
          sessionError instanceof Error
            ? sessionError.message
            : 'Sessie kon niet worden geladen.',
        )
        setLoading(false)
      })

    return () => subscription.unsubscribe()
  }, [])

 

async function signInWithGoogle() {
  console.log('Google-loginfunctie aangeroepen')
  setError('')

  const client = supabase
  if (!client) {
    setError('Supabase-accountaanmelding is niet ingesteld.')
    return
  }

  const redirectTo = 'https://strongjan.github.io/StrongJan/'
  console.log('redirectTo:', redirectTo)

  const { error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  })

  if (error) setError(error.message)
}


  async function signOut() {
    setError('')

    const client = supabase
    if (!client) {
      setError('Supabase-accountaanmelding is niet ingesteld.')
      return
    }

    const { error } = await client.auth.signOut()

    if (error) setError(error.message)
  }

  if (!supabaseConfigured || !supabase) {
    return (
      <section className="google-login">
        <p>Supabase-accountaanmelding is niet ingesteld.</p>
      </section>
    )
  }

  if (loading) {
    return <p>Inloggen controleren...</p>
  }

  return (
    <section className="google-login">
      {user ? (
        <>
          <p>
            Ingelogd als{' '}
            {user.email ?? user.user_metadata?.full_name ?? 'gebruiker'}
          </p>

          <button type="button" onClick={signOut}>
            Uitloggen
          </button>
        </>
      ) : (
        <button type="button" onClick={signInWithGoogle}>
          Inloggen met Google
        </button>
      )}

      {error && <p role="alert">Fout: {error}</p>}
    </section>
  )
}
