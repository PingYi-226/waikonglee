/*
 * Home page, first screen.
 *   1. intro: on the first visit of a session the name draws itself in the middle of the screen, then glides to its place
 *   2. entrance: what follows the name arrives by rank, 0.08 s apart (role, statement, the two buttons, the figures)
 *   3. leaving: the layers go at their own speeds (figures, words, name), read from the scroll the stepper tweens
 *   4. the lattice: a fixed layer under the first screen (see initLattice)
 * Everything here is an enhancement: without this file the page is complete and still.
 */
(function () {
  "use strict";

  var Site = window.Site;
  if (!Site) return;
  var M = window.Motion;
  var util = Site.util;
  var T = Site.tokens;
  var root = document.documentElement;

  function kit(el, name) {
    return el ? Site.get(el, name) : null;
  }
  function all(scope, selector) {
    return Array.prototype.slice.call(scope.querySelectorAll(selector));
  }
  function wait(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }
  function cssVar(name, fallback) {
    return getComputedStyle(root).getPropertyValue(name).trim() || fallback;
  }

  /* ================================================================== intro */
  var INTRO = { draw: 1.25, fill: 0.45, hold: 0.25, key: "wk-intro" };

  function introSeen() {
    try {
      return window.sessionStorage.getItem(INTRO.key) === "1";
    } catch (e) {
      return true;
    }
  }
  function markIntroSeen() {
    try {
      window.sessionStorage.setItem(INTRO.key, "1");
    } catch (e) {
      /* private mode: the intro simply plays again */
    }
  }

  /**
   * Plays the intro when it should. Resolves with true once the name is on its way to its place
   * (the rest of the hero may start arriving), or with false at once when there is no intro.
   */
  function intro(hero) {
    var name = hero.querySelector("[data-hero-name]");
    var lines = name ? all(name, ".hero__line") : [];
    var forced = /(^|[?&])intro(=|&|$)/.test(window.location.search.slice(1));
    var skip = Site.env.reduce || !M || !lines.length || window.scrollY > 4 || (!forced && (introSeen() || window.location.hash));
    if (skip) return Promise.resolve(false);

    root.classList.add("is-intro");
    var family = '"Instrument Serif"';
    var fonts = document.fonts;
    var loaded = fonts && fonts.load ? Promise.race([fonts.load("400 64px " + family), wait(1400)]) : Promise.resolve();

    return loaded
      .then(function () {
        if (fonts && fonts.check && !fonts.check("400 64px " + family)) throw new Error("font not ready");
        return playIntro(name, lines);
      })
      .catch(function () {
        root.classList.remove("is-intro");
        return false;
      });
  }

  function playIntro(name, lines) {
    var cs = getComputedStyle(name);
    var size = parseFloat(cs.fontSize);
    var vw = root.clientWidth;
    var vh = window.innerHeight;

    // where each line will rest: its left edge and its baseline
    var boxes = lines.map(function (line) {
      var probe = document.createElement("span");
      probe.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline";
      line.appendChild(probe);
      var rect = line.getBoundingClientRect();
      var base = probe.getBoundingClientRect().bottom;
      line.removeChild(probe);
      return { text: line.textContent, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, base: base };
    });
    var left = Math.min.apply(null, boxes.map(function (b) { return b.left; }));
    var right = Math.max.apply(null, boxes.map(function (b) { return b.right; }));
    var top = Math.min.apply(null, boxes.map(function (b) { return b.top; }));
    var bottom = Math.max.apply(null, boxes.map(function (b) { return b.bottom; }));
    var dx = (vw - (right - left)) / 2 - left;
    var dy = (vh - (bottom - top)) / 2 - top;
    var dash = Math.round(size * 9); // longer than any glyph outline at this size

    var NS = "http://www.w3.org/2000/svg";
    var overlay = document.createElement("div");
    overlay.className = "intro";
    overlay.setAttribute("aria-hidden", "true");
    var veil = document.createElement("div");
    veil.className = "intro__veil";
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("width", vw);
    svg.setAttribute("height", vh);
    svg.setAttribute("viewBox", "0 0 " + vw + " " + vh);
    var group = document.createElementNS(NS, "g");
    group.style.transform = "translate(" + dx + "px, " + dy + "px)";
    var texts = boxes.map(function (b) {
      var t = document.createElementNS(NS, "text");
      t.setAttribute("x", b.left);
      t.setAttribute("y", b.base);
      t.textContent = b.text;
      t.style.fontFamily = cs.fontFamily;
      t.style.fontSize = size + "px";
      t.style.letterSpacing = cs.letterSpacing;
      t.style.fontKerning = cs.fontKerning;
      t.style.strokeDasharray = dash;
      t.style.strokeDashoffset = dash;
      t.style.fillOpacity = 0;
      group.appendChild(t);
      return t;
    });
    svg.appendChild(group);
    overlay.appendChild(veil);
    overlay.appendChild(svg);
    document.body.appendChild(overlay);

    // 1. the outline draws itself, 2. it fills, 3. a short rest
    texts.forEach(function (t, i) {
      // explicit from-values: Motion cannot read these SVG properties from the element and would jump to the end
      M.animate(t, { strokeDashoffset: [dash, 0] }, { duration: INTRO.draw - i * 0.15, delay: i * 0.18, ease: "easeInOut" });
      M.animate(t, { fillOpacity: [0, 1] }, { duration: INTRO.fill, delay: INTRO.draw - 0.3, ease: T.ease.out });
      M.animate(t, { strokeOpacity: [1, 0] }, { duration: INTRO.fill, delay: INTRO.draw - 0.1, ease: T.ease.out });
    });

    return wait((INTRO.draw - 0.3 + INTRO.fill + INTRO.hold) * 1000).then(function () {
      // 4. the name glides to its place while the veil clears
      var glide = M.animate(group, { transform: "translate(0px, 0px)" }, Site.t("spring.glide"));
      M.animate(veil, { opacity: 0 }, { duration: 0.6, ease: T.ease.out });
      var landed = false;
      function land() {
        if (landed) return;
        landed = true;
        name.classList.add("is-on");
        overlay.remove();
        root.classList.remove("is-intro");
        markIntroSeen();
      }
      Promise.race([glide.finished || glide, wait(1600)]).then(land, land);
      return wait(320).then(function () {
        return true;
      });
    });
  }

  /* =============================================================== entrance
     After the name: everything marked data-hero-rank arrives in rank order, RANK seconds apart. Each part arrives in its
     own way (the kits do the moving): the role and the statement word by word out of a blur (split), the buttons under
     a block of colour (reveal, wipe), the figures rolling to their values under a hairline that draws itself. */
  var RANK = 0.08; // s between ranks (the owner's "about 0.08 s")
  var NAME_LEAD = 0.22; // s the name's own rise gets before the ranks start, when there was no intro

  function heroEntrance(hero, nameShown, lattice) {
    var name = hero.querySelector("[data-hero-name]");
    var lines = name ? all(name, ".hero__line") : [];
    var parts = all(hero, "[data-hero-rank]").sort(function (a, b) {
      return Number(a.getAttribute("data-hero-rank")) - Number(b.getAttribute("data-hero-rank"));
    });
    var morph = hero.querySelector('[data-kit~="morph-text"]');
    var instant = Site.env.static || !M;

    function startMorph() {
      var c = kit(morph, "morph-text");
      if (c && c.play) c.play();
    }

    function play(el) {
      var kits = " " + (el.getAttribute("data-kit") || "") + " ";
      if (kits.indexOf(" split ") > -1) {
        var s = kit(el, "split");
        var done = s && s.play ? s.play() : null;
        if (morph && el.contains(morph)) Promise.resolve(done).then(startMorph, startMorph);
      }
      if (kits.indexOf(" reveal ") > -1) {
        var r = kit(el, "reveal");
        if (r && r.play) r.play();
      }
      if (el.classList.contains("hero__base")) {
        el.classList.add("is-on");
        all(el, '[data-kit~="sliding-number"]').forEach(function (n, i) {
          var c = kit(n, "sliding-number");
          if (!c) return;
          if (instant) {
            if (c.set) c.set(Number(n.getAttribute("data-value")), { instant: true });
          } else
            setTimeout(function () {
              if (c.play) c.play();
            }, i * RANK * 1000);
        });
      }
    }

    if (instant) {
      if (name) name.classList.add("is-on");
      parts.forEach(play);
      if (lattice) lattice.reveal();
      return;
    }

    // the name: its characters rise out of their lines (unless the intro has just placed it)
    var lead = 0;
    if (name && !nameShown) {
      lines.forEach(function (line, i) {
        line.setAttribute("data-kit", "split");
        line.setAttribute("data-split", "chars");
        line.setAttribute("data-effect", "rise");
        line.setAttribute("data-trigger", "manual");
        Site.init(line);
        var c = kit(line, "split");
        setTimeout(function () {
          if (c && c.play) c.play();
        }, 40 + i * 120);
      });
      lead = NAME_LEAD;
    }
    if (name) name.classList.add("is-on");
    if (lattice) lattice.reveal();

    var tempo = Site.tempo || 1;
    parts.forEach(function (el, i) {
      setTimeout(function () {
        play(el);
      }, (lead + (i + 1) * RANK) * 1000 * tempo);
    });
  }

  /* ================================================================ leaving
     While the first screen scrolls away its layers drift at their own speeds (CSS reads --hero-y and --hero-p), the
     header takes the name over, and the lattice leaves with a sweep of light. */
  function heroScroll(hero, lattice) {
    var name = hero.querySelector("[data-hero-name]");
    if (name && "IntersectionObserver" in window) {
      new IntersectionObserver(
        function (entries) {
          root.classList.toggle("hero-name-in-view", entries[entries.length - 1].isIntersecting);
        },
        { rootMargin: "-64px 0px 0px 0px" },
      ).observe(name);
    }
    var height = 1;
    var lastY = -1;
    function measure() {
      height = Math.max(1, hero.offsetHeight);
      lastY = -1;
      update();
    }
    var update = util.throttle(function () {
      var y = util.clamp(window.scrollY, 0, height);
      if (y === lastY) return;
      lastY = y;
      var p = y / height;
      if (!Site.env.reduce) hero.style.setProperty("--hero-y", y.toFixed(1) + "px");
      hero.style.setProperty("--hero-p", p.toFixed(4));
      if (lattice) lattice.scroll(p);
    });
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", util.debounce(measure, 120));
    measure();
  }

  /* ================================================================ lattice
     A drawing of lattice cryptography, without a word.
     - The points of one lattice, on a plane seen in perspective: near points larger and darker, far ones smaller and paler.
     - Two bases of that same lattice, a short nearly orthogonal one and a longer skewed one: the tiling of their
       fundamental cells (same area) shears from one to the other in elementary steps and back (basis reduction). The points
       never move; only the cells change. Shown as a patch of cell lines around the target, and the target's own cell.
     - The pointer is the target: its closest lattice point is ringed and joined to it by the short error vector.
     - A click sends a ring through the plane. Leaving the first screen, a sweep of light crosses the drawing and takes it.
     It draws only while something changes (pointer, ring, shear, wave, sweep) and sleeps otherwise. */
  var LAT = {
    tilt: 0.74, // rad, the plane's tilt away from the viewer
    focal: 0.95, // focal length, times the larger side of the viewport
    look: 0.045, // rad, how far the camera turns toward the pointer
    shear: 2600, // ms, one elementary shear of the basis
    rest: 2400, // ms between shears
    restLong: 5200, // ms at either end (the good basis, the bad one)
    reveal: 1800, // ms, the points spreading from the target on arrival
    waveSpeed: 0.42, // px/ms, a click's ring through the plane
    waveLife: 2600, // ms
    sweepFrom: 0.06, // fraction of the hero scrolled when the sweep of light sets off
    sweepTo: 0.82, // ... and when it has crossed (the lattice is gone)
  };
  // the basis walks from good to bad by these elementary steps (b2 += b1, b1 += b2, b2 += b1) and back
  // which vector takes the other at each step (1: b1 += b2, 2: b2 += b1): from (g1, g2) to (2 g1 + g2, g1 + g2), cells of the
  // same area but long and thin; a third step makes them so thin that the tiling reads as hatching
  var STEPS = [2, 1];

  function bezier(p) {
    // a cubic-bezier easing (the tokens' curves) as a function of t
    var cx = 3 * p[0];
    var bx = 3 * (p[2] - p[0]) - cx;
    var ax = 1 - cx - bx;
    var cy = 3 * p[1];
    var by = 3 * (p[3] - p[1]) - cy;
    var ay = 1 - cy - by;
    return function (t) {
      if (t <= 0) return 0;
      if (t >= 1) return 1;
      var x = t;
      for (var i = 0; i < 6; i++) {
        var fx = ((ax * x + bx) * x + cx) * x - t;
        var d = (3 * ax * x + 2 * bx) * x + cx;
        if (Math.abs(fx) < 1e-5 || !d) break;
        x -= fx / d;
      }
      return ((ay * x + by) * x + cy) * x;
    };
  }

  function rgb(str) {
    var s = (str || "").trim();
    var m;
    if ((m = /^#([0-9a-f]{6})$/i.exec(s))) {
      var n = parseInt(m[1], 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
    }
    if ((m = /^#([0-9a-f]{3})$/i.exec(s))) {
      return [parseInt(m[1][0] + m[1][0], 16), parseInt(m[1][1] + m[1][1], 16), parseInt(m[1][2] + m[1][2], 16), 1];
    }
    if ((m = /rgba?\(([^)]+)\)/.exec(s))) {
      var p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
      return [p[0], p[1], p[2], p[3] == null ? 1 : p[3]];
    }
    return [128, 128, 128, 1];
  }
  function css(c, a) {
    return "rgba(" + Math.round(c[0]) + "," + Math.round(c[1]) + "," + Math.round(c[2]) + "," + (a == null ? c[3] : a) + ")";
  }
  function mix(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, 1];
  }

  /** A critically-or-under-damped spring on one number, stepped by the frame's time. Settings from a token. */
  function Spring(token, value) {
    this.k = token.stiffness;
    this.c = token.damping;
    this.m = token.mass || 1;
    this.x = value;
    this.v = 0;
    this.to = value;
  }
  Spring.prototype.step = function (dt) {
    var n = Math.max(1, Math.ceil(dt / 0.008));
    var h = dt / n;
    for (var i = 0; i < n; i++) {
      var a = (-this.k * (this.x - this.to) - this.c * this.v) / this.m;
      this.v += a * h;
      this.x += this.v * h;
    }
  };
  Spring.prototype.idle = function (eps) {
    return Math.abs(this.x - this.to) < eps && Math.abs(this.v) < eps * 8;
  };
  Spring.prototype.jump = function (v) {
    this.x = this.to = v;
    this.v = 0;
  };

  function initLattice(canvas, hero) {
    var ctx = canvas.getContext("2d");
    if (!ctx) return { reveal: function () {}, scroll: function () {} };
    var inOut = bezier(T.ease.inOut);
    var soft = bezier(T.ease.soft);

    var w = 0;
    var h = 0;
    var dpr = 1;
    var col = {};
    var quiet = []; // boxes of the hero's text, in page coordinates: the drawing stays quiet there
    var cam = { f: 1, cx: 0, cy: 0, tilt: LAT.tilt, yaw: 0 };
    var look = { yaw: new Spring(Site.t("spring.follow"), 0), tilt: new Spring(Site.t("spring.follow"), 0) };

    // the lattice: a short, nearly orthogonal basis g1, g2 (in plane units = px at unit depth)
    var s0 = 46;
    var g1 = [0, 0];
    var g2 = [0, 0];
    var home = [0, 0]; // where the target rests when the pointer is away (plane coordinates)

    // state
    var pointer = { x: 0, y: 0, on: false, moved: 0 };
    var target = { x: new Spring(Site.t("spring.glide"), 0), y: new Spring(Site.t("spring.glide"), 0) };
    var ring = { x: new Spring(Site.t("spring.pop"), 0), y: new Spring(Site.t("spring.pop"), 0), set: false };
    var waves = [];
    var shownAt = null;
    var shown = 0;
    var exitP = 0; // the hero scrolled, 0..1
    var gone = false;
    var revealed = false;

    // the basis walk: integer coefficients of b1, b2 over g1, g2; `stage` steps taken (0..3); a shear in progress
    var basis = { b1: [1, 0], b2: [0, 1], stage: 0, dir: 1, shear: null, timer: null, anchor: [0, 0] };

    /* ---------------------------------------------------------- setup */
    function readColors() {
      col.ink = rgb(cssVar("--ink", "#2b2d33"));
      col.accent = rgb(cssVar("--accent", "#2f5d54"));
      col.paper = rgb(cssVar("--paper", "#f6f4ef"));
      col.dark = Site.theme() === "dark";
    }

    function measureQuiet() {
      var y = window.scrollY;
      // the ink itself, not the blocks (a paragraph or a row of buttons is as wide as the page)
      var boxes = [];
      all(hero, ".hero__line, .hero__role, .hero__statement").forEach(function (el) {
        var range = document.createRange();
        range.selectNodeContents(el);
        boxes.push(range.getBoundingClientRect());
      });
      all(hero, ".hero__actions > *, .hero__figures > *").forEach(function (el) {
        boxes.push(el.getBoundingClientRect());
      });
      quiet = boxes
        .filter(function (r) {
          return r.width > 0 && r.height > 0;
        })
        .map(function (r) {
          return { l: r.left, r: r.right, t: r.top + y, b: r.bottom + y };
        });
    }

    function resize() {
      // the canvas's own box (the viewport less any scrollbar, which can come and go without a window resize)
      var box = canvas.getBoundingClientRect();
      w = box.width || root.clientWidth || window.innerWidth;
      h = box.height || window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var narrow = w < 760;
      cam.f = LAT.focal * Math.max(w, h);
      cam.cx = narrow ? w * 0.5 : w * 0.7;
      cam.cy = narrow ? h - 84 : h * 0.48;
      s0 = util.clamp(Math.min(w, h * 1.7) / 25, 30, 58);
      // g1 a little off the horizontal, g2 nearly orthogonal to it and a little longer: a "good" basis
      var a = -0.2;
      g1 = [s0 * Math.cos(a), s0 * Math.sin(a)];
      g2 = [s0 * 1.06 * Math.cos(a + 1.66), s0 * 1.06 * Math.sin(a + 1.66)];
      var hp = unproject(narrow ? w * 0.5 : w * 0.73, narrow ? h - 70 : h * 0.44);
      home = hp || [0, 0];
      if (!pointer.on) {
        target.x.jump(home[0]);
        target.y.jump(home[1]);
      }
      measureQuiet();
      wake(true);
    }

    /* ------------------------------------------------- the camera: plane <-> screen */
    function setCamera() {
      cam.tilt = LAT.tilt + look.tilt.x;
      cam.yaw = look.yaw.x;
      cam.st = Math.sin(cam.tilt);
      cam.ct = Math.cos(cam.tilt);
      cam.sy = Math.sin(cam.yaw);
      cam.cy2 = Math.cos(cam.yaw);
    }
    // plane (X, Y) -> screen [x, y, scale]
    function project(X, Y, out) {
      var x = X * cam.cy2;
      var z0 = X * cam.sy;
      var y = Y * cam.ct - z0 * cam.st;
      var z = Y * cam.st + z0 * cam.ct;
      var depth = cam.f + z;
      if (depth < cam.f * 0.15) depth = cam.f * 0.15;
      var k = cam.f / depth;
      out[0] = cam.cx + x * k;
      out[1] = cam.cy - y * k;
      out[2] = k;
      return out;
    }
    // screen (x, y) -> plane [X, Y] (null above the horizon)
    function unproject(sx, sy) {
      setCamera();
      var a = (sx - cam.cx) / cam.f;
      var b = (cam.cy - sy) / cam.f;
      // a (f + z) = X cy2 ; b (f + z) = Y ct - X sy st ; z = Y st + X sy ct
      var a11 = cam.cy2 - a * cam.sy * cam.ct;
      var a12 = -a * cam.st;
      var a21 = -cam.sy * cam.st - b * cam.sy * cam.ct;
      var a22 = cam.ct - b * cam.st;
      var det = a11 * a22 - a12 * a21;
      if (Math.abs(det) < 1e-6) return null;
      var r1 = a * cam.f;
      var r2 = b * cam.f;
      var X = (r1 * a22 - a12 * r2) / det;
      var Y = (a11 * r2 - a21 * r1) / det;
      if (cam.f + Y * cam.st + X * cam.sy * cam.ct <= 0) return null;
      return [X, Y];
    }

    /* ------------------------------------------------------- the lattice */
    function point(i, j, out) {
      out[0] = i * g1[0] + j * g2[0];
      out[1] = i * g1[1] + j * g2[1];
      return out;
    }
    // the closest lattice point to (X, Y): round in the good basis, then look at the neighbours
    function closest(X, Y) {
      var det = g1[0] * g2[1] - g1[1] * g2[0];
      var u = (X * g2[1] - Y * g2[0]) / det;
      var v = (g1[0] * Y - g1[1] * X) / det;
      var best = null;
      var bd = Infinity;
      for (var di = -1; di <= 1; di++)
        for (var dj = -1; dj <= 1; dj++) {
          var i = Math.round(u) + di;
          var j = Math.round(v) + dj;
          var px = i * g1[0] + j * g2[0];
          var py = i * g1[1] + j * g2[1];
          var d = (px - X) * (px - X) + (py - Y) * (py - Y);
          if (d < bd) {
            bd = d;
            best = [i, j, px, py];
          }
        }
      return best;
    }
    // the current basis vectors in plane units (with the shear in progress)
    function currentBasis(now) {
      var c1 = basis.b1.slice();
      var c2 = basis.b2.slice();
      var sh = basis.shear;
      if (sh) {
        var t = inOut(util.clamp((now - sh.start) / LAT.shear, 0, 1));
        var mover = sh.which === 1 ? c1 : c2;
        var other = sh.which === 1 ? c2 : c1;
        mover[0] += sh.sign * t * other[0];
        mover[1] += sh.sign * t * other[1];
      }
      return [
        [c1[0] * g1[0] + c1[1] * g2[0], c1[0] * g1[1] + c1[1] * g2[1]],
        [c2[0] * g1[0] + c2[1] * g2[0], c2[0] * g1[1] + c2[1] * g2[1]],
      ];
    }

    function scheduleShear(delay) {
      clearTimeout(basis.timer);
      basis.timer = null;
      if (Site.env.reduce || gone || document.hidden) return;
      basis.timer = setTimeout(startShear, delay);
    }
    function startShear() {
      basis.timer = null;
      if (gone || document.hidden || Site.env.reduce) return;
      var k = basis.dir > 0 ? basis.stage : basis.stage - 1;
      var which = STEPS[k];
      // anchor the tiling at the lattice point nearest the target, so the patch shears about where one looks
      var c = closest(target.x.x, target.y.x);
      basis.anchor = [c[2], c[3]];
      basis.shear = { which: which, sign: basis.dir, start: performance.now() };
      wake(false);
    }
    function endShear() {
      var sh = basis.shear;
      var mover = sh.which === 1 ? basis.b1 : basis.b2;
      var other = sh.which === 1 ? basis.b2 : basis.b1;
      mover[0] += sh.sign * other[0];
      mover[1] += sh.sign * other[1];
      basis.shear = null;
      basis.stage += basis.dir;
      var atEnd = basis.stage === 0 || basis.stage === STEPS.length;
      if (atEnd) basis.dir = -basis.dir;
      scheduleShear(atEnd ? LAT.restLong : LAT.rest);
    }

    /* ------------------------------------------------------------ frames */
    var raf = null;
    var lastT = 0;
    // wake(true): draw this one picture now; wake(false): run frames until nothing moves any more
    function wake(sync) {
      if (gone) return;
      if (sync === true && !raf) {
        draw(performance.now());
        return;
      }
      if (raf === null) {
        lastT = 0;
        raf = requestAnimationFrame(frame);
      }
    }
    function frame(now) {
      raf = null;
      var dt = lastT ? Math.min((now - lastT) / 1000, 0.05) : 1 / 60;
      lastT = now;
      var moving = false;

      if (basis.shear && now - basis.shear.start >= LAT.shear) endShear();
      if (basis.shear) moving = true;

      if (!Site.env.reduce) {
        look.yaw.step(dt);
        look.tilt.step(dt);
        if (!look.yaw.idle(0.0004) || !look.tilt.idle(0.0004)) moving = true;
      }

      // the target: on the pointer, or gliding home
      if (pointer.on) {
        setCamera();
        var pp = unproject(pointer.x, pointer.y);
        if (pp) {
          target.x.jump(pp[0]);
          target.y.jump(pp[1]);
        }
      } else {
        target.x.step(dt);
        target.y.step(dt);
        if (!target.x.idle(0.3) || !target.y.idle(0.3)) moving = true;
      }

      // the ring springs from lattice point to lattice point
      var c = closest(target.x.x, target.y.x);
      if (!ring.set || Site.env.reduce) {
        ring.x.jump(c[2]);
        ring.y.jump(c[3]);
        ring.set = true;
      } else {
        ring.x.to = c[2];
        ring.y.to = c[3];
        ring.x.step(dt);
        ring.y.step(dt);
        if (!ring.x.idle(0.05) || !ring.y.idle(0.05)) moving = true;
      }

      if (shownAt !== null && shown < 1) {
        shown = util.clamp((now - shownAt) / (LAT.reveal * (Site.tempo || 1)), 0, 1);
        moving = true;
      }
      if (waves.length) {
        waves = waves.filter(function (wv) {
          return now - wv.t < LAT.waveLife;
        });
        if (waves.length) moving = true;
      }

      draw(now);
      if (moving && !gone) raf = requestAnimationFrame(frame);
    }

    /* ------------------------------------------------------------- draw */
    var P = [0, 0, 1];
    var Q = [0, 0, 1];
    var W = [0, 0];
    var BUCKETS = 16; // dots are batched by opacity: bucket b holds alpha (b / BUCKETS)^2, fine steps where it is faint

    // how much of the drawing may show at a screen point: quiet over the hero's text, lighter toward the left
    function calm(x, y, scroll) {
      var d = Infinity;
      for (var i = 0; i < quiet.length; i++) {
        var q = quiet[i];
        var t = q.t - scroll;
        var b = q.b - scroll;
        var dx = x < q.l ? q.l - x : x > q.r ? x - q.r : 0;
        var dy = y < t ? t - y : y > b ? y - b : 0;
        var dd = Math.sqrt(dx * dx + dy * dy);
        if (dd < d) d = dd;
      }
      var near = util.smooth(util.clamp((d - 10) / 120, 0, 1));
      // on a wide screen the drawing leans right, away from the words; on a narrow one it is a band along the bottom
      var side = w < 760 ? util.smooth(util.clamp((y / h - 0.5) / 0.3, 0, 1)) : 0.4 + 0.6 * util.smooth(util.clamp((x / w - 0.12) / 0.5, 0, 1));
      return (0.035 + 0.965 * near) * side;
    }

    // a point's offset from the click rings passing through it (plane units)
    function displace(X, Y, now, out) {
      var px = 0;
      var py = 0;
      for (var i = 0; i < waves.length; i++) {
        var wv = waves[i];
        var age = now - wv.t;
        var dx = X - wv.x;
        var dy = Y - wv.y;
        var d = Math.sqrt(dx * dx + dy * dy) || 1;
        var ringAt = d - age * LAT.waveSpeed;
        var amp = 10 * Math.exp(-age / 700) * Math.exp(-(ringAt * ringAt) / 1600);
        px += (dx / d) * amp;
        py += (dy / d) * amp;
      }
      out[0] = X + px;
      out[1] = Y + py;
      return out;
    }

    function draw(now) {
      if (!w || !h || gone) return;
      setCamera();
      ctx.clearRect(0, 0, w, h);
      var scroll = window.scrollY;
      var reduce = Site.env.reduce;

      // the sweep of light that takes the drawing as the next block arrives: a front crossing from lower left to upper right
      var q = util.clamp((exitP - LAT.sweepFrom) / (LAT.sweepTo - LAT.sweepFrom), 0, 1);
      var BAND = 0.075;
      var front = -BAND * 2 + q * (1 + BAND * 4);
      function sweepAt(x, y) {
        // returns [visibility, light] for a screen point
        if (q <= 0) return SW0;
        if (reduce) {
          SW[0] = 1 - q;
          SW[1] = 0;
          return SW;
        }
        var d = 0.8 * (x / w) + 0.2 * (1 - y / h);
        var rel = (d - front) / BAND;
        SW[0] = rel >= 0 ? 1 : util.smooth(util.clamp(1 + rel / 1.4, 0, 1));
        SW[1] = Math.exp(-rel * rel * 2.2) * (1 - q * 0.35);
        return SW;
      }
      var SW = [1, 0];
      var SW0 = [1, 0];

      var appearAll = util.smooth(util.clamp(shown * 2 - 0.55, 0, 1)); // lines and marks come in after the points
      var tx = target.x.x;
      var ty = target.y.x;
      project(tx, ty, Q);
      var tsx = pointer.on ? pointer.x : Q[0];
      var tsy = pointer.on ? pointer.y : Q[1];
      var tCalm = Math.max(0.18, calm(tsx, tsy, scroll));
      var tSweep = sweepAt(tsx, tsy);
      var marks = appearAll * tCalm * tSweep[0] * (1 - q);

      /* 1. the patch of cell lines around the target, in the current basis (shearing while a step plays) */
      var B = currentBasis(now);
      var b1 = B[0];
      var b2 = B[1];
      var det = b1[0] * b2[1] - b1[1] * b2[0];
      var o = basis.anchor;
      var sigma = s0 * 2.5;
      if (marks > 0.01 && Math.abs(det) > 1e-6) {
        var u = ((tx - o[0]) * b2[1] - (ty - o[1]) * b2[0]) / det;
        var v = (b1[0] * (ty - o[1]) - b1[1] * (tx - o[0])) / det;
        // how many cells reach 3 sigma: the rows of the inverse basis
        var rm = Math.ceil(3 * sigma * Math.hypot(b2[1], b2[0]) / Math.abs(det)) + 1;
        var rn = Math.ceil(3 * sigma * Math.hypot(b1[1], b1[0]) / Math.abs(det)) + 1;
        rm = Math.min(rm, 14);
        rn = Math.min(rn, 14);
        var fu = Math.floor(u);
        var fv = Math.floor(v);
        // each edge in short pieces, each as strong as the patch is there (a round patch on the plane: an ellipse on
        // screen) and as the calm field and the sweep allow; batched by opacity like the dots
        var lines = [];
        for (var lb = 0; lb <= BUCKETS; lb++) lines.push(null);
        var piece = s0 * 0.5;
        var sg2 = 2 * sigma * sigma;
        var la = 0.34 * appearAll * (1 - q);
        var edge = function (ax, ay, bx, by) {
          var len = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay));
          var n = Math.max(1, Math.ceil(len / piece));
          projectMoved(ax, ay, S0, now);
          for (var k = 1; k <= n; k++) {
            var px = ax + ((bx - ax) * k) / n;
            var py = ay + ((by - ay) * k) / n;
            projectMoved(px, py, S1, now);
            var mx = px - ((bx - ax) * 0.5) / n;
            var my = py - ((by - ay) * 0.5) / n;
            var g = Math.exp(-((mx - tx) * (mx - tx) + (my - ty) * (my - ty)) / sg2);
            if (g > 0.03) {
              var sx = (S0[0] + S1[0]) / 2;
              var sy = (S0[1] + S1[1]) / 2;
              var a = la * g * calm(sx, sy, scroll) * sweepAt(sx, sy)[0];
              if (a > 0.008) {
                var bk = Math.max(1, Math.min(BUCKETS, Math.round(Math.sqrt(a) * BUCKETS)));
                var path = lines[bk] || (lines[bk] = new Path2D());
                path.moveTo(S0[0], S0[1]);
                path.lineTo(S1[0], S1[1]);
              }
            }
            S0[0] = S1[0];
            S0[1] = S1[1];
          }
        };
        for (var m = fu - rm; m <= fu + rm + 1; m++)
          for (var n2 = fv - rn; n2 <= fv + rn; n2++) {
            // the edge along b2 from o + m b1 + n b2
            var ex = o[0] + m * b1[0] + n2 * b2[0];
            var ey = o[1] + m * b1[1] + n2 * b2[1];
            edge(ex, ey, ex + b2[0], ey + b2[1]);
          }
        for (var n3 = fv - rn; n3 <= fv + rn + 1; n3++)
          for (var m2 = fu - rm; m2 <= fu + rm; m2++) {
            var fx = o[0] + m2 * b1[0] + n3 * b2[0];
            var fy = o[1] + m2 * b1[1] + n3 * b2[1];
            edge(fx, fy, fx + b1[0], fy + b1[1]);
          }
        ctx.lineWidth = 1;
        ctx.strokeStyle = css(col.ink, 1);
        for (var lk = 1; lk <= BUCKETS; lk++) {
          if (!lines[lk]) continue;
          ctx.globalAlpha = (lk / BUCKETS) * (lk / BUCKETS);
          ctx.stroke(lines[lk]);
        }
        ctx.globalAlpha = 1;

        /* 2. the target's own cell: a faint wash, its two basis edges a little stronger */
        var ox = o[0] + fu * b1[0] + fv * b2[0];
        var oy = o[1] + fu * b1[1] + fv * b2[1];
        var c0 = projectMoved(ox, oy, [0, 0, 1], now);
        var c1 = projectMoved(ox + b1[0], oy + b1[1], [0, 0, 1], now);
        var c2 = projectMoved(ox + b1[0] + b2[0], oy + b1[1] + b2[1], [0, 0, 1], now);
        var c3 = projectMoved(ox + b2[0], oy + b2[1], [0, 0, 1], now);
        ctx.beginPath();
        ctx.moveTo(c0[0], c0[1]);
        ctx.lineTo(c1[0], c1[1]);
        ctx.lineTo(c2[0], c2[1]);
        ctx.lineTo(c3[0], c3[1]);
        ctx.closePath();
        ctx.fillStyle = css(col.accent, (col.dark ? 0.09 : 0.065) * marks);
        ctx.fill();
        ctx.strokeStyle = css(col.accent, 0.55 * marks);
        ctx.beginPath();
        ctx.moveTo(c1[0], c1[1]);
        ctx.lineTo(c0[0], c0[1]);
        ctx.lineTo(c3[0], c3[1]);
        ctx.stroke();
      }

      /* 3. the points: size and tone from depth, closeness to the target, the calm field and the sweep */
      var corners = [unproject(0, 0), unproject(w, 0), unproject(0, h), unproject(w, h)];
      var di = g1[0] * g2[1] - g1[1] * g2[0];
      var imin = Infinity;
      var imax = -Infinity;
      var jmin = Infinity;
      var jmax = -Infinity;
      for (var ci = 0; ci < 4; ci++) {
        var cc = corners[ci];
        if (!cc) {
          cc = [tx, ty + 40 * s0];
        }
        var cu = (cc[0] * g2[1] - cc[1] * g2[0]) / di;
        var cv = (g1[0] * cc[1] - g1[1] * cc[0]) / di;
        imin = Math.min(imin, cu);
        imax = Math.max(imax, cu);
        jmin = Math.min(jmin, cv);
        jmax = Math.max(jmax, cv);
      }
      imin = Math.floor(imin) - 2;
      jmin = Math.floor(jmin) - 2;
      imax = Math.ceil(imax) + 2;
      jmax = Math.ceil(jmax) + 2;

      var ink = [];
      var lit = [];
      for (var bk = 0; bk <= BUCKETS; bk++) {
        ink.push(null);
        lit.push(null);
      }
      var reach = Math.max(w, h) * 0.9;
      var sig2 = 2 * (s0 * 1.9) * (s0 * 1.9);
      for (var i = imin; i <= imax; i++) {
        for (var j = jmin; j <= jmax; j++) {
          point(i, j, W);
          var nearD = (W[0] - tx) * (W[0] - tx) + (W[1] - ty) * (W[1] - ty);
          if (waves.length) displace(W[0], W[1], now, W);
          project(W[0], W[1], P);
          var x = P[0];
          var y = P[1];
          if (x < -8 || x > w + 8 || y < -8 || y > h + 8) continue;
          var appear = 1;
          if (shown < 1) {
            var far = Math.sqrt((x - tsx) * (x - tsx) + (y - tsy) * (y - tsy)) / reach;
            appear = util.smooth(util.clamp(shown * 2.1 - far * 1.5, 0, 1));
            if (appear <= 0) continue;
          }
          var sw = sweepAt(x, y);
          if (sw[0] <= 0.01 && sw[1] < 0.02) continue;
          var k = P[2];
          var near = Math.exp(-nearD / sig2) * appearAll;
          var depthTone = util.clamp((k - 0.55) / 0.9, 0.12, 1);
          var c = calm(x, y, scroll);
          var alpha = (0.2 + 0.42 * depthTone + 0.38 * near) * c * appear * sw[0];
          var r = (0.75 + 0.75 * k) * (1 + 0.85 * near);
          var light = sw[1] * Math.max(c, 0.25) * appear;
          if (light > 0.04) {
            var la2 = Math.min(0.8, alpha + light * 0.6);
            addDot(lit, la2, x, y, r * (1 + 0.5 * light));
          } else if (alpha > 0.012) addDot(ink, alpha, x, y, r);
        }
      }
      fillBuckets(ink, col.ink);
      fillBuckets(lit, col.dark ? mix(col.accent, col.ink, 0.35) : col.accent);

      /* 4. the error vector from the closest point to the target, the closest point ringed */
      if (marks > 0.01) {
        projectMoved(ring.x.x, ring.y.x, P, now);
        var e = [0, 0, 1];
        var R = 7.5;
        project(ring.x.x + R / P[2], ring.y.x, e);
        var rx = Math.abs(e[0] - P[0]);
        project(ring.x.x, ring.y.x + R / P[2], e);
        var ry = Math.abs(e[1] - P[1]);
        var rr = Math.max(rx, ry);
        ctx.globalAlpha = marks;
        ctx.strokeStyle = css(col.accent, 1);
        ctx.fillStyle = css(col.accent, 1);
        ctx.lineWidth = 1.25;
        var vx = tsx - P[0];
        var vy = tsy - P[1];
        var vl = Math.sqrt(vx * vx + vy * vy);
        if (vl > rr + 2) {
          ctx.beginPath();
          ctx.moveTo(P[0] + (vx / vl) * rr, P[1] + (vy / vl) * rr);
          ctx.lineTo(tsx, tsy);
          ctx.stroke();
        }
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(P[0], P[1], rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(P[0], P[1], 2.4 * Math.min(1.4, P[2]), 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(tsx, tsy, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    var S0 = [0, 0, 1];
    var S1 = [0, 0, 1];
    var MV = [0, 0];
    // a plane point as the click rings have moved it, on screen (the lines and the marks ripple with the dots)
    function projectMoved(X, Y, out, now) {
      if (!waves.length) return project(X, Y, out);
      displace(X, Y, now, MV);
      return project(MV[0], MV[1], out);
    }
    function addDot(buckets, alpha, x, y, r) {
      var b = Math.max(1, Math.min(BUCKETS, Math.round(Math.sqrt(alpha) * BUCKETS)));
      var p = buckets[b] || (buckets[b] = new Path2D());
      p.moveTo(x + r, y);
      p.arc(x, y, r, 0, Math.PI * 2);
    }
    function fillBuckets(buckets, color) {
      ctx.fillStyle = css(color, 1);
      for (var b = 1; b <= BUCKETS; b++) {
        if (!buckets[b]) continue;
        ctx.globalAlpha = (b / BUCKETS) * (b / BUCKETS);
        ctx.fill(buckets[b]);
      }
      ctx.globalAlpha = 1;
    }

    /* ------------------------------------------------------------ input */
    function onMove(e) {
      if (e.pointerType === "touch" || !Site.env.hover || Site.env.static || gone || exitP > 0.5) return;
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.on = true;
      if (!Site.env.reduce) {
        look.yaw.to = (e.clientX / w - 0.5) * 2 * LAT.look;
        look.tilt.to = (e.clientY / h - 0.5) * LAT.look * 0.6;
      }
      wake(false);
    }
    function onLeave() {
      if (!pointer.on) return;
      pointer.on = false;
      // the target glides home from where it was
      target.x.to = home[0];
      target.y.to = home[1];
      if (Site.env.reduce) {
        target.x.jump(home[0]);
        target.y.jump(home[1]);
      }
      look.yaw.to = 0;
      look.tilt.to = 0;
      wake(false);
    }
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    window.addEventListener("blur", onLeave);
    hero.addEventListener("pointerdown", function (e) {
      if (Site.env.reduce || gone || e.button !== 0) return;
      if (e.target.closest && e.target.closest('a, button, input, [data-kit~="morph-text"]')) return;
      setCamera();
      var pp = unproject(e.clientX, e.clientY);
      if (!pp) return;
      waves.push({ x: pp[0], y: pp[1], t: performance.now() });
      if (waves.length > 3) waves.shift();
      wake(false);
    });

    /* ------------------------------------------------------- life cycle */
    function setGone(on) {
      if (on === gone) return;
      gone = on;
      canvas.classList.toggle("is-gone", on);
      if (on) {
        if (raf) cancelAnimationFrame(raf);
        raf = null;
        clearTimeout(basis.timer);
        basis.timer = null;
        ctx.clearRect(0, 0, w, h);
      } else {
        if (basis.shear) basis.shear.start = performance.now() - LAT.shear * 0.999; // finish the interrupted step at once
        if (revealed) scheduleShear(LAT.rest);
        wake(true);
        wake(false);
      }
    }

    readColors();
    resize();
    window.addEventListener("resize", util.debounce(resize, 100));
    if ("ResizeObserver" in window) {
      var seen = { w: 0, h: 0 };
      new ResizeObserver(function (entries) {
        var r = entries[entries.length - 1].contentRect;
        if (Math.abs(r.width - seen.w) < 0.5 && Math.abs(r.height - seen.h) < 0.5) return;
        seen = { w: r.width, h: r.height };
        if (Math.abs(r.width - w) > 0.5 || Math.abs(r.height - h) > 0.5) resize();
      }).observe(canvas);
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measureQuiet);
    Site.on("theme", function () {
      readColors();
      wake(true);
    });
    Site.on("reduce", function () {
      if (Site.env.reduce) {
        clearTimeout(basis.timer);
        basis.shear = null;
      } else if (revealed) scheduleShear(LAT.rest);
      wake(true);
    });
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        clearTimeout(basis.timer);
        basis.timer = null;
      } else if (revealed && !basis.shear && !basis.timer) scheduleShear(LAT.rest);
    });

    return {
      reveal: function () {
        if (revealed) return;
        revealed = true;
        canvas.classList.add("is-on");
        measureQuiet();
        if (Site.env.reduce) {
          shown = 1;
          wake(true);
        } else {
          shownAt = performance.now();
          wake(false);
          scheduleShear(LAT.restLong);
        }
      },
      scroll: function (p) {
        exitP = p;
        var q = (p - LAT.sweepFrom) / (LAT.sweepTo - LAT.sweepFrom);
        setGone(q >= 1);
        if (gone) return;
        if (p > 0.5 && pointer.on) onLeave();
        if (revealed) wake(true);
      },
      refresh: measureQuiet,
    };
  }

  Site.replayIntro = function () {
    var hero = document.querySelector("[data-hero]");
    var name = hero && hero.querySelector("[data-hero-name]");
    if (!name || !M) return null;
    name.classList.remove("is-on");
    root.classList.add("is-intro");
    return playIntro(name, all(name, ".hero__line"));
  };

  /* ================================================================== start */
  Site.ready(function () {
    var hero = document.querySelector("[data-hero]");
    if (!hero) return;
    var canvas = document.querySelector("[data-lattice]");
    var lattice = null;
    try {
      lattice = canvas ? initLattice(canvas, hero) : null;
    } catch (e) {
      lattice = null;
      if (Site.errors) Site.errors.push({ where: "home-hero lattice", message: String(e && e.message), stack: String((e && e.stack) || "").slice(0, 600) });
    }
    var begin = function (nameShown) {
      try {
        heroEntrance(hero, nameShown, lattice);
      } catch (e) {
        // never leave the hero hidden
        all(hero, "[data-hero-name], .hero__base").forEach(function (el) {
          el.classList.add("is-on");
        });
        all(hero, "[data-hero-rank]").forEach(function (el) {
          var s = kit(el, "split") || kit(el, "reveal");
          if (s && s.play) s.play();
        });
        if (Site.errors) Site.errors.push({ where: "home-hero entrance", message: String(e && e.message), stack: "" });
      }
    };
    intro(hero).then(begin, function () {
      begin(false);
    });
    heroScroll(hero, lattice);
  });
})();
