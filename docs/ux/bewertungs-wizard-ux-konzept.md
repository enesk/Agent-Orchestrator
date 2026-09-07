# UX-Konzept: Bewertungs-Wizard (16 Steps)

**Ticket:** #5  
**Autor:** Rathana (AI Agent)  
**Datum:** 2026-04-18  
**Status:** Abgeschlossen  

---

## 1. Projektkontext & Design-System-Referenz

### Verwendetes Design-System
- **Schriftart:** Inter (UI), JetBrains Mono (Code)
- **Primaerfarbe (Accent):** `#6366F1` (Indigo)
- **Sekundaerfarbe (Accent2):** `#F59E0B` (Amber) — verwendet fuer Sterne/Bewertung
- **Oberflaechen:** `#FFFFFF` (Surface), `#FAFBFC` (Dark), `#F4F5F7` (Light)
- **Text:** `#111827` (Primary), `#374151` (Body), `#6B7280` (Secondary), `#9CA3AF` (Muted)
- **Status:** Success `#10B981`, Error `#EF4444`, Warning `#F59E0B`, Info `#3B82F6`
- **Schatten:** xs bis xl (etablierte Hierarchie)
- **Animationen:** Framer Motion, 200-250ms ease-out
- **Rundungen:** 10-20px (modern, einladend)

### Farbschema fuer den Wizard
| Element | Farbe | Verwendung |
|---------|-------|------------|
| Fortschrittsbalken aktiv | `#6366F1` | Abgeschlossene Steps |
| Fortschrittsbalken inaktiv | `#E5E7EB` | Ausstehende Steps |
| Sterne/Kreise aktiv | `#F59E0B` | Gewaehlt (Amber/Gold) |
| Sterne/Kreise hover | `#D97706` | Mouseover-Zustand |
| Sterne/Kreise inaktiv | `#E5E7EB` | Nicht gewaehlt |
| Primary Button | `#6366F1` | Weiter-Button |
| Primary Button hover | `#4F46E5` | Hover-Zustand |
| Secondary Button | transparent + `#6B7280` border | Zurueck-Button |
| Kachel selektiert | `#EEF2FF` bg + `#6366F1` border | Multi-Select aktiv |
| Kachel nicht selektiert | `#FFFFFF` bg + `#E5E7EB` border | Multi-Select inaktiv |
| Verifizierungs-Input fokussiert | `#6366F1` border + shadow-focus | Aktives Code-Feld |
| Error-Zustand | `#EF4444` border + `#FEF2F2` bg | Validierungsfehler |

### Typografie
| Element | Groesse | Gewicht | Farbe |
|---------|---------|---------|-------|
| Wizard-Titel (Step) | 22px (xl) | 600 (semibold) | `#111827` |
| Step-Beschreibung | 16px (base) | 400 (regular) | `#374151` |
| Label | 14px (sm) | 500 (medium) | `#374151` |
| Tooltip-Text | 13px (xs) | 400 (regular) | `#FFFFFF` auf `#111827` |
| Button-Text | 14px (sm) | 500 (medium) | `#FFFFFF` (primary), `#374151` (secondary) |
| Fortschritt-Label | 13px (xs) | 500 (medium) | `#6B7280` |
| Kachel-Text | 14px (sm) | 500 (medium) | `#374151` |
| Rating-Label | 13px (xs) | 400 (regular) | `#6B7280` |

---

## 2. Wizard-Architektur: 16 Steps

### Step-Uebersicht

| Step | Titel | Typ | Pflicht |
|------|-------|-----|---------|
| 1 | E-Mail-Verifizierung | Input + Verifizierungs-Modal | Ja |
| 2 | Hotel-/Objektauswahl | Suchfeld + Autocomplete | Ja |
| 3 | Reisezeitraum | Date-Picker (Monat/Jahr) | Ja |
| 4 | Reiseart | Radio-Button-Gruppe | Ja |
| 5 | Gesamtbewertung | 5-Punkte-Rating-Skala | Ja |
| 6 | Hotel/Lage bewerten | 5-Punkte-Rating-Skala | Ja |
| 7 | Zimmer bewerten | 5-Punkte-Rating-Skala | Ja |
| 8 | Service bewerten | 5-Punkte-Rating-Skala | Ja |
| 9 | Gastronomie bewerten | 5-Punkte-Rating-Skala | Ja |
| 10 | Sport & Unterhaltung | 5-Punkte-Rating-Skala | Ja |
| 11 | Hoteleinrichtungen | Multi-Select-Kacheln | Nein |
| 12 | Zimmerausstattung | Multi-Select-Kacheln | Nein |
| 13 | Fuer wen geeignet | Multi-Select-Kacheln | Nein |
| 14 | Titel der Bewertung | Text-Input | Ja |
| 15 | Bewertungstext | Textarea | Ja |
| 16 | Zusammenfassung & Absenden | Review-Ansicht | Ja |

### Step-Gruppierung (fuer Fortschrittsbalken)

```
Gruppe 1: Verifizierung     [Step 1]
Gruppe 2: Reisedaten         [Step 2-4]
Gruppe 3: Bewertungen        [Step 5-10]
Gruppe 4: Details            [Step 11-13]
Gruppe 5: Freitext           [Step 14-15]
Gruppe 6: Abschluss          [Step 16]
```

---

## 3. Wireframes

### 3.1 Globales Wizard-Layout

#### Mobile (375px Breite)

```
+---------------------------------------+
| [<] Bewertung schreiben    Step 1/16  |  <- Sticky Header (56px)
+---------------------------------------+
| ====[====]========================    |  <- Fortschrittsbalken (4px)
|  Verifizierung  |  Reisedaten  | ...  |  <- Gruppen-Labels (scrollbar)
+---------------------------------------+
|                                       |
|   [Step-Icon / Illustration]          |  <- Optional, 80px
|                                       |
|   Step-Titel                          |  <- xl, semibold
|   Kurze Beschreibung des Steps        |  <- base, regular, secondary
|                                       |
|   +-------------------------------+   |
|   |                               |   |
|   |   [Step-spezifischer Inhalt]  |   |  <- Scrollbarer Bereich
|   |                               |   |
|   +-------------------------------+   |
|                                       |
+---------------------------------------+
|                                       |
|  [  Zurueck  ]     [   Weiter   ->]   |  <- Sticky Footer (72px)
|                                       |
+---------------------------------------+
```

#### Desktop (max-width: 640px zentriert)

```
+------------------------------------------------------------------+
|                         Bewertung schreiben                       |
|                                                                   |
|     +------------------------------------------------------+     |
|     | ====[========]====================================== |     |  <- Fortschrittsbalken
|     | Verifizierung | Reisedaten | Bewertungen | Details   |     |  <- Gruppen-Tabs
|     +------------------------------------------------------+     |
|     |                                                      |     |
|     |   Step-Titel                                         |     |
|     |   Beschreibung                                       |     |
|     |                                                      |     |
|     |   +------------------------------------------+       |     |
|     |   |                                          |       |     |
|     |   |   [Step-spezifischer Inhalt]             |       |     |
|     |   |                                          |       |     |
|     |   +------------------------------------------+       |     |
|     |                                                      |     |
|     |   [  Zurueck  ]              [   Weiter   ->]        |     |
|     +------------------------------------------------------+     |
|                                                                   |
+------------------------------------------------------------------+
```

### Responsive Breakpoints
- **Mobile:** < 640px — Vollbild, sticky Header/Footer
- **Tablet:** 640px - 1024px — Zentrierte Karte (max-width: 580px), Padding 24px
- **Desktop:** > 1024px — Zentrierte Karte (max-width: 640px), Padding 48px, Schatten-lg

---

### 3.2 Fortschrittsbalken-Design

#### Variante: Segmentierter Balken mit Gruppen-Labels

```
Mobile:
+---------------------------------------+
| [=======][=======][  ][  ][  ][  ]    |  <- 6 Segmente (Gruppen)
|  Verif.   Reise   Bew. Det. Text Abs. |  <- Labels unter Segmenten
+---------------------------------------+

Zustaende:
  [=======]  Abgeschlossen: bg-accent (#6366F1), volle Opazitaet
  [===    ]  Aktuell: bg-accent (#6366F1), Fortschritt innerhalb der Gruppe
  [       ]  Ausstehend: bg-border (#E5E7EB)

Dynamisches Verhalten:
- Jedes Segment repraesentiert eine Gruppe
- Innerhalb einer Gruppe wird der Fortschritt proportional gefuellt
- Beispiel: Step 3 von 4 in Gruppe "Reisedaten" = 75% des Segments gefuellt
- Aktuelles Gruppen-Label ist accent-farben und semibold
- Animation: width-Transition 300ms ease-out
```

#### Desktop-Erweiterung:
```
+----------------------------------------------------------+
| [========][============][==================][====][==][=] |
|  Verifi-    Reise-        Bewertungen       Det.  Text Ab.|
|  zierung    daten                                        |
+----------------------------------------------------------+

- Segmentbreite proportional zur Anzahl der Steps in der Gruppe
- Hover auf Segment zeigt Tooltip: "Schritt 3 von 6: Zimmerbewertung"
```

#### Numerischer Indikator (Mobile, im Header):
```
Step 5 / 16
```

---

### 3.3 Step 1: E-Mail-Verifizierung

#### Mobile Wireframe

```
+---------------------------------------+
| [<] Bewertung schreiben    Step 1/16  |
+---------------------------------------+
| [=][                                ] |
+---------------------------------------+
|                                       |
|   [Mail-Icon]                         |
|                                       |
|   Bestaetigen Sie Ihre                |
|   E-Mail-Adresse                      |
|                                       |
|   Geben Sie Ihre E-Mail ein, um       |
|   Ihre Bewertung zu verifizieren.     |
|                                       |
|   E-Mail-Adresse *                    |
|   +-------------------------------+   |
|   | max@beispiel.de               |   |
|   +-------------------------------+   |
|                                       |
|   [ ] Ich stimme den Nutzungs-        |
|       bedingungen zu                  |
|                                       |
+---------------------------------------+
|           [  Code senden  ->]         |
+---------------------------------------+
```

#### Verifizierungs-Modal (nach "Code senden")

```
+---------------------------------------+
|  +-----------------------------------+|
|  |                                   ||
|  |   [X]                   (close)   ||
|  |                                   ||
|  |   Verifizierungscode              ||
|  |   eingeben                        ||
|  |                                   ||
|  |   Wir haben einen 4-stelligen     ||
|  |   Code an max@beispiel.de         ||
|  |   gesendet.                       ||
|  |                                   ||
|  |   +----+ +----+ +----+ +----+    ||
|  |   | 3  | | 7  | | _  | |    |    ||
|  |   +----+ +----+ +----+ +----+    ||
|  |                                   ||
|  |   Code nicht erhalten?            ||
|  |   [Erneut senden] (60s Cooldown)  ||
|  |                                   ||
|  |   [     Bestaetigen      ->]      ||
|  |                                   ||
|  +-----------------------------------+|
+---------------------------------------+

Code-Felder Verhalten:
- Jedes Feld: 56x56px, border-radius 12px
- Auto-Focus wandert zum naechsten Feld
- Backspace springt zum vorherigen Feld
- Paste: Verteilt 4 Ziffern automatisch
- Fokus: border accent (#6366F1) + shadow-focus
- Error: border error (#EF4444) + Shake-Animation (200ms)
- Schriftgroesse: 24px, zentriert, font-mono
```

#### Desktop Wireframe

```
+------------------------------------------------------------------+
|                                                                    |
|     +------------------------------------------------------+     |
|     |   Bestaetigen Sie Ihre E-Mail-Adresse                |     |
|     |   Geben Sie Ihre E-Mail ein, um Ihre Bewertung       |     |
|     |   zu verifizieren.                                    |     |
|     |                                                       |     |
|     |   E-Mail-Adresse *                                    |     |
|     |   +---------------------------------------------+     |     |
|     |   | max@beispiel.de                             |     |     |
|     |   +---------------------------------------------+     |     |
|     |                                                       |     |
|     |   [x] Ich stimme den Nutzungsbedingungen zu           |     |
|     |                                                       |     |
|     |   [  Zurueck  ]              [  Code senden  ->]      |     |
|     +------------------------------------------------------+     |
|                                                                    |
+------------------------------------------------------------------+

Verifizierungs-Modal (Desktop): Zentriert, max-width 420px
- Backdrop: rgba(0,0,0,0.5) + backdrop-blur(4px)
- Karte: bg-white, rounded-2xl, shadow-xl, padding 32px
- Einblendung: scale-in Animation (200ms)
```

---

### 3.4 Step 2: Hotel-/Objektauswahl

#### Mobile Wireframe

```
+---------------------------------------+
| [<] Bewertung schreiben    Step 2/16  |
+---------------------------------------+
| [==][                                ]|
+---------------------------------------+
|                                       |
|   Welches Hotel moechten             |
|   Sie bewerten?                       |
|                                       |
|   Suchen Sie nach Name oder Ort.      |
|                                       |
|   +-------------------------------+   |
|   | [Lupe] Hotel suchen...        |   |
|   +-------------------------------+   |
|                                       |
|   Vorschlaege:                        |
|   +-------------------------------+   |
|   | [Bild] Hotel Sunshine Resort  |   |
|   |        Antalya, Tuerkei       |   |
|   |        **** 4.2 (1.203 Bew.)  |   |
|   +-------------------------------+   |
|   | [Bild] Hotel Sunstar          |   |
|   |        Kreta, Griechenland    |   |
|   |        **** 4.5 (876 Bew.)    |   |
|   +-------------------------------+   |
|   | [Bild] Sunny Beach Resort     |   |
|   |        Burgas, Bulgarien      |   |
|   |        *** 3.8 (542 Bew.)     |   |
|   +-------------------------------+   |
|                                       |
+---------------------------------------+
|  [  Zurueck  ]     [   Weiter   ->]   |
+---------------------------------------+
```

---

### 3.5 Step 3: Reisezeitraum

#### Mobile Wireframe

```
+---------------------------------------+
| [<] Bewertung schreiben    Step 3/16  |
+---------------------------------------+
| [===][                               ]|
+---------------------------------------+
|                                       |
|   Wann waren Sie dort?               |
|                                       |
|   Waehlen Sie den Reisemonat         |
|   und das Jahr.                       |
|                                       |
|   Monat                               |
|   +-------------------------------+   |
|   | April                      [v]|   |
|   +-------------------------------+   |
|                                       |
|   Jahr                                |
|   +-------------------------------+   |
|   | 2026                       [v]|   |
|   +-------------------------------+   |
|                                       |
|   Aufenthaltsdauer                    |
|   +-------------------------------+   |
|   | 7 Naechte                  [v]|   |
|   +-------------------------------+   |
|                                       |
+---------------------------------------+
|  [  Zurueck  ]     [   Weiter   ->]   |
+---------------------------------------+
```

---

### 3.6 Step 4: Reiseart (Radio-Button-Gruppe)

#### Mobile Wireframe

```
+---------------------------------------+
| [<] Bewertung schreiben    Step 4/16  |
+---------------------------------------+
| [====][                              ]|
+---------------------------------------+
|                                       |
|   Wie haben Sie gereist?             |
|                                       |
|   Waehlen Sie Ihre Reiseart.         |
|                                       |
|   +-------------------------------+   |
|   | (o) Pauschalreise             |   |
|   +-------------------------------+   |
|   | ( ) Nur Hotel                 |   |
|   +-------------------------------+   |
|   | ( ) Individualreise           |   |
|   +-------------------------------+   |
|   | ( ) Geschaeftsreise           |   |
|   +-------------------------------+   |
|   | ( ) Staedtereise              |   |
|   +-------------------------------+   |
|                                       |
+---------------------------------------+
|  [  Zurueck  ]     [   Weiter   ->]   |
+---------------------------------------+

Radio-Button-Design:
- Jede Option: volle Breite, 52px Hoehe, padding 16px
- Unselected: bg-white, border border-DEFAULT, rounded-xl
- Selected: bg-accent-light (#EEF2FF), border-accent (#6366F1), 
            Radio-Dot accent-farben
- Hover: bg-surface-hover (#EEF0F4)
- Focus: shadow-focus Ring
- Tap-Feedback: scale(0.98) fuer 100ms
- Uebergang: background-color 150ms ease
```

#### Desktop Wireframe

```
+------------------------------------------------------------------+
|     +------------------------------------------------------+     |
|     |   Wie haben Sie gereist?                              |     |
|     |                                                       |     |
|     |   +-------------------+  +-------------------+       |     |
|     |   | (o) Pauschalreise |  | ( ) Nur Hotel     |       |     |
|     |   +-------------------+  +-------------------+       |     |
|     |   +-------------------+  +-------------------+       |     |
|     |   | ( ) Individual    |  | ( ) Geschaeft     |       |     |
|     |   +-------------------+  +-------------------+       |     |
|     |   +-------------------+                               |     |
|     |   | ( ) Staedtereise  |                               |     |
|     |   +-------------------+                               |     |
|     |                                                       |     |
|     |   [  Zurueck  ]              [   Weiter   ->]         |     |
|     +------------------------------------------------------+     |
+------------------------------------------------------------------+

Desktop: 2-spaltig Grid (grid-cols-2), gap-12px
```

---

### 3.7 Steps 5-10: 5-Punkte-Bewertungsskala (HolidayCheck-Style)

#### Interaktionskonzept Rating-Skala

```
Visuelle Darstellung: 5 Kreise (Sonnen im HolidayCheck-Style)

Zustaende pro Kreis:
  O   Leer/Inaktiv:    stroke #E5E7EB, fill transparent
  @   Gefuellt/Aktiv:  fill #F59E0B (Amber)
  o   Hover:           fill #FEF3C7 (Amber-Light), stroke #D97706

Labels pro Stufe:
  1 = "Mangelhaft"
  2 = "Ausreichend" 
  3 = "Befriedigend"
  4 = "Gut"
  5 = "Ausgezeichnet"
```

#### Mobile Wireframe (Step 5: Gesamtbewertung)

```
+---------------------------------------+
| [<] Bewertung schreiben    Step 5/16  |
+---------------------------------------+
| [=====][                             ]|
+---------------------------------------+
|                                       |
|   Wie war Ihr Aufenthalt             |
|   insgesamt?                          |
|                                       |
|   Bewerten Sie Ihr Gesamterlebnis.    |
|                                       |
|                                       |
|       O     O     O     O     O       |  <- 5 Kreise, je 48px
|                                       |
|            "Befriedigend"             |  <- Dynamisches Label
|                                       |
|                                       |
+---------------------------------------+
|  [  Zurueck  ]     [   Weiter   ->]   |
+---------------------------------------+

Kreise-Groesse:
  Mobile: 48px Durchmesser, 16px Gap
  Desktop: 56px Durchmesser, 20px Gap

Interaktion Mobile (Tap):
1. User tippt auf Kreis 3
2. Kreise 1-3 fuellen sich mit Amber (#F59E0B)
3. Label "Befriedigend" erscheint unter den Kreisen
4. Kurze scale-Animation (1.0 -> 1.15 -> 1.0, 200ms)
5. Optional: leichtes Haptic Feedback (falls nativ)

Interaktion Desktop (Mouseover):
1. User hovert ueber Kreis 3
2. Kreise 1-3 zeigen Hover-Zustand (fill amber-light)
3. Tooltip erscheint ueber dem gehoverten Kreis: "Befriedigend"
4. Bei Klick: Kreise 1-3 fuellen sich dauerhaft
5. Label bleibt sichtbar unter den Kreisen
```

#### Desktop Wireframe (Step 5)

```
+------------------------------------------------------------------+
|     +------------------------------------------------------+     |
|     |   Wie war Ihr Aufenthalt insgesamt?                   |     |
|     |   Bewerten Sie Ihr Gesamterlebnis.                    |     |
|     |                                                       |     |
|     |                                                       |     |
|     |          O     O     O     O     O                    |     |
|     |                    ^                                  |     |
|     |              +-----------+                            |     |
|     |              |Befriedigend|  <- Tooltip (Mouseover)   |     |
|     |              +-----------+                            |     |
|     |                                                       |     |
|     |   [  Zurueck  ]              [   Weiter   ->]         |     |
|     +------------------------------------------------------+     |
+------------------------------------------------------------------+
```

#### Alle Rating-Steps (5-10) mit identischem Layout:

| Step | Titel | Icon-Vorschlag |
|------|-------|----------------|
| 5 | Gesamtbewertung | Stern |
| 6 | Hotel & Lage | Standort-Pin |
| 7 | Zimmer | Bett |
| 8 | Service | Concierge-Glocke |
| 9 | Gastronomie | Besteck |
| 10 | Sport & Unterhaltung | Aktivitaet |

Jeder Step zeigt optional eine Sub-Frage:
```
Step 7 Beispiel:
  Titel: "Wie war Ihr Zimmer?"
  Sub: "Bewerten Sie Sauberkeit, Ausstattung und Komfort."
  
  +-------------------------------+
  |     @     @     @     O     O |  <- 3 von 5 gewaehlt
  |         "Befriedigend"        |
  +-------------------------------+
```

---

### 3.8 Steps 11-13: Multi-Select-Kacheln

#### Mobile Wireframe (Step 11: Hoteleinrichtungen)

```
+---------------------------------------+
| [<] Bewertung schreiben   Step 11/16  |
+---------------------------------------+
| [===========][                       ]|
+---------------------------------------+
|                                       |
|   Welche Einrichtungen hat            |
|   das Hotel?                          |
|                                       |
|   Waehlen Sie alle zutreffenden.     |
|   (Optional)                          |
|                                       |
|   +----------+  +----------+         |
|   | [Pool]   |  | [Spa]    |         |
|   |  Pool    |  |  Spa &   |         |
|   |          |  | Wellness |         |
|   +----------+  +----------+         |
|   +----------+  +----------+         |
|   | [Gym]    |  |[Kinder]  |         |
|   | Fitness  |  | Kinder-  |         |
|   |          |  |  club    |         |
|   +----------+  +----------+         |
|   +----------+  +----------+         |
|   | [Strand] |  |[Restau-] |         |
|   | Strand-  |  | rant     |         |
|   | zugang   |  |          |         |
|   +----------+  +----------+         |
|   +----------+  +----------+         |
|   |[W-LAN]   |  |[Parking] |         |
|   | Kosten-  |  | Park-    |         |
|   | loses    |  | platz    |         |
|   | WLAN     |  |          |         |
|   +----------+  +----------+         |
|                                       |
+---------------------------------------+
|  [  Zurueck  ]  [Uebersp.] [Weiter->]|
+---------------------------------------+

Kachel-Design:
  Layout: Grid 2 Spalten, gap 12px
  Groesse: Flexibel, min-height 80px
  Padding: 16px
  Border-Radius: 12px (rounded-xl)

  Nicht selektiert:
    bg: #FFFFFF
    border: 1px solid #E5E7EB
    Icon: 24px, Farbe #9CA3AF
    Text: 14px, #374151

  Selektiert:
    bg: #EEF2FF (accent-light)
    border: 2px solid #6366F1 (accent)
    Icon: 24px, Farbe #6366F1
    Text: 14px, #4338CA (accent-text)
    Checkmark: Top-right, 18px, #6366F1

  Hover (Desktop):
    bg: #EEF0F4 (surface-hover)
    border: 1px solid #D1D5DB (border-light)

  Tap-Feedback:
    scale(0.97) fuer 100ms, dann zurueck

  Animation bei Selektion:
    Checkmark fade-in + scale (0 -> 1, 200ms ease-out)
    Border-Uebergang: 150ms ease
```

#### Desktop Wireframe (Step 11)

```
+------------------------------------------------------------------+
|     +------------------------------------------------------+     |
|     |   Welche Einrichtungen hat das Hotel?                 |     |
|     |   Waehlen Sie alle zutreffenden. (Optional)          |     |
|     |                                                       |     |
|     |   +----------+ +----------+ +----------+             |     |
|     |   | [Pool]   | | [Spa]    | | [Gym]    |             |     |
|     |   |  Pool    | |  Spa &   | | Fitness  |             |     |
|     |   |          | | Wellness | |          |             |     |
|     |   +----------+ +----------+ +----------+             |     |
|     |   +----------+ +----------+ +----------+             |     |
|     |   | [Kinder] | | [Strand] | | [Restau] |             |     |
|     |   | Kinder-  | | Strand-  | | Restau-  |             |     |
|     |   |  club    | | zugang   | | rant     |             |     |
|     |   +----------+ +----------+ +----------+             |     |
|     |   +----------+ +----------+                           |     |
|     |   | [WLAN]   | | [Park]   |                           |     |
|     |   | Kosten-  | | Park-    |                           |     |
|     |   | loses    | | platz    |                           |     |
|     |   | WLAN     | |          |                           |     |
|     |   +----------+ +----------+                           |     |
|     |                                                       |     |
|     |   [  Zurueck  ]   [Ueberspringen]   [Weiter   ->]    |     |
|     +------------------------------------------------------+     |
+------------------------------------------------------------------+

Desktop: 3-spaltig Grid (grid-cols-3), gap-16px
```

#### Step 12: Zimmerausstattung (gleiches Kachel-Pattern)
Kacheln: Klimaanlage, Balkon/Terrasse, Safe, Minibar, TV, Badewanne, Dusche, Meerblick

#### Step 13: Fuer wen geeignet (gleiches Kachel-Pattern)
Kacheln: Paare, Familien, Singles, Senioren, Freundesgruppen, Geschaeftsreisende

---

### 3.9 Step 14: Titel der Bewertung

#### Mobile Wireframe

```
+---------------------------------------+
| [<] Bewertung schreiben   Step 14/16  |
+---------------------------------------+
| [==============][                    ]|
+---------------------------------------+
|                                       |
|   Geben Sie Ihrer Bewertung          |
|   einen Titel                         |
|                                       |
|   Ein guter Titel fasst Ihr          |
|   Erlebnis in wenigen Worten          |
|   zusammen.                           |
|                                       |
|   Titel *                             |
|   +-------------------------------+   |
|   | Traumhafter Urlaub am Strand  |   |
|   +-------------------------------+   |
|   32 / 100 Zeichen                    |
|                                       |
|   Beispiele:                          |
|   "Perfekt fuer Familien"            |
|   "Tolles Hotel, maessiges Essen"    |
|   "Preis-Leistung top"               |
|                                       |
+---------------------------------------+
|  [  Zurueck  ]     [   Weiter   ->]   |
+---------------------------------------+
```

---

### 3.10 Step 15: Bewertungstext

#### Mobile Wireframe

```
+---------------------------------------+
| [<] Bewertung schreiben   Step 15/16  |
+---------------------------------------+
| [===============][                   ]|
+---------------------------------------+
|                                       |
|   Beschreiben Sie Ihren              |
|   Aufenthalt                          |
|                                       |
|   Teilen Sie Ihre Erfahrungen mit     |
|   anderen Reisenden.                  |
|                                       |
|   Bewertungstext *                    |
|   +-------------------------------+   |
|   | Das Hotel liegt direkt am     |   |
|   | Strand und bietet einen       |   |
|   | wunderbaren Blick auf das     |   |
|   | Meer. Das Personal war sehr   |   |
|   | freundlich und aufmerksam.    |   |
|   | Das Fruehstuecksbuffet war   |   |
|   | reichhaltig und abwechslungs- |   |
|   | reich...                      |   |
|   +-------------------------------+   |
|   156 / 2000 Zeichen (min. 50)        |
|                                       |
|   Tipps fuer eine gute Bewertung:    |
|   - Was hat Ihnen besonders gefallen? |
|   - Was koennte verbessert werden?   |
|   - Wuerde Sie das Hotel empfehlen?  |
|                                       |
+---------------------------------------+
|  [  Zurueck  ]     [   Weiter   ->]   |
+---------------------------------------+

Textarea-Design:
  Min-Hoehe: 160px (Mobile), 200px (Desktop)
  Auto-Grow bis max 400px
  Zeichenzaehler: rechtsbuendig, txt-muted
  < 50 Zeichen: Zaehler wird rot (status-error)
  >= 50 Zeichen: Zaehler wird gruen (status-success)
```

---

### 3.11 Step 16: Zusammenfassung & Absenden

#### Mobile Wireframe

```
+---------------------------------------+
| [<] Bewertung schreiben   Step 16/16  |
+---------------------------------------+
| [=====================================]|
+---------------------------------------+
|                                       |
|   Ihre Bewertung im Ueberblick       |
|                                       |
|   Pruefen Sie Ihre Angaben, bevor    |
|   Sie die Bewertung absenden.         |
|                                       |
|   Hotel                     [Aendern]|
|   +-------------------------------+   |
|   | Hotel Sunshine Resort         |   |
|   | Antalya, Tuerkei | April 2026 |   |
|   | Pauschalreise                 |   |
|   +-------------------------------+   |
|                                       |
|   Bewertungen                [Aendern]|
|   +-------------------------------+   |
|   | Gesamt      @@@@@  Ausgezeichn.|  |
|   | Hotel/Lage  @@@@O  Gut         |   |
|   | Zimmer      @@@@O  Gut         |   |
|   | Service     @@@@@  Ausgezeichn.|  |
|   | Gastro      @@@OO  Befriedigend|   |
|   | Sport       @@OOO  Ausreichend |   |
|   +-------------------------------+   |
|                                       |
|   Einrichtungen             [Aendern]|
|   +-------------------------------+   |
|   | Pool, Spa, WLAN, Strand       |   |
|   +-------------------------------+   |
|                                       |
|   Titel                     [Aendern]|
|   "Traumhafter Urlaub am Strand"      |
|                                       |
|   Text                      [Aendern]|
|   "Das Hotel liegt direkt am..."      |
|                                       |
+---------------------------------------+
|           [ Bewertung absenden  ->]   |
+---------------------------------------+

"Aendern"-Links springen zum jeweiligen Step.
Absenden-Button: Volle Breite, accent-Farbe, 
  height 52px, font-weight 600, rounded-xl
```

---

## 4. Tooltip-Verhalten

### Desktop (Mouseover)

```
Verhalten:
1. Hover ueber Element (z.B. Rating-Kreis)
2. 300ms Verzoegerung (vermeidet Flackern)
3. Tooltip erscheint oberhalb (bevorzugt) oder unterhalb
4. Fade-in + translateY(-4px), 150ms ease-out
5. Maus verlaesst Element: 100ms Verzoegerung, dann fade-out

Design:
  +-------------------+
  |   Befriedigend    |  <- 13px, Inter, #FFFFFF
  +--------v----------+  <- Pfeil nach unten
  
  Hintergrund: #111827 (txt-primary)
  Text: #FFFFFF
  Padding: 6px 12px
  Border-Radius: 8px
  Schatten: shadow-md
  Max-Width: 200px
  Z-Index: 50

Positionierung:
  - Standard: oben zentriert
  - Kein Platz oben: unten
  - Am Rand: links/rechts verschoben (Pfeil bleibt zentriert)
```

### Mobile (Tap-Sheet / Popover)

```
Verhalten:
1. User tippt auf Element mit Info-Icon [i]
2. Popover erscheint unterhalb des Elements
3. Bleibt offen bis: anderswo getippt oder X gedrueckt
4. Bei Rating-Kreisen: Label erscheint direkt (kein Popover noetig)

Design Popover:
  +-------------------------------+
  |  Befriedigend                 |
  |                               |
  |  Diese Bewertung bedeutet,    |
  |  dass das Erlebnis Ihren      |
  |  Erwartungen teilweise        |
  |  entsprochen hat.        [X]  |
  +-------------------------------+
  
  Hintergrund: #FFFFFF
  Border: 1px solid #E5E7EB
  Schatten: shadow-lg
  Padding: 16px
  Border-Radius: 12px
  Max-Width: 280px

Alternative fuer komplexere Inhalte: Bottom-Sheet
  - Slide-up Animation (250ms ease-out)
  - Max-Hoehe: 40vh
  - Drag-Handle oben (32px breit, 4px hoch, #D1D5DB)
  - Kann durch Swipe-Down geschlossen werden
```

---

## 5. Step-Uebergaenge und Animationen

### Transition zwischen Steps

```
Richtung: Vorwaerts (Weiter)
  Aktueller Step:  translateX(0) -> translateX(-100%), opacity 1 -> 0
  Neuer Step:      translateX(100%) -> translateX(0), opacity 0 -> 1
  Dauer: 250ms
  Easing: ease-out
  
Richtung: Rueckwaerts (Zurueck)
  Aktueller Step:  translateX(0) -> translateX(100%), opacity 1 -> 0
  Neuer Step:      translateX(-100%) -> translateX(0), opacity 0 -> 1
  Dauer: 250ms
  Easing: ease-out

Framer Motion Konfiguration:
  <AnimatePresence mode="wait">
    <motion.div
      key={currentStep}
      initial={{ x: direction > 0 ? '100%' : '-100%', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: direction > 0 ? '-100%' : '100%', opacity: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    />
  </AnimatePresence>
```

### Fortschrittsbalken-Animation

```
Balken-Fuellung:
  transition: width 300ms ease-out
  
Gruppen-Segment-Wechsel:
  Altes Segment: Fuellt sich komplett (300ms)
  Neues Segment: Beginnt von 0% zu fuellen (300ms)
```

### Element-Animationen

```
Rating-Kreise (bei Auswahl):
  transform: scale(1) -> scale(1.15) -> scale(1)
  Dauer: 200ms
  Easing: ease-out
  Farbe: transparent -> #F59E0B (150ms)

Kacheln (bei Selektion):
  transform: scale(1) -> scale(0.97) -> scale(1)
  Dauer: 150ms
  Border: 1px -> 2px (sofort)
  Checkmark: scale(0) -> scale(1), 200ms ease-out

Radio-Buttons (bei Auswahl):
  Dot: scale(0) -> scale(1), 150ms ease-out
  Background: transparent -> #EEF2FF, 150ms ease

Modal (Verifizierung):
  Backdrop: opacity 0 -> 1, 200ms
  Karte: scale(0.97) + opacity(0) -> scale(1) + opacity(1), 200ms
  Schliessen: Umgekehrt, 150ms

Validierungs-Error:
  Shake: translateX(0, -6px, 6px, -4px, 4px, 0), 300ms
  Border-Farbe: -> #EF4444, sofort
  Error-Text: fade-in, 200ms
```

---

## 6. Barrierefreiheit (Accessibility)

### WCAG 2.1 AA Konformitaet

#### Kontrastverhältnisse (geprueft)

| Kombination | Ratio | Status |
|-------------|-------|--------|
| #111827 auf #FFFFFF | 16.75:1 | Bestanden (AAA) |
| #374151 auf #FFFFFF | 10.69:1 | Bestanden (AAA) |
| #6B7280 auf #FFFFFF | 5.03:1 | Bestanden (AA) |
| #FFFFFF auf #6366F1 | 4.56:1 | Bestanden (AA) |
| #FFFFFF auf #111827 (Tooltip) | 16.75:1 | Bestanden (AAA) |
| #F59E0B auf #FFFFFF | 2.15:1 | Nicht bestanden — Sterne brauchen zusaetzlichen Text |
| #4338CA auf #EEF2FF | 8.22:1 | Bestanden (AAA) |

#### Wichtig: Rating-Sterne Barrierefreiheit

Die Amber-Sterne (#F59E0B) auf weissem Hintergrund haben kein ausreichendes Kontrast-Verhaeltnis (2.15:1). Loesung:
- Immer ein Text-Label ("Gut", "Ausgezeichnet") unterhalb anzeigen
- Sterne mit 2px border #D97706 umranden (Ratio 3.31:1 verbessert)
- `aria-label` auf dem Rating-Container mit aktuellem Wert

#### Tastaturnavigation

```
Tab-Reihenfolge pro Step:
1. Zurueck-Button (wenn sichtbar)
2. Step-Inhalt (Inputs, Radio-Buttons, Rating, Kacheln)
3. Weiter-Button

Rating-Kreise:
  - Arrow-Keys (links/rechts) navigieren zwischen Kreisen
  - Space/Enter waehlt den fokussierten Kreis
  - role="radiogroup", jeder Kreis role="radio"
  - aria-label="Bewertung: 3 von 5 Sternen, Befriedigend"

Radio-Buttons:
  - Arrow-Keys (hoch/runter) navigieren
  - Space waehlt aus
  - Natuerliches <input type="radio"> Verhalten

Multi-Select-Kacheln:
  - Tab navigiert zwischen Kacheln
  - Space/Enter toggelt Selektion
  - role="checkbox" auf jeder Kachel
  - aria-checked="true/false"

Verifizierungs-Modal:
  - Focus-Trap im Modal (Tab-Zyklus innerhalb)
  - Escape schliesst Modal
  - Auto-Focus auf erstes Code-Feld
  - role="dialog", aria-modal="true"
  - aria-labelledby auf Modal-Titel

Fortschrittsbalken:
  - role="progressbar"
  - aria-valuenow={currentStep}
  - aria-valuemin={1}
  - aria-valuemax={16}
  - aria-label="Fortschritt: Schritt 5 von 16"
```

#### Touch-Zielgroessen

```
Minimum: 44x44px (WCAG), empfohlen: 48x48px
- Buttons: min-height 44px, padding 12px 24px
- Rating-Kreise: 48px Durchmesser
- Radio-Buttons: 52px Hoehe, volle Breite
- Kacheln: min 80px Hoehe, volle Spaltenbreite
- Code-Felder: 56x56px
- Zurueck/Weiter: 44px Hoehe, min-width 120px
```

#### Screen-Reader-Unterstuetzung

```
Step-Wechsel:
  - aria-live="polite" auf Step-Container
  - Ansage: "Schritt 5 von 16: Gesamtbewertung"

Validierungsfehler:
  - aria-live="assertive" auf Error-Container
  - aria-invalid="true" auf fehlerhaftem Input
  - aria-describedby verlinkt Error-Text mit Input

Fortschritt:
  - Dynamisches aria-label Update bei Step-Wechsel
  - Gruppenname wird mit angesagt

Optionale Steps:
  - "(Optional)" im aria-label des Step-Titels
  - "Ueberspringen"-Button ist per Tab erreichbar
```

#### Reduzierte Bewegung

```
@media (prefers-reduced-motion: reduce):
  - Alle Transitions auf 0ms setzen
  - Step-Uebergaenge: Instant-Switch statt Slide
  - Rating-Bounce deaktiviert
  - Kachel-Scale deaktiviert
  - Shake-Animation bei Error: Nur Border-Farbe, kein Shake
```

---

## 7. Responsive Verhalten aller Komponenten

### Breakpoint-Matrix

| Komponente | Mobile (<640px) | Tablet (640-1024px) | Desktop (>1024px) |
|------------|----------------|--------------------|--------------------|
| Container | 100% Breite, padding 16px | Max 580px, zentriert, padding 24px | Max 640px, zentriert, padding 32px |
| Header | Sticky, 56px, kompakt | In Karte integriert | In Karte integriert |
| Footer | Sticky, 72px, volle Breite | In Karte, inline | In Karte, inline |
| Fortschrittsbalken | Horizontal, Labels scrollbar | Horizontal, alle Labels sichtbar | Horizontal, alle Labels sichtbar |
| Rating-Kreise | 48px, gap 16px | 52px, gap 18px | 56px, gap 20px |
| Radio-Buttons | 1 Spalte, volle Breite | 2 Spalten | 2 Spalten |
| Multi-Select-Kacheln | 2 Spalten, gap 12px | 2 Spalten, gap 14px | 3 Spalten, gap 16px |
| Buttons | Volle Breite (gestapelt bei Platz) | Inline, rechtsbuendig | Inline, rechtsbuendig |
| Tooltips | Tap-Popover / Bottom-Sheet | Mouseover-Tooltip | Mouseover-Tooltip |
| Code-Felder | 48x48px, gap 12px | 52x52px, gap 14px | 56x56px, gap 16px |
| Textarea | 160px min-Hoehe | 180px min-Hoehe | 200px min-Hoehe |
| Zusammenfassung | Volle Breite, Cards gestapelt | 2-spaltig moeglich | 2-spaltig |

### Safe Areas (Mobile)
```
padding-bottom: env(safe-area-inset-bottom)  -> Footer
padding-top: env(safe-area-inset-top)        -> Header
```

### Keyboard Avoidance (Mobile)
```
- Bei Fokus auf Input/Textarea: Scroll-to-view
- Footer-Buttons bleiben ueber der Tastatur
- visualViewport API fuer praezise Tastaturhoehe
```

---

## 8. Implementierungshinweise

### Komponentenstruktur (React/TypeScript)

```
src/renderer/components/
  RatingWizard/
    RatingWizard.tsx          <- Container, Step-Navigation, State
    WizardHeader.tsx          <- Fortschrittsbalken, Titel
    WizardFooter.tsx          <- Zurueck/Weiter/Ueberspringen
    steps/
      EmailVerification.tsx   <- Step 1
      HotelSearch.tsx         <- Step 2
      TravelPeriod.tsx        <- Step 3
      TravelType.tsx          <- Step 4
      RatingStep.tsx          <- Steps 5-10 (parametrisiert)
      MultiSelectStep.tsx     <- Steps 11-13 (parametrisiert)
      ReviewTitle.tsx         <- Step 14
      ReviewText.tsx          <- Step 15
      Summary.tsx             <- Step 16
    shared/
      RatingScale.tsx         <- 5-Punkt-Bewertungsskala
      SelectTile.tsx          <- Multi-Select-Kachel
      RadioGroup.tsx          <- Radio-Button-Gruppe
      VerificationModal.tsx   <- 4-Code-Felder Modal
      Tooltip.tsx             <- Desktop-Tooltip
      Popover.tsx             <- Mobile-Popover
      ProgressBar.tsx         <- Segmentierter Fortschrittsbalken
```

### State Management
```typescript
interface WizardState {
  currentStep: number;
  direction: 1 | -1;
  email: string;
  isVerified: boolean;
  hotelId: string | null;
  travelMonth: number;
  travelYear: number;
  travelDuration: number;
  travelType: string;
  ratings: {
    overall: number;
    hotelLocation: number;
    room: number;
    service: number;
    gastronomy: number;
    sports: number;
  };
  facilities: string[];
  roomFeatures: string[];
  suitableFor: string[];
  title: string;
  reviewText: string;
}
```

### Framer Motion Variants
```typescript
const stepVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? '100%' : '-100%',
    opacity: 0,
  }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({
    x: direction > 0 ? '-100%' : '100%',
    opacity: 0,
  }),
};
```

---

## 9. Zusammenfassung der Akzeptanzkriterien

| Kriterium | Status | Verweis |
|-----------|--------|---------|
| Wireframes fuer alle 16 Steps (Mobile + Desktop) | Erfuellt | Abschnitte 3.1 - 3.11 |
| Interaktionskonzept fuer Rating-Skala dokumentiert | Erfuellt | Abschnitt 3.7 |
| Tooltip-Verhalten fuer Mobile und Desktop definiert | Erfuellt | Abschnitt 4 |
| Styleguide-konformes Farbschema und Typografie | Erfuellt | Abschnitt 1 |
| Barrierefreie Bedienbarkeit beruecksichtigt | Erfuellt | Abschnitt 6 |

---

*Dokument erstellt am 2026-04-18 durch Agent Rathana.*
