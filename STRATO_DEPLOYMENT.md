# STRATO: LAB und PROD

Die Projektzentrale läuft auf klassischem STRATO-Webhosting als gebaute React/Vite-App plus PHP-Backend. Login und gemeinsame Projektdaten liegen in einer STRATO-MySQL/MariaDB-Datenbank. GitHub enthält Quellcode und Deployment-Workflows, aber keine Datenbank-Passwörter.

## Zielarchitektur

Es gibt zwei vollständig getrennte Umgebungen:

### LAB / Test

- Beispiel: `http://betruungmachtschule.binder-lab.com/`
- eigener STRATO-Webordner
- eigene LAB-Datenbank
- eigenes `api/private/config.php`
- neue Quellcode-Änderungen dürfen hier automatisch veröffentlicht werden
- LAB-Builds zeigen rechts oben den Hinweis `LAB · TESTUMGEBUNG`

### PROD / Live

- spätere endgültige Domain oder Subdomain
- eigener STRATO-Webordner
- eigene PROD-Datenbank
- eigenes `api/private/config.php`
- keine automatische Veröffentlichung bei normalen Code-Änderungen
- veröffentlicht wird ausschließlich eine ausdrücklich freigegebene, zuvor im LAB getestete Git-Commit-Version

LAB und PROD dürfen niemals dieselbe Datenbank verwenden. Dadurch können Tests, Benutzerkonten und Testdaten die Live-Daten nicht beschädigen.

## GitHub Workflows

### `Build STRATO package`

Erzeugt nur ein ZIP/Artifact. Dieser Workflow veröffentlicht nichts auf STRATO.

### `Deploy LAB to STRATO`

Wird bei relevanten Änderungen auf `main` automatisch gebaut. Sind die LAB-SFTP-Secrets vorhanden, wird die neue Version anschließend auf die LAB-Seite übertragen. `api/private/config.php` wird beim Deployment nicht überschrieben.

Ein erneuter LAB-Deploy ohne Codeänderung kann durch eine Änderung an `.deploy/lab-trigger.txt` ausgelöst werden.

### `Deploy tested version to PROD`

PROD wird nicht bei normalen Änderungen aktualisiert. In `.deploy/production-source.txt` wird die exakte 40-stellige Commit-SHA der im LAB geprüften Version eingetragen. Nur eine Änderung dieser Datei startet den Produktions-Workflow.

Der Produktions-Workflow checkt exakt diese Commit-Version aus, baut sie neu für PROD und lädt sie hoch. Dadurch kann nicht versehentlich ein neuerer, noch ungeprüfter Stand live gehen.

## GitHub Secrets

Unter **Repository → Settings → Secrets and variables → Actions** werden folgende Werte einmalig hinterlegt.

### LAB

- `STRATO_LAB_HOST`
- `STRATO_LAB_USER`
- `STRATO_LAB_PASSWORD`
- `STRATO_LAB_REMOTE_PATH`

### PROD

- `STRATO_PROD_HOST`
- `STRATO_PROD_USER`
- `STRATO_PROD_PASSWORD`
- `STRATO_PROD_REMOTE_PATH`

Die Werte werden niemals in Quellcode oder Chat geschrieben.

Am einfachsten sind zwei getrennte STRATO-SFTP-Zugänge, deren Startverzeichnis jeweils direkt auf den LAB- bzw. PROD-Ordner zeigt. Dann kann `*_REMOTE_PATH` jeweils `.` sein.

## Erstinstallation einer Umgebung

Nach dem ersten Upload einer Umgebung einmal deren `api/setup.php` öffnen. Dort werden die Datenbankdaten dieser Umgebung und das erste Admin-Konto eingerichtet.

Die Setup-Seite erzeugt die benötigten Tabellen und schreibt `api/private/config.php` nur auf den jeweiligen STRATO-Webspace. Diese Datei wird bei späteren GitHub-Deployments ausdrücklich ausgespart.

Für LAB und PROD muss `setup.php` jeweils mit der passenden, getrennten Datenbank durchgeführt werden.

## Empfohlener Arbeitsablauf

1. Änderungen werden im GitHub-Repository erstellt.
2. GitHub baut und veröffentlicht automatisch ins LAB, sobald die LAB-Secrets eingerichtet sind.
3. Funktion auf der LAB-Seite mit Testdaten prüfen.
4. Wenn die Version freigegeben ist, wird die erfolgreiche LAB-Commit-SHA als Produktionsquelle festgelegt.
5. GitHub baut genau diese geprüfte Version für PROD und veröffentlicht sie dort.

Damit kann die Veröffentlichung künftig aus dem Chat angestoßen werden: Für LAB wird der LAB-Trigger aktualisiert. Für PROD wird zuerst der letzte erfolgreiche LAB-Stand ermittelt und anschließend genau dessen Commit-SHA in `.deploy/production-source.txt` eingetragen.

## Wichtige Sicherheitsregeln

- `api/private/config.php` niemals in GitHub hochladen.
- Datenbank- und SFTP-Passwörter niemals im Chat oder Repository posten.
- LAB und PROD verwenden getrennte Datenbanken.
- PROD nur nach erfolgreichem LAB-Test veröffentlichen.
- Solange die Seite nur über HTTP erreichbar ist, keine sensiblen Kinder-, Personal- oder Vertragsdaten in der Anwendung speichern. Vor echtem Team-/Produktivbetrieb sollte HTTPS eingerichtet werden.

## Build-Metadaten

Jeder LAB- und PROD-Build enthält eine Datei `deployment-info.json` mit Umgebung, Git-Commit und Build-Zeitpunkt. Damit lässt sich später eindeutig nachvollziehen, welche Quellcode-Version tatsächlich auf STRATO liegt.
