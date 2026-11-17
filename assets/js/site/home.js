/*
 * Home page.
 *   1. intro: on the first visit of a session the name draws itself in the middle of the screen, then glides to its place
 *   2. hero: the entrance of the other hero parts, the lattice figure, what the hero does while it scrolls away
 *   3. research: the area cards circle a small 3D lattice and settle into a grid as the page scrolls (after the
 *      "every primitive, alive" piece on animate-ui.com); a plain grid on small screens and under reduced motion
 *   4. results: the figure of the result being shown rolls to its value
 * Everything here is an enhancement: without this file the page is complete and static.
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

  /* =================================================================== hero */
  function heroEntrance(hero, nameShown) {
    var name = hero.querySelector("[data-hero-name]");
    var lines = name ? all(name, ".hero__line") : [];
    var items = all(hero, "[data-hero-item]");
    var numbers = all(hero, '.hero__figures [data-kit~="sliding-number"]');

    function rollNumbers(instant) {
      numbers.forEach(function (el, i) {
        var c = kit(el, "sliding-number");
        var value = Number(el.getAttribute("data-value"));
        if (!c || !c.set) return;
        if (instant) {
          c.set(value, { instant: true });
          return;
        }
        c.set(0, { instant: true });
        setTimeout(function () {
          c.set(value);
        }, i * 120);
      });
    }

    if (Site.env.static || !M) {
      if (name) name.classList.add("is-on");
      items.forEach(function (el) {
        el.classList.add("is-on");
      });
      rollNumbers(true);
      return;
    }

    // the name: its characters rise out of their lines (unless the intro has just placed it)
    var lead = 0.05;
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
        }, 60 + i * 140);
      });
      name.classList.add("is-on");
      lead = 0.5;
    }

    // the other parts arrive one after the other: a fade through a light blur, a short rise
    items.forEach(function (el, i) {
      var delay = lead + i * T.stagger.items;
      el.style.opacity = "0";
      el.style.transform = "translateY(" + Site.m(T.shift.rise) + "px)";
      el.style.filter = "blur(" + T.blur.surface + "px)";
      el.classList.add("is-on");
      var a = M.animate(el, { opacity: 1, transform: "translateY(0px)", filter: "blur(0px)" }, Site.t("transition.arrive", { delay: delay }));
      var clear = function () {
        el.style.transform = "";
        el.style.filter = "";
      };
      (a.finished || a).then(clear, clear);

      var isKicker = el.getAttribute("data-hero-item") === "kicker";
      var isBase = el.classList.contains("hero__base");
      setTimeout(function () {
        if (isKicker) {
          all(el, '[data-kit~="scramble"]').forEach(function (s) {
            var c = kit(s, "scramble");
            if (c && c.play) c.play();
          });
        }
        if (isBase) rollNumbers(false);
      }, delay * 1000);
    });
  }

  /* While the hero scrolls away: its text drifts and fades a little, and the header takes the name over. */
  function heroScroll(hero) {
    var name = hero.querySelector("[data-hero-name]");
    if (name && "IntersectionObserver" in window) {
      new IntersectionObserver(
        function (entries) {
          root.classList.toggle("hero-name-in-view", entries[entries.length - 1].isIntersecting);
        },
        { rootMargin: "-64px 0px 0px 0px" },
      ).observe(name);
    }
    if (Site.env.reduce) return;
    var update = util.throttle(function () {
      var p = util.clamp(window.scrollY / Math.max(1, hero.offsetHeight), 0, 1);
      hero.style.setProperty("--hero-p", p.toFixed(4));
    });
    window.addEventListener("scroll", update, { passive: true });
    update();
  }

  /* ---------------------------------------------------------------- lattice
     A point lattice whose basis breathes slowly. The lattice point closest to the pointer is marked with the
     vector that joins them (the closest-vector problem that lattice-based cryptography rests on). The sheet is
     elastic: points lean away from the pointer, and a click sends a ring through them. */
  function initLattice(canvas, hero) {
    var ctx = canvas.getContext("2d");
    if (!ctx) return { reveal: function () {} };
    var out = hero.querySelector("[data-lattice-out]");
    var w = 0;
    var h = 0;
    var colors = {};
    var pointer = { x: 0, y: 0, active: false };
    var cur = { x: null, y: null };
    var waves = [];
    var shown = 0; // 0 -> 1 while the figure appears
    var showStart = null;
    var lastOut = "";
    var lastFrame = 0;

    function readColors() {
      colors.dot = cssVar("--ink", "#2b2d33");
      colors.line = cssVar("--accent", "#2f5d54");
      colors.text = cssVar("--muted", "#686b73");
      colors.axis = cssVar("--line-strong", "rgba(43,45,51,.24)");
    }
    function resize() {
      var r = canvas.getBoundingClientRect();
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width;
      h = r.height;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!loop.running) draw(performance.now());
    }
    function geometry(time) {
      var s = Math.max(34, Math.min(56, w / 25));
      var a = 0.1 * Math.sin(time * 0.00011);
      var k = 0.36 + 0.09 * Math.sin(time * 0.00007 + 1.3);
      var narrow = w < 760;
      return {
        s: s,
        narrow: narrow,
        b1: [s * Math.cos(a), s * Math.sin(a)],
        b2: [s * k, -s * (0.92 + 0.035 * Math.cos(time * 0.00009))],
        ox: narrow ? w * 0.5 : w * 0.73,
        oy: narrow ? h - 78 : h * 0.44,
      };
    }
    function arrow(x0, y0, x1, y1) {
      var ang = Math.atan2(y1 - y0, x1 - x0);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1 - 6 * Math.cos(ang - 0.42), y1 - 6 * Math.sin(ang - 0.42));
      ctx.lineTo(x1 - 6 * Math.cos(ang + 0.42), y1 - 6 * Math.sin(ang + 0.42));
      ctx.closePath();
      ctx.fill();
    }
    // how far a point at (x, y) is pushed: away from the pointer, and by each ring passing through
    function push(x, y, time, g, into) {
      var px = 0;
      var py = 0;
      var dx = x - cur.x;
      var dy = y - cur.y;
      var d = Math.sqrt(dx * dx + dy * dy) || 1;
      var hill = 7 * Math.exp(-(d * d) / (2 * g.s * g.s * 2.2));
      px += (dx / d) * hill;
      py += (dy / d) * hill;
      for (var i = 0; i < waves.length; i++) {
        var wv = waves[i];
        var age = time - wv.t;
        var wx = x - wv.x;
        var wy = y - wv.y;
        var wd = Math.sqrt(wx * wx + wy * wy) || 1;
        var ring = wd - age * 0.42;
        var amp = 11 * Math.exp(-age / 650) * Math.exp(-(ring * ring) / 1800);
        px += (wx / wd) * amp;
        py += (wy / wd) * amp;
      }
      into[0] = x + px;
      into[1] = y + py;
    }
    var tmp = [0, 0];

    function draw(time) {
      if (!w || !h) return;
      var g = geometry(time);
      var b1 = g.b1;
      var b2 = g.b2;
      var det = b1[0] * b2[1] - b1[1] * b2[0];
      if (showStart !== null) shown = util.clamp((time - showStart) / 1800, 0, 1);
      waves = waves.filter(function (wv) {
        return time - wv.t < 2600;
      });

      var tx;
      var ty;
      if (pointer.active) {
        tx = pointer.x;
        ty = pointer.y;
      } else {
        tx = g.ox + Math.cos(time * 0.00021) * g.s * 3.4;
        ty = g.oy + Math.sin(time * 0.00033) * g.s * (g.narrow ? 0.7 : 2.6);
      }
      if (cur.x === null) {
        cur.x = tx;
        cur.y = ty;
      }
      cur.x += (tx - cur.x) * 0.12;
      cur.y += (ty - cur.y) * 0.12;

      // lattice coordinates of the target, then the nearest point among its neighbours
      var u = ((cur.x - g.ox) * b2[1] - (cur.y - g.oy) * b2[0]) / det;
      var v = (b1[0] * (cur.y - g.oy) - b1[1] * (cur.x - g.ox)) / det;
      var best = null;
      var bestD = Infinity;
      for (var di = -2; di <= 2; di++) {
        for (var dj = -2; dj <= 2; dj++) {
          var ci = Math.round(u) + di;
          var cj = Math.round(v) + dj;
          var cx = g.ox + ci * b1[0] + cj * b2[0];
          var cy = g.oy + ci * b1[1] + cj * b2[1];
          var cd = (cx - cur.x) * (cx - cur.x) + (cy - cur.y) * (cy - cur.y);
          if (cd < bestD) {
            bestD = cd;
            best = { i: ci, j: cj, x: cx, y: cy };
          }
        }
      }

      ctx.clearRect(0, 0, w, h);
      var span = Math.ceil((w + h) / g.s) + 4;
      var sigma = g.s * 2.3;
      var reach = Math.sqrt(w * w + h * h);
      var fade = util.smooth(util.clamp(shown * 2 - 0.6, 0, 1));
      function nearness(x, y) {
        return Math.exp(-((x - cur.x) * (x - cur.x) + (y - cur.y) * (y - cur.y)) / (2 * sigma * sigma));
      }

      // around the target the lattice shows its lines: a patch of the grid, fading with distance
      if (fade > 0) {
        var ru = Math.round(u);
        var rv = Math.round(v);
        ctx.strokeStyle = colors.dot;
        ctx.lineWidth = 1;
        for (var li = ru - 7; li <= ru + 7; li++) {
          for (var lj = rv - 7; lj <= rv + 7; lj++) {
            var lx = g.ox + li * b1[0] + lj * b2[0];
            var ly = g.oy + li * b1[1] + lj * b2[1];
            var n0 = nearness(lx, ly);
            if (n0 < 0.03) continue;
            push(lx, ly, time, g, tmp);
            var ax = tmp[0];
            var ay = tmp[1];
            for (var side = 0; side < 2; side++) {
              var nx = lx + (side ? b2[0] : b1[0]);
              var ny = ly + (side ? b2[1] : b1[1]);
              var n1 = Math.min(n0, nearness(nx, ny));
              if (n1 < 0.03) continue;
              push(nx, ny, time, g, tmp);
              ctx.globalAlpha = 0.2 * n1 * fade;
              ctx.beginPath();
              ctx.moveTo(ax, ay);
              ctx.lineTo(tmp[0], tmp[1]);
              ctx.stroke();
            }
          }
        }
      }

      ctx.fillStyle = colors.dot;
      for (var i = -span; i <= span; i++) {
        for (var j = -span; j <= span; j++) {
          var x0 = g.ox + i * b1[0] + j * b2[0];
          var y0 = g.oy + i * b1[1] + j * b2[1];
          if (x0 < -16 || x0 > w + 16 || y0 < -16 || y0 > h + 16) continue;
          // the figure appears from its origin outwards
          var far = Math.sqrt((x0 - g.ox) * (x0 - g.ox) + (y0 - g.oy) * (y0 - g.oy)) / reach;
          var appear = util.smooth(util.clamp(shown * 2.2 - far * 1.6, 0, 1));
          if (appear <= 0) continue;
          push(x0, y0, time, g, tmp);
          var near = nearness(x0, y0);
          ctx.globalAlpha = (0.3 + 0.55 * near) * appear;
          ctx.beginPath();
          ctx.arc(tmp[0], tmp[1], 1.2 + 1.5 * near, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (fade > 0) {
        // basis vectors at the origin
        ctx.globalAlpha = 0.9 * fade;
        ctx.strokeStyle = colors.axis;
        ctx.fillStyle = colors.axis;
        ctx.lineWidth = 1;
        arrow(g.ox, g.oy, g.ox + b1[0], g.oy + b1[1]);
        arrow(g.ox, g.oy, g.ox + b2[0], g.oy + b2[1]);
        ctx.font = 'italic 15px "Instrument Serif", Georgia, serif';
        ctx.fillStyle = colors.text;
        ctx.globalAlpha = fade;
        ctx.fillText("b₁", g.ox + b1[0] + 7, g.oy + b1[1] + 13);
        ctx.fillText("b₂", g.ox + b2[0] + 8, g.oy + b2[1] - 3);

        // the target, the closest lattice point, and the vector between them
        if (best) {
          push(best.x, best.y, time, g, tmp);
          ctx.globalAlpha = 0.95 * fade;
          ctx.strokeStyle = colors.line;
          ctx.fillStyle = colors.line;
          ctx.lineWidth = 1.25;
          ctx.beginPath();
          ctx.moveTo(cur.x, cur.y);
          ctx.lineTo(tmp[0], tmp[1]);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(tmp[0], tmp[1], 9, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(tmp[0], tmp[1], 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(cur.x, cur.y, 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.lineWidth = 1;
          var label = "(" + best.i + ", " + best.j + ")";
          if (out && label !== lastOut) {
            lastOut = label;
            out.textContent = label;
          }
        }
      }
      ctx.globalAlpha = 1;
    }

    // about 30 frames a second is plenty for something this slow
    var loop = util.loop(function (time) {
      if (time - lastFrame < 32) return;
      lastFrame = time;
      draw(time);
    });
    var visible = false;
    function refresh() {
      if (visible && !Site.env.reduce) loop.start();
      else {
        loop.stop();
        draw(performance.now());
      }
    }
    util.visible(canvas, function (on) {
      visible = on;
      refresh();
    });
    Site.on("reduce", refresh);
    Site.on("theme", function () {
      readColors();
      if (!loop.running) draw(performance.now());
    });
    window.addEventListener("resize", resize);

    if (Site.env.hover) {
      hero.addEventListener("pointermove", function (e) {
        if (e.pointerType === "touch") return;
        var r = canvas.getBoundingClientRect();
        pointer.x = e.clientX - r.left;
        pointer.y = e.clientY - r.top;
        pointer.active = true;
        if (!loop.running) {
          cur.x = pointer.x;
          cur.y = pointer.y;
          draw(performance.now());
        }
      });
      hero.addEventListener("pointerleave", function () {
        pointer.active = false;
      });
    }
    hero.addEventListener("pointerdown", function (e) {
      if (Site.env.reduce || (e.target.closest && e.target.closest("a, button"))) return;
      var r = canvas.getBoundingClientRect();
      waves.push({ x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now() });
      if (waves.length > 3) waves.shift();
    });

    readColors();
    resize();
    return {
      reveal: function () {
        canvas.classList.add("is-on");
        if (Site.env.reduce) {
          shown = 1;
          draw(performance.now());
        } else showStart = performance.now();
      },
    };
  }

  /* ================================================================== orbit */
  var ORBIT = {
    stage: { w: 1200, h: 780 },
    card: { w: 300, h: 188 },
    gap: 16,
    radius: { x: 410, y: 245 },
    columns: 3,
    lift: 44, // the grid sits a little below the middle, under the headline
  };

  function initOrbit(section) {
    var scene = section.querySelector("[data-orbit-scene]");
    var cards = all(section, "[data-orbit-card]");
    var titles = all(section, "[data-orbit-title]");
    var core = section.querySelector("[data-orbit-core]");
    if (!scene || !cards.length) return;
    var wide = window.matchMedia("(min-width: 900px) and (min-height: 600px)");
    var count = cards.length;
    var columns = ORBIT.columns;
    var rows = Math.ceil(count / columns);
    var slots = cards.map(function (_, i) {
      var col = i % columns;
      var row = Math.floor(i / columns);
      var inRow = Math.min(columns, count - row * columns);
      return {
        x: (col - (inRow - 1) / 2) * (ORBIT.card.w + ORBIT.gap),
        y: (row - (rows - 1) / 2) * (ORBIT.card.h + ORBIT.gap) + ORBIT.lift,
      };
    });

    var active = false;
    var target = 0;
    var p = 0; // smoothed progress
    var vel = 0;
    var drift = 0;
    var settledBefore = null;
    var coreFig = core ? orbitCore(core) : null;

    function measure() {
      var r = section.getBoundingClientRect();
      target = util.clamp((window.innerHeight - r.top) / Math.max(1, r.height), 0, 1);
    }
    function scale() {
      var s = Math.min(1, root.clientWidth / ORBIT.stage.w, (window.innerHeight - 40) / ORBIT.stage.h);
      scene.style.setProperty("--orbit-scale", s.toFixed(4));
    }
    function title(el, range) {
      var o = p <= range[0] || p >= range[3] ? 0 : p < range[1] ? (p - range[0]) / (range[1] - range[0]) : p <= range[2] ? 1 : 1 - (p - range[2]) / (range[3] - range[2]);
      var y = p < range[1] ? 24 * (1 - o) : -24 * (1 - o);
      el.style.opacity = util.round(o, 3);
      el.style.transform = "translateY(" + util.round(y, 1) + "px)";
      el.style.filter = o > 0.98 ? "none" : "blur(" + util.round(8 * (1 - o), 1) + "px)";
    }
    function place() {
      var enter = util.smooth(util.clamp((p - 0.12) / 0.25, 0, 1));
      var settle = util.clamp((p - 0.86) / 0.12, 0, 1);
      var turn = util.clamp(p / 0.86, 0, 1) * Math.PI * 1.1;
      var k = util.smooth(settle);
      for (var i = 0; i < count; i++) {
        var angle = (i / count) * Math.PI * 2 + turn + drift * (1 - settle);
        var depth = (Math.sin(angle) + 1) / 2;
        var reach = 0.3 + 0.7 * enter;
        var ox = Math.cos(angle) * ORBIT.radius.x * reach;
        var oy = Math.sin(angle) * ORBIT.radius.y * reach + 30;
        var os = 0.7 + 0.3 * depth;
        var ob = (1 - depth) * 1.6 + (1 - enter) * 8;
        var oo = (0.55 + 0.45 * depth) * enter;
        var or = -Math.cos(angle) * 24;
        var x = ox + (slots[i].x - ox) * k;
        var y = oy + (slots[i].y - oy) * k;
        var s = os + (1 - os) * k;
        var blur = ob * (1 - k);
        var el = cards[i];
        el.style.transform =
          "perspective(900px) translate(" + util.round(x, 1) + "px, " + util.round(y, 1) + "px) scale(" + util.round(s, 3) + ") rotateY(" + util.round(or * (1 - k), 2) + "deg)";
        el.style.opacity = util.round(oo + (1 - oo) * k, 3);
        el.style.filter = blur > 0.05 ? "blur(" + util.round(blur, 1) + "px)" : "none";
        el.style.zIndex = k > 0.5 ? 30 : depth > 0.5 ? 20 : 5;
      }
      // the cards can be used once they have settled
      var settled = k > 0.96;
      if (settled !== settledBefore) {
        settledBefore = settled;
        section.classList.toggle("is-settled", settled);
        cards.forEach(function (el) {
          var a = el.querySelector("a");
          if (a) a.tabIndex = settled ? 0 : -1;
        });
      }
      if (titles[0]) title(titles[0], [-0.01, 0, 0.78, 0.87]);
      if (titles[1]) title(titles[1], [0.9, 0.97, 1, 1.01]);
      if (coreFig) {
        coreFig.set({
          scale: util.map(p, 0, 0.3, 0.8, 1) * util.map(p, 0.86, 0.95, 1, 0.3),
          opacity: util.map(p, 0.86, 0.94, 1, 0),
          spin: p * Math.PI * 1.6,
        });
      }
    }

    // scroll progress on a spring (stiffness 160, damping 32, mass 0.4), so the piece glides after the wheel stops
    var loop = util.loop(function (time, delta) {
      measure();
      var dt = Math.min(delta, 48) / 1000;
      var steps = 3;
      for (var n = 0; n < steps; n++) {
        var a = (-160 * (p - target) - 32 * vel) / 0.4;
        vel += (a * dt) / steps;
        p += (vel * dt) / steps;
      }
      if (p < 0.86) drift += delta * 0.00008;
      place();
      if (coreFig) coreFig.draw(time);
    });

    function start() {
      if (active) return;
      active = true;
      section.classList.add("is-orbit");
      scale();
      measure();
      p = target;
      vel = 0;
      place();
      if (visible) loop.start();
    }
    function stop() {
      if (!active) return;
      active = false;
      loop.stop();
      section.classList.remove("is-orbit", "is-settled");
      settledBefore = null;
      cards.forEach(function (el) {
        el.style.transform = el.style.opacity = el.style.filter = el.style.zIndex = "";
        var a = el.querySelector("a");
        if (a) a.removeAttribute("tabindex");
      });
      titles.forEach(function (el) {
        el.style.opacity = el.style.transform = el.style.filter = "";
      });
    }
    var visible = false;
    util.visible(
      section,
      function (on) {
        visible = on;
        if (!active) return;
        if (on) loop.start();
        else loop.stop();
      },
      "200px",
    );
    function choose() {
      if (wide.matches && !Site.env.reduce && M) start();
      else stop();
    }
    wide.addEventListener("change", choose);
    Site.on("reduce", choose);
    Site.on("resize", function () {
      if (active) scale();
    });
    choose();
  }

  /* The object in the middle of the orbit: a small cubic point lattice turning slowly, with its three basis vectors. */
  function orbitCore(canvas) {
    var ctx = canvas.getContext("2d");
    var size = 520;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var state = { scale: 1, opacity: 1, spin: 0 };
    var ink = "";
    var accent = "";
    function readColors() {
      ink = cssVar("--ink", "#2b2d33");
      accent = cssVar("--accent", "#2f5d54");
    }
    readColors();
    Site.on("theme", readColors);

    var N = 2; // points from -N to N on each axis
    var pts = [];
    for (var x = -N; x <= N; x++) for (var y = -N; y <= N; y++) for (var z = -N; z <= N; z++) pts.push([x, y, z]);
    var projected = pts.map(function () {
      return [0, 0, 0];
    });

    function project(v, ry, rx, unit, into) {
      var cx = Math.cos(ry);
      var sx = Math.sin(ry);
      var x = v[0] * cx + v[2] * sx;
      var z = -v[0] * sx + v[2] * cx;
      var cy = Math.cos(rx);
      var sy = Math.sin(rx);
      var y = v[1] * cy - z * sy;
      z = v[1] * sy + z * cy;
      var f = 9 / (9 - z); // gentle perspective
      into[0] = size / 2 + x * unit * f;
      into[1] = size / 2 + y * unit * f;
      into[2] = z;
    }
    var tip = [0, 0, 0];
    var origin = [0, 0, 0];

    return {
      set: function (next) {
        state = next;
      },
      draw: function (time) {
        ctx.clearRect(0, 0, size, size);
        if (state.opacity <= 0.01) return;
        var ry = time * 0.00022 + state.spin;
        var rx = 0.42 + 0.12 * Math.sin(time * 0.00031);
        var unit = 46 * state.scale;
        for (var i = 0; i < pts.length; i++) project(pts[i], ry, rx, unit, projected[i]);
        ctx.fillStyle = ink;
        for (var j = 0; j < pts.length; j++) {
          var q = projected[j];
          var depth = (q[2] + N * 1.75) / (N * 3.5); // 0 far, 1 near
          ctx.globalAlpha = state.opacity * (0.16 + 0.6 * depth);
          ctx.beginPath();
          ctx.arc(q[0], q[1], 1.4 + 2 * depth, 0, Math.PI * 2);
          ctx.fill();
        }
        // basis vectors from the centre
        project([0, 0, 0], ry, rx, unit, origin);
        ctx.strokeStyle = accent;
        ctx.fillStyle = accent;
        ctx.lineWidth = 1.4;
        var basis = [
          [1, 0, 0],
          [0, -1, 0],
          [0, 0, 1],
        ];
        for (var b = 0; b < 3; b++) {
          project(basis[b], ry, rx, unit, tip);
          ctx.globalAlpha = state.opacity * 0.9;
          ctx.beginPath();
          ctx.moveTo(origin[0], origin[1]);
          ctx.lineTo(tip[0], tip[1]);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(tip[0], tip[1], 2.6, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      },
    };
  }

  /* ================================================================ results */
  // The figure of the result that has just come into view rolls up from zero.
  function initResults(el) {
    function roll(panel) {
      if (!panel) return;
      all(panel, '[data-kit~="sliding-number"]').forEach(function (n) {
        var c = kit(n, "sliding-number");
        if (!c || !c.set) return;
        var value = Number(n.getAttribute("data-value"));
        if (Site.env.reduce) {
          c.set(value, { instant: true });
          return;
        }
        c.set(0, { instant: true });
        requestAnimationFrame(function () {
          c.set(value);
        });
      });
    }
    el.addEventListener("kit:tabs-change", function (e) {
      var id = e.detail && e.detail.id;
      var panel = id ? document.getElementById(id) : null;
      if (!panel || panel.getAttribute("role") !== "tabpanel") panel = el.querySelector('[role="tabpanel"]:not([hidden])');
      roll(panel);
    });
    // the first one rolls when the block scrolls into view
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(
        function (entries) {
          if (!entries[0].isIntersecting) return;
          io.disconnect();
          roll(el.querySelector('[role="tabpanel"]:not([hidden])'));
        },
        { threshold: 0.35 },
      );
      io.observe(el);
    }
  }

  // for checking the intro by hand or from a test: Site.replayIntro() plays it again
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
    if (hero) {
      var canvas = hero.querySelector("[data-lattice]");
      var lattice = canvas ? initLattice(canvas, hero) : null;
      var begin = function (nameShown) {
        try {
          heroEntrance(hero, nameShown);
        } catch (e) {
          // never leave the hero hidden
          all(hero, "[data-hero-item], [data-hero-name]").forEach(function (el) {
            el.classList.add("is-on");
          });
        }
        if (lattice) lattice.reveal();
      };
      intro(hero).then(begin, function () {
        begin(false);
      });
      heroScroll(hero);
    }
    var orbit = document.querySelector("[data-orbit]");
    if (orbit) initOrbit(orbit);
    var results = document.querySelector("[data-results]");
    if (results) initResults(results);
  });
})();
