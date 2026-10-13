import * as THREE from 'three';

/**
 * Alle Texturen entstehen auf Leinwänden im Browser. Es gibt keine
 * Bilddatei außer dem Gesicht.
 */

const BALLFARBEN = ['#e3263a', '#f6c419', '#1f7fe0', '#2fb24a', '#f07a1a', '#d23ec4'];
export { BALLFARBEN };

function leinwand(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function textur(c, wiederholen = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (wiederholen) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Feines Rauschen über eine Fläche, für Teppich und Putz. */
function rauschen(g, w, h, staerke, menge = w * h * 0.15) {
  for (let i = 0; i < menge; i++) {
    const v = Math.random() < 0.5 ? 0 : 255;
    g.fillStyle = `rgba(${v},${v},${v},${Math.random() * staerke})`;
    g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random(), 1 + Math.random());
  }
}

/** Zufallsgenerator mit Startwert — die Wolken sollen jedes Mal gleich liegen. */
function zufall(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/**
 * Wand des Spielparadieses: unten hellblau mit Wolken, oben ein dunkler
 * Streifen. V läuft über die volle Raumhöhe, U wiederholt alle 4 m.
 */
export function wandTextur() {
  const [c, g] = leinwand(512, 512);
  const r = zufall(7);
  const grenze = 512 * 0.36;              // oberhalb davon dunkel

  g.fillStyle = '#7fc4dc';
  g.fillRect(0, grenze, 512, 512 - grenze);
  // weicher Verlauf zum Boden hin
  const v = g.createLinearGradient(0, grenze, 0, 512);
  v.addColorStop(0, 'rgba(255,255,255,0.08)');
  v.addColorStop(1, 'rgba(0,30,60,0.25)');
  g.fillStyle = v;
  g.fillRect(0, grenze, 512, 512 - grenze);

  // Wolken, über den Rand gekachelt
  g.fillStyle = 'rgba(250,252,255,0.92)';
  for (let i = 0; i < 4; i++) {
    const cx = r() * 512, cy = grenze + 40 + r() * 140, s = 26 + r() * 22;
    for (const dx of [-512, 0, 512]) {
      for (let k = 0; k < 5; k++) {
        g.beginPath();
        g.arc(cx + dx + (k - 2) * s * 0.8, cy + (k % 2 ? -s * 0.35 : 0), s * (k === 2 ? 1.1 : 0.75), 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  g.fillStyle = '#1a1520';
  g.fillRect(0, 0, 512, grenze);
  g.fillStyle = '#d8d0c0';
  g.fillRect(0, grenze - 6, 512, 6);      // Abschlussleiste
  g.fillStyle = '#2a2230';
  g.fillRect(0, 500, 512, 12);            // Fußleiste

  rauschen(g, 512, 512, 0.08);
  return textur(c);
}

/** Bürowand: hell, grünstichig, sauber. */
export function bueroWandTextur() {
  const [c, g] = leinwand(256, 256);
  g.fillStyle = '#c9d8c8';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#9fb59e';
  g.fillRect(0, 236, 256, 20);
  rauschen(g, 256, 256, 0.06);
  return textur(c);
}

export function teppichTextur() {
  const [c, g] = leinwand(256, 256);
  g.fillStyle = '#3d2c48';
  g.fillRect(0, 0, 256, 256);
  rauschen(g, 256, 256, 0.22, 26000);
  // ein paar Flecken
  for (let i = 0; i < 6; i++) {
    g.fillStyle = `rgba(20,10,20,${0.15 + Math.random() * 0.15})`;
    g.beginPath();
    g.ellipse(Math.random() * 256, Math.random() * 256, 10 + Math.random() * 20, 6 + Math.random() * 14, Math.random() * 3, 0, Math.PI * 2);
    g.fill();
  }
  return textur(c);
}

export function bueroBodenTextur() {
  const [c, g] = leinwand(256, 256);
  g.fillStyle = '#7d917c';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(40,60,40,0.35)';
  g.lineWidth = 2;
  g.strokeRect(1, 1, 254, 254);
  rauschen(g, 256, 256, 0.1);
  return textur(c);
}

export function deckenTextur() {
  const [c, g] = leinwand(256, 256);
  g.fillStyle = '#17141b';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#0b0a0d';
  g.lineWidth = 6;
  g.strokeRect(0, 0, 256, 256);
  g.strokeRect(0, 0, 128, 256);
  rauschen(g, 256, 256, 0.05);
  return textur(c);
}

/**
 * Untergrund im Bällebad: dicht an dicht gemalte Bälle. Liegt knapp
 * unter der echten Ballschicht und füllt die Lücken.
 */
export function baelleBodenTextur() {
  const [c, g] = leinwand(512, 512);
  g.fillStyle = '#1a1018';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 1400; i++) {
    const x = Math.random() * 512, y = Math.random() * 512, r = 9 + Math.random() * 3;
    g.fillStyle = BALLFARBEN[(Math.random() * BALLFARBEN.length) | 0];
    for (const dx of [-512, 0, 512]) for (const dy of [-512, 0, 512]) {
      g.beginPath(); g.arc(x + dx, y + dy, r, 0, Math.PI * 2); g.fill();
    }
  }
  // abdunkeln, es liegt ja unten
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.fillRect(0, 0, 512, 512);
  return textur(c);
}

export function holzTextur() {
  const [c, g] = leinwand(128, 256);
  g.fillStyle = '#b48a52';
  g.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = `rgba(90,55,20,${0.08 + Math.random() * 0.12})`;
    g.lineWidth = 1 + Math.random() * 2;
    g.beginPath();
    const x = Math.random() * 128;
    g.moveTo(x, 0);
    g.bezierCurveTo(x + 6, 80, x - 6, 170, x + 3, 256);
    g.stroke();
  }
  return textur(c, false);
}

/** Plakat im Gang. */
export function plakatTextur(zeilen, farbe) {
  const [c, g] = leinwand(256, 360);
  g.fillStyle = farbe;
  g.fillRect(0, 0, 256, 360);
  g.fillStyle = '#fff8e6';
  g.fillRect(10, 10, 236, 340);
  g.fillStyle = farbe;
  g.textAlign = 'center';
  let y = 70;
  for (const [text, groesse] of zeilen) {
    g.font = `${groesse}px Anton, Impact, sans-serif`;
    g.fillText(text, 128, y);
    y += groesse * 1.25;
  }
  // bunte Bälle unten
  for (let i = 0; i < 9; i++) {
    g.fillStyle = BALLFARBEN[i % BALLFARBEN.length];
    g.beginPath(); g.arc(40 + (i % 5) * 44, 290 + Math.floor(i / 5) * 30, 16, 0, Math.PI * 2); g.fill();
  }
  // vergilbt
  g.fillStyle = 'rgba(80,60,20,0.18)';
  g.fillRect(0, 0, 256, 360);
  rauschen(g, 256, 360, 0.12);
  return textur(c, false);
}

/** Abreißkalender-Blatt mit dem Kürzel des Tages. */
export function kalenderTextur(tag) {
  const [c, g] = leinwand(256, 320);
  g.fillStyle = '#f4efe2';
  g.fillRect(0, 0, 256, 320);
  g.fillStyle = '#d61f33';
  g.fillRect(0, 0, 256, 70);
  g.fillStyle = '#fff';
  g.font = '40px Anton, Impact, sans-serif';
  g.textAlign = 'center';
  g.fillText('FEIERABEND', 128, 52);
  g.fillStyle = '#111';
  g.font = '150px Anton, Impact, sans-serif';
  g.fillText(tag, 128, 250);
  g.font = '22px Oswald, sans-serif';
  g.fillStyle = '#555';
  g.fillText('Vier-Tage-Woche', 128, 298);
  return textur(c, false);
}

/** Notausgangsschild. */
export function notausgangTextur() {
  const [c, g] = leinwand(256, 96);
  g.fillStyle = '#0d9b3e';
  g.fillRect(0, 0, 256, 96);
  g.fillStyle = '#ecfff0';
  g.font = '44px Anton, Impact, sans-serif';
  g.textAlign = 'center';
  g.fillText('NOTAUSGANG', 140, 64);
  // Pfeil
  g.beginPath();
  g.moveTo(14, 48); g.lineTo(38, 28); g.lineTo(38, 40); g.lineTo(54, 40);
  g.lineTo(54, 56); g.lineTo(38, 56); g.lineTo(38, 68); g.closePath();
  g.fill();
  return textur(c, false);
}

/** Bildschirm im Büro. */
export function bildschirmTextur() {
  const [c, g] = leinwand(128, 80);
  g.fillStyle = '#0c2a14';
  g.fillRect(0, 0, 128, 80);
  g.fillStyle = '#7dffa0';
  g.font = '11px monospace';
  const zeilen = ['> Arbeitszeit:', '  mehr', '> Urlaub:', '  abgelehnt', '> Wohlstand:', '  erhalten?'];
  zeilen.forEach((z, i) => g.fillText(z, 6, 13 + i * 12));
  return textur(c, false);
}

/**
 * Was man sieht, wenn man sich im Bällebad duckt: Bälle drängen von
 * allen Seiten ins Bild, in der Mitte bleibt ein Spalt.
 */
export function versteckBild() {
  const [c, g] = leinwand(600, 600);
  for (let i = 0; i < 520; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = 170 + Math.pow(Math.random(), 0.6) * 300;
    const x = 300 + Math.cos(a) * d * 1.15, y = 300 + Math.sin(a) * d * 0.9;
    const r = 34 + Math.random() * 30;
    const farbe = BALLFARBEN[(Math.random() * BALLFARBEN.length) | 0];
    const grad = g.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
    grad.addColorStop(0, '#ffffff55');
    grad.addColorStop(0.25, farbe);
    grad.addColorStop(1, '#000');
    g.fillStyle = grad;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  const v = g.createRadialGradient(300, 300, 60, 300, 300, 420);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.75)');
  g.fillStyle = v;
  g.fillRect(0, 0, 600, 600);
  return c.toDataURL('image/png');
}
