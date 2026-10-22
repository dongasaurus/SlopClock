/**
 * ha80s-digital-clock
 * A Home Assistant Lovelace card showing the current time in 24 hour format,
 * drawn as a retro red seven segment LED display.
 */

const CARD_VERSION = "1.0.0";

// Digit geometry (SVG units)
const DW = 50; // digit width
const DH = 90; // digit height
const ST = 10; // segment thickness
const SG = 1.6; // gap between segments
const DIGIT_GAP = 14; // space between digits
const COLON_W = 22; // width reserved for a colon
const PAD = 8; // outer padding
const SKEW = -6; // italic lean, like real LED displays

// Which segments are lit for each digit (a b c d e f g)
const DIGITS = {
  0: "abcdef",
  1: "bc",
  2: "abdeg",
  3: "abcdg",
  4: "bcfg",
  5: "acdfg",
  6: "acdefg",
  7: "abc",
  8: "abcdefg",
  9: "abcdfg",
};

function hSeg(yc) {
  const h = ST / 2;
  const x0 = h + SG;
  const x1 = DW - h - SG;
  return `${x0},${yc} ${x0 + h},${yc - h} ${x1 - h},${yc - h} ${x1},${yc} ${x1 - h},${yc + h} ${x0 + h},${yc + h}`;
}

function vSeg(xc, yTop, yBottom) {
  const h = ST / 2;
  const y0 = yTop + SG;
  const y1 = yBottom - SG;
  return `${xc},${y0} ${xc + h},${y0 + h} ${xc + h},${y1 - h} ${xc},${y1} ${xc - h},${y1 - h} ${xc - h},${y0 + h}`;
}

const SEGMENTS = {
  a: hSeg(ST / 2),
  g: hSeg(DH / 2),
  d: hSeg(DH - ST / 2),
  f: vSeg(ST / 2, ST / 2, DH / 2),
  b: vSeg(DW - ST / 2, ST / 2, DH / 2),
  e: vSeg(ST / 2, DH / 2, DH - ST / 2),
  c: vSeg(DW - ST / 2, DH / 2, DH - ST / 2),
};

const formatters = {};
function getFormatter(timeZone) {
  const key = timeZone || "local";
  if (!formatters[key]) {
    formatters[key] = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
      ...(timeZone ? { timeZone } : {}),
    });
  }
  return formatters[key];
}

class Ha80sDigitalClock extends HTMLElement {
  static getStubConfig() {
    return { show_seconds: false };
  }

  setConfig(config) {
    this._config = {
      show_seconds: false,
      blink_colon: true,
      color: "#ff2a1a",
      background: "#0b0202",
      ghost_opacity: 0.08,
      glow: true,
      time_zone: "local",
      ...config,
    };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
  }

  getCardSize() {
    return 3;
  }

  getGridOptions() {
    return { columns: 6, rows: 2, min_columns: 3, min_rows: 1 };
  }

  connectedCallback() {
    this._start();
  }

  disconnectedCallback() {
    clearTimeout(this._timer);
    this._timer = null;
  }

  _start() {
    clearTimeout(this._timer);
    const loop = () => {
      this._tick();
      // Wake up on each half second so the colon blinks in step with the clock
      const ms = Date.now() % 500;
      this._timer = setTimeout(loop, 500 - ms + 5);
    };
    loop();
  }

  _timeZone() {
    const tz = this._config.time_zone;
    if (!tz || tz === "local") return undefined;
    if (tz === "server") return this._hass?.config?.time_zone;
    return tz;
  }

  _tick() {
    if (!this._digitEls) return;
    const now = new Date();
    let parts;
    try {
      parts = getFormatter(this._timeZone()).formatToParts(now);
    } catch (e) {
      parts = getFormatter(undefined).formatToParts(now);
    }
    const get = (type) => parts.find((p) => p.type === type)?.value ?? "00";
    const text = get("hour") + get("minute") + (this._config.show_seconds ? get("second") : "");

    if (text !== this._lastText) {
      this._lastText = text;
      this._digitEls.forEach((segs, i) => {
        const lit = DIGITS[text[i]] || "";
        for (const [name, el] of Object.entries(segs)) {
          el.classList.toggle("on", lit.includes(name));
        }
      });
    }

    const colonOn = !this._config.blink_colon || now.getMilliseconds() < 500;
    this._colonEls.forEach((el) => el.classList.toggle("on", colonOn));
  }

  _render() {
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    const c = this._config;
    const digitCount = c.show_seconds ? 6 : 4;

    let x = PAD;
    let body = "";
    const digitIds = [];
    for (let i = 0; i < digitCount; i++) {
      if (i > 0 && i % 2 === 0) {
        // colon
        const cx = x - DIGIT_GAP / 2 + COLON_W / 2;
        const r = ST / 2 + 0.5;
        body += `<g class="colon"><circle class="seg" cx="${cx}" cy="${DH * 0.3}" r="${r}"/><circle class="seg" cx="${cx}" cy="${DH * 0.7}" r="${r}"/></g>`;
        x += COLON_W;
      }
      body += `<g class="digit" data-i="${i}" transform="translate(${x},0)">`;
      for (const [name, pts] of Object.entries(SEGMENTS)) {
        body += `<polygon class="seg" data-s="${name}" points="${pts}"/>`;
      }
      body += `</g>`;
      digitIds.push(i);
      x += DW + DIGIT_GAP;
    }
    const lean = Math.tan((-SKEW * Math.PI) / 180) * DH;
    const width = x - DIGIT_GAP + PAD + lean;
    const height = DH + PAD * 2;

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; height: 100%; }
        ha-card {
          height: 100%;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          justify-content: center;
          background: ${c.background};
          padding: 16px;
          overflow: hidden;
        }
        .title {
          color: ${c.color};
          opacity: 0.7;
          font-family: monospace;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          font-size: 0.8em;
          margin-bottom: 8px;
          text-align: center;
        }
        svg { width: 100%; height: auto; max-height: 100%; min-height: 0; display: block; }
        .seg { fill: ${c.color}; opacity: ${c.ghost_opacity}; transition: opacity 0.08s linear; }
        .seg.on, .colon.on .seg { opacity: 1; }
        ${c.glow ? `.seg.on, .colon.on .seg { filter: drop-shadow(0 0 1px ${c.color}) drop-shadow(0 0 4px color-mix(in srgb, ${c.color} 45%, transparent)); }` : ""}
      </style>
      <ha-card>
        ${c.title ? `<div class="title">${String(c.title).replace(/[&<>"]/g, "")}</div>` : ""}
        <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Clock">
          <g transform="translate(${lean},${PAD}) skewX(${SKEW})">${body}</g>
        </svg>
      </ha-card>
    `;

    this._digitEls = digitIds.map((i) => {
      const g = this.shadowRoot.querySelector(`.digit[data-i="${i}"]`);
      const segs = {};
      g.querySelectorAll(".seg").forEach((el) => (segs[el.dataset.s] = el));
      return segs;
    });
    this._colonEls = [...this.shadowRoot.querySelectorAll(".colon")];
    this._lastText = null;
    this._tick();
  }
}

customElements.define("ha80s-digital-clock", Ha80sDigitalClock);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "ha80s-digital-clock",
  name: "SlopClock",
  description: "24 hour clock styled as a red seven segment LED display.",
  preview: true,
});

console.info(`%c HA80S-DIGITAL-CLOCK %c v${CARD_VERSION} `, "color:#ff2a1a;background:#000;font-weight:bold", "color:#000;background:#ff2a1a");
