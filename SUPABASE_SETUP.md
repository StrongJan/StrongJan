# Supabase-account en synchronisatie instellen

1. Maak een project aan in Supabase.
2. Kopieer de Project URL en de anon/publishable key naar een nieuw `.env`-bestand in de projectroot (naast `package.json`):

   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-supabase-anon-or-publishable-key
   ```

   Gebruik `.env.example` als voorbeeld. Zet nooit een `service_role`-key in de frontend.
3. Open **SQL Editor** in Supabase, plak de inhoud van [`supabase/schema.sql`](./supabase/schema.sql) en voer het script uit. Dit maakt een persoonlijke tabel met Row Level Security en een privéopslagbucket voor progressiefoto’s. Gebruikers kunnen alleen hun eigen gegevens en foto’s lezen, uploaden en verwijderen.
4. Schakel in Supabase onder **Authentication → Providers** e-mail/wachtwoord in.
5. Voor Google-login: schakel de Google-provider in, maak OAuth-gegevens aan in Google Cloud en configureer de Client ID en Client Secret in Supabase. Gebruik als Google OAuth-redirect-URI de callback-URL die Supabase bij de Google-provider toont.
6. Voeg de lokale app-URL (bijvoorbeeld `http://localhost:5173`) en de uiteindelijke productie-URL toe aan **Authentication → URL Configuration → Redirect URLs**. Dit zijn toegestane terugkeeradressen van de app; ze vervangen niet de Google callback-URL uit stap 5.
7. Schakel realtime-wijzigingen in voor `public.user_data` via **Database → Publications → supabase_realtime**. De app gebruikt dit om wijzigingen van andere apparaten meteen op te halen.
8. Herstart de Vite-server nadat `.env` is aangemaakt of aangepast.

Na inloggen worden trainingen, presets, eigen oefeningen, presetmappen, lichaamsmetingen en fotomapgegevens in de accounttabel opgeslagen. De fotobestanden zelf staan in de privébucket `progress-photos`; alleen de eigenaar kan ze met een tijdelijke beveiligde link bekijken. Op een nieuw apparaat log je in met hetzelfde account om de gegevens en foto’s op te halen. Als er nog geen cloudgegevens zijn, wordt de lokale data van dat eerste apparaat eenmalig naar Supabase gekopieerd. Als er al cloudgegevens bestaan, worden die leidend en geladen op het apparaat.

Veranderingen worden automatisch opgeslagen en via realtime naar andere ingelogde apparaten gestuurd. Zonder account blijven gegevens alleen in de lokale browser. De kleurinstelling blijft lokaal per apparaat.
