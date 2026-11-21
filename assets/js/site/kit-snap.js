/*
 * kit-snap: the scroll stepper (Site.snap). The page lands on stops instead of drifting.
 *
 *   <div data-kit="snap" data-snap-mode="deck|soft">
 *     <section data-snap> ... </section>
 *     <section data-snap data-snap-points="0.4 1" data-snap-hold="1"> ... </section>   (a tall, pinned section)
 *   </div>
 *
 * One wheel gesture or key press is one move to the next or previous stop. The move is our own tween of the
 * real scroll position, so sticky positioning, scroll-driven kits and the footer keep working. Trackpad inertia
 * is absorbed: after a move the rest of a stream is ignored until it pauses or clearly speeds up again.
 * Touch, portrait or narrow screens, reduced motion and ?static keep native scrolling (with CSS proximity snapping).
 * Usage notes for page authors: _work/agent_notes/kit-scroll.md, section "kit-snap".
 */
(function () {
  "use strict";

  var Site = window.Site;
  if (!Site || !Site.register) return;
  var env = Site.env;
  var util = Site.util;
  var clamp = util.clamp;
  var root = document.documentElement;

  /* ------------------------------------------------------------- constants */
  // ROUND2_SPEC 4.1: the stepper runs on landscape viewports at least this wide.
  var MIN_WIDTH = 760;
  // ROUND2_SPEC 4.1: a stop farther than REACH viewports is approached in steps of STEP viewports.
  var REACH = 1.1;
  var STEP = 0.85;
  // ROUND2_SPEC 4.1: an unmanaged scroll that stops in a tall section glides to a stop within REST_REACH viewports.
  var REST_REACH = 0.45;
  // Own: in soft mode a wheel scroll that stops this close to a stop (viewports) still lands on it.
  var SOFT_NEAR = 0.06;
  // ROUND2_SPEC 4.1: "about 700 to 1500 ms" by distance. Own formula: base + per viewport, clamped.
  var DURATION = { base: 450, perVh: 500, min: 450, max: 1500 };
  // Own: soft mode moves take this share of the time and give this share of the rubber band.
  var SOFT_TIME = 0.8;
  var SOFT_BAND = 0.6;
  // ROUND2_SPEC 4.1: "the page gives a few percent of the viewport and springs back".
  var BAND = 0.035;
  // Own: a reversed move brakes its old velocity over this time constant (ms), so it turns without a jump.
  var BRAKE_MS = 70;
  // Wheel gestures (own values, tuned by tests with mouse notches and simulated trackpad inertia):
  var WHEEL_START = 14; // px a new gesture travels before it moves the page (a light brush does nothing)
  var WHEEL_PAUSE = 400; // ms of silence that ends a gesture
  var REACCEL_RATIO = 1.8; // a stream speeding up again by this ratio over its low point ...
  var REACCEL_MIN = 8; // ... and by at least this many px per event is a new gesture
  var SUSTAIN_MIN = 40; // a wheel still spinning: events this large ...
  var SUSTAIN_RATIO = 0.85; // ... and as large as this share of the stream's peak (inertia decays, a spinning wheel does not)
  var EPS = 2; // px: "at a stop"
  var REST_MS = 160; // ms without scroll events that count as "the scroll stopped" where scrollend is missing

  var FIELD = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
  var KEY_OWNERS =
    'audio, video, [role="slider"], [role="listbox"], [role="menu"], [role="menubar"], [role="tablist"], [role="radiogroup"], [role="spinbutton"], [role="combobox"], [role="grid"], [role="tree"]';
  var BUTTONLIKE = 'button, summary, [role="button"], [role="checkbox"], [role="switch"], [role="tab"]';

  /* ---------------------------------------------------------------- helpers */
  function now() {
    return performance.now();
  }
  function emit(el, name, detail) {
    el.dispatchEvent(new CustomEvent("kit:" + name, { bubbles: true, detail: detail }));
  }
  function maxScroll() {
    var se = document.scrollingElement || root;
    return Math.max(0, se.scrollHeight - window.innerHeight);
  }
  function scrollToY(y) {
    window.scrollTo({ top: y, left: window.scrollX, behavior: "instant" });
  }
  /** A cubic-bezier easing (x1, y1, x2, y2) as a function of progress. */
  function bezier(c) {
    var x1 = c[0];
    var y1 = c[1];
    var x2 = c[2];
    var y2 = c[3];
    function at(a1, a2, t) {
      return 3 * a1 * (1 - t) * (1 - t) * t + 3 * a2 * (1 - t) * t * t + t * t * t;
    }
    function slope(a1, a2, t) {
      return 3 * a1 * (1 - t) * (1 - t) + 6 * (a2 - a1) * (1 - t) * t + 3 * (1 - a2) * t * t;
    }
    return function (x) {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      var t = x;
      for (var i = 0; i < 8; i++) {
        var d = at(x1, x2, t) - x;
        if (Math.abs(d) < 1e-5) break;
        var s = slope(x1, x2, t);
        if (Math.abs(s) < 1e-6) break;
        t -= d / s;
      }
      if (t < 0 || t > 1 || Math.abs(at(x1, x2, t) - x) > 1e-3) {
        // bisection when Newton wanders off
        var lo = 0;
        var hi = 1;
        t = x;
        for (var k = 0; k < 30; k++) {
          if (at(x1, x2, t) < x) lo = t;
          else hi = t;
          t = (lo + hi) / 2;
        }
      }
      return at(y1, y2, t);
    };
  }
  /** Displacement (in units of the start offset) of a spring released at rest from 1: 1 -> 0 with its overshoots. */
  function springStep(token) {
    var s = Site.t(token);
    var m = s.mass || 1;
    var w = Math.sqrt(s.stiffness / m);
    var z = s.damping / (2 * Math.sqrt(s.stiffness * m));
    if (z >= 1) {
      return function (t) {
        return (1 + w * t) * Math.exp(-w * t);
      };
    }
    var wd = w * Math.sqrt(1 - z * z);
    return function (t) {
      return Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t));
    };
  }
  function parsePoints(v) {
    if (v == null || v === "") return null;
    var pts = String(v)
      .split(/[\s,]+/)
      .map(Number)
      .filter(function (p) {
        return !isNaN(p);
      })
      .map(function (p) {
        return clamp(p, 0, 1);
      });
    return pts.length ? pts : null;
  }
  function attrNum(el, name) {
    var v = el.getAttribute(name);
    if (v == null || v === "") return null;
    var n = Number(v);
    return isNaN(n) ? null : n;
  }
  /** Can an element between the target and the page still scroll this way? Then the wheel is its own. */
  function scrollsInside(node, dir) {
    for (var n = node && node.nodeType === 1 ? node : node && node.parentElement; n && n !== document.body && n !== root; n = n.parentElement) {
      if (n.scrollHeight <= n.clientHeight + 1) continue;
      var oy = getComputedStyle(n).overflowY;
      if (oy !== "auto" && oy !== "scroll" && oy !== "overlay") continue;
      if (dir > 0 ? n.scrollTop + n.clientHeight < n.scrollHeight - 1 : n.scrollTop > 0) return true;
    }
    return false;
  }
  function modal() {
    return root.classList.contains("is-modal");
  }
  /** The page is locked (the home intro, a sheet, a dialog): its scroll is not ours to move. */
  function locked() {
    var o = getComputedStyle(root).overflowY;
    var b = document.body ? getComputedStyle(document.body).overflowY : "";
    return o === "hidden" || o === "clip" || b === "hidden" || b === "clip";
  }

  /* ------------------------------------------------------------ the stepper */
  var inst = null; // the one running stepper (one per page)

  function Stepper(wrap, opts) {
    var self = this;
    this.wrap = wrap;
    this.mode = opts.snapMode === "soft" ? "soft" : "deck";
    this.active = null;
    this.stops = [];
    this.zones = [];
    this.index = -1;
    this.currentEl = null; // the element carrying is-snap-current
    this.restingOn = undefined; // the index of the stop the page rests on, if it does
    this.nativeArrived = -1;
    this.vh = window.innerHeight;
    this.anim = null; // the running move
    this.band = null; // the running rubber band
    this.lastSet = null; // the last position we wrote (scrolls near it are ours)
    this.armed = new Map(); // element -> forward gestures its hold still absorbs
    this.wheel = { last: -1e9, sign: 0, used: false, acc: 0, peak: 0, recent: [], trough: Infinity };
    this.native = { target: 0, t: -1e9, wheelAt: -1e9 }; // soft mode: native wheel scrolling in a tall section
    this.vel = { y: window.scrollY, t: 0, v: 0 }; // velocity of scrolls we did not make (px/ms)
    this.restTimer = 0;
    this.touched = false; // the visitor has moved the page (no initial alignment after that)
    this.ease = Site.tokens.ease;
    this.offs = [];

    this.refresh = util.debounce(function () {
      self.update();
    }, 60);
    this.offs.push(Site.on("resize", this.refresh));
    this.offs.push(Site.on("reduce", this.refresh));
    this.offs.push(Site.on("hover", this.refresh));
    this.offs.push(
      Site.on("ready", function () {
        self.update();
        if (self.index > -1) {
          self.nativeArrived = self.index;
          var at = self.stopAt(window.scrollY);
          if (at && at.index === self.index) self.restingOn = at.index;
          emit(self.elOf(self.index), "snap-arrive", self.detail(self.index, -1, 0, { initial: true }));
        }
      }),
    );
    if (window.ResizeObserver) {
      this.ro = new ResizeObserver(this.refresh);
      this.ro.observe(wrap);
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(this.refresh);
    this.onLoad = function () {
      self.update();
      // a restored scroll position or an anchor jump: land on the stop at once
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          if (!self.touched) self.rest(true);
        });
      });
    };
    if (document.readyState === "complete") setTimeout(this.onLoad, 0);
    else window.addEventListener("load", this.onLoad);
    this.update();
  }

  var P = Stepper.prototype;

  /* ---------- running or not */
  P.shouldRun = function () {
    var w = window.innerWidth;
    var h = window.innerHeight;
    return env.hover && !env.reduce && !env.static && w >= MIN_WIDTH && w > h;
  };
  P.update = function () {
    var run = this.shouldRun();
    if (run !== this.active) {
      this.active = run;
      this.stopAnim();
      this.stopBand(true);
      root.classList.toggle("has-snap", run);
      root.classList.remove("is-snapping");
      this.wrap.classList.toggle("k-snap--native", !run);
      this.wrap.classList.toggle("k-snap", run);
    }
    if (this.band) return; // measured once the band has settled
    this.measure();
    // resting on a stop (or inside a pinned section): stay on it after the layout changed
    if (this.active && !this.anim && this.restingOn !== undefined && this.restingOn === this.index) {
      var s = this.stops[this.index];
      if (s && Math.abs(s.y - window.scrollY) > EPS) this.write(s.y);
    }
  };

  /* ---------- stops */
  P.measure = function () {
    var vh = (this.vh = window.innerHeight);
    var max = maxScroll();
    var y0 = window.scrollY;
    var list = [];
    var zones = [];
    var els = this.wrap.querySelectorAll("[data-snap]");
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (!el.getClientRects().length) continue; // not rendered
      var r = el.getBoundingClientRect();
      var top = r.top + y0;
      var h = el.offsetHeight || r.height;
      var pts = parsePoints(el.getAttribute("data-snap-points"));
      var hold = el.hasAttribute("data-snap-hold") ? (attrNum(el, "data-snap-hold") === null ? 1 : attrNum(el, "data-snap-hold")) : 0;
      var dur = attrNum(el, "data-snap-duration");
      var base = { el: el, top: top, bottom: top + h, duration: dur };
      var range = h - vh;
      if (pts && range > EPS) {
        if (el.getAttribute("data-snap-top") === "true" && pts.indexOf(0) < 0) pts.unshift(0);
        pts.sort(function (a, b) {
          return a - b;
        });
        zones.push({ el: el, top: top, bottom: top + range });
        for (var k = 0; k < pts.length; k++) {
          list.push(mk(base, top + pts[k] * range, k, pts.length, k === pts.length - 1 ? hold : 0));
        }
      } else list.push(mk(base, top, 0, 1, hold));
    }
    function mk(b, y, point, points, hold) {
      return { el: b.el, top: b.top, bottom: b.bottom, duration: b.duration, y: y, point: point, points: points, hold: hold, end: false };
    }
    list.forEach(function (s) {
      s.y = clamp(Math.round(s.y), 0, max);
    });
    list.sort(function (a, b) {
      return a.y - b.y;
    });
    // stops that fall together are one (the first keeps its element)
    var merged = [];
    list.forEach(function (s) {
      var last = merged[merged.length - 1];
      if (last && Math.abs(last.y - s.y) <= EPS * 2) {
        if (s.hold && !last.hold) last.hold = s.hold;
        return;
      }
      merged.push(s);
    });
    // the page's top is the first stop; the very end of the page is the last one
    if (merged.length && merged[0].y <= vh * 0.25) merged[0].y = 0;
    var last = merged[merged.length - 1];
    if (!last || max - last.y > vh * 0.25) merged.push({ el: this.wrap, top: 0, bottom: 0, duration: null, y: max, point: 0, points: 1, hold: 0, end: true });
    else if (last.points === 1) last.y = max;
    merged.forEach(function (s, n) {
      s.index = n;
    });
    var was = this.index > -1 && this.stops[this.index] ? this.stops[this.index] : null;
    var wasResting = this.restingOn !== undefined && this.restingOn === this.index;
    this.stops = merged;
    this.zones = zones;
    // keep the current stop by identity, else take the one at the current position
    var keep = -1;
    if (was) {
      for (var j = 0; j < merged.length; j++) if (merged[j].el === was.el && merged[j].point === was.point && merged[j].end === was.end) keep = j;
    }
    if (this.anim && this.anim.stop) {
      // a move under way keeps its target, measured anew
      var t = this.anim.stop;
      for (var q = 0; q < merged.length; q++) {
        if (merged[q].el === t.el && merged[q].point === t.point) {
          this.anim.stop = merged[q];
          this.anim.to = merged[q].y;
        }
      }
    }
    var idx = keep > -1 ? keep : this.indexAt(window.scrollY);
    this.index = -2; // re-applied below (the old number may point at a different stop now)
    this.setIndex(idx, 0, true);
    this.restingOn = wasResting && keep > -1 ? idx : this.restingOn === undefined ? undefined : this.stopAt(window.scrollY) ? this.stopAt(window.scrollY).index : undefined;
  };
  P.elOf = function (i) {
    var s = this.stops[i];
    return s ? s.el : this.wrap;
  };
  /** The stop within EPS of y, or null. */
  P.stopAt = function (y) {
    for (var i = 0; i < this.stops.length; i++) if (Math.abs(this.stops[i].y - y) <= EPS) return this.stops[i];
    return null;
  };
  /** The current stop for a position: a stop at it; else among the sections covering the viewport's middle,
   *  the stop nearest; else the last stop above the middle. */
  P.indexAt = function (y) {
    var st = this.stops;
    if (!st.length) return -1;
    var at = this.stopAt(y);
    if (at) return at.index;
    var mid = y + this.vh / 2;
    var best = -1;
    for (var i = 0; i < st.length; i++) {
      var s = st[i];
      if (s.end || !(s.top <= mid && mid < s.bottom)) continue;
      if (best < 0 || Math.abs(s.y - y) < Math.abs(st[best].y - y)) best = i;
    }
    if (best > -1) return best;
    for (var k = st.length - 1; k >= 0; k--) if (st[k].y <= mid) return k;
    return 0;
  };
  P.zoneAt = function (y) {
    for (var i = 0; i < this.zones.length; i++) {
      var z = this.zones[i];
      if (y > z.top + EPS && y < z.bottom - EPS) return z;
    }
    return null;
  };
  P.nextStop = function (dir, y) {
    var st = this.stops;
    if (dir > 0) {
      for (var i = 0; i < st.length; i++) if (st[i].y > y + EPS) return st[i];
    } else {
      for (var k = st.length - 1; k >= 0; k--) if (st[k].y < y - EPS) return st[k];
    }
    return null;
  };
  /** Where the free part of the way from y toward a stop ends: the first pinned section met on the way. */
  P.freeLine = function (dir, y, to) {
    var line = null;
    for (var i = 0; i < this.zones.length; i++) {
      var z = this.zones[i];
      var edge = dir > 0 ? z.top : z.bottom;
      if (dir > 0 ? edge > y + EPS && edge <= to : edge < y - EPS && edge >= to) {
        if (line === null || (dir > 0 ? edge < line : edge > line)) line = edge;
      }
    }
    return line;
  };
  /**
   * The next resting place in a direction: the next stop when it is within reach (or the way to it runs through a
   * pinned section), else a step of STEP viewports through a tall section. { y, stop } or null at the last stop.
   */
  P.step = function (dir, y) {
    var s = this.nextStop(dir, y);
    if (!s) return null;
    var reach = REACH * this.vh;
    if (Math.abs(s.y - y) <= reach || this.zoneAt(y)) return { y: s.y, stop: s };
    var line = this.freeLine(dir, y, s.y);
    var free = line === null ? Math.abs(s.y - y) : Math.abs(line - y);
    if (free <= reach) return { y: s.y, stop: s };
    return { y: y + dir * STEP * this.vh, stop: null, free: true, line: line === null ? s.y : line };
  };

  /* ---------- index and events */
  P.detail = function (i, from, dir, extra) {
    var s = this.stops[i] || {};
    var d = { index: i, from: from, direction: dir, point: s.point || 0, end: !!s.end, element: s.el || this.wrap };
    if (extra) for (var k in extra) d[k] = extra[k];
    return d;
  };
  P.setIndex = function (i, dir, silent) {
    var from = this.index;
    if (i === from) return;
    var oldEl = this.currentEl;
    this.index = i;
    var newEl = i > -1 ? this.elOf(i) : null;
    if (oldEl && oldEl !== newEl) oldEl.classList.remove("is-snap-current");
    if (newEl) newEl.classList.add("is-snap-current");
    this.currentEl = newEl;
    if (silent || i < 0) return;
    this.lastFrom = from;
    if (oldEl) emit(oldEl, "snap-leave", this.detail(from, from, dir, { to: i, element: oldEl }));
    emit(newEl, "snap-change", this.detail(i, from, dir));
  };
  P.arrive = function (s, dir) {
    this.restingOn = s.index;
    if (s.hold) this.armed.set(s.el, s.hold);
    emit(s.el, "snap-arrive", this.detail(s.index, this.lastFrom == null ? s.index : this.lastFrom, dir || 0));
  };

  /* ---------- the move */
  P.duration = function (dist, s) {
    var ms = s && s.duration ? s.duration : clamp(DURATION.base + (DURATION.perVh * dist) / this.vh, DURATION.min, DURATION.max);
    if (this.mode === "soft" && !(s && s.duration)) ms *= SOFT_TIME;
    return ms * Site.tempo;
  };
  P.write = function (y) {
    this.lastSet = y;
    scrollToY(y);
  };
  /** Move to y (a stop, or a step through a tall section), from where the page is, with the velocity it has. */
  P.moveTo = function (y, stop, dir, kind) {
    var self = this;
    y = clamp(Math.round(y), 0, maxScroll());
    var a = this.anim;
    var from = a ? a.pos : window.scrollY;
    var v0 = a ? a.vel : now() - this.vel.t < 60 ? this.vel.v : 0;
    if (this.band && this.band.kind === "hold") this.stopBand(false);
    this.restingOn = undefined;
    var dist = Math.abs(y - from);
    var d = dir || (y > from ? 1 : -1);
    if (dist < 0.5) {
      this.stopAnim(false);
      this.write(y);
      if (stop) {
        this.setIndex(stop.index, d);
        this.arrive(stop, d);
      }
      return;
    }
    if (a) cancelAnimationFrame(a.raf);
    var curve = bezier(this.mode === "soft" ? this.ease.soft : this.ease.inOut);
    var dur = this.duration(dist, stop);
    var brake = v0 * BRAKE_MS; // where the old velocity alone would carry the page
    var anim = (this.anim = { from: from, to: y, start: now(), dur: dur, v0: v0, dir: d, stop: stop, kind: kind || "move", pos: from, vel: v0, origin: a ? a.origin : from, originStop: a ? a.originStop : this.stopAt(from) });
    root.classList.add("is-snapping");
    var target = stop ? stop.index : this.indexAt(y);
    if (target !== this.index) this.setIndex(target, d);
    function frame() {
      var t = now() - anim.start;
      var s = clamp(t / anim.dur, 0, 1);
      var carry = brake * (1 - Math.exp(-t / BRAKE_MS)); // the old motion dying away
      var pos = anim.from + carry + (anim.to - anim.from - brake) * curve(s);
      if (s >= 1) pos = anim.to;
      var dt = Math.max(1, t - (anim.t || 0));
      anim.vel = (pos - anim.pos) / dt;
      anim.t = t;
      anim.pos = pos;
      self.write(pos);
      if (s >= 1) return self.finish(anim);
      anim.raf = requestAnimationFrame(frame);
    }
    anim.raf = requestAnimationFrame(frame);
  };
  P.finish = function (anim) {
    if (this.anim !== anim) return;
    this.anim = null;
    root.classList.remove("is-snapping");
    var s = anim.stop || this.stopAt(anim.to);
    if (s) {
      if (s.index !== this.index) this.setIndex(s.index, anim.dir);
      this.arrive(s, anim.dir);
    }
  };
  P.stopAnim = function () {
    if (!this.anim) return;
    cancelAnimationFrame(this.anim.raf);
    this.anim = null;
    root.classList.remove("is-snapping");
  };
  /** A gesture the other way during a move: back to where the move started, from where the page is. */
  P.turnAround = function () {
    var a = this.anim;
    var back = a.originStop;
    this.moveTo(back ? back.y : a.origin, back || null, -a.dir, "turn");
    // the move back starts a fresh "origin" (a further reversal returns to the stop we just left)
    if (this.anim) {
      this.anim.origin = a.to;
      this.anim.originStop = a.stop;
    }
  };

  /* ---------- the rubber band */
  /** Stop the rubber band; `restore` puts a held page back on its stop (else a move takes over from where it is). */
  P.stopBand = function (restore) {
    var b = this.band;
    if (!b) return;
    cancelAnimationFrame(b.raf);
    this.band = null;
    b.els.forEach(function (el) {
      el.style.translate = "";
    });
    if (restore && b.kind === "hold") this.write(b.base);
  };
  /** kind "hold": the real scroll gives a little and comes back (a pinned stage keeps its pin);
   *  kind "edge": at the first or last stop, the sections in view give a little (there is no scroll left). */
  P.rubber = function (dir, kind) {
    var self = this;
    var amp = BAND * this.vh * (this.mode === "soft" ? SOFT_BAND : 1);
    var prev = this.band;
    if (prev && prev.kind !== kind) {
      this.stopBand(true);
      prev = null;
    }
    var startOff = prev ? prev.off : 0;
    if (prev) cancelAnimationFrame(prev.raf);
    var base = prev ? prev.base : window.scrollY;
    var els = [];
    if (kind === "edge") {
      var vh = this.vh;
      var seen = [];
      this.stops.forEach(function (s) {
        if (s.end || seen.indexOf(s.el) > -1) return;
        var r = s.el.getBoundingClientRect();
        if (r.bottom > 0 && r.top < vh) seen.push(s.el);
      });
      els = seen;
      if (prev)
        prev.els.forEach(function (el) {
          if (els.indexOf(el) < 0) el.style.translate = "";
        });
    }
    var out = Site.t("transition.fade"); // the give: quick, easing out
    var outMs = out.duration * 1000;
    var outCurve = bezier(out.ease);
    var back = springStep("spring.bounce"); // the return: a spring with a little overshoot
    var band = (this.band = { kind: kind, dir: dir, base: base, els: els, off: startOff, start: now() });
    var peak = dir * amp;
    function frame() {
      var t = now() - band.start;
      var off;
      if (t < outMs) off = startOff + (peak - startOff) * outCurve(t / outMs);
      else {
        var ts = (t - outMs) / 1000 / Site.tempo;
        off = peak * back(ts);
        if (ts > 0.25 && Math.abs(off) < 0.3) off = 0;
      }
      band.off = off;
      if (kind === "hold") self.write(base + off);
      else
        els.forEach(function (el) {
          el.style.translate = off === 0 ? "" : "0 " + (-off).toFixed(2) + "px";
        });
      if (off === 0 && t > outMs) {
        self.band = null;
        if (kind === "hold") self.write(base);
        self.refresh();
        return;
      }
      band.raf = requestAnimationFrame(frame);
    }
    band.raf = requestAnimationFrame(frame);
  };

  /* ---------- gestures */
  /** One gesture in a direction (a wheel stream, a key press). */
  P.gesture = function (dir, source) {
    this.touched = true;
    var a = this.anim;
    if (a) {
      if (a.kind === "rest" || a.kind === "jump") {
        // a correction under way: decide afresh from where the page is
        var st = this.step(dir, a.pos);
        if (st) this.moveTo(st.y, st.stop, dir);
        return;
      }
      if (dir !== a.dir) this.turnAround();
      return; // the same way: ignored (moves never queue)
    }
    if (this.band && this.band.dir === dir && now() - this.band.start < Site.t("transition.fade").duration * 1000) return;
    var y = this.band && this.band.kind === "hold" ? this.band.base : window.scrollY;
    var here = this.stopAt(y);
    if (dir > 0 && here && here.hold && (this.armed.get(here.el) || 0) > 0) {
      this.armed.set(here.el, this.armed.get(here.el) - 1);
      this.rubber(dir, "hold");
      emit(here.el, "snap-hold", this.detail(here.index, here.index, dir));
      return;
    }
    var st2 = this.step(dir, y);
    if (!st2) {
      this.rubber(dir, "edge");
      emit(this.wrap, dir > 0 ? "snap-end" : "snap-start", this.detail(this.index, this.index, dir));
      return;
    }
    this.moveTo(st2.y, st2.stop, dir);
  };
  /** Soft mode: in a tall section the wheel scrolls natively, until it would run past the next stop. */
  P.nativeWheel = function (dir, dy, t) {
    if (this.mode !== "soft" || this.anim || this.band) return false;
    var y = window.scrollY;
    var st = this.step(dir, y);
    if (!st || !st.free) return false;
    var n = this.native;
    var stale = t - n.t > 250 || (n.target - y) * dir < 0;
    n.target = (stale ? y : n.target) + dy;
    n.t = t;
    n.wheelAt = t;
    return (n.target - st.line) * dir < -EPS ? "native" : "cross";
  };
  P.onWheel = function (e, dy, dir) {
    var t = e.timeStamp || now();
    var a = Math.abs(dy);
    var w = this.wheel;
    var fresh = t - w.last > WHEEL_PAUSE || dir !== w.sign;
    w.last = t;
    if (fresh) {
      w.sign = dir;
      w.used = false;
      w.acc = 0;
      w.peak = 0;
      w.recent.length = 0;
      w.trough = Infinity;
    }
    w.recent.push(a);
    if (w.recent.length > 3) w.recent.shift();
    var mean = w.recent.reduce(function (p, c) {
      return p + c;
    }, 0) / w.recent.length;
    if (a > w.peak) w.peak = a;
    var nat = w.used ? false : this.nativeWheel(dir, dy, t);
    if (nat === "native") {
      this.touched = true;
      return; // the browser scrolls (soft mode, inside a tall section)
    }
    e.preventDefault();
    if (!w.used) {
      w.acc += a;
      if (w.acc < WHEEL_START && nat !== "cross") return;
      w.used = true;
      w.trough = Infinity;
      this.native.t = -1e9;
      this.gesture(dir, "wheel");
      return;
    }
    if ((this.anim && this.anim.kind !== "rest") || (this.band && this.band.dir === dir)) {
      w.trough = Infinity; // during a move (or the band) the stream is absorbed; its low point is taken after
      return;
    }
    if (mean < w.trough) w.trough = mean;
    var reaccel = mean > w.trough * REACCEL_RATIO && mean - w.trough >= REACCEL_MIN;
    var sustained = a >= SUSTAIN_MIN && a >= w.peak * SUSTAIN_RATIO;
    if (reaccel || sustained) {
      w.trough = Infinity;
      w.peak = a;
      this.gesture(dir, "wheel");
    }
  };
  P.onKey = function (e) {
    var k = e.key;
    var dir = 0;
    var t = e.target;
    var buttonish = t && t.closest && t.closest(BUTTONLIKE);
    if (k === "PageDown" || (k === " " && !e.shiftKey) || k === "ArrowDown" || k === "Down") dir = 1;
    else if (k === "PageUp" || (k === " " && e.shiftKey) || k === "ArrowUp" || k === "Up") dir = -1;
    else if (k === "Home" || k === "End") {
      e.preventDefault();
      this.touched = true;
      return this.go(k === "Home" ? 0 : this.stops.length - 1);
    } else return;
    if (k === " " && buttonish) return; // Space presses the button
    if (t && t.closest && t.closest(KEY_OWNERS) && k !== "PageDown" && k !== "PageUp") return;
    if (scrollsInside(t, dir) && t !== document.body) return;
    if ((k === "ArrowDown" || k === "ArrowUp") && this.mode === "soft" && !this.anim) {
      var st = this.step(dir, window.scrollY);
      if (st && st.free && Math.abs(st.line - window.scrollY) > this.vh * 0.1) {
        this.native.wheelAt = now();
        return; // reading a tall section line by line
      }
    }
    e.preventDefault();
    if (e.repeat && this.anim && this.anim.dir === dir) return;
    this.gesture(dir, "key");
  };

  /* ---------- scrolls we did not make */
  P.onScroll = function () {
    var y = window.scrollY;
    var t = now();
    if (this.active && this.lastSet !== null && Math.abs(y - this.lastSet) <= EPS) return; // ours
    var dir = y >= this.vel.y ? 1 : -1;
    var dt = t - this.vel.t;
    this.vel.v = dt > 0 && dt < 100 ? 0.6 * ((y - this.vel.y) / dt) + 0.4 * this.vel.v : 0;
    this.vel.y = y;
    this.vel.t = t;
    var self = this;
    clearTimeout(this.restTimer);
    // where scrollend exists it says when the scroll stopped; the timer is only a safety net then
    this.restTimer = setTimeout(function () {
      self.rest(false);
    }, "onscrollend" in window ? 1500 : REST_MS);
    if (!this.active) {
      var ni = this.indexAt(y);
      if (ni !== this.index) this.setIndex(ni, dir);
      return;
    }
    // the scrollbar, find-in-page, focus, an anchor, a native wheel: stop what we were doing, look again when it stops
    this.lastSet = null;
    this.touched = true;
    this.restingOn = undefined;
    if (this.anim) this.stopAnim();
    if (this.band && this.band.kind === "hold") this.stopBand(false);
    if (this.mode === "soft") {
      var i = this.indexAt(y);
      if (i !== this.index) this.setIndex(i, dir);
    }
  };
  P.onScrollEnd = function () {
    if (this.active && this.lastSet !== null && Math.abs(window.scrollY - this.lastSet) <= EPS) return;
    clearTimeout(this.restTimer);
    this.rest(false);
  };
  /** The page has stopped somewhere we did not put it: land on a stop if it is near or the place is not a resting place. */
  P.rest = function (instant) {
    if (!this.active) {
      // native mode: index from the position, arrive when the scroll stops
      var ni = this.indexAt(window.scrollY);
      if (ni !== this.index) this.setIndex(ni, 0);
      if (ni > -1 && !instant && ni !== this.nativeArrived) {
        this.nativeArrived = ni;
        emit(this.elOf(ni), "snap-arrive", this.detail(ni, this.lastFrom == null ? ni : this.lastFrom, 0, { native: true }));
      }
      return;
    }
    if (this.anim || this.band || modal() || locked()) return;
    var y = window.scrollY;
    var target = this.restTarget(y);
    if (target === null) {
      var i = this.indexAt(y);
      if (i !== this.index) this.setIndex(i, 0);
      var at = this.stopAt(y);
      if (at && this.restingOn !== at.index) this.arrive(at, 0);
      return;
    }
    if (instant) {
      this.write(target.y);
      if (target.index !== this.index) this.setIndex(target.index, 0, true);
      this.restingOn = target.index;
      if (target.hold) this.armed.set(target.el, target.hold);
      return;
    }
    this.moveTo(target.y, target, target.y > y ? 1 : -1, "rest");
  };
  P.restTarget = function (y) {
    var st = this.stops;
    if (!st.length || this.stopAt(y)) return null;
    var prev = this.nextStop(-1, y + EPS + 0.5);
    var next = this.nextStop(1, y - EPS - 0.5);
    if (!prev) return next;
    if (!next) return prev;
    var nearest = y - prev.y <= next.y - y ? prev : next;
    var d = Math.min(y - prev.y, next.y - y);
    if (this.zoneAt(y)) return nearest; // never half-way through a pinned (scroll-driven) section
    var gap = next.y - prev.y;
    var vh = this.vh;
    var free = gap > REACH * vh;
    if (!free) return nearest; // between two slides: always the nearer one
    if (this.mode === "soft" && now() - this.native.wheelAt < 1500) return d <= SOFT_NEAR * vh ? nearest : null;
    return d <= REST_REACH * vh ? nearest : null;
  };

  /* ---------- in-page links and focus */
  /** Where to go to show an element: its section's stop, or (deep inside a tall section) the element itself. */
  P.targetFor = function (el) {
    var sec = el.closest ? el.closest("[data-snap]") : null;
    if (!sec || !this.wrap.contains(sec)) return null;
    var mine = this.stops.filter(function (s) {
      return s.el === sec;
    });
    if (!mine.length) return null;
    var cur = this.stops[this.index];
    if (mine.length > 1) {
      if (cur && cur.el === sec) return cur;
      var y = window.scrollY;
      return mine.reduce(function (b, s) {
        return Math.abs(s.y - y) < Math.abs(b.y - y) ? s : b;
      });
    }
    var s0 = mine[0];
    var r = el.getBoundingClientRect();
    var elBottom = r.bottom + window.scrollY;
    var elTop = r.top + window.scrollY;
    // shown well at the section's top (in its upper part): the stop; deeper: the element, a little below the top
    if (sec.offsetHeight <= REACH * this.vh || el === sec || (elTop - s0.y <= 0.6 * this.vh && elBottom - s0.y <= this.vh)) return s0;
    var next = this.nextStop(1, s0.y);
    var limit = next ? next.y : maxScroll();
    return { y: clamp(elTop - 0.3 * this.vh, s0.y, limit), free: true, index: s0.index };
  };
  P.onClick = function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || modal() || locked()) return;
    var a = e.target.closest ? e.target.closest('a[href^="#"]') : null;
    if (!a) return;
    var href = a.getAttribute("href");
    var id = href.slice(1);
    try {
      id = decodeURIComponent(id);
    } catch (err) {
      /* keep it */
    }
    var el = id ? document.getElementById(id) : null;
    if (!el || !this.wrap.contains(el)) return; // the skip link, the footer: the browser's own jump (and a landing after)
    var target = this.targetFor(el);
    if (!target) return;
    e.preventDefault();
    this.touched = true;
    if (window.location.hash !== href) {
      try {
        history.pushState(null, "", href);
      } catch (err) {
        /* file:// and the like */
      }
    }
    this.moveTo(target.y, target.free ? null : target, 0, "jump");
    if (!el.hasAttribute("tabindex") && !el.matches("a[href], button, input, select, textarea, summary")) el.setAttribute("tabindex", "-1");
    this.anchoring = true;
    el.focus({ preventScroll: true });
    this.anchoring = false;
  };
  P.onFocus = function (e) {
    if (this.anchoring || modal() || locked()) return;
    var t = e.target;
    if (!t || !t.matches || !this.wrap.contains(t)) return;
    var visible = false;
    try {
      visible = t.matches(":focus-visible");
    } catch (err) {
      visible = true;
    }
    if (!visible) return;
    var target = this.targetFor(t);
    if (!target) return;
    var y = this.anim ? this.anim.to : window.scrollY;
    if (Math.abs(target.y - y) <= EPS) return;
    this.touched = true;
    this.moveTo(target.y, target.free ? null : target, 0, "jump");
  };

  /* ---------- the API */
  P.resolve = function (target) {
    if (typeof target === "number") return this.stops[clamp(Math.round(target), 0, this.stops.length - 1)] || null;
    if (target && target.nodeType === 1) {
      for (var i = 0; i < this.stops.length; i++) if (this.stops[i].el === target) return this.stops[i];
      for (var k = 0; k < this.stops.length; k++) if (!this.stops[k].end && this.stops[k].el.contains(target)) return this.stops[k];
    }
    return null;
  };
  P.go = function (target) {
    var s = this.resolve(target);
    if (!s) return;
    if (!this.active) {
      window.scrollTo({ top: s.y, behavior: env.reduce ? "auto" : "smooth" });
      return;
    }
    if (this.band) this.stopBand(false);
    this.moveTo(s.y, s, 0, "move");
  };
  P.destroy = function () {
    this.stopAnim();
    this.stopBand(true);
    clearTimeout(this.restTimer);
    this.offs.forEach(function (off) {
      off();
    });
    if (this.ro) this.ro.disconnect();
    window.removeEventListener("load", this.onLoad);
    if (this.currentEl) this.currentEl.classList.remove("is-snap-current");
    root.classList.remove("has-snap", "is-snapping");
    this.wrap.classList.remove("k-snap", "k-snap--native");
  };

  /* One set of listeners for the page, registered once; they act only while a stepper runs. */
  function norm(d, mode) {
    return mode === 1 ? d * 16 : mode === 2 ? d * window.innerHeight : d;
  }
  window.addEventListener(
    "wheel",
    function (e) {
      if (!inst || !inst.active || e.defaultPrevented) return;
      if (e.ctrlKey || e.metaKey || modal() || locked()) return;
      var dy = norm(e.deltaY, e.deltaMode);
      var dx = norm(e.deltaX, e.deltaMode);
      if (!dy || Math.abs(dx) > Math.abs(dy)) return;
      var dir = dy > 0 ? 1 : -1;
      if (scrollsInside(e.target, dir)) return;
      inst.onWheel(e, dy, dir);
    },
    { passive: false },
  );
  window.addEventListener("keydown", function (e) {
    if (!inst || !inst.active || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || modal() || locked()) return;
    var t = e.target;
    if (t && t.closest && (t.closest(FIELD) || t.isContentEditable)) return;
    inst.onKey(e);
  });
  window.addEventListener(
    "scroll",
    function () {
      if (inst) inst.onScroll();
    },
    { passive: true },
  );
  window.addEventListener("scrollend", function () {
    if (inst) inst.onScrollEnd();
  });
  document.addEventListener("click", function (e) {
    if (inst && inst.active) inst.onClick(e);
  });
  document.addEventListener("focusin", function (e) {
    if (inst && inst.active) inst.onFocus(e);
  });

  /** Site.snap: the page's stepper (inert until a [data-kit="snap"] wrapper is attached). */
  Site.snap = {
    get index() {
      return inst ? inst.index : -1;
    },
    get stops() {
      return inst
        ? inst.stops.map(function (s) {
            return { index: s.index, y: s.y, element: s.el, point: s.point, hold: s.hold, end: s.end };
          })
        : [];
    },
    get active() {
      return !!(inst && inst.active);
    },
    get mode() {
      return inst ? inst.mode : null;
    },
    get moving() {
      return !!(inst && inst.anim);
    },
    go: function (target) {
      if (inst) inst.go(target);
    },
    next: function () {
      if (inst) inst.go(Math.min(inst.index + 1, inst.stops.length - 1));
    },
    prev: function () {
      if (inst) inst.go(Math.max(inst.index - 1, 0));
    },
    refresh: function () {
      if (inst) inst.update();
    },
  };

  Site.register("snap", function (el, opts) {
    if (inst) return null; // one stepper per page
    inst = new Stepper(el, opts);
    var mine = inst;
    return {
      go: Site.snap.go,
      next: Site.snap.next,
      prev: Site.snap.prev,
      refresh: Site.snap.refresh,
      get index() {
        return mine.index;
      },
      destroy: function () {
        mine.destroy();
        if (inst === mine) inst = null;
      },
    };
  });
})();
