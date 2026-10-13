import { SPIELER } from './config.js';

/**
 * Tastatur, Maus, Touch und Gamepad, zusammengefasst zu einem Zustand:
 *
 *   gehen.x / gehen.y   -1..1 (rechts / vor)
 *   blick.x / blick.y   Bogenmaß, aufgelaufen seit dem letzten Abholen
 *   rennen              gehalten
 *   und Einmal-Ereignisse über `einmal(name)`: ducken, lampe, tuer, pause
 */
export class Eingabe {
  constructor(leinwand) {
    this.leinwand = leinwand;
    this.gehen = { x: 0, y: 0 };
    this.blick = { x: 0, y: 0 };
    this.rennen = false;
    this.aktiv = false;

    this._tasten = new Set();
    this._ereignisse = new Set();
    this._stick = { id: null, x0: 0, y0: 0, x: 0, y: 0 };
    this._blickFinger = null;
    this._touchRennen = false;
    this._padVorher = new Set();
    this.touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    if (this.touch) document.body.classList.add('touch');

    this._tastatur();
    this._maus();
    this._touchSteuerung();
  }

  einmal(name) {
    const da = this._ereignisse.has(name);
    this._ereignisse.delete(name);
    return da;
  }

  _tastatur() {
    const belegung = {
      KeyC: 'ducken', ControlLeft: 'ducken', KeyF: 'lampe', KeyE: 'tuer', Escape: 'pause', KeyP: 'pause',
    };
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this._tasten.add(e.code);
      const name = belegung[e.code];
      if (name) { this._ereignisse.add(name); e.preventDefault(); }
    });
    addEventListener('keyup', (e) => this._tasten.delete(e.code));
    addEventListener('blur', () => this._tasten.clear());
  }

  _maus() {
    this.leinwand.addEventListener('click', () => {
      if (this.aktiv && !this.touch && document.pointerLockElement !== this.leinwand) {
        this.leinwand.requestPointerLock?.();
      }
    });
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== this.leinwand) return;
      this.blick.x += e.movementX * SPIELER.maus;
      this.blick.y += e.movementY * SPIELER.maus;
    });
    document.addEventListener('pointerlockchange', () => {
      // Esc gibt die Maus frei — das ist dann auch die Pause.
      if (!document.pointerLockElement && this.aktiv && !this.touch) this._ereignisse.add('pause');
    });
  }

  sperreMaus() {
    if (!this.touch) this.leinwand.requestPointerLock?.();
  }

  gibMausFrei() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  _touchSteuerung() {
    const zone = document.getElementById('stick-zone');
    const stick = document.getElementById('stick');
    const knauf = stick.querySelector('i');
    const blickZone = document.getElementById('blick-zone');

    const stickSetzen = (dx, dy) => {
      const max = 50;
      const d = Math.hypot(dx, dy);
      const k = d > max ? max / d : 1;
      knauf.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
      this._stick.x = (dx * k) / max;
      this._stick.y = (-dy * k) / max;
    };

    zone.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      this._stick.id = t.identifier;
      this._stick.x0 = t.clientX; this._stick.y0 = t.clientY;
      const r = zone.getBoundingClientRect();
      stick.style.left = `${t.clientX - r.left}px`;
      stick.style.top = `${t.clientY - r.top}px`;
      stickSetzen(0, 0);
      e.preventDefault();
    }, { passive: false });
    zone.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this._stick.id) stickSetzen(t.clientX - this._stick.x0, t.clientY - this._stick.y0);
      }
      e.preventDefault();
    }, { passive: false });
    const stickEnde = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this._stick.id) { this._stick.id = null; stickSetzen(0, 0); }
      }
    };
    zone.addEventListener('touchend', stickEnde);
    zone.addEventListener('touchcancel', stickEnde);

    blickZone.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      this._blickFinger = { id: t.identifier, x: t.clientX, y: t.clientY };
      e.preventDefault();
    }, { passive: false });
    blickZone.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        const f = this._blickFinger;
        if (!f || t.identifier !== f.id) continue;
        this.blick.x += (t.clientX - f.x) * SPIELER.touchBlick;
        this.blick.y += (t.clientY - f.y) * SPIELER.touchBlick;
        f.x = t.clientX; f.y = t.clientY;
      }
      e.preventDefault();
    }, { passive: false });
    const blickEnde = (e) => {
      for (const t of e.changedTouches) if (this._blickFinger && t.identifier === this._blickFinger.id) this._blickFinger = null;
    };
    blickZone.addEventListener('touchend', blickEnde);
    blickZone.addEventListener('touchcancel', blickEnde);

    for (const b of document.querySelectorAll('#touch-knoepfe button')) {
      const k = b.dataset.k;
      b.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (k === 'rennen') { this._touchRennen = true; b.classList.add('an'); }
        else this._ereignisse.add(k);
      }, { passive: false });
      b.addEventListener('touchend', (e) => {
        e.preventDefault();
        if (k === 'rennen') { this._touchRennen = false; b.classList.remove('an'); }
      }, { passive: false });
    }
  }

  /** Einmal je Bild: Tasten, Stick und Gamepad zusammenführen. */
  update(dt) {
    const T = this._tasten;
    let x = (T.has('KeyD') || T.has('ArrowRight') ? 1 : 0) - (T.has('KeyA') || T.has('ArrowLeft') ? 1 : 0);
    let y = (T.has('KeyW') || T.has('ArrowUp') ? 1 : 0) - (T.has('KeyS') || T.has('ArrowDown') ? 1 : 0);
    let rennen = T.has('ShiftLeft') || T.has('ShiftRight') || this._touchRennen;

    if (this._stick.id !== null) { x = this._stick.x; y = this._stick.y; }

    const pad = [...(navigator.getGamepads?.() ?? [])].find((p) => p && p.connected);
    if (pad) {
      const tz = (v) => (Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82);
      const ax = tz(pad.axes[0] ?? 0), ay = tz(pad.axes[1] ?? 0);
      if (ax || ay) { x = ax; y = -ay; }
      this.blick.x += tz(pad.axes[2] ?? 0) * SPIELER.stickBlick * dt;
      this.blick.y += tz(pad.axes[3] ?? 0) * SPIELER.stickBlick * dt;
      const t = (i) => !!pad.buttons[i]?.pressed;
      if (t(10) || t(7) || t(5)) rennen = true;
      const jetzt = new Set();
      const map = { 0: 'tuer', 1: 'ducken', 3: 'lampe', 9: 'pause' };
      for (const [i, n] of Object.entries(map)) {
        if (t(+i)) { jetzt.add(n); if (!this._padVorher.has(n)) this._ereignisse.add(n); }
      }
      this._padVorher = jetzt;
    }

    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    this.gehen.x = x;
    this.gehen.y = y;
    this.rennen = rennen;
  }

  /** Blickbewegung abholen und zurücksetzen. */
  holeBlick() {
    const b = { x: this.blick.x, y: this.blick.y };
    this.blick.x = this.blick.y = 0;
    return b;
  }

  leeren() { this._ereignisse.clear(); this.blick.x = this.blick.y = 0; }
}
