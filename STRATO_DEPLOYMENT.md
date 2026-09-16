# STRATO: LAB und PROD

WeKiB läuft als React/Vite-Frontend mit PHP-Backend und MySQL/MariaDB auf STRATO. GitHub enthält Quellcode und Build-/Deployment-Logik, aber keine produktiven Zugangsdaten.

## Umgebungen

### LAB

- `http://betruungmachtschule.binder-lab.com/`
- eigener Webordner und eigene Datenbank
- automatische Veröffentlichung relevanter Änderungen auf `main`
- sichtbarer LAB-Hinweis im Frontend

### PROD

- eigener Webordner und eigene Datenbank
- keine automatische Veröffentlichung normaler Commits
- veröffentlicht wird ausschließlich eine ausdrücklich ausgewählte, im LAB geprüfte Commit-SHA

LAB und PROD dürfen niemals dieselbe Datenbank verwenden.

## Dauerhafte GitHub-Workflows

- **Build STRATO package:** reproduzierbarer Build ohne Veröffentlichung
- **Deploy LAB to STRATO:** Build + automatische LAB-Übertragung
- **Deploy tested version to PROD:** kontrollierte Promotion einer exakten getesteten Commit-SHA

`.deploy/production-source.txt` bleibt solange `NOT_SET`, bis bewusst eine getestete Version für PROD freigegeben wird.

## Server-only Dateien

Diese Daten gehören ausschließlich auf den jeweiligen STRATO-Webspace und werden nicht aus GitHub deployed:

- `api/private/config.php` – Datenbank und App-Key
- `api/private/mail.php` – STRATO-SMTP-Zugang
- `api/private/uploads/` – hochgeladene Nutzdateien

Die Deployment-Workflows schließen diese Pfade ausdrücklich aus.

## GitHub Secrets

LAB: `STRATO_LAB_HOST`, `STRATO_LAB_USER`, `STRATO_LAB_PASSWORD`, `STRATO_LAB_REMOTE_PATH`

PROD: `STRATO_PROD_HOST`, `STRATO_PROD_USER`, `STRATO_PROD_PASSWORD`, `STRATO_PROD_REMOTE_PATH`

## Erstinstallation

Nach dem ersten Upload `api/setup.php` im jeweiligen Ziel öffnen und dort die Datenbank sowie das erste Admin-Konto einrichten. Die SMTP-Konfiguration wird anschließend über die geschützte Mail-Setup-Seite auf STRATO hinterlegt.

## Arbeitsablauf

1. Änderungen nach `main` bringen.
2. Automatischen LAB-Build und SFTP-Deploy prüfen.
3. Funktionen im LAB mit Testdaten testen.
4. Erst nach Freigabe die exakte getestete Commit-SHA als PROD-Quelle setzen.
5. PROD-Workflow kontrollieren.

## Sicherheit

Solange die LAB-Seite nur über HTTP erreichbar ist, keine sensiblen Kinder-, Personal-, Vertrags- oder echten Finanzdaten einpflegen. Für den späteren Echtbetrieb ist HTTPS erforderlich. Datenbank-, Mail- und SFTP-Passwörter niemals in GitHub oder Quellcode ablegen.
