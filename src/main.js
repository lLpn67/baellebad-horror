import * as THREE from 'three';
import { TAGE, STIMME, ZITATE, SPIELER } from './config.js';
import { Level, glutTextur } from './level.js';
import { Baellebad } from './baelle.js';
import { MonsterModell, Monster } from './monster.js';
import { Spieler } from './spieler.js';
import { Ton } from './ton.js';
import { Eingabe } from './eingabe.js';
import { kalenderTextur, versteckBild } from './texturen.js';

const $ = (id) => document.getElementById(id);
const clamp = THREE.MathUtils.clamp;

class Spiel {
  constructor() {
    this.phase = 'titel';
    this._setzePhase('titel');

    this.leinwand = $('szene');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.leinwand, antialias: devicePixelRatio < 2, powerPreference: 'default' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.szene = new THREE.Scene();
    this.szene.background = new THREE.Color(0x030204);
    this.szene.fog = new THREE.FogExp2(0x030204, 0.075);
    this.kamera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 80);
    this.szene.add(new THREE.HemisphereLight(0x55496e, 0x120a14, 0.35));

    this.ton = new Ton();
    this.ein = new Eingabe(this.leinwand);
    this.level = new Level(this.szene);
    this.baelle = new Baellebad(this.szene, this.level);
    this.spieler = new Spieler(this.kamera, this.szene, this.level, this.ton);

    $('baelle-sicht').style.backgroundImage = `url(${versteckBild()})`;

    this._baueTage();
    this._knoepfe();
    this.ton.untertitel = (satz, start) => { this.untertitel = { satz, start }; };

    addEventListener('resize', () => this._groesse());
    this._groesse();

    this.uhr = new THREE.Clock();
    this.bereit = this._ladeGesicht().then(() => {
      $('ladezustand').textContent = '';
      this._neu();
      this.renderer.setAnimationLoop(() => this._bild());
    });
    $('ladezustand').textContent = 'Lädt…';

    // für Tests in der Konsole
    window.spiel = this;
  }

  async _ladeGesicht() {
    const tex = await new THREE.TextureLoader().loadAsync('assets/merz.png');
    tex.colorSpace = THREE.SRGBColorSpace;
    this.gesicht = tex;
    this.modell = new MonsterModell(tex);
    this.szene.add(this.modell.wurzel);
    this.monster = new Monster(this.level, this.modell, this.ton);
    this.modell.aufsetzen = () => {
      if (this.phase !== 'spiel') return;
      const p = this.monster.pos;
      if (this.monster.abstandZumSpieler < 22) this.ton.kralle(p, this.level.imBaellebad(p.x, p.z));
    };

    // Gesicht für den Jumpscare, klebt vor der Kamera
    const seiten = tex.image.width / tex.image.height;
    this.schreckGesicht = new THREE.Mesh(
      new THREE.PlaneGeometry(seiten, 1),
      new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, fog: false, depthTest: false }),
    );
    this.schreckGesicht.renderOrder = 10;
    this.schreckGesicht.visible = false;
    this.kamera.add(this.schreckGesicht);
  }

  _groesse() {
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.kamera.aspect = innerWidth / innerHeight;
    this.kamera.updateProjectionMatrix();
  }

  _setzePhase(p) {
    this.phase = p;
    document.body.dataset.phase = p;
  }

  // ---------------------------------------------------------------
  // Ablauf
  // ---------------------------------------------------------------

  _knoepfe() {
    $('start').addEventListener('click', () => this.starte());
    $('nochmal').addEventListener('click', () => this.starte());
    $('weiter').addEventListener('click', () => this.weiter());
    $('zum-titel').addEventListener('click', () => { this.ton.pause(false); this.ton.verstumme(); this._neu(); this._setzePhase('titel'); });
    $('pause-knopf').addEventListener('click', () => this.pause());
    $('pause-knopf').addEventListener('touchstart', (e) => { e.preventDefault(); this.pause(); }, { passive: false });
  }

  async starte() {
    // Ton zuerst und ohne await davor: iOS erlaubt ihn nur direkt im Klick.
    const ton = this.ton.init();
    await this.bereit;
    await ton;
    this.ton.pause(false);
    this._neu();
    this._setzePhase('spiel');
    this.ein.aktiv = true;
    this.ein.leeren();
    this.ein.sperreMaus();
    this.uhr.getDelta();
    this.hinweis('Finde die vier Kalenderblätter. Er schläft noch…', 5);
    setTimeout(() => this.phase === 'spiel' && this.hinweis('…aber nicht mehr lange.', 3), 5500);
  }

  pause() {
    if (this.phase !== 'spiel') return;
    this._setzePhase('pause');
    this.ein.aktiv = false;
    this.ein.gibMausFrei();
    this.ton.pause(true);
  }

  weiter() {
    this._setzePhase('spiel');
    this.ein.aktiv = true;
    this.ein.leeren();
    this.ein.sperreMaus();
    this.ton.pause(false);
    this.uhr.getDelta();
  }

  /** Alles auf Anfang, ohne die Welt neu zu bauen. */
  _neu() {
    this.level.reset();
    this.spieler.reset();
    this.monster.reset();
    this.ton.verstumme();
    this.untertitel = null;
    this.gesammelt = [];
    this.spielzeit = 0;
    this.schreckZeit = 0;
    this.schreckGesicht.visible = false;
    this._verteileBlaetter();
    this._zeigeTage();
    document.body.classList.remove('versteckt');
  }

  _ende(sieg) {
    this._setzePhase('ende');
    this.ein.aktiv = false;
    this.ein.gibMausFrei();
    document.body.dataset.ausgang = sieg ? 'sieg' : 'tot';
    const t = Math.round(this.spielzeit);
    const zeit = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    if (sieg) {
      $('ende-titel').textContent = 'FEIERABEND.';
      $('ende-zitat').textContent = 'Du hast die Vier-Tage-Woche gerettet.';
      $('ende-werte').textContent = `Zeit: ${zeit}`;
    } else {
      $('ende-titel').textContent = 'ERWISCHT.';
      $('ende-zitat').textContent = ZITATE[this.letzterSatz ?? 'paschas'];
      $('ende-werte').textContent = `${this.gesammelt.length} von 4 Tagen · überlebt ${zeit}`;
    }
  }

  // ---------------------------------------------------------------
  // Kalenderblätter
  // ---------------------------------------------------------------

  _baueTage() {
    $('tage').innerHTML = TAGE.map((t) => `<div class="tag" data-tag="${t}">${t}</div>`).join('');
    this.blaetter = [];
    const glut = new THREE.SpriteMaterial({ map: glutTextur('255,230,170'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 });
    for (const tag of TAGE) {
      const g = new THREE.Group();
      const tex = kalenderTextur(tag);
      const seite = new THREE.MeshLambertMaterial({ color: 0xf4efe2, emissive: 0x6a6050 });
      const blatt = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.05), [
        seite, seite, seite, seite,
        new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.35 }),
        new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.35 }),
      ]);
      g.add(blatt);
      const s = new THREE.Sprite(glut);
      s.scale.set(1.3, 1.3, 1);
      s.position.z = -0.05;
      g.add(s);
      this.szene.add(g);
      this.blaetter.push({ tag, g, da: true, x: 0, z: 0, y: 1 });
    }
  }

  _verteileBlaetter() {
    const plaetze = [...this.level.blattPlaetze].sort(() => Math.random() - 0.5);
    this.blaetter.forEach((b, i) => {
      const p = plaetze[i];
      b.x = p.x + (Math.random() - 0.5) * 0.6;
      b.z = p.z + (Math.random() - 0.5) * 0.6;
      b.y = this.level.boden(p.r, p.c) === 'baelle' ? 1.15 : 1.0;
      b.da = true;
      b.g.visible = true;
      b.g.position.set(b.x, b.y, b.z);
    });
  }

  _zeigeTage() {
    for (const el of document.querySelectorAll('#tage .tag')) {
      el.classList.toggle('da', this.gesammelt.includes(el.dataset.tag));
    }
  }

  _blaetterUpdate(dt) {
    const t = this.uhr.elapsedTime;
    for (const b of this.blaetter) {
      if (!b.da) continue;
      b.g.rotation.y += dt * 1.2;
      b.g.position.y = b.y + Math.sin(t * 2 + b.x) * 0.06;
      const d = Math.hypot(b.x - this.spieler.x, b.z - this.spieler.z);
      if (d < 1.1) this._sammle(b);
    }
  }

  _sammle(b) {
    b.da = false;
    b.g.visible = false;
    this.gesammelt.push(b.tag);
    this.ton.aufheben();
    this._zeigeTage();
    this.monster.tage = this.gesammelt.length;
    const rest = 4 - this.gesammelt.length;

    if (rest === 0) {
      this.hinweis('Die Vier-Tage-Woche ist komplett. Ab zum NOTAUSGANG!', 5);
      // Das gefällt ihm gar nicht.
      this.ton.verstumme();
      this.monster.rede('wohlstand');
      this.monster.alarm(this.spieler, 6);
    } else {
      const namen = { MO: 'Montag', DI: 'Dienstag', MI: 'Mittwoch', DO: 'Donnerstag' };
      this.hinweis(`${namen[b.tag]}. Noch ${rest}.`, 2.5);
      // Er hört das Rascheln des Papiers
      if (this.gesammelt.length >= 2) this.monster.alarm(this.spieler, 0.5);
    }
  }

  // ---------------------------------------------------------------
  // Bild für Bild
  // ---------------------------------------------------------------

  _bild() {
    const dt = Math.min(this.uhr.getDelta(), 0.05);
    this.ein.update(dt);

    if (this.ein.einmal('pause')) {
      if (this.phase === 'spiel') this.pause();
      else if (this.phase === 'pause') this.weiter();
    }

    if (this.phase === 'spiel') this._spielen(dt);
    else if (this.phase === 'schreck') this._schreck(dt);
    else if (this.phase === 'titel') this._titelbild(dt);

    this._untertitel();
    this.renderer.render(this.szene, this.kamera);
  }

  /** Hinter dem Titel: langsamer Blick durchs Bällebad. */
  _titelbild(dt) {
    const t = this.uhr.elapsedTime * 0.06;
    this.kamera.position.set(24 + Math.sin(t) * 6, 1.6, 10 + Math.cos(t * 0.7) * 4);
    this.kamera.rotation.set(-0.12, t * 2.2, 0, 'YXZ');
    this.spieler.lampenLicht.visible = true;
    this.monster.update(0, { x: -100, z: -100, kamera: this.kamera, leuchtetAuf: () => false, laerm: 0 });
    this.level.update(dt);
  }

  _spielen(dt) {
    this.spielzeit += dt;
    const sp = this.spieler;

    if (this.ein.einmal('tuer')) this._tuer();
    sp.update(dt, this.ein);
    this.level.update(dt);

    const gefangen = this.monster.update(dt, {
      x: sp.x, z: sp.z, kamera: this.kamera,
      lampe: sp.lampe, geduckt: sp.geduckt, versteckt: sp.versteckt,
      laerm: sp.laerm, leuchtetAuf: (p) => sp.leuchtetAuf(p),
    });

    this._blaetterUpdate(dt);
    const m = this.monster.pos;
    this.baelle.update(dt, [
      { x: sp.x, z: sp.z, r: sp.geduckt ? 0.75 : 0.55 },
      { x: m.x, z: m.z, r: 0.85 },
    ]);

    this.ton.hoerer(this.kamera);
    this.ton.stimmeOrt(m.x, m.z, this.level.sichtfrei(m.x, m.z, sp.x, sp.z));

    // Licht im Büro flackert
    if (this.level.bueroLicht) {
      const an = Math.random() > 0.015;
      this.level.bueroLicht.intensity = an ? 9 : 1;
      this.level.roehre.visible = an;
    }
    // Ausgang pulsiert, wenn alles gesammelt ist
    if (this.gesammelt.length === 4) {
      this.level.ausgangLicht.intensity = 4 + Math.sin(this.spielzeit * 6) * 3;
    }

    this._hud(dt);

    if (gefangen) return this._gefangen();

    // Ausgang
    const a = this.level.ausgangPunkt;
    const dA = Math.hypot(a.x - sp.x, a.z - sp.z);
    if (dA < 1.3) {
      if (this.gesammelt.length === 4) return this._gewonnen();
      if (!this._ausgangGesagt) {
        this.hinweis(`Abgeschlossen. Erst die Vier-Tage-Woche zusammenbekommen (${this.gesammelt.length}/4).`, 3);
        this._ausgangGesagt = true;
      }
    } else this._ausgangGesagt = false;
  }

  _tuer() {
    const sp = this.spieler;
    const t = this.level.naechsteTuer(sp.x, sp.z);
    if (!t) return;
    if (t.ziel === 0) {
      t.oeffnen(sp.x, sp.z);
      this.ton.tuerKnarren(t);
    } else {
      // nicht zuschlagen, wenn jemand drinsteht
      const m = this.monster.pos;
      const drin = (p) => Math.abs(p.x - t.x) < 0.9 && Math.abs(p.z - t.z) < 0.9;
      if (drin(sp) || drin(m)) return;
      t.schliessen();
      this.ton.tuerKnarren(t);
    }
  }

  _hud(dt) {
    const sp = this.spieler;
    const d = this.monster.abstandZumSpieler;
    const jagd = this.monster.zustand === 'jagd';

    const angst = clamp(1 - d / 14, 0, 1) * (jagd ? 1 : 0.6) + (jagd ? 0.25 : 0);
    this.ton.angst(clamp(angst, 0, 1), dt);
    $('gefahr').style.opacity = clamp(angst, 0, 1) * 0.9;
    $('rauschen').style.opacity = clamp((1 - d / 7) * (jagd ? 0.3 : 0.12), 0, 0.3);

    document.body.classList.toggle('versteckt', sp.geduckt && sp.imBaellebad);

    $('ausdauer').classList.toggle('voll', sp.ausdauer >= 0.999);
    $('ausdauer').firstElementChild.style.width = `${sp.ausdauer * 100}%`;
    const la = $('lampe-anzeige');
    la.querySelector('b').style.width = `${sp.batterie * 100}%`;
    la.classList.toggle('aus', !sp.lampe);
    la.classList.toggle('leer', sp.batterie < 0.2);

    const t = this.level.naechsteTuer(sp.x, sp.z);
    const knopf = $('tuer-knopf');
    knopf.classList.toggle('da', !!t);
    if (t) knopf.textContent = t.ziel === 0 ? 'Tür auf' : 'Tür zu';

    for (const b of document.querySelectorAll('#touch-knoepfe button')) {
      if (b.dataset.k === 'ducken') b.classList.toggle('an', sp.geduckt);
      if (b.dataset.k === 'lampe') b.classList.toggle('an', sp.lampe);
    }
  }

  hinweis(text, sekunden = 3) {
    const el = $('hinweis');
    el.textContent = text;
    el.classList.add('zeigen');
    clearTimeout(this._hinweisUhr);
    this._hinweisUhr = setTimeout(() => el.classList.remove('zeigen'), sekunden * 1000);
  }

  /** Untertitel: ein Wort nach dem anderen, im Takt der Stimme. */
  _untertitel() {
    const el = $('untertitel');
    const u = this.untertitel;
    if (!u || !this.ton.ctx) { if (el.textContent) el.textContent = ''; return; }
    const t = this.ton.zeit - u.start;
    const woerter = STIMME[u.satz].woerter;
    if (!this.ton.redet() && t > 0.3) { this.untertitel = null; el.textContent = ''; return; }

    let wort = '';
    for (const [ab, w] of woerter) if (t >= ab) wort = w;
    if (el.textContent !== wort) el.textContent = wort;

    // leiser, je weiter weg
    const d = this.phase === 'schreck' ? 0 : this.monster.abstandZumSpieler;
    el.style.setProperty('--laut', clamp(1.15 - d / 22, 0, 1).toFixed(2));
    this.letzterSatz = u.satz;
  }

  // ---------------------------------------------------------------
  // Erwischt
  // ---------------------------------------------------------------

  _gefangen() {
    this._setzePhase('schreck');
    this.schreckZeit = 0;
    this.ein.aktiv = false;
    this.ton.verstumme();
    this.ton.schreck();
    this.letzterSatz = 'paschas';
    this.schreckGesicht.visible = true;
    this.spieler.lampe = true;
    this.spieler.lampenLicht.visible = true;
    this.spieler.lampenLicht.intensity = 22;
    $('gefahr').style.opacity = 1;
  }

  _schreck(dt) {
    this.schreckZeit += dt;
    const t = this.schreckZeit;
    const g = this.schreckGesicht;

    // auf die Kamera zu, dann zittern
    const anflug = clamp(t / 0.18, 0, 1);
    const z = -2.2 + anflug * 1.6;
    const zittern = 0.03 + (1 - anflug) * 0.05;
    g.position.set((Math.random() - 0.5) * zittern, -0.05 + (Math.random() - 0.5) * zittern, z);
    g.rotation.z = Math.sin(t * 40) * 0.08;
    g.scale.setScalar(0.9 + anflug * 0.25);

    // Kamera wackelt, Lampe flackert
    const k = this.kamera;
    k.rotation.z = (Math.random() - 0.5) * 0.08;
    this.spieler.lampenLicht.visible = Math.random() > 0.25;

    this.monster.modell.update(dt, 0, k, 1);
    this.ton.angst(1, dt);
    $('rauschen').style.opacity = 0.35;

    if (t > 2.1) {
      g.visible = false;
      this._ende(false);
    }
  }

  _gewonnen() {
    this.ton.verstumme();
    this.ton.sieg();
    this._ende(true);
  }
}

new Spiel();
