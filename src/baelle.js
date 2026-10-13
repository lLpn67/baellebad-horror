import * as THREE from 'three';
import { ZELLE } from './config.js';
import { BALLFARBEN } from './texturen.js';

const RADIUS = 0.12;
const ABSTAND = 0.235;
const HOEHE = 0.42;
/** Kantenlänge eines Stücks in Zellen. Jedes Stück ist ein Zeichenaufruf. */
const STUECK = 3;

/**
 * Das Bällebad: eine Lage echter Kugeln über einem gemalten Untergrund.
 *
 * Die Kugeln sind in Stücke von 3×3 Zellen geteilt, damit der Browser
 * die außer Sicht nicht zeichnet. Wer durchs Bad läuft, schiebt die
 * Bälle in der Nähe zur Seite und nach unten; danach rollen sie langsam
 * zurück.
 */
export class Baellebad {
  constructor(szene, level) {
    this.stuecke = [];
    const geo = new THREE.SphereGeometry(RADIUS, 9, 6);
    const mat = new THREE.MeshPhongMaterial({ shininess: 70, specular: 0x444444 });
    const farbe = new THREE.Color();
    const m = new THREE.Matrix4();

    const sr = Math.ceil(level.zeilen / STUECK), sc = Math.ceil(level.spalten / STUECK);
    for (let a = 0; a < sr; a++) for (let b = 0; b < sc; b++) {
      const basis = [];
      for (let r = a * STUECK; r < (a + 1) * STUECK; r++) for (let c = b * STUECK; c < (b + 1) * STUECK; c++) {
        if (level.boden(r, c) !== 'baelle' || level.zeichen(r, c) === 'B') continue;
        const x0 = c * ZELLE, z0 = r * ZELLE;
        for (let x = x0 + ABSTAND / 2; x < x0 + ZELLE; x += ABSTAND) {
          for (let z = z0 + ABSTAND / 2; z < z0 + ZELLE; z += ABSTAND) {
            const jx = x + (Math.random() - 0.5) * 0.09;
            const jz = z + (Math.random() - 0.5) * 0.09;
            // nicht in die Schaumstoffblöcke der Nachbarn
            const [rr, cc] = level.zelle(jx, jz);
            if (level.zeichen(rr, cc) === 'B') continue;
            basis.push(jx, HOEHE + (Math.random() - 0.5) * 0.1, jz);
          }
        }
      }
      if (!basis.length) continue;

      const n = basis.length / 3;
      const mesh = new THREE.InstancedMesh(geo, mat, n);
      mesh.receiveShadow = true;
      for (let i = 0; i < n; i++) {
        m.makeTranslation(basis[i * 3], basis[i * 3 + 1], basis[i * 3 + 2]);
        mesh.setMatrixAt(i, m);
        farbe.set(BALLFARBEN[(Math.random() * BALLFARBEN.length) | 0]);
        mesh.setColorAt(i, farbe);
      }
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.computeBoundingSphere();
      szene.add(mesh);

      this.stuecke.push({
        mesh,
        basis: new Float32Array(basis),
        versatz: new Float32Array(n * 3),
        x1: b * STUECK * ZELLE, z1: a * STUECK * ZELLE,
        x2: (b + 1) * STUECK * ZELLE, z2: (a + 1) * STUECK * ZELLE,
        unruhig: false,
      });
    }

    this.anzahl = this.stuecke.reduce((s, st) => s + st.basis.length / 3, 0);
    this._m = new THREE.Matrix4();
  }

  /**
   * @param {Array<{x:number,z:number,r:number}>} koerper  was sich durchs Bad bewegt
   */
  update(dt, koerper) {
    const m = this._m;
    const kZiel = 1 - Math.exp(-dt * 14);
    const kZurueck = 1 - Math.exp(-dt * 1.6);

    for (const st of this.stuecke) {
      const nah = koerper.filter((k) => k.x > st.x1 - k.r && k.x < st.x2 + k.r && k.z > st.z1 - k.r && k.z < st.z2 + k.r);
      if (!nah.length && !st.unruhig) continue;

      const { basis, versatz, mesh } = st;
      const n = basis.length / 3;
      let bewegt = false;

      for (let i = 0; i < n; i++) {
        const bx = basis[i * 3], bz = basis[i * 3 + 2];
        let zx = 0, zy = 0, zz = 0;
        for (const k of nah) {
          const dx = bx - k.x, dz = bz - k.z;
          const d = Math.hypot(dx, dz);
          if (d >= k.r) continue;
          const t = (k.r - d) / k.r;
          const s = d > 1e-4 ? 1 / d : 0;
          zx += dx * s * t * 0.35;
          zz += dz * s * t * 0.35;
          zy -= t * 0.32;
        }
        const j = i * 3;
        const ziel = zx || zy || zz;
        const k = ziel ? kZiel : kZurueck;
        const ax = versatz[j], ay = versatz[j + 1], az = versatz[j + 2];
        if (!ziel && Math.abs(ax) + Math.abs(ay) + Math.abs(az) < 0.002) {
          if (ax || ay || az) {
            versatz[j] = versatz[j + 1] = versatz[j + 2] = 0;
            m.makeTranslation(bx, basis[j + 1], bz);
            mesh.setMatrixAt(i, m);
            bewegt = true;
          }
          continue;
        }
        versatz[j] = ax + (zx - ax) * k;
        versatz[j + 1] = ay + (zy - ay) * k;
        versatz[j + 2] = az + (zz - az) * k;
        m.makeTranslation(bx + versatz[j], basis[j + 1] + versatz[j + 1], bz + versatz[j + 2]);
        mesh.setMatrixAt(i, m);
        bewegt = true;
      }

      st.unruhig = bewegt;
      if (bewegt) mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
