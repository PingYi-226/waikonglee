/*
 * Home page, research block: the pinned piece of the deck.
 *
 * The section is a stop of the home page's stepper (kit-snap) with two points (data-snap-points="a 1"): the ring
 * (the area cards circling a small turning lattice; at rest it turns slowly by itself, like a carousel) and the grid
 * (the cards flat, 4 + 3, two banners of venue abbreviations pulled out beneath them). Everything on screen is a pure
 * function of the scroll position (the stepper's own tween is the smoothing), so it runs back in reverse and never
 * rests half-way. Flat, the cards answer the pointer (tilt, spotlight, hover-fill, press) and open their area's
 * detail view (expand); the stepper's hold on the grid stop makes them wave once.
 * The scene runs where the stepper runs (html.has-snap); elsewhere the block stays the plain grid of its markup.
 */
(function () {
  "use strict";

  var Site = window.Site;
  if (!Site) return;
  var util = Site.util;
  var env = Site.env;
  var root = document.documentElement;
  var clamp = util.clamp;
  var map = util.map;
  var smooth = util.smooth;
  var lerp = util.lerp;
  var TAU = Math.PI * 2;
  /** An angle brought into [-pi, pi]. */
  function wrap(a) {
    return a - TAU * Math.round(a / TAU);
  }

  function all(scope, selector) {
    return Array.prototype.slice.call(scope.querySelectorAll(selector));
  }
  function cssVar(name, fallback) {
    return getComputedStyle(root).getPropertyValue(name).trim() || fallback;
  }

  /* ------------------------------------------------------------------ values
   * Scene geometry in scene px: the scene is laid out at SCENE and scaled to fit the stage under the header. */
  var SCENE = { w: 1280, h: 760, max: 1.2, side: 24, bottom: 20 }; // max: full size on wide screens, never larger (own)
  var CARD = { w: 288, h: 192, gap: 20 }; // the card box of .ocard in the scene (home-research.css)
  var ROWS = [4, 3]; // the grid: four cards, then three, centred
  var GRID_Y = 34; // the grid's centre below the scene's centre (the title is above it)
  var RING = { y: 46, rx: 440, ry: 212, far: 0.7, turn: 22, blur: 1.4 }; // centre below the scene's, ellipse radii, scale at the back, rotateY at the sides (deg), blur at the back (px)
  var SPIN = 0.15; // rad/s: the ring at rest turns once in about 42 s (own: a slow carousel)
  var SPIN_LAG = 0.55; // s: time constant of the spin starting and stopping (own)
  var SWIRL = 1.5; // rad the ring turns while the cards spread out of the core (own)
  /* ring to grid (shares of the move's time; owner, round 3: "the cards first go once round the ring, then take their
     places"): the ring gathers speed and goes once round (TURN.end: done by this share, on ease.fill); as the turn
     completes the cards leave it one after another in ring order (the first at LEAVE.from, each next LEAVE.step later),
     each landing a little past its slot (ease.drawer). The first leaves when the ring is less than one card's spacing
     from its final angle, so a leaving card never passes the one ahead of it. (own values, filmed) */
  var TURN = { end: 0.7 };
  var LEAVE = { from: 0.44, step: 0.045 };
  var LIFT = 0.05; // the cards grow by this much half-way between ring and grid (own)
  var SLANT = 4; // deg: the two banners lean this way and the other
  var WAVE = { rise: 14, grow: 0.025 }; // px and scale of the cards' wave on the stepper's hold
  /* leaving the grid toward the next block (owner, round 3: the title, the banners and the cards leave with parallax):
     while the stage unpins and travels one viewport up, each layer moves against it by a share of that travel. The
     title hangs back (far), the banners hang back a little and run on out the way they came in, the cards rise ahead
     of the stage, the top row first. (own values, filmed) */
  var EXIT = { title: 0.34, banner: 0.1, run: 0.3, card: 0.16, row: 0.1 };
  var GIVE = 0.05; // viewport: the stepper's hold gives the page this much at most (kit-snap BAND); the grid stays "at rest" there
  var EPS = 2; // px: "at a stop" (kit-snap's own tolerance)

  /* ------------------------------------------------------------------ time
   * The stepper carries the page from stop to stop on ease.inOut (kit-snap, deck mode), which puts most of the way in
   * the middle of the move. The scene reads the scroll position back as the share of the move's time (the inverse of
   * that curve) and paces itself on its own curves from there, so the ring-to-grid change is spread over the whole
   * move, each card landing on a spring. Still a pure function of the scroll position: any scroll, any speed, both ways. */
  var MOVE = Site.tokens.ease.inOut;
  function bez(a, b, s) {
    var r = 1 - s;
    return 3 * r * r * s * a + 3 * r * s * s * b + s * s * s;
  }
  function timeAt(way) {
    if (!(way > 0)) return 0;
    if (way >= 1) return 1;
    var lo = 0;
    var hi = 1;
    for (var n = 0; n < 22; n++) {
      var mid = (lo + hi) / 2;
      if (bez(MOVE[1], MOVE[3], mid) < way) lo = mid;
      else hi = mid;
    }
    return bez(MOVE[0], MOVE[2], (lo + hi) / 2);
  }
  /** A curve token ([x1, y1, x2, y2], as cubic-bezier()) as a function of 0..1. */
  function curve(c) {
    return function (u) {
      if (!(u > 0)) return 0;
      if (u >= 1) return 1;
      var lo = 0;
      var hi = 1;
      for (var n = 0; n < 22; n++) {
        var mid = (lo + hi) / 2;
        if (bez(c[0], c[2], mid) < u) lo = mid;
        else hi = mid;
      }
      return bez(c[1], c[3], (lo + hi) / 2);
    };
  }

  /* ================================================================== the scene */
  function initOrbit(section) {
    var stage = section.querySelector(".orbit__stage");
    var scene = section.querySelector("[data-orbit-scene]");
    var list = section.querySelector("[data-orbit-cards]");
    var items = all(section, "[data-orbit-card]");
    var cards = items.map(function (li) {
      return li.querySelector(".ocard");
    });
    var banners = all(section, "[data-orbit-banner]");
    var coreCanvas = section.querySelector("[data-orbit-core]");
    if (!stage || !scene || !items.length) return;

    var count = items.length;
    var points = String(section.getAttribute("data-snap-points") || "0.4 1")
      .trim()
      .split(/\s+/)
      .map(Number);
    var RING_AT = points[0] > 0 && points[0] < 1 ? points[0] : 0.4;

    /* the grid's slots, in reading order */
    var slots = [];
    var rowsUsed = [];
    var left = count;
    ROWS.forEach(function (n) {
      if (left > 0) rowsUsed.push(Math.min(n, left));
      left -= n;
    });
    while (left > 0) {
      rowsUsed.push(Math.min(ROWS[ROWS.length - 1], left));
      left -= ROWS[ROWS.length - 1];
    }
    rowsUsed.forEach(function (n, r) {
      for (var c = 0; c < n; c++) {
        slots.push({
          x: (c - (n - 1) / 2) * (CARD.w + CARD.gap),
          y: (r - (rowsUsed.length - 1) / 2) * (CARD.h + CARD.gap) + GRID_Y,
        });
      }
    });
    /* the ring's order is the grid's order around its edge (top row left to right, then the lower rows back), so the
       ring unrolls into the grid without cards crossing */
    var around = [];
    var first = 0;
    rowsUsed.forEach(function (n, r) {
      var row = [];
      for (var c = 0; c < n; c++) row.push(first + c);
      first += n;
      around.push(r === 0 ? row : row.reverse());
    });
    var ringOrder = around[0].concat.apply(around[0], around.slice(1).reverse()); // ring position -> card index
    var ringPos = []; // card index -> ring position
    ringOrder.forEach(function (card, j) {
      ringPos[card] = j;
    });
    function ringPoint(angle, j, reach) {
      var a = angle + (j / count) * TAU;
      return { a: a, x: Math.cos(a) * RING.rx * reach, y: Math.sin(a) * RING.ry * reach + RING.y };
    }
    /* the ring angle at which the cards lie nearest their slots: where the ring turns to while it flattens */
    var home = 0;
    (function () {
      var best = Infinity;
      for (var k = 0; k < 720; k++) {
        var a = (k / 720) * TAU;
        var cost = 0;
        for (var i = 0; i < count; i++) {
          var p = ringPoint(a, ringPos[i], 1);
          cost += (p.x - slots[i].x) * (p.x - slots[i].x) + (p.y - slots[i].y) * (p.y - slots[i].y);
        }
        if (cost < best) {
          best = cost;
          home = a;
        }
      }
    })();

    var land = curve(Site.tokens.ease.drawer); // a card travelling to its place: lands a little past it and settles
    var slide = curve(Site.tokens.ease.soft); // the banners: start at once, slow into place
    var whirl = curve(Site.tokens.ease.fill); // the ring's full turn: gathers speed, then a long slowing into place
    var travel = 1 - LEAVE.from - (count - 1) * LEAVE.step; // share of the time each card takes from the ring to its slot
    var rowOf = []; // card index -> row of the grid
    rowsUsed.forEach(function (n, r) {
      for (var c = 0; c < n; c++) rowOf.push(r);
    });
    var head = section.querySelector(".orbit__head");
    var core = coreCanvas ? orbitCore(coreCanvas) : null;
    var active = false;
    var visible = false;
    var flat = null; // the cards lie flat and answer the pointer
    var spin = home - SWIRL * 0.4; // the ring's own turn (rad)
    var omega = 0; // its speed (rad/s)
    var target = null; // the ring angle the flattening turns to (chosen when it starts)
    var lastQ = null;
    var still = 0;
    var scale = 1;

    /* scroll position -> progress: 0 when the section's top meets the viewport's top, 1 at the end of its pinned range;
       negative while it comes up from below */
    var from = -0.5; // progress at the stop before the ring (where the way in starts)
    var range = 1; // px of the pinned range
    function progress() {
      var r = section.getBoundingClientRect();
      range = Math.max(1, r.height - window.innerHeight);
      var stops = Site.snap.stops || [];
      for (var i = 1; i < stops.length; i++) {
        if (stops[i].element === section) {
          from = Math.min(-0.05, (stops[i - 1].y - (r.top + window.scrollY)) / range);
          break;
        }
      }
      return -r.top / range;
    }
    function fit() {
      var st = getComputedStyle(stage);
      var top = parseFloat(st.paddingTop) || 0;
      var w = stage.clientWidth - 2 * SCENE.side;
      var h = stage.clientHeight - top - SCENE.bottom;
      scale = Math.max(0.1, Math.min(SCENE.max, w / SCENE.w, h / SCENE.h));
      scene.style.setProperty("--orbit-scale", scale.toFixed(4));
      if (core) core.resize(scale);
    }

    function setFlat(on) {
      if (on === flat) return;
      flat = on;
      section.classList.toggle("is-flat", on);
      if (!on) {
        // whatever the pointer had started on a card ends now (tilt, fill, spotlight, the diagram's loop)
        cards.forEach(function (a) {
          if (!a.matches(":hover")) return;
          var r = a.getBoundingClientRect();
          var e = { bubbles: false, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, pointerType: "mouse" };
          a.dispatchEvent(new PointerEvent("pointerleave", e));
        });
        list.dispatchEvent(new PointerEvent("pointerleave", { bubbles: false, pointerType: "mouse" }));
      } else {
        var spot = Site.get(list, "spotlight");
        if (spot) spot.refresh();
      }
    }

    /** Share of the way from progress a to b, exact at either end when the page is within EPS px of it (the
        inverse curve is steep there: a sub-pixel miss would read as a visible share of the time). */
    function way(q, a, b) {
      var len = (b - a) * range;
      var at = (q - a) * range;
      if (at <= EPS) return 0;
      if (len - at <= EPS) return 1;
      return at / len;
    }
    function place(q, dt, time) {
      // the way in: the stage comes up with the page; once it is pinned (q >= 0, where the page never rests) the
      // lattice grows, and a beat later the cards spread out of it into the ring
      var tIn = timeAt(way(q, from, RING_AT));
      var t0 = timeAt(way(0, from, RING_AT));
      var tFlat = timeAt(way(q, RING_AT, 1)); // ring to grid
      var coreIn = q <= 0 ? 0 : smooth(map(tIn, t0, lerp(t0, 1, 0.55), 0, 1));
      var form = q <= 0 ? 0 : land(map(tIn, lerp(t0, 1, 0.15), 1, 0, 1));

      // the ring turns by itself only while the page rests on it
      var resting = Math.abs(q - RING_AT) * range <= EPS && !Site.snap.moving && !document.hidden;
      var want = resting ? SPIN : 0;
      omega += (want - omega) * (1 - Math.exp(-dt / SPIN_LAG));
      if (want === 0 && (Math.abs(omega) < 0.002 || tFlat >= 1)) omega = 0; // still, or no ring left to turn
      spin += omega * dt;
      var base = spin - SWIRL * (1 - form);
      // the turn ends where every card lies nearest its slot, one full turn on from where it starts (fixed as it starts)
      if (tFlat <= 0 || target === null) target = base + TAU + wrap(home - base);
      var ring = lerp(base, target, whirl(tFlat / TURN.end)); // the ring's angle

      // leaving the grid: px the page has gone past the pinned range (the stage travels up with it), in scene px
      var past = Math.max(0, q - 1) * range;
      var vh = window.innerHeight;
      // the grid is at rest on its stop, and while the stepper's hold gives the page a little and brings it back
      var rest = tFlat >= 0.999 && (past <= EPS || (past <= GIVE * vh && !Site.snap.moving));
      var gone = past <= EPS ? 0 : clamp(past / vh, 0, 1); // share of the exit
      var lift = past / scale; // the stage's travel, scene px

      for (var i = 0; i < count; i++) {
        var j = ringPos[i];
        var k = rest ? 1 : land((tFlat - LEAVE.from - j * LEAVE.step) / travel);
        var p = ringPoint(ring, j, 0.22 + 0.78 * form);
        var depth = (Math.sin(p.a) + 1) / 2; // 1 at the front (the bottom of the ellipse)
        var ringScale = (RING.far + (1 - RING.far) * depth) * (0.5 + 0.5 * form);
        var x = lerp(p.x, slots[i].x, k);
        var y = lerp(p.y, slots[i].y, k) - lift * (EXIT.card + (rowsUsed.length - 1 - rowOf[i]) * EXIT.row);
        var s = lerp(ringScale, 1, k) * (1 + LIFT * Math.sin(Math.PI * k));
        var ry = -Math.cos(p.a) * RING.turn * (1 - k);
        var o = clamp(lerp((0.5 + 0.5 * depth) * form, 1, k), 0, 1);
        var blur = Math.max(0, ((1 - depth) * RING.blur + (1 - form) * 6) * (1 - k));
        var li = items[i];
        // lying flat a card is placed in the plane (no 3D; at rest whole pixels), so its text stays sharp
        li.style.transform =
          k >= 1
            ? rest
              ? "translate(" + Math.round(x) + "px, " + Math.round(y) + "px)"
              : "translate(" + util.round(x, 2) + "px, " + util.round(y, 2) + "px)"
            : "perspective(1000px) translate(" + util.round(x, 1) + "px, " + util.round(y, 1) + "px) scale(" + util.round(s, 4) + ") rotateY(" + util.round(ry, 2) + "deg)";
        li.style.opacity = o < 0.002 ? "0" : util.round(o, 3);
        li.style.filter = blur > 0.05 ? "blur(" + util.round(blur, 2) + "px)" : "";
        li.style.zIndex = String(Math.round(lerp(depth * 20, 30, k)));
      }
      setFlat(rest);

      // the title hangs back as the stage leaves
      if (head) head.style.transform = lift > 0.05 ? "translateY(" + util.round(lift * EXIT.title, 2) + "px)" : "";

      // the banners come out from the sides as the cards flatten; leaving, they run on the way they came in
      var out = slide(map(tFlat, 0.5, 1, 0, 1));
      var run = slide(gone);
      banners.forEach(function (b) {
        var side = Number(b.getAttribute("data-orbit-banner")) || -1;
        var dx = side * (1 - out) * 105 - side * run * EXIT.run * 100;
        b.style.transform =
          (lift > 0.05 ? "translateY(" + util.round(lift * EXIT.banner, 2) + "px) " : "") + "rotate(" + -side * SLANT + "deg) translateX(" + util.round(dx, 2) + "%)";
        b.style.opacity = util.round(map(out, 0, 0.35, 0, 1), 3);
        b.style.visibility = out <= 0 ? "hidden" : "visible";
      });

      if (core) {
        var shrink = smooth(map(tFlat, 0.3, 0.75, 0, 1));
        core.set({ opacity: coreIn * (1 - shrink), scale: (0.6 + 0.4 * coreIn) * (1 - 0.45 * shrink), spin: spin + ring - base }); // turns with the ring's turn
        core.draw(time);
      }
      return omega !== 0 || want !== 0 || (core && core.visible());
    }

    function frame(time, delta) {
      if (!active) return loop.stop();
      var q = progress();
      var busy = place(q, delta / 1000, time);
      if (!busy && lastQ !== null && Math.abs(q - lastQ) < 1e-5) {
        if (++still > 3) loop.stop(); // nothing moves: sleep until the page scrolls again
      } else still = 0;
      lastQ = q;
    }
    var ticker = util.loop(frame);
    // the loop's state shows on the section (data-orbit-live) for anyone checking that the block sleeps
    var loop = {
      get running() {
        return ticker.running;
      },
      start: function () {
        ticker.start();
        section.setAttribute("data-orbit-live", "");
      },
      stop: function () {
        ticker.stop();
        section.removeAttribute("data-orbit-live");
      },
    };
    function wake() {
      still = 0;
      if (active && visible && !loop.running) loop.start();
    }

    function start() {
      if (active) return;
      active = true;
      section.classList.add("is-orbit");
      fit();
      target = null;
      place(progress(), 0, performance.now());
      wake();
      Site.snap.refresh();
      // switched on with the page inside the pinned range (a window turned to landscape): land on the nearer rest
      setTimeout(function () {
        if (!active || Site.snap.moving) return;
        var q = progress();
        if (q * range < -EPS || (1 - q) * range <= EPS || Math.abs(q - RING_AT) * range <= EPS) return;
        var mine = (Site.snap.stops || []).filter(function (st) {
          return st.element === section;
        });
        if (mine.length < 2) return;
        Site.snap.go(mine[q < (RING_AT + 1) / 2 ? 0 : mine.length - 1].index);
      }, 200);
    }
    function stop() {
      if (!active) return;
      active = false;
      loop.stop();
      section.classList.remove("is-orbit", "is-flat");
      flat = null;
      items.forEach(function (li) {
        li.style.transform = li.style.opacity = li.style.filter = li.style.zIndex = "";
      });
      banners.forEach(function (b) {
        b.style.transform = b.style.opacity = b.style.visibility = "";
      });
      if (head) head.style.transform = "";
      Site.snap.refresh();
    }
    function choose() {
      if (root.classList.contains("has-snap") && window.Motion) start();
      else stop();
    }

    util.visible(
      section,
      function (on) {
        visible = on;
        if (on) wake();
        else loop.stop();
      },
      "120px",
    );
    window.addEventListener("scroll", wake, { passive: true });
    Site.on("resize", function () {
      if (!active) return;
      fit();
      wake();
    });
    Site.on("theme", wake);
    ["kit:snap-arrive", "kit:snap-change", "kit:snap-leave"].forEach(function (name) {
      section.addEventListener(name, wake);
    });
    new MutationObserver(choose).observe(root, { attributes: true, attributeFilter: ["class"] });
    choose();

    /* keyboard: a card reached with Tab before the cards lie flat takes the page to the grid (also when the stepper's
       own answer to the focus has landed on the ring) */
    function keyFocus() {
      var el = document.activeElement;
      if (!el || !list.contains(el)) return false;
      try {
        return el.matches(":focus-visible");
      } catch (err) {
        return true;
      }
    }
    function toGrid() {
      if (!active || flat || !keyFocus()) return;
      var mine = (Site.snap.stops || []).filter(function (st) {
        return st.element === section;
      });
      if (mine.length && Site.snap.index !== mine[mine.length - 1].index) Site.snap.go(mine[mine.length - 1].index);
    }
    list.addEventListener("focusin", function () {
      setTimeout(toGrid, 0);
    });
    section.addEventListener("kit:snap-arrive", function () {
      setTimeout(toGrid, 0);
    });

    /* a page opened at #research lands on the ring (the browser's jump may leave it just above the pinned stage) */
    if (window.location.hash === "#" + section.id) {
      var landRing = function () {
        setTimeout(function () {
          var mine = (Site.snap.stops || []).filter(function (st) {
            return st.element === section;
          });
          if (active && !Site.snap.moving && mine.length && Math.abs(window.scrollY - mine[0].y) > EPS) Site.snap.go(mine[0].index);
        }, 250);
      };
      if (document.readyState === "complete") landRing();
      else window.addEventListener("load", landRing);
    }

    /* the stepper's hold on the grid: the cards wave, one after the other, so it shows they can be taken */
    section.addEventListener("kit:snap-hold", function () {
      if (!active || !flat || env.reduce) return;
      var up = Site.css("transition.swap");
      var back = Site.css("spring.bounce");
      var total = up.duration + back.duration;
      var step = Site.tokens.stagger.words * 1000 * Site.tempo;
      items.forEach(function (li, i) {
        if (typeof li.animate !== "function") return;
        li.animate(
          [
            { translate: "0 0", scale: "1", easing: up.easing },
            { translate: "0 " + -WAVE.rise + "px", scale: String(1 + WAVE.grow), offset: up.duration / total, easing: back.easing },
            { translate: "0 0", scale: "1" },
          ],
          { duration: total, delay: i * step, composite: "replace" },
        );
      });
    });
  }

  /* ================================================================== the core
   * The object in the middle of the ring: a small cubic point lattice turning slowly, with its three basis vectors. */
  function orbitCore(canvas) {
    var ctx = canvas.getContext("2d");
    var size = 520;
    var state = { scale: 1, opacity: 0, spin: 0 };
    var ink = "";
    var accent = "";
    var drawnBlank = false;
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
      var px = v[0] * cx + v[2] * sx;
      var pz = -v[0] * sx + v[2] * cx;
      var cy = Math.cos(rx);
      var sy = Math.sin(rx);
      var py = v[1] * cy - pz * sy;
      pz = v[1] * sy + pz * cy;
      var f = 9 / (9 - pz); // gentle perspective
      into[0] = size / 2 + px * unit * f;
      into[1] = size / 2 + py * unit * f;
      into[2] = pz;
    }
    var tip = [0, 0, 0];
    var origin = [0, 0, 0];
    var basis = [
      [1, 0, 0],
      [0, -1, 0],
      [0, 0, 1],
    ];

    return {
      resize: function (sceneScale) {
        var dpr = Math.min(2, (window.devicePixelRatio || 1) * Math.max(1, sceneScale));
        canvas.width = Math.round(size * dpr);
        canvas.height = Math.round(size * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawnBlank = false;
      },
      set: function (next) {
        state = next;
      },
      visible: function () {
        return state.opacity > 0.01;
      },
      draw: function (time) {
        if (state.opacity <= 0.01) {
          if (!drawnBlank) ctx.clearRect(0, 0, size, size);
          drawnBlank = true;
          return;
        }
        drawnBlank = false;
        ctx.clearRect(0, 0, size, size);
        var ry = time * 0.00016 + state.spin * 0.6;
        var rx = 0.42 + 0.12 * Math.sin(time * 0.00031);
        var unit = 46 * state.scale;
        for (var i = 0; i < pts.length; i++) project(pts[i], ry, rx, unit, projected[i]);
        ctx.fillStyle = ink;
        for (var j = 0; j < pts.length; j++) {
          var q = projected[j];
          var depth = (q[2] + N * 1.75) / (N * 3.5); // 0 far, 1 near
          ctx.globalAlpha = state.opacity * (0.16 + 0.6 * depth);
          ctx.beginPath();
          ctx.arc(q[0], q[1], 1.4 + 2 * depth, 0, TAU);
          ctx.fill();
        }
        project([0, 0, 0], ry, rx, unit, origin);
        ctx.strokeStyle = accent;
        ctx.fillStyle = accent;
        ctx.lineWidth = 1.4;
        for (var b = 0; b < 3; b++) {
          project(basis[b], ry, rx, unit, tip);
          ctx.globalAlpha = state.opacity * 0.9;
          ctx.beginPath();
          ctx.moveTo(origin[0], origin[1]);
          ctx.lineTo(tip[0], tip[1]);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(tip[0], tip[1], 2.6, 0, TAU);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      },
    };
  }

  /* ================================================================== the detail views
   * The card's drawing flies into the view (kit expand, data-shared="figure") and lands on the view's own, larger
   * drawing (trigger="manual": drawn from the start, with its labels). It holds still during the flight and starts
   * running a beat after the landing (live="always"; it runs only while on screen). A redraw from blank after the
   * landing was tried: the drawing that had just flown in dissolved and drew itself again, which read as a glitch. */
  function initDetails(section) {
    function diagramIn(e) {
      var body = e.detail && e.detail.body;
      var svg = body && body.querySelector(".odetail__fig [data-kit~='diagram']");
      return svg ? Site.get(svg, "diagram") : null;
    }
    section.addEventListener("kit:expand-open", function (e) {
      var dg = diagramIn(e);
      if (dg) dg.live(false);
    });
    section.addEventListener("kit:expand-opened", function (e) {
      var dg = diagramIn(e);
      if (dg) dg.live(true);
    });
  }

  /* ================================================================== start */
  Site.ready(function () {
    var orbit = document.querySelector("[data-orbit]");
    if (!orbit) return;
    initOrbit(orbit);
    initDetails(orbit);
  });
})();
