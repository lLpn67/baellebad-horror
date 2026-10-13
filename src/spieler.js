import * as THREE from 'three';
import { SPIELER, MONSTER } from './config.js';

const clamp = THREE.MathUtils.clamp;

/**
 * Der Spieler: Kamera, Taschenlampe, Bewegung, Ausdauer, Geräusche.
 */
export class Spieler {
  constructor(kamera, szene, level, ton) {
    this.kamera = kamera;
    this.level = level;
    this.ton = ton;
    this.x = 0; this.z = 0;
    this.gier = 0; this.nick = 0;

    // Taschenlampe hängt an der Kamera und zeigt dorthin, wo man hinschaut.
    this.lampenLicht = new THREE.SpotLight(0xfff1d6, 22, 26, 0.52, 0.55, 1.35);
    this.lampenLicht.castShadow = true;
    this.lampenLicht.shadow.mapSize.set(1024, 1024);
    this.lampenLicht.shadow.camera.near = 0.2;
    this.lampenLicht.shadow.camera.far = 26;
    this.lampenLicht.shadow.bias = -0.0008;
    this.lampenLicht.position.set(0.18, -0.15, 0.1);
    this.lampenZiel = new THREE.Object3D();
    this.lampenZiel.position.set(0.05, -0.1, -5);
    kamera.add(this.lampenLicht, this.lampenZiel);
    this.lampenLicht.target = this.lampenZiel;

    // Schwacher Schein um den Kopf, damit man ohne Lampe nicht ganz blind ist
    this.nahLicht = new THREE.PointLight(0x8a7fb0, 0.5, 5, 2);
    kamera.add(this.nahLicht);
    szene.add(kamera);

    this.reset();
  }

  reset() {
    const s = this.level.start;
    this.x = s.x; this.z = s.z;
    this.gier = Math.PI;      // Richtung Süden, in den Raum hinein
    this.nick = 0;
    this.augen = SPIELER.augenhoehe.stehen;
    this.ausdauer = 1;
    this.erschoepft = false;
    this.geduckt = false;
    this.lampe = true;
    this.batterie = 1;
    this.flackern = 0;
    this.schrittUhr = 0;
    this.wipp = 0;
    this.laerm = 0;
    this.tempo = 0;
    this.lampenLicht.visible = true;
  }

  get imBaellebad() { return this.level.imBaellebad(this.x, this.z); }

  /** Versteckt: geduckt im Bällebad und ohne Licht. */
  get versteckt() { return this.geduckt && this.imBaellebad && !this.lampe; }

  /** Leuchtet die Lampe gerade auf diesen Punkt? */
  leuchtetAuf(p) {
    if (!this.lampe) return false;
    const dx = p.x - this.x, dz = p.z - this.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.5) return true;
    const vx = -Math.sin(this.gier), vz = -Math.cos(this.gier);
    return (dx * vx + dz * vz) / d > Math.cos(0.42);
  }

  /** Wie weit ist es in Blickrichtung bis zur nächsten Wand? */
  _wandAbstand() {
    const L = this.level;
    const cn = Math.cos(this.nick);
    const vx = -Math.sin(this.gier) * cn, vz = -Math.cos(this.gier) * cn, vy = Math.sin(this.nick);
    for (let s = 0.2; s < 3; s += 0.2) {
      const y = this.augen + vy * s;
      if (y < 0.05 || y > 3.35) return s;
      const [r, c] = L.zelle(this.x + vx * s, this.z + vz * s);
      const ch = L.zeichen(r, c);
      if (ch === '#' || ch === 'E' || (ch === 'D' && !L.tuer(r, c).offen)) return s;
    }
    return 3;
  }

  lampeUmschalten() {
    if (!this.lampe && this.batterie < 0.03) return;
    this.lampe = !this.lampe;
    this.ton.klick();
  }

  update(dt, ein) {
    // --- Blick ---------------------------------------------------------
    const b = ein.holeBlick();
    this.gier -= b.x;
    this.nick = clamp(this.nick - b.y, -1.35, 1.35);

    if (ein.einmal('ducken')) this.geduckt = !this.geduckt;
    if (ein.einmal('lampe')) this.lampeUmschalten();

    // --- Bewegung ------------------------------------------------------
    const baelle = this.imBaellebad;
    const willRennen = ein.rennen && (ein.gehen.y > 0.2 || Math.abs(ein.gehen.x) > 0.2) && !this.erschoepft;
    if (willRennen && this.geduckt) this.geduckt = false;
    let tempo = this.geduckt ? SPIELER.geduckt : willRennen ? SPIELER.rennen : SPIELER.gehen;
    if (baelle) tempo *= SPIELER.baelleBremse;

    const sin = Math.sin(this.gier), cos = Math.cos(this.gier);
    const vx = (-sin * ein.gehen.y + cos * ein.gehen.x) * tempo;
    const vz = (-cos * ein.gehen.y - sin * ein.gehen.x) * tempo;
    const pos = { x: this.x + vx * dt, z: this.z + vz * dt };
    this.level.kollidiere(pos, SPIELER.radius);
    const weg = Math.hypot(pos.x - this.x, pos.z - this.z);
    this.x = pos.x; this.z = pos.z;
    this.tempo = weg / Math.max(dt, 1e-4);
    const bewegt = this.tempo > 0.3;
    const rennt = willRennen && bewegt;

    // --- Ausdauer ------------------------------------------------------
    if (rennt) {
      this.ausdauer -= dt / SPIELER.ausdauer;
      if (this.ausdauer <= 0) { this.ausdauer = 0; this.erschoepft = true; }
    } else {
      this.ausdauer = Math.min(1, this.ausdauer + dt / SPIELER.erholung);
      if (this.ausdauer > 0.35) this.erschoepft = false;
    }

    // --- Lampe ---------------------------------------------------------
    if (this.lampe) {
      this.batterie -= dt / SPIELER.batterie;
      if (this.batterie <= 0) { this.batterie = 0; this.lampe = false; this.ton.klick(); }
    } else {
      this.batterie = Math.min(1, this.batterie + dt * SPIELER.batterieLaden);
    }
    // bei wenig Saft flackert sie
    let hell = 1;
    if (this.lampe && this.batterie < 0.2) {
      this.flackern -= dt;
      if (this.flackern <= 0) this.flackern = Math.random() * 0.6;
      hell = this.flackern < 0.08 ? 0.15 : 0.6 + this.batterie * 2;
    }
    // Dicht vor der Wand blendet sie sonst alles weiß aus
    const nah = clamp(Math.pow(this._wandAbstand() / 3, 1.3), 0.2, 1);
    this.lampenLicht.visible = this.lampe;
    this.lampenLicht.intensity = 22 * hell * nah;

    // --- Geräusche -----------------------------------------------------
    this.laerm = 0;
    if (bewegt && !this.geduckt) {
      const H = MONSTER.hoeren;
      this.laerm = baelle ? (rennt ? H.baelleRennen : H.baelle) : (rennt ? H.rennen : H.gehen);
    }
    if (bewegt) {
      this.schrittUhr -= dt * (this.tempo / 1.6);
      if (this.schrittUhr <= 0) {
        this.schrittUhr = 1;
        if (!this.geduckt || baelle) this.ton.schritt(baelle, rennt);
      }
    }

    // --- Kamera --------------------------------------------------------
    const A = SPIELER.augenhoehe;
    const soll = this.geduckt ? (baelle ? A.baelleDucken : A.ducken) : (baelle ? A.baelle : A.stehen);
    this.augen += (soll - this.augen) * Math.min(1, dt * 7);
    this.wipp += dt * this.tempo * 2.2;
    const wipp = bewegt ? Math.sin(this.wipp * 2) * 0.035 * Math.min(1, this.tempo / 3) : 0;

    const k = this.kamera;
    k.position.set(this.x, this.augen + wipp, this.z);
    k.rotation.set(this.nick, this.gier, Math.sin(this.wipp) * 0.006 * this.tempo, 'YXZ');
  }
}
