/**
 * Alles, woran man beim Abstimmen dreht, an einem Ort.
 */

/** Kantenlänge einer Kartenzelle in Metern. */
export const ZELLE = 2;

/** Raumhöhe in Metern. */
export const HOEHE = 3.4;

/**
 * Die Karte. Eine Zeile pro Reihe, ein Zeichen pro Zelle:
 *
 *   #  Wand                      .  Teppichboden
 *   b  Bällebad                  B  Schaumstoffblock (im Bällebad)
 *   D  Tür                       E  Notausgang (in der Außenwand)
 *   O  Büro                      S  Start des Spielers
 *   M  Start des Monsters        T  möglicher Platz für ein Kalenderblatt
 *
 * T, S und M nehmen den Boden ihrer Nachbarn an.
 */
export const KARTE = [
  '############################',
  '#S.....#bbbbbbbbbbbbbb#....#',
  '#......#bbbbbbbbbbbbbb#.T..#',
  '#..T...DbbBBbbbbbbbbbbD....#',
  '#......#bbBBbbbbbbbBbb#....#',
  '###D####bbbbbbbbbbbbbb###D##',
  '#......#bbbbbbbTbbbbbb#....#',
  '#......DbbbbbbbbbbbBBb#....#',
  '#...T..#bbbbbbbbbbbbbbD..T.#',
  '#......#bbbbbbbbbbbbbb#....#',
  '####D#######D#####D#####D###',
  '#..........................#',
  '#.#####.######.#####.#####.#',
  '#.#OOO#.#bbbb#.#...#.#bTb#.#',
  '#.#OMO#.#bTbb#.#.T.#.#bbb#.#',
  '#.#OOOD.#bbbbD.D...#.Dbbb#.E',
  '#.#OTO#.######.#####.#####.#',
  '#.#####....................#',
  '#..........................#',
  '############################',
];

/** Die vier Tage, die es zu sammeln gilt. */
export const TAGE = ['MO', 'DI', 'MI', 'DO'];

export const SPIELER = {
  radius: 0.3,
  gehen: 3.1,
  rennen: 5.4,
  geduckt: 1.5,
  /** Faktor im Bällebad. */
  baelleBremse: 0.62,
  /** Sekunden Rennen mit voller Ausdauer. */
  ausdauer: 4.5,
  /** Sekunden, bis sie wieder voll ist. */
  erholung: 6,
  augenhoehe: { stehen: 1.65, baelle: 1.48, ducken: 0.95, baelleDucken: 0.5 },
  /** Volle Batterie reicht so viele Sekunden. */
  batterie: 140,
  /** Aufladen pro Sekunde, wenn die Lampe aus ist (Anteil). */
  batterieLaden: 1 / 70,
  /** Bogenmaß pro Pixel Mausbewegung. */
  maus: 0.0023,
  touchBlick: 0.0055,
  stickBlick: 2.6,
};

export const MONSTER = {
  radius: 0.38,
  patrouille: 1.8,
  nachforschen: 2.7,
  jagd: 4.05,
  /** Schneller mit jedem gesammelten Tag. */
  jagdProTag: 0.22,
  /** Fängt ab dieser Entfernung. */
  fangen: 0.95,
  /** Sichtweite, je nach Lage des Spielers. */
  sicht: { dunkel: 8.5, lampe: 21, geduckt: 5, versteckt: 1.3 },
  /** Halber Blickwinkel in Bogenmaß. */
  blickwinkel: 1.35,
  /** Hörweite der Geräusche des Spielers in Metern. */
  hoeren: { gehen: 5, rennen: 15, baelle: 9, baelleRennen: 19, tuer: 11 },
  /** So lange sucht er dort, wo er dich zuletzt gesehen hat. */
  sucheSekunden: 7,
  /** Pause zwischen zwei Sätzen beim Herumschleichen. */
  redePause: [8, 15],
  /** Ab dem Start schläft er so lange im Büro. */
  schlaf: 9,
};

/**
 * Originaltöne. `woerter` sind die Untertitel, Wort für Wort, mit dem
 * Zeitpunkt in Sekunden, ab dem das Wort steht.
 */
export const STIMME = {
  wohlstand: {
    datei: 'assets/stimme/wohlstand.mp3',
    woerter: [
      [0.75, 'und'], [1.08, 'vier'], [1.24, 'Tage'], [1.42, 'Woche'],
      [1.66, 'lässt'], [1.94, 'sich'], [2.08, 'der'], [2.2, 'Wohlstand'],
      [2.44, 'unseres'], [2.62, 'Landes,'], [2.78, 'den'], [2.88, 'wir'],
      [3.0, 'heute'], [3.12, 'haben…'],
    ],
  },
  zaehne: {
    datei: 'assets/stimme/zaehne.mp3',
    woerter: [
      [0.0, 'lassen'], [0.3, 'sich'], [0.4, 'die'], [0.5, 'Zähne'],
      [0.62, 'neu'], [0.72, 'machen'], [0.86, 'und'], [1.04, 'die'],
      [1.16, 'deutschen'], [1.26, 'Bürger'], [1.44, 'nebenan'],
      [1.72, 'kriegen'], [1.84, 'keine'], [1.98, 'Termine'],
    ],
  },
  stadtbild: {
    datei: 'assets/stimme/stadtbild.mp3',
    woerter: [
      [0.3, 'im'], [0.58, 'Stadtbild'], [0.84, 'noch'], [1.1, 'dieses'],
      [1.32, 'Problem'],
    ],
  },
  paschas: {
    datei: 'assets/stimme/paschas.mp3',
    woerter: [[0.3, 'die'], [0.44, 'kleinen'], [0.56, 'Paschas']],
  },
};

/** Ganze Sätze für den Endbildschirm. */
export const ZITATE = {
  wohlstand: '„…und Vier-Tage-Woche lässt sich der Wohlstand unseres Landes, den wir heute haben…“',
  zaehne: '„…lassen sich die Zähne neu machen, und die deutschen Bürger nebenan kriegen keine Termine.“',
  stadtbild: '„…im Stadtbild noch dieses Problem.“',
  paschas: '„…die kleinen Paschas.“',
};
