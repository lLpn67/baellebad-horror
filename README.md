# Bällebad

Horror-Game im Browser, aus der Ich-Perspektive. Spielparadies *Sonnenschein*,
kurz nach Ladenschluss: Irgendwo im Dunkeln liegen vier Kalenderblätter,
Montag bis Donnerstag. Wer die Vier-Tage-Woche einsammelt, darf zum Notausgang.
Dabei ist man nicht allein.

Satire. Das Monster trägt das Gesicht von Friedrich Merz und spricht in
Originaltönen.

## Spielen

Die Seite ist rein statisch, es gibt nichts zu bauen und nichts zu installieren.

```bash
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

Direkt als `file://` geht es nicht, weil die Module und Tondateien über HTTP
geladen werden. Zum Veröffentlichen reicht jedes statische Hosting, zum
Beispiel Vercel oder GitHub Pages.

| | Tastatur & Maus | Touch | Gamepad |
|---|---|---|---|
| Gehen | WASD / Pfeile | linke Hälfte ziehen | linker Stick |
| Schauen | Maus | rechte Hälfte wischen | rechter Stick |
| Rennen | Shift | *Rennen* halten | RT / RB / L3 |
| Ducken | C | *Ducken* | B |
| Lampe | F | *Lampe* | Y |
| Tür | E | *Tür* | A |
| Pause | Esc | II | Start |

## Wie er jagt

- **Sehen:** Im Dunkeln sieht er dich auf etwa 8 m, mit Lampe auf über 20 m.
  Leuchtest du ihm ins Gesicht, weiß er sofort Bescheid.
- **Hören:** Rennen hört man weit, Rennen durchs Bällebad noch weiter.
  Geduckt bist du lautlos.
- **Verstecken:** Geduckt im Bällebad und mit ausgeschalteter Lampe bist du
  fast unsichtbar. Er findet dich nur, wenn er praktisch auf dich tritt.
- **Türen** hält er nicht auf, sie bremsen ihn aber kurz, und geschlossene
  Türen versperren ihm die Sicht.
- Mit jedem gesammelten Tag wird er schneller. Beim vierten Blatt rastet er aus.
- Die Lampe hat eine Batterie. Ausgeschaltet lädt sie wieder auf.

## Aufbau

| Datei | Inhalt |
|---|---|
| `src/config.js` | Karte, Tempo, Sichtweiten, Stimme samt Untertitel-Timing |
| `src/level.js` | Karte → Geometrie, Kollision, Sichtlinien, Wegsuche (A*), Türen |
| `src/baelle.js` | Bällebad aus rund 11 000 Kugeln, die man beim Durchlaufen verdrängt |
| `src/monster.js` | Körper mit IK-Gliedern und Verhalten (Patrouille, Nachforschen, Jagd, Suche) |
| `src/spieler.js` | Bewegung, Taschenlampe, Ausdauer, Geräusche |
| `src/ton.js` | Räumliche Stimme, synthetische Geräusche, Herzschlag |
| `src/eingabe.js` | Tastatur, Maus, Touch, Gamepad |
| `src/texturen.js` | Alle Texturen, im Browser gemalt |
| `assets/merz.png` | Das Gesicht, ausgeschnitten aus dem Vorlagevideo |
| `assets/stimme/` | Die vier Originaltöne, geschnitten aus dem Vorlagevideo |

Die Karte steht als Zeichenraster in `src/config.js` und lässt sich direkt dort
umbauen. Die Legende steht darüber.

## Online spielen über GitHub Pages

Einmalig in GitHub: **Settings → Pages → Build and deployment**, Quelle
*Deploy from a branch*, Branch `main`, Ordner `/ (root)`, speichern. Nach ein
bis zwei Minuten läuft das Spiel unter

https://llpn67.github.io/baellebad-horror/

Pages gibt es nur für öffentliche Repos oder mit GitHub Pro. Die leere Datei
`.nojekyll` sorgt dafür, dass GitHub die Dateien unverändert ausliefert.
