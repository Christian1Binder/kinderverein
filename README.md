# WeKiB Portal

Gemeinsames Portal für die Gründung und spätere Organisation von WeKiB als gemeinnützigem Bildungsträger für Betreuung, Ganztag, Bildung und Jugendhilfe.

## Portalebenen

- **Öffentlich:** Homepage, Angebote, Informationen und Registrierung.
- **Mein WeKiB:** erweiterter Lesebereich für bestätigte, selbst registrierte Konten.
- **Gründung:** Aufgaben, Dokumente, Dateien, Termine, Umfragen, Entscheidungen und Aktivitäten.
- **Vorstand:** geschützter Vorstandsbereich; der Schatzmeister hat eine zusätzliche Finanzverwaltung.
- **CMS:** Baukasten für öffentliche und registrierte Inhalte sowie Mitgliederumfragen und Auswertung.
- **Administration:** Konten, Rollen und individuelle Sonderrechte.

Neue selbst registrierte Konten erhalten standardmäßig ausschließlich den Lesebereich. Interne Bereiche und Bearbeitungsrechte werden explizit administrativ freigeschaltet.

## Wichtige Funktionen

- STRATO-Login mit E-Mail-Bestätigung und Passwort-Reset
- rollen- und rechtebasierte Portalnavigation
- Vorschau als Besucher, registrierter Nutzer, Gründungsmitglied oder Vorstand
- Deep Links für Portal-Unterseiten
- hierarchischer Datei-Explorer mit Unterordnern, Mehrfach- und Ordnerupload
- mobiler Dokumentenscanner mit Mehrseitigkeit, Bearbeitung, PDF und OCR
- DOCX-Import und umfangreicher TipTap-Dokumenteditor mit Listen, Einrückung und Tabellen
- Finalisierung von Dokumenten in die Dateiablage
- Bild- und Textumfragen; Mitgliederumfragen mit einer Stimme pro Konto
- CMS mit Inhaltsbausteinen und Bildern
- Schatzmeisterbereich für Buchungen, Budgets und Finanzdateien
- responsives Light-/Dark-Design

## Technik

- React 18 + Vite
- PHP-Backend auf STRATO
- MySQL/MariaDB auf STRATO
- TipTap, Mammoth, jsPDF und Tesseract.js
- GitHub Actions für Build, LAB-Deployment und kontrollierte PROD-Promotion

## Lokal starten

```bash
npm ci
npm run dev
```

Lokal wird ohne Backend-Konfiguration ein Demo-Modus mit Local Storage verwendet.

## STRATO

```bash
npm run build:strato
```

Der STRATO-Build erzwingt das PHP-Backend und erzeugt `dist-strato/`. Details zu LAB/PROD und serverseitigen Konfigurationsdateien stehen in `STRATO_DEPLOYMENT.md`.

## Quellstruktur

- `src/` – Portal, CMS, Editor, Dateien, Scanner und Finanzverwaltung
- `api/` – Authentifizierung, Rechte, Dateien, E-Mail-Verifikation und Projektzustand
- `scripts/build-strato.mjs` – reproduzierbarer STRATO-Build
- `.github/workflows/` – ausschließlich dauerhafte Build-/Deployment-Workflows

Der spätere OGTS-Trägerwechsel bleibt fachlich eine separate Projektphase und wird nicht mit der rechtlichen Vereinsgründung vermischt.
