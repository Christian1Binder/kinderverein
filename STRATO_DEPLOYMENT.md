# STRATO-Produktivbetrieb

Die Projektzentrale ist als statische React/Vite-App gebaut. Auf klassischem STRATO-Webhosting muss deshalb **kein Node.js-Server** laufen. STRATO liefert nur die fertigen HTML-, CSS- und JavaScript-Dateien aus. Die gemeinsamen Projektdaten, Anmeldung und Live-Synchronisierung laufen über Supabase.

## Zielarchitektur

- **STRATO Webhosting:** Website / Frontend
- **Supabase Auth:** Login per Magic Link
- **Supabase Postgres + RLS:** gemeinsamer Projektstand
- **Supabase Realtime:** Änderungen für andere angemeldete Teammitglieder sichtbar
- **GitHub:** Quellcode, Builds und optional automatische SFTP-Auslieferung

## 1. Supabase-Projekt einrichten

1. Ein eigenes Supabase-Projekt nur für diese Projektzentrale anlegen.
2. `supabase/schema.sql` im Supabase SQL Editor ausführen.
3. Unter Authentication die Produktiv-Domain als **Site URL** setzen, z. B. `https://projekt.example.de/`.
4. Dieselbe URL als erlaubte Redirect URL hinterlegen.
5. Teammitglieder in Supabase Auth anlegen bzw. einladen.

Die Anwendung nutzt `shouldCreateUser: false`. Eine beliebige E-Mail-Adresse kann daher über das Login-Formular **kein neues Konto selbst anlegen**. Nur bereits angelegte/eingeladene Nutzer können einen Magic Link erhalten und auf den gemeinsamen Datenbestand zugreifen.

## 2. GitHub Secrets für den Cloud-Build

Im Repository unter **Settings → Secrets and variables → Actions** anlegen:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Nur die Publishable-/Anon-Konfiguration gehört in den Browser-Build. **Nie** einen Supabase Secret Key oder Service-Role-Key in GitHub Pages, STRATO-Dateien oder Frontend-Code eintragen.

Sobald diese beiden Secrets vorhanden sind, erzeugt `.github/workflows/build-strato.yml` bei Quellcode-Änderungen automatisch ein fertiges Artifact `kinderverein-strato`.

## 3. STRATO per SFTP anbinden

Optional für automatische Deployments zusätzlich folgende GitHub Secrets hinterlegen:

- `STRATO_HOST` – personalisierter SFTP-Server aus dem STRATO Kunden-Login
- `STRATO_USER` – SFTP-Benutzername
- `STRATO_PASSWORD` – SFTP-Passwort
- `STRATO_REMOTE_PATH` – Zielverzeichnis der Domain, z. B. `.` oder ein Unterordner

Sind diese Werte vorhanden, lädt GitHub Actions den fertigen `dist-strato`-Build per SFTP auf Port 22 hoch. Fehlen die SFTP-Daten, wird nur das fertige Artifact erzeugt und kann manuell heruntergeladen und per SFTP hochgeladen werden.

## 4. Manuell bauen

Lokal eine `.env.production` anhand von `.env.example` anlegen und dann:

```bash
npm install
npm run build:strato
```

Der komplette Inhalt von `dist-strato/` wird anschließend in das STRATO-Webverzeichnis der gewünschten Domain geladen.

Der STRATO-Build verwendet relative Asset-Pfade. Dadurch funktioniert er sowohl direkt unter einer Domain als auch in einem Unterordner.

## 5. Benutzerzugang

Der produktive gemeinsame Datenbestand ist über Supabase Row-Level-Security nur für `authenticated` Nutzer freigegeben. Das Frontend zeigt bei aktiver Cloud-Konfiguration zunächst den Team-Login.

Die Teamliste innerhalb der Projektzentrale und die Supabase-Auth-Konten sind bewusst getrennt:

- **Teamliste:** Projektrolle, Verantwortungsbereich, Kontaktinformationen
- **Supabase Auth:** tatsächliche Zugangsberechtigung zur gemeinsamen Datenbank

Ein Teammitglied sollte daher erst in Supabase Auth angelegt/eingeladen und danach in der Projektzentrale als Person mit Rolle hinterlegt werden.

## 6. Gemeinsame Änderungen

Nach erfolgreichem Login wird derselbe Datensatz `kinderverein-main` verwendet. Änderungen an Aufgaben, Meilensteinen, Abstimmungen, Teamdaten, Dokumenten oder Projektfeed werden zentral gespeichert und über Supabase Realtime an andere angemeldete Browser übertragen.

## 7. Sicherheitsmodell dieser Version

Alle eingeladenen und angemeldeten Teamkonten können den Projektstand lesen und bearbeiten. Nicht angemeldete Nutzer können die Supabase-Daten weder lesen noch verändern.

Die sichtbaren Projektrollen wie „Projektleitung“, „Vorstand“ oder „Beteiligt“ sind derzeit organisatorische Rollen. Falls später unterschiedliche technische Rechte benötigt werden – z. B. nur Admins dürfen Meilensteine löschen, normale Mitglieder dürfen nur abstimmen – sollte die JSON-Gesamtdatenstruktur in getrennte Tabellen mit rollenbezogenen RLS-Regeln aufgeteilt werden.

## 8. DNS / Domain

Die App kann auf einer eigenen Subdomain wie `projekt.example.de` betrieben werden. Für Magic Links muss exakt die produktive HTTPS-Adresse in Supabase Auth als Site URL bzw. Redirect URL hinterlegt sein.
