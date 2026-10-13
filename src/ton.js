import { STIMME } from './config.js';

/**
 * Alles, was man hört. Die Stimme kommt aus den Originaltönen, alles
 * andere entsteht synthetisch.
 *
 * Die Stimme des Monsters ist räumlich: sie kommt aus seiner Richtung,
 * wird mit der Entfernung leiser und hinter Wänden dumpf.
 */
export class Ton {
  constructor() {
    this.ctx = null;
    this.puffer = new Map();
    this.stimme = null;          // läuft gerade: { quelle, start, satz, panner }
    this.untertitel = () => {};  // (satz, startZeit) — main zeigt die Wörter
  }

  /** Muss aus einer Nutzergeste kommen (iOS). */
  async init() {
    if (this.ctx) { await this.ctx.resume?.(); return; }
    // Auf dem iPhone spielt Web Audio sonst nicht, wenn der Stummschalter an ist.
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* egal */ }
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    const c = this.ctx;

    this.haupt = c.createGain();
    this.haupt.gain.value = 0.9;
    const kompressor = c.createDynamicsCompressor();
    kompressor.threshold.value = -10;
    kompressor.ratio.value = 4;
    this.haupt.connect(kompressor).connect(c.destination);

    this.hall = c.createConvolver();
    this.hall.buffer = this._impuls(2.2);
    const hallPegel = c.createGain();
    hallPegel.gain.value = 0.45;
    this.hall.connect(hallPegel).connect(this.haupt);

    // stummer Ton weckt die Ausgabe auf iOS
    const s = c.createBufferSource();
    s.buffer = c.createBuffer(1, 1, 22050);
    s.connect(c.destination);
    s.start();

    this._laden = Promise.all(Object.entries(STIMME).map(async ([name, def]) => {
      try {
        const roh = await (await fetch(def.datei)).arrayBuffer();
        this.puffer.set(name, await new Promise((ok, fehler) => c.decodeAudioData(roh, ok, fehler)));
      } catch (e) {
        console.warn('[Ton] Stimme fehlt:', name, e);
      }
    }));

    this._atmosphaere();
    this._herz();
    return this._laden;
  }

  get zeit() { return this.ctx ? this.ctx.currentTime : 0; }

  /** Hörer an Kamera koppeln. */
  hoerer(kamera) {
    if (!this.ctx) return;
    const L = this.ctx.listener;
    const p = kamera.position;
    const v = kamera.getWorldDirection(this._v ??= kamera.position.clone());
    const t = this.ctx.currentTime;
    if (L.positionX) {
      L.positionX.setTargetAtTime(p.x, t, 0.02);
      L.positionY.setTargetAtTime(p.y, t, 0.02);
      L.positionZ.setTargetAtTime(p.z, t, 0.02);
      L.forwardX.setTargetAtTime(v.x, t, 0.02);
      L.forwardY.setTargetAtTime(v.y, t, 0.02);
      L.forwardZ.setTargetAtTime(v.z, t, 0.02);
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else {
      L.setPosition(p.x, p.y, p.z);
      L.setOrientation(v.x, v.y, v.z, 0, 1, 0);
    }
  }

  _panner(x, y, z) {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = 1.6;
    p.rolloffFactor = 1.3;
    p.maxDistance = 60;
    this._setzeOrt(p, x, y, z);
    return p;
  }

  _setzeOrt(p, x, y, z) {
    if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; }
    else p.setPosition(x, y, z);
  }

  // ---------------------------------------------------------------
  // Stimme
  // ---------------------------------------------------------------

  redet() { return !!this.stimme; }

  /**
   * Satz an einem Ort sprechen.
   * @param {string} satz  Schlüssel aus STIMME
   * @param {{x:number,z:number}|null} ort  null = direkt ins Ohr (Jumpscare)
   */
  sprich(satz, ort, laut = 1) {
    if (!this.ctx) return;
    const puffer = this.puffer.get(satz);
    if (!puffer) return;
    this.verstumme();

    const c = this.ctx;
    const q = c.createBufferSource();
    q.buffer = puffer;
    const pegel = c.createGain();
    pegel.gain.value = 1.6 * laut;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 16000;

    q.connect(filter).connect(pegel);
    let panner = null;
    if (ort) {
      panner = this._panner(ort.x, 1.1, ort.z);
      pegel.connect(panner);
      panner.connect(this.haupt);
      panner.connect(this.hall);
    } else {
      pegel.connect(this.haupt);
    }

    const start = c.currentTime + 0.02;
    q.start(start);
    const eintrag = { quelle: q, start, satz, panner, filter, pegel };
    this.stimme = eintrag;
    q.onended = () => { if (this.stimme === eintrag) this.stimme = null; };
    this.untertitel(satz, start);
  }

  verstumme() {
    if (!this.stimme) return;
    try { this.stimme.quelle.stop(); } catch { /* schon aus */ }
    this.stimme = null;
  }

  /** Stimme dem Monster folgen lassen; dumpf, wenn eine Wand dazwischen ist. */
  stimmeOrt(x, z, frei) {
    const s = this.stimme;
    if (!s || !s.panner) return;
    this._setzeOrt(s.panner, x, 1.1, z);
    s.filter.frequency.setTargetAtTime(frei ? 16000 : 900, this.ctx.currentTime, 0.1);
  }

  // ---------------------------------------------------------------
  // Synthetische Geräusche
  // ---------------------------------------------------------------

  _rauschPuffer() {
    if (this._rp) return this._rp;
    const c = this.ctx;
    const b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return (this._rp = b);
  }

  _impuls(sek) {
    const c = this.ctx;
    const n = c.sampleRate * sek;
    const b = c.createBuffer(2, n, c.sampleRate);
    for (let k = 0; k < 2; k++) {
      const d = b.getChannelData(k);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3.2);
    }
    return b;
  }

  /** Kurzer Rauschstoß durch einen Filter, optional räumlich. */
  _stoss({ frequenz = 1000, q = 1, dauer = 0.1, laut = 0.3, typ = 'bandpass', ort = null, hall = 0.2, verzoegerung = 0 }) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime + verzoegerung;
    const s = c.createBufferSource();
    s.buffer = this._rauschPuffer();
    const f = c.createBiquadFilter();
    f.type = typ; f.frequency.value = frequenz; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(laut, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dauer);
    s.connect(f).connect(g);
    const ziel = ort ? g.connect(this._panner(ort.x, 0.2, ort.z)) : g;
    ziel.connect(this.haupt);
    if (hall) {
      const h = c.createGain(); h.gain.value = hall;
      ziel.connect(h).connect(this.hall);
    }
    s.start(t, Math.random() * 1.5, dauer + 0.05);
  }

  schritt(baelle, rennen) {
    if (baelle) {
      // Bälle rascheln: viele kleine Klacker
      for (let i = 0; i < 6; i++) {
        this._stoss({ frequenz: 2500 + Math.random() * 2500, q: 4, dauer: 0.04, laut: rennen ? 0.12 : 0.07, verzoegerung: i * 0.025 + Math.random() * 0.02, hall: 0.1 });
      }
    } else {
      this._stoss({ frequenz: 260, q: 0.8, dauer: 0.09, laut: rennen ? 0.22 : 0.13, typ: 'lowpass', hall: 0.15 });
    }
  }

  kralle(ort, baelle) {
    if (baelle) {
      for (let i = 0; i < 3; i++) this._stoss({ frequenz: 3000, q: 4, dauer: 0.04, laut: 0.35, ort, verzoegerung: i * 0.02 });
    } else {
      this._stoss({ frequenz: 1800, q: 6, dauer: 0.03, laut: 0.5, ort });
      this._stoss({ frequenz: 140, q: 1, dauer: 0.08, laut: 0.4, typ: 'lowpass', ort });
    }
  }

  tuerKnarren(t) {
    if (!this.ctx) return;
    const c = this.ctx, z = c.currentTime;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(90 + Math.random() * 40, z);
    o.frequency.linearRampToValueAtTime(160 + Math.random() * 80, z + 0.5);
    const f = c.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 6;
    const g = c.createGain();
    g.gain.setValueAtTime(0, z);
    g.gain.linearRampToValueAtTime(0.12, z + 0.08);
    g.gain.linearRampToValueAtTime(0, z + 0.6);
    o.connect(f).connect(g).connect(this._panner(t.x, 1.2, t.z)).connect(this.haupt);
    o.start(z); o.stop(z + 0.65);
  }

  tuerKnall(t) {
    this.tuerKnarren(t);
    this._stoss({ frequenz: 120, q: 0.7, dauer: 0.35, laut: 1.2, typ: 'lowpass', ort: t, hall: 0.6, verzoegerung: 0.3 });
  }

  /** Er hat dich gesehen: tiefer Schlag und ein Kreischen. */
  entdeckt(ort) {
    if (!this.ctx) return;
    this._stoss({ frequenz: 60, q: 0.5, dauer: 1.2, laut: 0.9, typ: 'lowpass', hall: 0.5 });
    this._kreischen(0.25, 0.9, ort);
  }

  _kreischen(laut, dauer, ort = null) {
    const c = this.ctx, z = c.currentTime;
    const g = c.createGain();
    g.gain.setValueAtTime(0, z);
    g.gain.linearRampToValueAtTime(laut, z + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, z + dauer);
    const verzerr = c.createWaveShaper();
    const kurve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = i / 128 - 1; kurve[i] = Math.tanh(x * 4); }
    verzerr.curve = kurve;
    for (const f of [740, 783, 1110, 1480]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f, z);
      o.frequency.linearRampToValueAtTime(f * 0.7, z + dauer);
      o.connect(verzerr);
      o.start(z); o.stop(z + dauer + 0.05);
    }
    verzerr.connect(g);
    (ort ? g.connect(this._panner(ort.x, 1.2, ort.z)) : g).connect(this.haupt);
  }

  /** Der Jumpscare: Kreischen, Schlag, Stimme direkt ins Ohr. */
  schreck() {
    if (!this.ctx) return;
    this._kreischen(0.7, 1.6);
    this._stoss({ frequenz: 50, q: 0.5, dauer: 1.5, laut: 1.6, typ: 'lowpass', hall: 0.6 });
    this._stoss({ frequenz: 3000, q: 0.3, dauer: 0.9, laut: 0.6, typ: 'highpass', hall: 0.4 });
    this.sprich('paschas', null, 1.4);
  }

  aufheben() {
    if (!this.ctx) return;
    const c = this.ctx, z = c.currentTime;
    [660, 880, 1320].forEach((f, i) => {
      const o = c.createOscillator();
      o.type = 'sine'; o.frequency.value = f;
      const g = c.createGain();
      g.gain.setValueAtTime(0, z + i * 0.08);
      g.gain.linearRampToValueAtTime(0.18, z + i * 0.08 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, z + i * 0.08 + 0.6);
      o.connect(g).connect(this.haupt);
      g.connect(this.hall);
      o.start(z + i * 0.08); o.stop(z + i * 0.08 + 0.7);
    });
  }

  klick() { this._stoss({ frequenz: 4000, q: 2, dauer: 0.02, laut: 0.15, hall: 0 }); }

  sieg() {
    if (!this.ctx) return;
    const c = this.ctx, z = c.currentTime;
    [523, 659, 784, 1046].forEach((f, i) => {
      const o = c.createOscillator();
      o.type = 'triangle'; o.frequency.value = f;
      const g = c.createGain();
      g.gain.setValueAtTime(0, z + i * 0.12);
      g.gain.linearRampToValueAtTime(0.2, z + i * 0.12 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, z + i * 0.12 + 1.2);
      o.connect(g).connect(this.haupt);
      o.start(z + i * 0.12); o.stop(z + i * 0.12 + 1.3);
    });
  }

  /** Dröhnen im Hintergrund, langsam schwankend. */
  _atmosphaere() {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.value = 0.11;
    const f = c.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 220;
    for (const [freq, typ] of [[43.6, 'sawtooth'], [44.1, 'sawtooth'], [65.4, 'triangle']]) {
      const o = c.createOscillator();
      o.type = typ; o.frequency.value = freq;
      o.connect(f); o.start();
    }
    const n = c.createBufferSource();
    n.buffer = this._rauschPuffer(); n.loop = true;
    const nf = c.createBiquadFilter();
    nf.type = 'bandpass'; nf.frequency.value = 400; nf.Q.value = 0.6;
    const ng = c.createGain(); ng.gain.value = 0.25;
    n.connect(nf).connect(ng).connect(f); n.start();

    const lfo = c.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = c.createGain(); lg.gain.value = 120;
    lfo.connect(lg).connect(f.frequency); lfo.start();

    f.connect(g).connect(this.haupt);
    this.atmo = g;
  }

  /** Herzschlag; Tempo und Lautstärke setzt `angst`. */
  _herz() {
    this.herzUhr = 0;
    this.angstWert = 0;
  }

  angst(wert, dt) {
    if (!this.ctx) return;
    this.angstWert = wert;
    this.atmo.gain.setTargetAtTime(0.11 + wert * 0.12, this.ctx.currentTime, 0.3);
    if (wert < 0.08) return;
    this.herzUhr -= dt;
    if (this.herzUhr > 0) return;
    this.herzUhr = 1.1 - wert * 0.65;
    const laut = 0.25 + wert * 0.6;
    this._schlag(laut, 0);
    this._schlag(laut * 0.7, 0.16);
  }

  _schlag(laut, verz) {
    const c = this.ctx, z = c.currentTime + verz;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(70, z);
    o.frequency.exponentialRampToValueAtTime(38, z + 0.15);
    const g = c.createGain();
    g.gain.setValueAtTime(0, z);
    g.gain.linearRampToValueAtTime(laut, z + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, z + 0.2);
    o.connect(g).connect(this.haupt);
    o.start(z); o.stop(z + 0.25);
  }

  /** Alles leiser, z. B. in der Pause. */
  pause(an) {
    if (!this.ctx) return;
    if (an) this.ctx.suspend(); else this.ctx.resume();
  }
}
