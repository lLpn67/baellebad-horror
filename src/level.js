import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { KARTE, ZELLE, HOEHE } from './config.js';
import * as TX from './texturen.js';

const Z = ZELLE;
const H = HOEHE;
const TUER_BREITE = 1.0;
const TUER_HOEHE = 2.2;
const WAND = new Set(['#', 'E']);

/**
 * Sammelt Vierecke für ein Material und baut daraus am Ende eine
 * einzige Geometrie — eine Zeichenoperation je Material.
 */
class Bau {
  constructor() { this.p = []; this.n = []; this.uv = []; this.i = []; }

  /** Viereck aus vier Ecken (gegen den Uhrzeigersinn von vorn gesehen). */
  viereck(a, b, c, d, normale, uvs) {
    const s = this.p.length / 3;
    for (const v of [a, b, c, d]) this.p.push(v[0], v[1], v[2]);
    for (let k = 0; k < 4; k++) this.n.push(normale[0], normale[1], normale[2]);
    for (const t of uvs) this.uv.push(t[0], t[1]);
    this.i.push(s, s + 1, s + 2, s, s + 2, s + 3);
  }

  /**
   * Senkrechte Wandfläche von (x1,z1) nach (x2,z2), sichtbar von der
   * Seite, in die `normale` zeigt. U läuft mit der Weltlänge, damit die
   * Wolken über Zellgrenzen hinweg weiterlaufen.
   */
  wand(x1, z1, x2, z2, y1, y2, normale, uAnfang) {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const u1 = uAnfang / 4, u2 = (uAnfang + len) / 4;
    this.viereck(
      [x1, y1, z1], [x2, y1, z2], [x2, y2, z2], [x1, y2, z1],
      normale,
      [[u1, y1 / H], [u2, y1 / H], [u2, y2 / H], [u1, y2 / H]],
    );
  }

  /** Waagerechte Fläche, nach oben oder unten sichtbar. */
  flaeche(x1, z1, x2, z2, y, oben, uvMass) {
    const u = (x) => x / uvMass;
    if (oben) {
      this.viereck([x1, y, z2], [x2, y, z2], [x2, y, z1], [x1, y, z1], [0, 1, 0],
        [[u(x1), u(-z2)], [u(x2), u(-z2)], [u(x2), u(-z1)], [u(x1), u(-z1)]]);
    } else {
      this.viereck([x1, y, z1], [x2, y, z1], [x2, y, z2], [x1, y, z2], [0, -1, 0],
        [[u(x1), u(z1)], [u(x2), u(z1)], [u(x2), u(z2)], [u(x1), u(z2)]]);
    }
  }

  /** Quader mit Welt-UVs auf allen Seiten. */
  quader(x1, x2, y1, y2, z1, z2) {
    this.wand(x1, z2, x2, z2, y1, y2, [0, 0, 1], x1);    // +z
    this.wand(x2, z1, x1, z1, y1, y2, [0, 0, -1], -x2);  // -z
    this.wand(x2, z2, x2, z1, y1, y2, [1, 0, 0], -z2);   // +x
    this.wand(x1, z1, x1, z2, y1, y2, [-1, 0, 0], z1);   // -x
    this.flaeche(x1, z1, x2, z2, y1, false, 2);
  }

  geometrie() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.i);
    g.computeBoundingSphere();
    return g;
  }
}

/**
 * Eine Tür in einer Türzelle. Sie dreht sich um ein Scharnier an einer
 * Seite der Öffnung und schwingt immer vom Öffnenden weg.
 */
class Tuer {
  constructor(r, c, quer, holz) {
    this.r = r; this.c = c;
    /** quer: Türblatt liegt entlang x, man geht in z-Richtung hindurch. */
    this.quer = quer;
    this.x = c * Z + Z / 2;
    this.z = r * Z + Z / 2;
    this.winkel = 0;
    this.ziel = 0;

    this.dreh = new THREE.Group();
    if (quer) this.dreh.position.set(this.x - TUER_BREITE / 2, 0, this.z);
    else this.dreh.position.set(this.x, 0, this.z - TUER_BREITE / 2);

    const blatt = new THREE.Mesh(
      new THREE.BoxGeometry(quer ? TUER_BREITE - 0.02 : 0.05, TUER_HOEHE - 0.02, quer ? 0.05 : TUER_BREITE - 0.02),
      new THREE.MeshLambertMaterial({ map: holz }),
    );
    blatt.position.set(quer ? TUER_BREITE / 2 : 0, TUER_HOEHE / 2, quer ? 0 : TUER_BREITE / 2);
    blatt.castShadow = true;
    blatt.receiveShadow = true;
    this.dreh.add(blatt);

    // Klinke auf beiden Seiten
    const metall = new THREE.MeshPhongMaterial({ color: 0xc8c8c8, shininess: 90 });
    for (const s of [-1, 1]) {
      const griff = new THREE.Mesh(new THREE.BoxGeometry(quer ? 0.14 : 0.03, 0.03, quer ? 0.03 : 0.14), metall);
      const ab = TUER_BREITE - 0.14;
      griff.position.set(quer ? ab : s * 0.06, 1.05, quer ? s * 0.06 : ab);
      this.dreh.add(griff);
    }
  }

  get offen() { return Math.abs(this.winkel) > 1.0; }

  /** Öffnen, vom Punkt (x,z) weg. */
  oeffnen(x, z) {
    if (this.ziel !== 0) return false;
    if (this.quer) this.ziel = z > this.z ? 1.75 : -1.75;
    else this.ziel = x > this.x ? -1.75 : 1.75;
    return true;
  }

  schliessen() { if (this.ziel === 0) return false; this.ziel = 0; return true; }

  update(dt) {
    const d = this.ziel - this.winkel;
    this.winkel += Math.sign(d) * Math.min(Math.abs(d), dt * 3.2);
    this.dreh.rotation.y = this.winkel;
  }
}

export class Level {
  constructor(szene) {
    this.szene = szene;
    this.zeilen = KARTE.length;
    this.spalten = KARTE[0].length;
    this.raster = KARTE.map((z) => z.split(''));

    for (const [i, z] of KARTE.entries()) {
      if (z.length !== this.spalten) throw new Error(`Karte: Zeile ${i} hat ${z.length} statt ${this.spalten} Zeichen`);
    }

    this.tueren = [];
    this.tuerAn = new Map();
    this.blattPlaetze = [];
    this.lichter = [];

    for (let r = 0; r < this.zeilen; r++) {
      for (let c = 0; c < this.spalten; c++) {
        const ch = this.raster[r][c];
        if (ch === 'S') this.start = this.mitte(r, c);
        if (ch === 'M') this.monsterStart = this.mitte(r, c);
        if (ch === 'T') this.blattPlaetze.push({ r, c, ...this.mitte(r, c) });
        if (ch === 'E') this.ausgang = { r, c, ...this.mitte(r, c) };
      }
    }

    this._baue();
  }

  // ---------------------------------------------------------------
  // Abfragen
  // ---------------------------------------------------------------

  zeichen(r, c) {
    if (r < 0 || c < 0 || r >= this.zeilen || c >= this.spalten) return '#';
    return this.raster[r][c];
  }

  mitte(r, c) { return { x: c * Z + Z / 2, z: r * Z + Z / 2 }; }

  zelle(x, z) { return [Math.floor(z / Z), Math.floor(x / Z)]; }

  /** Bodenart einer Zelle: 'teppich', 'baelle', 'buero' oder null für Wand. */
  boden(r, c) {
    const ch = this.zeichen(r, c);
    if (WAND.has(ch)) return null;
    if (ch === 'b' || ch === 'B') return 'baelle';
    if (ch === 'O') return 'buero';
    if (ch === 'T' || ch === 'S' || ch === 'M') {
      let b = 0, o = 0;
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = this.zeichen(r + dr, c + dc);
        if (n === 'b' || n === 'B') b++;
        if (n === 'O') o++;
      }
      if (b >= 2) return 'baelle';
      if (o >= 2) return 'buero';
    }
    return 'teppich';
  }

  imBaellebad(x, z) {
    const [r, c] = this.zelle(x, z);
    return this.boden(r, c) === 'baelle';
  }

  /** Für den Weg des Monsters: Türen zählen als begehbar, es öffnet sie. */
  begehbar(r, c) {
    const ch = this.zeichen(r, c);
    return !WAND.has(ch) && ch !== 'B';
  }

  tuer(r, c) { return this.tuerAn.get(r * 1000 + c); }

  /** Hindernisse einer Zelle als Kästen [x1, z1, x2, z2]. */
  _kaesten(r, c, aus) {
    const ch = this.zeichen(r, c);
    const x1 = c * Z, z1 = r * Z, x2 = x1 + Z, z2 = z1 + Z;
    if (WAND.has(ch)) { aus.push([x1, z1, x2, z2]); return; }
    if (ch === 'B') { aus.push([x1 + 0.2, z1 + 0.2, x2 - 0.2, z2 - 0.2]); return; }
    if (ch === 'D') {
      const t = this.tuer(r, c);
      const h = TUER_BREITE / 2;
      const mx = x1 + Z / 2, mz = z1 + Z / 2;
      if (t.quer) {
        aus.push([x1, z1, mx - h, z2], [mx + h, z1, x2, z2]);
        if (!t.offen) aus.push([mx - h, mz - 0.1, mx + h, mz + 0.1]);
      } else {
        aus.push([x1, z1, x2, mz - h], [x1, mz + h, x2, z2]);
        if (!t.offen) aus.push([mx - 0.1, mz - h, mx + 0.1, mz + h]);
      }
    }
  }

  /**
   * Kreis gegen die Karte: schiebt `pos` aus allen Hindernissen in der
   * Nähe heraus. Zwei Durchgänge, damit Ecken nicht durchrutschen.
   */
  kollidiere(pos, radius) {
    const kaesten = [];
    const [r0, c0] = this.zelle(pos.x, pos.z);
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) this._kaesten(r0 + dr, c0 + dc, kaesten);

    for (let durchgang = 0; durchgang < 2; durchgang++) {
      for (const [x1, z1, x2, z2] of kaesten) {
        const nx = Math.max(x1, Math.min(pos.x, x2));
        const nz = Math.max(z1, Math.min(pos.z, z2));
        let dx = pos.x - nx, dz = pos.z - nz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= radius * radius) continue;

        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          pos.x = nx + (dx / d) * radius;
          pos.z = nz + (dz / d) * radius;
        } else {
          // Mittelpunkt steckt im Kasten: kürzester Weg hinaus
          const raus = [pos.x - x1, x2 - pos.x, pos.z - z1, z2 - pos.z];
          const m = Math.min(...raus);
          if (m === raus[0]) pos.x = x1 - radius;
          else if (m === raus[1]) pos.x = x2 + radius;
          else if (m === raus[2]) pos.z = z1 - radius;
          else pos.z = z2 + radius;
        }
      }
    }
  }

  /** Blockiert die Zelle die Sicht? */
  _sperrtSicht(r, c) {
    const ch = this.zeichen(r, c);
    if (WAND.has(ch)) return true;
    if (ch === 'D') return !this.tuer(r, c).offen;
    return false;
  }

  /**
   * Sichtlinie zwischen zwei Punkten, Zelle für Zelle (Amanatides-Woo).
   */
  sichtfrei(ax, az, bx, bz) {
    let [r, c] = this.zelle(ax, az);
    const [rz, cz] = this.zelle(bx, bz);
    const dx = bx - ax, dz = bz - az;
    const sx = Math.sign(dx), sz = Math.sign(dz);
    const tdx = dx !== 0 ? Math.abs(Z / dx) : Infinity;
    const tdz = dz !== 0 ? Math.abs(Z / dz) : Infinity;
    let tmx = dx !== 0 ? ((sx > 0 ? (c + 1) * Z - ax : ax - c * Z) / Math.abs(dx)) : Infinity;
    let tmz = dz !== 0 ? ((sz > 0 ? (r + 1) * Z - az : az - r * Z) / Math.abs(dz)) : Infinity;

    for (let n = 0; n < 200; n++) {
      if (r === rz && c === cz) return true;
      if (tmx < tmz) { tmx += tdx; c += sx; } else { tmz += tdz; r += sz; }
      if (r === rz && c === cz) return true;
      if (this._sperrtSicht(r, c)) return false;
    }
    return true;
  }

  /** Ist die Strecke für einen Körper mit Radius frei (ohne Türen zu öffnen)? */
  freieLinie(ax, az, bx, bz, radius) {
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1e-3) return true;
    const ux = (bx - ax) / len, uz = (bz - az) / len;
    const px = -uz * radius, pz = ux * radius;
    for (let s = 0; s <= len; s += 0.25) {
      const x = ax + ux * s, z = az + uz * s;
      for (const k of [0, 1, -1]) {
        const [r, c] = this.zelle(x + px * k, z + pz * k);
        if (!this.begehbar(r, c)) return false;
        if (this.zeichen(r, c) === 'D' && !this.tuer(r, c).offen) return false;
      }
    }
    return true;
  }

  /**
   * A* auf dem Raster. Liefert Wegpunkte in Weltkoordinaten, schon
   * geglättet, der letzte ist das Ziel selbst.
   */
  weg(ax, az, bx, bz) {
    const [ra, ca] = this.zelle(ax, az);
    let [rb, cb] = this.zelle(bx, bz);
    if (!this.begehbar(rb, cb)) {
      // Ziel steckt in einem Block: nächste freie Nachbarzelle
      let best = null, bd = Infinity;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!this.begehbar(rb + dr, cb + dc)) continue;
        const m = this.mitte(rb + dr, cb + dc);
        const d = Math.hypot(m.x - bx, m.z - bz);
        if (d < bd) { bd = d; best = [rb + dr, cb + dc]; }
      }
      if (!best) return null;
      [rb, cb] = best;
      ({ x: bx, z: bz } = this.mitte(rb, cb));
    }

    const S = this.spalten;
    const key = (r, c) => r * S + c;
    const ziel = key(rb, cb);
    const g = new Map([[key(ra, ca), 0]]);
    const von = new Map();
    const offen = [[0, ra, ca]];
    const zu = new Set();

    while (offen.length) {
      // kleine Karte, lineare Suche genügt
      let bi = 0;
      for (let i = 1; i < offen.length; i++) if (offen[i][0] < offen[bi][0]) bi = i;
      const [, r, c] = offen.splice(bi, 1)[0];
      const k = key(r, c);
      if (k === ziel) break;
      if (zu.has(k)) continue;
      zu.add(k);

      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nr = r + dr, nc = c + dc;
        if (!this.begehbar(nr, nc)) continue;
        if (dr && dc) {
          // nicht um Ecken schneiden, nicht schräg durch Türen
          if (!this.begehbar(r + dr, c) || !this.begehbar(r, c + dc)) continue;
          if ([this.zeichen(nr, nc), this.zeichen(r, c)].includes('D')) continue;
        }
        const nk = key(nr, nc);
        const ng = g.get(k) + (dr && dc ? 1.414 : 1);
        if (ng < (g.get(nk) ?? Infinity)) {
          g.set(nk, ng);
          von.set(nk, k);
          offen.push([ng + Math.hypot(nr - rb, nc - cb), nr, nc]);
        }
      }
    }

    if (!g.has(ziel)) return null;
    const zellen = [];
    for (let k = ziel; k !== undefined; k = von.get(k)) zellen.push(k);
    zellen.reverse();

    const punkte = zellen.slice(1).map((k) => {
      const m = this.mitte(Math.floor(k / S), k % S);
      return { x: m.x, z: m.z };
    });
    if (punkte.length) punkte[punkte.length - 1] = { x: bx, z: bz };
    else punkte.push({ x: bx, z: bz });

    // Glätten: Wegpunkte überspringen, solange die Linie frei ist.
    // Türzellen bleiben drin, sonst schneidet er durch die Laibung.
    const glatt = [];
    let ax2 = ax, az2 = az, i = 0;
    while (i < punkte.length) {
      let j = i;
      while (j + 1 < punkte.length && this.freieLinie(ax2, az2, punkte[j + 1].x, punkte[j + 1].z, 0.4)) {
        const [r, c] = this.zelle(punkte[j].x, punkte[j].z);
        if (this.zeichen(r, c) === 'D') break;
        j++;
      }
      glatt.push(punkte[j]);
      ax2 = punkte[j].x; az2 = punkte[j].z;
      i = j + 1;
    }
    return glatt;
  }

  /** Zufällige begehbare Zelle, optional in der Nähe eines Punkts. */
  zufallsZiel(nahe = null, radius = 8) {
    for (let versuch = 0; versuch < 200; versuch++) {
      let r, c;
      if (nahe) {
        const [r0, c0] = this.zelle(nahe.x, nahe.z);
        const rz = Math.ceil(radius / Z);
        r = r0 + Math.round((Math.random() * 2 - 1) * rz);
        c = c0 + Math.round((Math.random() * 2 - 1) * rz);
      } else {
        r = (Math.random() * this.zeilen) | 0;
        c = (Math.random() * this.spalten) | 0;
      }
      const ch = this.zeichen(r, c);
      if (this.begehbar(r, c) && ch !== 'D') return this.mitte(r, c);
    }
    return this.monsterStart;
  }

  /** Nächste Tür in Reichweite, für den Tür-Knopf. */
  naechsteTuer(x, z, max = 1.9) {
    let best = null, bd = max;
    for (const t of this.tueren) {
      const d = Math.hypot(t.x - x, t.z - z);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }

  update(dt) { for (const t of this.tueren) t.update(dt); }

  reset() { for (const t of this.tueren) { t.winkel = t.ziel = 0; t.update(0); } }

  // ---------------------------------------------------------------
  // Aufbau der Geometrie
  // ---------------------------------------------------------------

  _baue() {
    const holz = TX.holzTextur();
    const bau = {
      wand: new Bau(), bueroWand: new Bau(), teppich: new Bau(),
      bueroBoden: new Bau(), baelleBoden: new Bau(), decke: new Bau(), rahmen: new Bau(),
    };

    for (let r = 0; r < this.zeilen; r++) {
      for (let c = 0; c < this.spalten; c++) {
        const ch = this.zeichen(r, c);
        if (WAND.has(ch)) continue;
        const x1 = c * Z, z1 = r * Z, x2 = x1 + Z, z2 = z1 + Z;
        const art = this.boden(r, c);

        if (art === 'baelle') bau.baelleBoden.flaeche(x1, z1, x2, z2, 0.3, true, 3);
        else if (art === 'buero') bau.bueroBoden.flaeche(x1, z1, x2, z2, 0, true, 2);
        else bau.teppich.flaeche(x1, z1, x2, z2, 0, true, 2);
        bau.decke.flaeche(x1, z1, x2, z2, H, false, 2);

        if (ch === 'D') { this._baueTuer(r, c, bau, holz); continue; }

        const w = art === 'buero' ? bau.bueroWand : bau.wand;
        if (WAND.has(this.zeichen(r - 1, c))) w.wand(x1, z1, x2, z1, 0, H, [0, 0, 1], x1);
        if (WAND.has(this.zeichen(r + 1, c))) w.wand(x2, z2, x1, z2, 0, H, [0, 0, -1], -x2);
        if (WAND.has(this.zeichen(r, c - 1))) w.wand(x1, z2, x1, z1, 0, H, [1, 0, 0], -z2);
        if (WAND.has(this.zeichen(r, c + 1))) w.wand(x2, z1, x2, z2, 0, H, [-1, 0, 0], z1);
      }
    }

    const mat = {
      wand: new THREE.MeshLambertMaterial({ map: TX.wandTextur() }),
      bueroWand: new THREE.MeshLambertMaterial({ map: TX.bueroWandTextur() }),
      teppich: new THREE.MeshLambertMaterial({ map: TX.teppichTextur() }),
      bueroBoden: new THREE.MeshLambertMaterial({ map: TX.bueroBodenTextur() }),
      baelleBoden: new THREE.MeshLambertMaterial({ map: TX.baelleBodenTextur() }),
      decke: new THREE.MeshLambertMaterial({ map: TX.deckenTextur() }),
      rahmen: new THREE.MeshLambertMaterial({ color: 0xe8e4da }),
    };

    for (const [name, b] of Object.entries(bau)) {
      if (!b.p.length) continue;
      const m = new THREE.Mesh(b.geometrie(), mat[name]);
      m.receiveShadow = true;
      m.castShadow = name === 'wand' || name === 'bueroWand' || name === 'rahmen';
      m.matrixAutoUpdate = false;
      this.szene.add(m);
    }

    this._baueBloecke();
    this._baueAusgang();
    this._baueBuero();
    this._baueDeko();
  }

  _baueTuer(r, c, bau, holz) {
    const x1 = c * Z, z1 = r * Z, x2 = x1 + Z, z2 = z1 + Z;
    const mx = x1 + Z / 2, mz = z1 + Z / 2, h = TUER_BREITE / 2;
    // quer, wenn oben und unten frei sind: man geht in z-Richtung durch
    const quer = !WAND.has(this.zeichen(r - 1, c)) && !WAND.has(this.zeichen(r + 1, c));
    const w = bau.wand;

    if (quer) {
      w.quader(x1, mx - h, 0, H, z1, z2);
      w.quader(mx + h, x2, 0, H, z1, z2);
      w.quader(mx - h, mx + h, TUER_HOEHE, H, z1, z2);
      // weiße Zarge an beiden Mündungen
      for (const zz of [z1, z2 - 0.04]) {
        bau.rahmen.quader(mx - h - 0.08, mx - h, 0, TUER_HOEHE + 0.08, zz - 0.02, zz + 0.06);
        bau.rahmen.quader(mx + h, mx + h + 0.08, 0, TUER_HOEHE + 0.08, zz - 0.02, zz + 0.06);
        bau.rahmen.quader(mx - h, mx + h, TUER_HOEHE, TUER_HOEHE + 0.08, zz - 0.02, zz + 0.06);
      }
    } else {
      w.quader(x1, x2, 0, H, z1, mz - h);
      w.quader(x1, x2, 0, H, mz + h, z2);
      w.quader(x1, x2, TUER_HOEHE, H, mz - h, mz + h);
      for (const xx of [x1, x2 - 0.04]) {
        bau.rahmen.quader(xx - 0.02, xx + 0.06, 0, TUER_HOEHE + 0.08, mz - h - 0.08, mz - h);
        bau.rahmen.quader(xx - 0.02, xx + 0.06, 0, TUER_HOEHE + 0.08, mz + h, mz + h + 0.08);
        bau.rahmen.quader(xx - 0.02, xx + 0.06, TUER_HOEHE, TUER_HOEHE + 0.08, mz - h, mz + h);
      }
    }

    const t = new Tuer(r, c, quer, holz);
    this.tueren.push(t);
    this.tuerAn.set(r * 1000 + c, t);
    this.szene.add(t.dreh);
  }

  /** Schaumstoffblöcke im Bällebad, wie auf dem Spielplatz. */
  _baueBloecke() {
    const farben = [0xf2c21b, 0xd8263a, 0x1f9fb0, 0x2a62c9];
    let i = 0;
    for (let r = 0; r < this.zeilen; r++) for (let c = 0; c < this.spalten; c++) {
      if (this.zeichen(r, c) !== 'B') continue;
      const m = this.mitte(r, c);
      const hoehe = 1.0 + ((r * 7 + c * 3) % 5) * 0.15;
      const block = new THREE.Mesh(
        new RoundedBoxGeometry(1.6, hoehe, 1.6, 3, 0.12),
        new THREE.MeshLambertMaterial({ color: farben[i++ % farben.length] }),
      );
      block.position.set(m.x, hoehe / 2, m.z);
      block.rotation.y = ((r + c) % 3) * 0.08;
      block.castShadow = block.receiveShadow = true;
      this.szene.add(block);

      // manchmal ein Keil obendrauf
      if ((r + c) % 2 === 0) {
        const keil = new THREE.Mesh(
          keilGeometrie(1.2, 0.6, 1.2),
          new THREE.MeshLambertMaterial({ color: farben[(i + 1) % farben.length] }),
        );
        keil.position.set(m.x, hoehe, m.z);
        keil.rotation.y = (r * c) % 4 * (Math.PI / 2);
        keil.castShadow = true;
        this.szene.add(keil);
      }
    }
  }

  /** Notausgang: Tür in der Außenwand, grünes Schild, grünes Licht. */
  _baueAusgang() {
    const a = this.ausgang;
    // zur offenen Nachbarzelle hin
    let nx = 0, nz = 0;
    for (const [dr, dc] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      if (!WAND.has(this.zeichen(a.r + dr, a.c + dc))) { nx = dc; nz = dr; break; }
    }
    const fx = a.x + nx * (Z / 2 + 0.01), fz = a.z + nz * (Z / 2 + 0.01);
    const winkel = Math.atan2(nx, nz);

    const gruppe = new THREE.Group();
    gruppe.position.set(fx, 0, fz);
    gruppe.rotation.y = winkel;
    this.szene.add(gruppe);

    const tuer = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, TUER_HOEHE),
      new THREE.MeshLambertMaterial({ color: 0x5f6b66 }),
    );
    tuer.position.y = TUER_HOEHE / 2;
    gruppe.add(tuer);

    const stange = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.06, 0.08),
      new THREE.MeshPhongMaterial({ color: 0xbfc4c0, shininess: 80 }),
    );
    stange.position.set(0, 1.0, 0.05);
    gruppe.add(stange);

    const schild = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.34),
      new THREE.MeshBasicMaterial({ map: TX.notausgangTextur() }),
    );
    schild.position.set(0, TUER_HOEHE + 0.35, 0.02);
    gruppe.add(schild);

    const licht = new THREE.PointLight(0x2bff6a, 4, 9, 2);
    licht.position.set(0, TUER_HOEHE + 0.3, 0.6);
    gruppe.add(licht);
    this.ausgangLicht = licht;
    this.ausgangPunkt = { x: a.x + nx * (Z / 2 + 0.4), z: a.z + nz * (Z / 2 + 0.4) };
  }

  /** Das Büro: grünes Neonlicht, Schreibtisch, Bildschirm, Fähnchen. */
  _baueBuero() {
    const zellen = [];
    for (let r = 0; r < this.zeilen; r++) for (let c = 0; c < this.spalten; c++) {
      if (this.boden(r, c) === 'buero') zellen.push(this.mitte(r, c));
    }
    if (!zellen.length) return;
    const mx = zellen.reduce((s, p) => s + p.x, 0) / zellen.length;
    const mz = zellen.reduce((s, p) => s + p.z, 0) / zellen.length;

    const licht = new THREE.PointLight(0xd8ffe0, 9, 16, 1.6);
    licht.position.set(mx, H - 0.3, mz);
    this.szene.add(licht);
    this.bueroLicht = licht;

    const roehre = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.06, 0.16),
      new THREE.MeshBasicMaterial({ color: 0xeaffef }),
    );
    roehre.position.set(mx, H - 0.04, mz);
    this.szene.add(roehre);
    this.roehre = roehre;

    const hell = new THREE.MeshLambertMaterial({ color: 0xe9e6dc });
    const dunkel = new THREE.MeshLambertMaterial({ color: 0x2b2b30 });
    const tisch = new THREE.Group();
    tisch.position.set(mx - 0.6, 0, mz - 1.6);
    const platte = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.05, 0.8), hell);
    platte.position.y = 0.75;
    tisch.add(platte);
    for (const [x, z] of [[-0.85, -0.35], [0.85, -0.35], [-0.85, 0.35], [0.85, 0.35]]) {
      const bein = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.75, 0.05), dunkel);
      bein.position.set(x, 0.375, z);
      tisch.add(bein);
    }
    const monitor = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.38, 0.04), dunkel);
    monitor.position.set(0, 1.05, -0.2);
    tisch.add(monitor);
    const schirm = new THREE.Mesh(
      new THREE.PlaneGeometry(0.55, 0.33),
      new THREE.MeshBasicMaterial({ map: TX.bildschirmTextur() }),
    );
    schirm.position.set(0, 1.05, -0.177);
    tisch.add(schirm);
    const fuss = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.25, 0.06), dunkel);
    fuss.position.set(0, 0.88, -0.2);
    tisch.add(fuss);

    // Tischfähnchen
    const flagge = new THREE.Group();
    flagge.position.set(0.7, 0.78, 0.1);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.32), dunkel);
    mast.position.y = 0.16;
    flagge.add(mast);
    [0x111111, 0xdd0000, 0xffce00].forEach((farbe, i) => {
      const streifen = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.04), new THREE.MeshBasicMaterial({ color: farbe, side: THREE.DoubleSide }));
      streifen.position.set(0.1, 0.3 - i * 0.04, 0);
      flagge.add(streifen);
    });
    tisch.add(flagge);

    for (const o of tisch.children) o.castShadow = true;
    this.szene.add(tisch);

    const stuhl = new THREE.Group();
    stuhl.position.set(mx - 0.6, 0, mz - 0.8);
    const sitz = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.5), dunkel);
    sitz.position.y = 0.48;
    const lehne = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.06), dunkel);
    lehne.position.set(0, 0.8, 0.24);
    const saeule = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.45), dunkel);
    saeule.position.y = 0.23;
    stuhl.add(sitz, lehne, saeule);
    stuhl.rotation.y = 0.5;
    this.szene.add(stuhl);
  }

  /** Plakate und rote Lämpchen. */
  _baueDeko() {
    const plakate = [
      [[['BÄLLEBAD', 52], ['Bitte', 34], ['Schuhe', 34], ['ausziehen!', 34]], '#d61f33'],
      [[['SPIELPARADIES', 30], ['SONNEN-', 46], ['SCHEIN', 46]], '#1f7fe0'],
      [[['HEUTE', 46], ['GESCHLOSSEN', 36], ['Feierabend', 30], ['um 18 Uhr', 30]], '#2fb24a'],
      [[['NICHT', 52], ['TAUCHEN', 46], ['im Bällebad', 30]], '#f07a1a'],
      [[['Eltern', 40], ['haften', 40], ['für ihre', 34], ['Kinder', 40]], '#d23ec4'],
    ];

    // offene Wandflächen sammeln, an denen Platz ist
    const flaechen = [];
    for (let r = 0; r < this.zeilen; r++) for (let c = 0; c < this.spalten; c++) {
      if (!['.', 'b'].includes(this.zeichen(r, c))) continue;
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        if (this.zeichen(r + dr, c + dc) !== '#') continue;
        const m = this.mitte(r, c);
        flaechen.push({ x: m.x + dc * (Z / 2 - 0.02), z: m.z + dr * (Z / 2 - 0.02), winkel: Math.atan2(-dc, -dr), baelle: this.zeichen(r, c) === 'b' });
      }
    }

    const r = (() => { let s = 99; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();
    const gemischt = flaechen.sort(() => r() - 0.5);

    plakate.forEach(([zeilen, farbe], i) => {
      const f = gemischt[i * 7];
      const p = new THREE.Mesh(
        new THREE.PlaneGeometry(0.75, 1.05),
        new THREE.MeshLambertMaterial({ map: TX.plakatTextur(zeilen, farbe) }),
      );
      p.position.set(f.x, 1.55, f.z);
      p.rotation.y = f.winkel;
      p.rotation.z = (r() - 0.5) * 0.08;
      this.szene.add(p);
    });

    // rote Lämpchen, wie Notbeleuchtung im Dunkeln
    const lampe = new THREE.MeshBasicMaterial({ color: 0xff2030 });
    const schein = new THREE.SpriteMaterial({ map: glutTextur('255,40,50'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    for (let i = 0; i < 14; i++) {
      const f = gemischt[3 + i * 5];
      if (!f) break;
      const punkt = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), lampe);
      punkt.position.set(f.x, 2.75, f.z);
      this.szene.add(punkt);
      const s = new THREE.Sprite(schein);
      s.scale.set(0.5, 0.5, 1);
      s.position.copy(punkt.position);
      this.szene.add(s);
    }
  }
}

/** Keil: Rampe aus Schaumstoff. */
function keilGeometrie(b, h, t) {
  const g = new THREE.BufferGeometry();
  const x = b / 2, z = t / 2;
  const p = [
    -x, 0, -z, x, 0, -z, x, 0, z, -x, 0, z,     // Boden
    -x, h, -z, x, h, -z,                         // hohe Kante
  ];
  const i = [
    0, 2, 1, 0, 3, 2,           // unten
    3, 4, 5, 3, 5, 2,           // Schräge
    0, 1, 5, 0, 5, 4,           // Rückwand
    0, 4, 3,                    // Seite links
    1, 2, 5,                    // Seite rechts
  ];
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setIndex(i);
  const ng = g.toNonIndexed();
  ng.computeVertexNormals();
  return ng;
}

/** Weicher Lichtfleck für Sprites. */
export function glutTextur(rgb) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const v = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  v.addColorStop(0, `rgba(${rgb},1)`);
  v.addColorStop(0.3, `rgba(${rgb},0.35)`);
  v.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = v;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
