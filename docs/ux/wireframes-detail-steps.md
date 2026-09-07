# Wireframes Detail: Steps 2-4, 6-10, 12-13 (Ergaenzung)

Dieses Dokument ergaenzt das Hauptkonzept mit detaillierten Wireframes fuer
alle Steps, die im Hauptdokument kompakter dargestellt wurden.

---

## Step 2: Hotel-/Objektauswahl — Desktop

```
+------------------------------------------------------------------+
|     +------------------------------------------------------+     |
|     |   Welches Hotel moechten Sie bewerten?                |     |
|     |   Suchen Sie nach Name oder Ort.                      |     |
|     |                                                       |     |
|     |   +---------------------------------------------+     |     |
|     |   | [Lupe] Hotel suchen...                      |     |     |
|     |   +---------------------------------------------+     |     |
|     |                                                       |     |
|     |   +---------------------------------------------+     |     |
|     |   | [Img] Hotel Sunshine Resort                 |     |     |
|     |   |       Antalya, Tuerkei | **** 4.2 (1.203)   |     |     |
|     |   +---------------------------------------------+     |     |
|     |   | [Img] Hotel Sunstar                         |     |     |
|     |   |       Kreta, Griechenland | **** 4.5 (876)  |     |     |
|     |   +---------------------------------------------+     |     |
|     |                                                       |     |
|     |   [  Zurueck  ]              [   Weiter   ->]         |     |
|     +------------------------------------------------------+     |
+------------------------------------------------------------------+
```

Suchfeld-Verhalten:
- Debounce: 300ms nach letztem Tastendruck
- Minimum 2 Zeichen fuer Suche
- Ergebnisse: Max 5, mit Thumbnail (40x40px), Name, Ort, Rating
- Leer-Zustand: "Keine Ergebnisse gefunden"
- Lade-Zustand: Skeleton-Loader (3 Zeilen, pulsierend)

---

## Step 3: Reisezeitraum — Desktop

```
+------------------------------------------------------------------+
|     +------------------------------------------------------+     |
|     |   Wann waren Sie dort?                                |     |
|     |   Waehlen Sie den Reisemonat und das Jahr.            |     |
|     |                                                       |     |
|     |   +-------------------+  +-------------------+       |     |
|     |   | Monat             |  | Jahr              |       |     |
|     |   | April          [v]|  | 2026           [v]|       |     |
|     |   +-------------------+  +-------------------+       |     |
|     |                                                       |     |
|     |   Aufenthaltsdauer                                    |     |
|     |   +-------------------------------------------+       |     |
|     |   | 7 Naechte                              [v]|       |     |
|     |   +-------------------------------------------+       |     |
|     |                                                       |     |
|     |   [  Zurueck  ]              [   Weiter   ->]         |     |
|     +------------------------------------------------------+     |
+------------------------------------------------------------------+
```

Desktop: Monat und Jahr nebeneinander (grid-cols-2)

---

## Step 4: Reiseart — Mobile (Detailliertes Radio-Design)

```
+---------------------------------------+
|                                       |
|   +-------------------------------+   |
|   | (#) Pauschalreise             |   |  <- Selektiert
|   |     Komplett organisierte     |   |     bg: #EEF2FF
|   |     Reise mit Flug & Hotel    |   |     border: #6366F1
|   +-------------------------------+   |
|   | ( ) Nur Hotel                 |   |  <- Nicht selektiert
|   |     Eigene Anreise, nur       |   |     bg: #FFFFFF
|   |     Unterkunft gebucht        |   |     border: #E5E7EB
|   +-------------------------------+   |
|   | ( ) Individualreise           |   |
|   |     Selbst organisiert        |   |
|   +-------------------------------+   |
|   | ( ) Geschaeftsreise           |   |
|   |     Beruflich veranlasst      |   |
|   +-------------------------------+   |
|   | ( ) Staedtereise              |   |
|   |     Kurztrip in die Stadt     |   |
|   +-------------------------------+   |
|                                       |
```

Jede Radio-Option kann optional eine Beschreibung haben (13px, txt-muted).

---

## Step 6: Hotel & Lage bewerten — Mobile

```
+---------------------------------------+
| [<] Bewertung schreiben    Step 6/16  |
+---------------------------------------+
| [======][                            ]|
+---------------------------------------+
|                                       |
|   [Pin-Icon]                          |
|                                       |
|   Wie bewerten Sie Hotel             |
|   und Lage?                           |
|                                       |
|   Bewerten Sie die Lage des Hotels,   |
|   die Umgebung und die Erreichbar-    |
|   keit.                               |
|                                       |
|                                       |
|       O     O     O     @     @       |  <- 4 von 5
|                                       |
|              "Gut"                    |
|                                       |
|                                       |
+---------------------------------------+
|  [  Zurueck  ]     [   Weiter   ->]   |
+---------------------------------------+
```

---

## Step 7: Zimmer bewerten — Mobile

```
+---------------------------------------+
| [<] Bewertung schreiben    Step 7/16  |
+---------------------------------------+
| [=======][                           ]|
+---------------------------------------+
|                                       |
|   [Bett-Icon]                         |
|                                       |
|   Wie bewerten Sie Ihr               |
|   Zimmer?                             |
|                                       |
|   Bewerten Sie Sauberkeit,            |
|   Ausstattung und Komfort.            |
|                                       |
|                                       |
|       @     @     @     @     O       |  <- 4 von 5
|                                       |
|              "Gut"                    |
|                                       |
|                                       |
+---------------------------------------+
|  [  Zurueck  ]     [   Weiter   ->]   |
+---------------------------------------+
```

---

## Step 8: Service bewerten — Mobile

```
+---------------------------------------+
| [<] Bewertung schreiben    Step 8/16  |
+---------------------------------------+
| [========][                          ]|
+---------------------------------------+
|                                       |
|   [Glocken-Icon]                      |
|                                       |
|   Wie bewerten Sie den              |
|   Service?                            |
|                                       |
|   Bewerten Sie Freundlichkeit,        |
|   Hilfsbereitschaft und               |
|   Professionalitaet.                  |
|                                       |
|                                       |
|       @     @     @     @     @       |  <- 5 von 5
|                                       |
|          "Ausgezeichnet"              |
|                                       |
|                                       |
+---------------------------------------+
|  [  Zurueck  ]     [   Weiter   ->]   |
+---------------------------------------+
```

---

## Step 9: Gastronomie bewerten — Mobile

```
+---------------------------------------+
| [<] Bewertung schreiben    Step 9/16  |
+---------------------------------------+
| [=========][                         ]|
+---------------------------------------+
|                                       |
|   [Besteck-Icon]                      |
|                                       |
|   Wie bewerten Sie die              |
|   Gastronomie?                        |
|                                       |
|   Bewerten Sie Essen, Getraenke      |
|   und das kulinarische Angebot.       |
|                                       |
|                                       |
|       @     @     @     O     O       |  <- 3 von 5
|                                       |
|          "Befriedigend"               |
|                                       |
|                                       |
+---------------------------------------+
|  [  Zurueck  ]     [   Weiter   ->]   |
+---------------------------------------+
```

---

## Step 10: Sport & Unterhaltung — Mobile

```
+---------------------------------------+
| [<] Bewertung schreiben   Step 10/16  |
+---------------------------------------+
| [==========][                        ]|
+---------------------------------------+
|                                       |
|   [Aktivitaet-Icon]                   |
|                                       |
|   Wie bewerten Sie Sport            |
|   & Unterhaltung?                     |
|                                       |
|   Bewerten Sie Freizeitangebot,       |
|   Animation und Sportmoeglichkeiten.  |
|                                       |
|                                       |
|       @     @     O     O     O       |  <- 2 von 5
|                                       |
|          "Ausreichend"                |
|                                       |
|                                       |
+---------------------------------------+
|  [  Zurueck  ]     [   Weiter   ->]   |
+---------------------------------------+
```

---

## Steps 6-10: Desktop (Einheitliches Layout)

```
+------------------------------------------------------------------+
|     +------------------------------------------------------+     |
|     |   [Icon]                                              |     |
|     |                                                       |     |
|     |   Wie bewerten Sie [Kategorie]?                       |     |
|     |   [Beschreibungstext]                                 |     |
|     |                                                       |     |
|     |            O     O     O     O     O                  |     |
|     |                       ^                               |     |
|     |                 +-----------+                          |     |
|     |                 |   Label   |  <- Tooltip              |     |
|     |                 +-----------+                          |     |
|     |                                                       |     |
|     |   [  Zurueck  ]              [   Weiter   ->]         |     |
|     +------------------------------------------------------+     |
+------------------------------------------------------------------+
```

---

## Step 12: Zimmerausstattung — Mobile

```
+---------------------------------------+
| [<] Bewertung schreiben   Step 12/16  |
+---------------------------------------+
| [============][                      ]|
+---------------------------------------+
|                                       |
|   Was hatte Ihr Zimmer?              |
|                                       |
|   Waehlen Sie alle zutreffenden.     |
|   (Optional)                          |
|                                       |
|   +----------+  +----------+         |
|   |[Klima]   |  |[Balkon]  |         |
|   | Klima-   |  | Balkon / |         |
|   | anlage   |  | Terrasse |         |
|   +----------+  +----------+         |
|   +----------+  +----------+         |
|   |[Safe]    |  |[Minibar] |         |
|   | Safe     |  | Minibar  |         |
|   +----------+  +----------+         |
|   +----------+  +----------+         |
|   |[TV]      |  |[Wanne]   |         |
|   | TV       |  | Bade-    |         |
|   |          |  | wanne    |         |
|   +----------+  +----------+         |
|   +----------+  +----------+         |
|   |[Dusche]  |  |[Meer]    |         |
|   | Dusche   |  | Meer-    |         |
|   |          |  | blick    |         |
|   +----------+  +----------+         |
|                                       |
+---------------------------------------+
|  [  Zurueck  ]  [Uebersp.] [Weiter->]|
+---------------------------------------+
```

---

## Step 12: Zimmerausstattung — Desktop

```
+------------------------------------------------------------------+
|     +------------------------------------------------------+     |
|     |   Was hatte Ihr Zimmer?                               |     |
|     |   Waehlen Sie alle zutreffenden. (Optional)          |     |
|     |                                                       |     |
|     |   +----------+ +----------+ +----------+             |     |
|     |   |[Klima]   | |[Balkon]  | |[Safe]    |             |     |
|     |   | Klima-   | | Balkon / | | Safe     |             |     |
|     |   | anlage   | | Terrasse | |          |             |     |
|     |   +----------+ +----------+ +----------+             |     |
|     |   +----------+ +----------+ +----------+             |     |
|     |   |[Minibar] | |[TV]      | |[Wanne]   |             |     |
|     |   | Minibar  | | TV       | | Bade-    |             |     |
|     |   |          | |          | | wanne    |             |     |
|     |   +----------+ +----------+ +----------+             |     |
|     |   +----------+ +----------+                           |     |
|     |   |[Dusche]  | |[Meer]    |                           |     |
|     |   | Dusche   | | Meer-    |                           |     |
|     |   |          | | blick    |                           |     |
|     |   +----------+ +----------+                           |     |
|     |                                                       |     |
|     |   [  Zurueck  ]   [Ueberspringen]   [Weiter   ->]    |     |
|     +------------------------------------------------------+     |
+------------------------------------------------------------------+
```

---

## Step 13: Fuer wen geeignet — Mobile

```
+---------------------------------------+
| [<] Bewertung schreiben   Step 13/16  |
+---------------------------------------+
| [=============][                     ]|
+---------------------------------------+
|                                       |
|   Fuer wen ist das Hotel             |
|   geeignet?                           |
|                                       |
|   Waehlen Sie alle zutreffenden.     |
|   (Optional)                          |
|                                       |
|   +----------+  +----------+         |
|   |[Herz]    |  |[Familie] |         |
|   | Paare    |  | Familien |         |
|   +----------+  +----------+         |
|   +----------+  +----------+         |
|   |[Person]  |  |[Senioren]|         |
|   | Singles  |  | Senioren |         |
|   +----------+  +----------+         |
|   +----------+  +----------+         |
|   |[Gruppe]  |  |[Koffer]  |         |
|   | Freundes-|  | Geschaef-|         |
|   | gruppen  |  | tsreisen |         |
|   +----------+  +----------+         |
|                                       |
+---------------------------------------+
|  [  Zurueck  ]  [Uebersp.] [Weiter->]|
+---------------------------------------+
```

---

## Step 13: Fuer wen geeignet — Desktop

```
+------------------------------------------------------------------+
|     +------------------------------------------------------+     |
|     |   Fuer wen ist das Hotel geeignet?                    |     |
|     |   Waehlen Sie alle zutreffenden. (Optional)          |     |
|     |                                                       |     |
|     |   +----------+ +----------+ +----------+             |     |
|     |   |[Herz]    | |[Familie] | |[Person]  |             |     |
|     |   | Paare    | | Familien | | Singles  |             |     |
|     |   +----------+ +----------+ +----------+             |     |
|     |   +----------+ +----------+ +----------+             |     |
|     |   |[Senioren]| |[Gruppe]  | |[Koffer]  |             |     |
|     |   | Senioren | | Freundes-| | Geschaef-|             |     |
|     |   |          | | gruppen  | | tsreisen |             |     |
|     |   +----------+ +----------+ +----------+             |     |
|     |                                                       |     |
|     |   [  Zurueck  ]   [Ueberspringen]   [Weiter   ->]    |     |
|     +------------------------------------------------------+     |
+------------------------------------------------------------------+
```

---

## Step 16: Zusammenfassung — Desktop

```
+------------------------------------------------------------------+
|     +------------------------------------------------------+     |
|     |   Ihre Bewertung im Ueberblick                        |     |
|     |   Pruefen Sie Ihre Angaben vor dem Absenden.          |     |
|     |                                                       |     |
|     |   +-------------------------+ +--------------------+  |     |
|     |   | Hotel                   | | Bewertungen        |  |     |
|     |   | Hotel Sunshine Resort   | | Gesamt    @@@@@ 5  |  |     |
|     |   | Antalya, Tuerkei        | | Lage      @@@@O 4  |  |     |
|     |   | April 2026, 7 Naechte   | | Zimmer    @@@@O 4  |  |     |
|     |   | Pauschalreise           | | Service   @@@@@ 5  |  |     |
|     |   |              [Aendern]  | | Gastro    @@@OO 3  |  |     |
|     |   +-------------------------+ | Sport     @@OOO 2  |  |     |
|     |                               |          [Aendern] |  |     |
|     |                               +--------------------+  |     |
|     |                                                       |     |
|     |   +---------------------------------------------------+     |
|     |   | Einrichtungen: Pool, Spa, WLAN      [Aendern]     |     |
|     |   | Zimmer: Klima, Balkon, Safe          [Aendern]     |     |
|     |   | Geeignet fuer: Paare, Familien       [Aendern]     |     |
|     |   +---------------------------------------------------+     |
|     |                                                       |     |
|     |   Titel                                    [Aendern]  |     |
|     |   "Traumhafter Urlaub am Strand"                      |     |
|     |                                                       |     |
|     |   Text                                     [Aendern]  |     |
|     |   "Das Hotel liegt direkt am Strand und..."            |     |
|     |                                                       |     |
|     |              [   Bewertung absenden   ->]              |     |
|     +------------------------------------------------------+     |
+------------------------------------------------------------------+

Desktop: 2-spaltig fuer Hotel + Bewertungen (grid-cols-2)
```

---

*Ergaenzungsdokument zum Hauptkonzept bewertungs-wizard-ux-konzept.md*
