import * as THREE from 'three';
import { MONSTER } from './config.js';

const OBEN = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _q = new THREE.Quaternion();

/**
 * Ein Glied aus zwei Knochen, das per IK auf einen Fußpunkt zielt.
 * Knie bzw. Ellbogen knicken in Richtung `hinweis` — nach außen und
 * oben, das gibt die Spinnenhaltung.
 */
class Glied {
  constructor(eltern, anker, l1, l2, hinweis, material, dicke) {
    this.anker = anker;
    this.l1 = l1;
    this.l2 = l2;
    this.hinweis = hinweis.clone().normalize();
    this.fuss = new THREE.Vector3();

    const zyl = (r1, r2) => {
      const g = new THREE.CylinderGeometry(r1, r2, 1, 7, 1);
      g.translate(0, 0.5, 0);
      const m = new THREE.Mesh(g, material);
      m.castShadow = true;
      eltern.add(m);
      return m;
    };
    this.oben = zyl(dicke * 0.75, dicke);
    this.unten = zyl(dicke * 0.35, dicke * 0.7);

    const gelenk = new THREE.Mesh(new THREE.SphereGeometry(dicke * 1.05, 8, 6), material);
    eltern.add(gelenk);
    this.gelenk = gelenk;

    // drei Krallen an der Hand
    this.krallen = new THREE.Group();
    for (let i = -1; i <= 1; i++) {
      const k = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.2, 5), material);
      k.rotation.x = Math.PI / 2 + 0.5;
      k.position.set(i * 0.045, 0.02, 0.08);
      k.rotation.z = i * 0.25;
      this.krallen.add(k);
    }
    eltern.add(this.krallen);
  }

  setze(fuss) {
    this.fuss.copy(fuss);
    const A = this.anker;
    const dir = _a.subVectors(fuss, A);
    let d = dir.length();
    d = Math.min(d, this.l1 + this.l2 - 0.001);
    dir.normalize();

    const a = (this.l1 * this.l1 - this.l2 * this.l2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, this.l1 * this.l1 - a * a));
    const knick = _b.copy(this.hinweis).addScaledVector(dir, -this.hinweis.dot(dir)).normalize();
    const knie = _c.copy(A).addScaledVector(dir, a).addScaledVector(knick, h);
    const ende = new THREE.Vector3().copy(A).addScaledVector(dir, d);

    this._knochen(this.oben, A, knie);
    this._knochen(this.unten, knie, ende);
    this.gelenk.position.copy(knie);
    this.krallen.position.copy(ende);
  }

  _knochen(mesh, von, nach) {
    const v = new THREE.Vector3().subVectors(nach, von);
    const l = v.length();
    mesh.position.copy(von);
    mesh.quaternion.setFromUnitVectors(OBEN, v.divideScalar(l || 1));
    mesh.scale.set(1, l, 1);
  }
}

/**
 * Der Körper: dürr, grau, auf allen vieren — mit einem aufgeklebten
 * Gesicht, das sich immer zur Kamera dreht.
 */
export class MonsterModell {
  constructor(gesicht) {
    this.wurzel = new THREE.Group();
    this.koerper = new THREE.Group();
    this.koerper.scale.setScalar(1.2);
    this.wurzel.add(this.koerper);

    const haut = new THREE.MeshPhongMaterial({ color: 0x3b3739, shininess: 28, specular: 0x222222 });

    const rumpf = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.7, 4, 10), haut);
    rumpf.rotation.x = Math.PI / 2 - 0.25;
    rumpf.position.set(0, 0.8, 0);
    rumpf.scale.set(1.15, 1, 0.85);
    rumpf.castShadow = true;
    this.koerper.add(rumpf);

    // Wirbelsäule und Rippen
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      const w = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), haut);
      w.position.set(0, 0.95 + t * 0.15, -0.42 + t * 0.8);
      this.koerper.add(w);
    }
    for (let i = 0; i < 4; i++) {
      const rippe = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.015, 5, 12, Math.PI), haut);
      rippe.position.set(0, 0.86 + i * 0.03, 0.05 + i * 0.09);
      rippe.rotation.set(-0.25, 0, Math.PI);
      this.koerper.add(rippe);
    }

    const hals = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.32, 4, 8), haut);
    hals.position.set(0, 1.05, 0.52);
    hals.rotation.x = 0.9;
    this.koerper.add(hals);

    // Gesicht: flacher Aufkleber, wie ausgeschnitten
    const tex = gesicht;
    const seiten = tex.image ? tex.image.width / tex.image.height : 0.72;
    const hoehe = 0.78;
    this.gesicht = new THREE.Mesh(
      new THREE.PlaneGeometry(hoehe * seiten, hoehe),
      new THREE.MeshLambertMaterial({
        map: tex, alphaTest: 0.5, side: THREE.DoubleSide,
        emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.06,
      }),
    );
    this.kopfPunkt = new THREE.Object3D();
    this.kopfPunkt.position.set(0, 1.24, 0.84);
    this.koerper.add(this.kopfPunkt);
    this.kopfPunkt.add(this.gesicht);
    this.gesicht.castShadow = true;

    const arm = (s) => new Glied(this.koerper, new THREE.Vector3(s * 0.2, 0.88, 0.35), 0.68, 0.8, new THREE.Vector3(s, 1.2, -0.2), haut, 0.06);
    const bein = (s) => new Glied(this.koerper, new THREE.Vector3(s * 0.17, 0.74, -0.38), 0.62, 0.7, new THREE.Vector3(s, 1.0, 0.3), haut, 0.066);
    // Reihenfolge: vorn links, vorn rechts, hinten links, hinten rechts
    this.glieder = [arm(-1), arm(1), bein(-1), bein(1)];
    this.ruhe = [
      new THREE.Vector3(-0.6, 0, 0.75), new THREE.Vector3(0.6, 0, 0.75),
      new THREE.Vector3(-0.55, 0, -0.5), new THREE.Vector3(0.55, 0, -0.5),
    ];
    this.versatz = [0, 0.5, 0.5, 0];

    this.phase = 0;
    this.zeit = 0;
    this._fuss = new THREE.Vector3();
    this._unten = [true, true, true, true];

    /** Wird gerufen, wenn eine Hand aufsetzt. */
    this.aufsetzen = () => {};
  }

  /**
   * @param {number} tempo   m/s, treibt den Gang
   * @param {THREE.Camera} kamera  das Gesicht schaut immer dorthin
   */
  update(dt, tempo, kamera, wut = 0) {
    this.zeit += dt;
    const schritt = Math.min(0.75, tempo * 0.2);
    this.phase += dt * (0.4 + tempo * 0.55);

    for (let i = 0; i < 4; i++) {
      const s = (this.phase + this.versatz[i]) % 1;
      const f = this._fuss.copy(this.ruhe[i]);
      let unten;
      if (s < 0.6) {
        f.z += schritt * (0.5 - s / 0.6);
        unten = true;
      } else {
        const t = (s - 0.6) / 0.4;
        f.z += schritt * (-0.5 + t);
        f.y += Math.sin(Math.PI * t) * (0.12 + schritt * 0.25);
        unten = false;
      }
      if (unten && !this._unten[i] && tempo > 0.3) this.aufsetzen(i);
      this._unten[i] = unten;
      this.glieder[i].setze(f);
    }

    // Körper wippt mit dem Gang, zittert in Ruhe
    const wipp = Math.sin(this.phase * Math.PI * 4) * 0.03 * Math.min(1, tempo);
    this.koerper.position.y = wipp + Math.sin(this.zeit * 7) * 0.006;
    this.koerper.rotation.z = Math.sin(this.phase * Math.PI * 2) * 0.05 * Math.min(1, tempo);

    // Gesicht zur Kamera, mit leichtem Wackeln — wie ein Aufkleber
    this.gesicht.lookAt(kamera.position);
    this.gesicht.rotateZ(Math.sin(this.zeit * (2.3 + wut * 6)) * (0.12 + wut * 0.15));
    const zucken = wut > 0.5 && Math.random() < 0.08 ? 1.08 : 1;
    this.gesicht.scale.setScalar(zucken);
  }
}

// -------------------------------------------------------------------
// Verhalten
// -------------------------------------------------------------------

const zufall = (a, b) => a + Math.random() * (b - a);

/**
 * Was das Monster tut. Es schleicht umher, folgt Geräuschen, jagt,
 * sobald es dich sieht, und sucht, wo es dich verloren hat.
 */
export class Monster {
  constructor(level, modell, ton) {
    this.level = level;
    this.modell = modell;
    this.ton = ton;
    this.pos = { x: 0, z: 0 };
    this.reset();
  }

  reset() {
    const s = this.level.monsterStart;
    this.pos.x = s.x; this.pos.z = s.z;
    this.richtung = Math.PI;
    this.tempo = 0;
    this.zustand = 'schlaf';
    this.uhr = MONSTER.schlaf;
    this.weg = null;
    this.ziel = null;
    this.planUhr = 0;
    this.zuletzt = null;
    this.ahnung = 0;
    this.redeUhr = zufall(3, 6);
    this.letzterSatz = null;
    this.wartet = 0;
    this.feststeck = { x: s.x, z: s.z, uhr: 1 };
    this.sieht = false;
    this.wut = 0;
    this.tage = 0;
    this.modell.wurzel.position.set(s.x, 0, s.z);
  }

  get abstandZumSpieler() { return this._abstand ?? Infinity; }

  /** Sagt einen zufälligen Satz, nicht zweimal denselben hintereinander. */
  rede(satz = null) {
    if (this.ton.redet()) return;
    if (!satz) {
      const auswahl = ['wohlstand', 'zaehne', 'stadtbild', 'paschas'].filter((s) => s !== this.letzterSatz);
      satz = auswahl[(Math.random() * auswahl.length) | 0];
    }
    this.letzterSatz = satz;
    this.ton.sprich(satz, this.pos);
  }

  /** Alarm: kennt den Standort des Spielers für ein paar Sekunden. */
  alarm(spieler, sekunden) {
    this.ahnung = sekunden;
    this.zuletzt = { x: spieler.x, z: spieler.z };
    if (this.zustand !== 'jagd') this._wechsel('jagd');
  }

  _wechsel(z) {
    this.zustand = z;
    this.weg = null;
    this.planUhr = 0;
    if (z === 'suche') this.uhr = MONSTER.sucheSekunden;
    if (z === 'patrouille') this.ziel = null;
  }

  _sieht(sp) {
    const dx = sp.x - this.pos.x, dz = sp.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    const S = MONSTER.sicht;
    let weite = sp.lampe ? S.lampe : S.dunkel;
    if (sp.geduckt) weite = Math.min(weite, S.geduckt);
    if (sp.versteckt) weite = S.versteckt;
    if (d > weite && !(sp.lampe && sp.leuchtetAuf(this.pos) && d < 18 && !sp.versteckt)) return false;
    if (!this.level.sichtfrei(this.pos.x, this.pos.z, sp.x, sp.z)) return false;

    // Leuchtet man ihm ins Gesicht, merkt er es sofort.
    if (sp.lampe && !sp.versteckt && sp.leuchtetAuf(this.pos)) return true;

    if (d < 3.2) return true;
    let w = Math.atan2(dx, dz) - this.richtung;
    w = Math.atan2(Math.sin(w), Math.cos(w));
    return Math.abs(w) < MONSTER.blickwinkel;
  }

  /**
   * @returns {boolean} true, wenn er den Spieler gefangen hat
   */
  update(dt, sp) {
    const dx = sp.x - this.pos.x, dz = sp.z - this.pos.z;
    this._abstand = Math.hypot(dx, dz);
    this.redeUhr -= dt;
    this.ahnung = Math.max(0, this.ahnung - dt);

    if (this.zustand === 'schlaf') {
      this.uhr -= dt;
      this.tempo = 0;
      if (this.uhr <= 0) { this._wechsel('patrouille'); this.rede('wohlstand'); }
      this._modell(dt, sp);
      return false;
    }

    // --- Wahrnehmung -------------------------------------------------
    this.sieht = this._sieht(sp);
    if (this.sieht) {
      this.zuletzt = { x: sp.x, z: sp.z };
      this.ahnung = Math.max(this.ahnung, 1.4);
      if (this.zustand !== 'jagd') {
        this._wechsel('jagd');
        this.ton.entdeckt(this.pos);
        this.redeUhr = 0;
      }
    } else if (sp.laerm > 0 && this.zustand !== 'jagd') {
      const frei = this.level.sichtfrei(this.pos.x, this.pos.z, sp.x, sp.z);
      if (this._abstand < sp.laerm * (frei ? 1 : 0.6)) {
        this.zuletzt = { x: sp.x + zufall(-1.5, 1.5), z: sp.z + zufall(-1.5, 1.5) };
        if (this.zustand !== 'nachforschen') this._wechsel('nachforschen');
        else this.planUhr = Math.min(this.planUhr, 0.2);
      }
    }

    // Kurz nach dem Verlieren folgt er noch der echten Position —
    // sonst wäre jede Ecke ein sicheres Versteck.
    if (this.zustand === 'jagd' && !this.sieht && this.ahnung > 0 && !sp.versteckt) {
      this.zuletzt = { x: sp.x, z: sp.z };
    }

    // --- Gefangen? -----------------------------------------------------
    if (this._abstand < MONSTER.fangen && (!sp.versteckt || this._abstand < MONSTER.fangen * 0.9)) {
      this.zustand = 'fangen';
      return true;
    }

    // --- Ziel wählen ---------------------------------------------------
    let tempo = MONSTER.patrouille;
    let ziel = null;

    switch (this.zustand) {
      case 'jagd':
        tempo = MONSTER.jagd + this.tage * MONSTER.jagdProTag;
        ziel = this.zuletzt;
        if (!this.sieht && this.ahnung <= 0 && this._nah(ziel, 0.8)) this._wechsel('suche');
        break;
      case 'nachforschen':
        tempo = MONSTER.nachforschen + this.tage * 0.1;
        ziel = this.zuletzt;
        if (this._nah(ziel, 0.8)) { this._wechsel('suche'); this.uhr = 4; }
        break;
      case 'suche':
        tempo = MONSTER.patrouille + 0.4;
        this.uhr -= dt;
        if (!this.ziel || this._nah(this.ziel, 0.6)) this.ziel = this.level.zufallsZiel(this.zuletzt ?? this.pos, 4);
        ziel = this.ziel;
        if (this.uhr <= 0) this._wechsel('patrouille');
        break;
      default: // patrouille
        if (this.wartet > 0) { this.wartet -= dt; tempo = 0; break; }
        if (!this.ziel || this._nah(this.ziel, 0.7)) {
          if (this.ziel) this.wartet = zufall(0.5, 2);
          // oft in die Nähe des Spielers — sonst wird es langweilig
          const nahe = Math.random() < 0.55 + this.tage * 0.08;
          this.ziel = this.level.zufallsZiel(nahe ? sp : null, 9);
          this.weg = null;
        }
        ziel = this.ziel;
    }

    if (this.redeUhr <= 0) {
      this.rede();
      this.redeUhr = this.zustand === 'jagd' ? zufall(4, 7) : zufall(...MONSTER.redePause);
    }

    this.wut += ((this.zustand === 'jagd' ? 1 : 0) - this.wut) * Math.min(1, dt * 2);

    // --- Bewegen -------------------------------------------------------
    if (ziel && tempo > 0) this._gehe(dt, ziel, tempo, this.zustand === 'jagd' ? 0.45 : 1.2);
    else this.tempo += (0 - this.tempo) * Math.min(1, dt * 5);

    this._modell(dt, sp);
    return false;
  }

  _nah(p, d) { return p && Math.hypot(p.x - this.pos.x, p.z - this.pos.z) < d; }

  _gehe(dt, ziel, tempo, planAbstand) {
    const L = this.level;
    this.planUhr -= dt;

    let wohin;
    if (L.freieLinie(this.pos.x, this.pos.z, ziel.x, ziel.z, MONSTER.radius)) {
      wohin = ziel;
      this.weg = null;
    } else {
      if (!this.weg || this.planUhr <= 0 || !this.weg.length) {
        this.weg = L.weg(this.pos.x, this.pos.z, ziel.x, ziel.z) ?? [];
        this.planUhr = planAbstand;
      }
      while (this.weg.length > 1 && this._nah(this.weg[0], 0.45)) this.weg.shift();
      wohin = this.weg[0] ?? ziel;
    }

    // Türen auf dem Weg aufreißen
    const [r, c] = L.zelle(wohin.x, wohin.z);
    const t = L.tuer(r, c);
    if (t && !t.offen && this._nah(t, 2.4)) {
      if (t.oeffnen(this.pos.x, this.pos.z)) this.ton.tuerKnall(t);
      tempo = 0.2;
    }

    const dx = wohin.x - this.pos.x, dz = wohin.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.01) {
      const soll = Math.atan2(dx, dz);
      let w = soll - this.richtung;
      w = Math.atan2(Math.sin(w), Math.cos(w));
      this.richtung += Math.sign(w) * Math.min(Math.abs(w), dt * 5);
      // in scharfen Kurven langsamer
      tempo *= 1 - Math.min(0.7, Math.abs(w) * 0.5);
    }

    this.tempo += (tempo - this.tempo) * Math.min(1, dt * 4);
    const schritt = Math.min(this.tempo * dt, d);
    this.pos.x += Math.sin(this.richtung) * schritt;
    this.pos.z += Math.cos(this.richtung) * schritt;
    L.kollidiere(this.pos, MONSTER.radius);

    // festgefahren? neu planen, notfalls neues Ziel
    this.feststeck.uhr -= dt;
    if (this.feststeck.uhr <= 0) {
      const weit = Math.hypot(this.pos.x - this.feststeck.x, this.pos.z - this.feststeck.z);
      if (weit < 0.15 && this.tempo > 0.3) { this.weg = null; this.planUhr = 0; this.ziel = null; }
      this.feststeck = { x: this.pos.x, z: this.pos.z, uhr: 1 };
    }
  }

  _modell(dt, sp) {
    const w = this.modell.wurzel;
    w.position.set(this.pos.x, 0, this.pos.z);
    w.rotation.y = this.richtung;
    this.modell.update(dt, this.tempo, sp.kamera, this.wut);
  }
}
