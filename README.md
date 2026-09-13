# Kinderverein · Projektzentrale

Responsive Projektplattform für die Gründung eines gemeinnützigen e.V. als professioneller Träger für Bildung, Betreuung und Jugendhilfe in Bayern.

## Enthalten

- Dashboard mit Gesamtfortschritt und aktuellen Prioritäten
- vollständiger 15-Phasen-Zeitstrahl vom Grundkonzept bis zur Trägerbereitschaft
- editierbare Meilensteine und Projektphasen
- Kanban-Aufgabenboard mit Verantwortlichen, Fälligkeiten und Prioritäten
- Team- und Rollenverwaltung
- Team-Abstimmungen, u. a. für die Namensentscheidung
- Projektfeed für kurze Zusammenarbeit
- Checkliste aller zentralen Gründungs- und Trägerunterlagen
- mobile Bottom-Navigation, Touch-optimierte Bedienung und responsive Kartenansichten
- optionaler Supabase-Cloudmodus mit Magic-Link-Login und Live-Synchronisierung
- lokaler Demo-/Offline-Modus via Local Storage

## Lokal starten

```bash
npm install
npm run dev
```

Ohne Umgebungsvariablen läuft die Anwendung vollständig lokal im Browser. Änderungen werden im Local Storage gespeichert.

## Gemeinsame Nutzung mit Supabase

1. Neues Supabase-Projekt anlegen.
2. `supabase/schema.sql` im Supabase SQL Editor ausführen.
3. In Supabase unter **Authentication** öffentliche Registrierungen deaktivieren bzw. nur gewünschte Teammitglieder einladen.
4. `.env.example` nach `.env.local` kopieren und Werte ergänzen:

```env
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

5. Entwicklungsserver neu starten.

Die Anwendung zeigt dann einen passwortlosen E-Mail-Login. Alle angemeldeten Nutzer sehen denselben Projektstand und Änderungen werden per Supabase Realtime synchronisiert.

> Wichtig: Der `anon` Key darf im Frontend verwendet werden. Niemals den Supabase `service_role` Key in dieses Repository oder in Vite-Umgebungsvariablen eintragen.

## GitHub Pages

Ein Workflow unter `.github/workflows/deploy-pages.yml` baut die Seite automatisch aus `main`.

Für den Cloudmodus müssen in den Repository-Secrets hinterlegt werden:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Danach in GitHub unter **Settings → Pages → Build and deployment** als Quelle **GitHub Actions** auswählen.

## Projektlogik

Die vorbefüllte Planung folgt dieser Reihenfolge:

1. Grundkonzept & Vereinsname
2. Vereinsstruktur
3. Satzungsentwurf
4. Satzung vorprüfen
5. Gründungsversammlung vorbereiten
6. Gründungsversammlung
7. Notar & Vereinsregister
8. Steuerliche Erfassung
9. Bank & Finanzorganisation
10. Versicherungen & Verwaltung
11. Arbeitgeberfähigkeit
12. Kinderschutz & Pädagogik
13. Finanz- & Personalplan
14. Betriebsbereitschaft
15. späterer OGTS-Trägerwechsel als bewusst getrennte Folgephase

## Technischer Stack

- React 18
- Vite
- Supabase Auth, Postgres und Realtime (optional)
- Lucide Icons
- CSS ohne UI-Framework, mobile-first und vollständig responsiv
