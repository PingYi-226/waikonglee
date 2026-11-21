/*
 * Group page.
 *   1. glyph (kit): a person's mark, computed from their name. A hash of the name picks a lattice basis (the angle
 *      between b1 and b2, their length ratio, a slight turn) and a short self-avoiding walk on that lattice; the points
 *      of the walk are lit, its last point is ringed. Drawn as inline SVG in ink. It settles into place when it first
 *      appears (with its row's entrance), a ripple runs through it from where the pointer came in and its points give
 *      way under the pointer (a student's card: the mark re-forms instead), and it morphs when the name changes (the
 *      view behind the button in the page head). A photo in the data replaces it (markup). An empty name draws the
 *      lattice alone.
 *        <span class="glyph glyph--tile" data-kit="glyph" data-name="Ying Ying Chia" data-kind="tile|row|band|dot|big"
 *              data-trigger="reveal|view|load|manual" data-delay="ms">YC</span>
 *      Controller: { set(name), play(delay), reform(), model }. Event kit:glyph-change { model } after set().
 *   2. The head: every member's mark in two rows that swell under the pointer; a mark glides the page to its person.
 *      The button at the end of the students' row opens the view with the large mark and a name field (kit expand).
 *   3. Student cards: the mark re-forms when the card is entered or focused.
 *   4. Students filtered by degree, alumni ordered by a column: both through Site.flip.
 * Everything here is an enhancement: without this file the page shows every person, with their initials.
 */
(function () {
  "use strict";

  var Site = window.Site;
  if (!Site) return;
  var util = Site.util;
  var T = Site.tokens;
  var env = Site.env;
  var NS = "http://www.w3.org/2000/svg";

  function all(scope, selector) {
    return Array.prototype.slice.call(scope.querySelectorAll(selector));
  }
  function mk(tag, attrs, parent) {
    var el = document.createElementNS(NS, tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  }
  function f2(v) {
    return Math.round(v * 100) / 100;
  }

  /* ================================================================== model
     A name -> { pts: [{ x, y, lit, start }], walk: [index into pts], b1, b2, origin, angle, ratio, steps }.
     Coordinates are in the glyph's own units: the drawing is a 72 x 72 box centred on 0, 0. */
  var ANGLES = [60, 66, 72, 80, 90, 100, 108, 116, 120]; // degrees between b1 and b2
  var RATIOS = [0.86, 1, 1.14]; // |b2| / |b1|
  var TURN = 0.42; // the lattice turns by up to this many radians (about 24 degrees)
  var REACH = 2.4; // the walk stays within this many cells of where it starts
  // the six shortest steps of the lattice, in basis coordinates; opposite steps are 3 apart
  var ACUTE = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
  var OBTUSE = [[1, 0], [0, 1], [1, 1], [-1, 0], [0, -1], [-1, -1]];
  // per size: cell length, radius of the field of points, dot radii, how far points give way under the pointer
  var KINDS = {
    big: { cell: 9, field: 34, faint: 0.6, lit: 1.25, start: 1.7, ring: 3.2, push: 4.5, sigma: 8, axes: true },
    tile: { cell: 10.5, field: 31, faint: 1, lit: 2.1, start: 2.7, ring: 4.7, push: 6, sigma: 10 },
    row: { cell: 12, field: 22, faint: 1.25, lit: 3.1, start: 3.7, ring: 6.4, push: 6, sigma: 12 },
    band: { cell: 11.5, field: 25, faint: 1.15, lit: 2.7, start: 3.3, ring: 5.8, push: 6, sigma: 11 },
    dot: { cell: 12.5, field: 17, faint: 1.4, lit: 3.5, start: 4.1, ring: 7, push: 6, sigma: 12 },
  };
  // a mark re-forming (a student's card entered): how far the points step out, when the walk starts again
  var REFORM = { out: 3.2, jitter: 2.6, wait: 0.05, spread: 0.18, draw: 0.6, every: 0.9 };
  // the ripple that runs through a mark when the pointer comes in (glyph units, seconds)
  var WAVE = { speed: 95, amp: 3.4, width: 6, decay: 0.45, life: 1.5 };

  function norm(name) {
    var s = String(name == null ? "" : name);
    if (s.normalize) s = s.normalize("NFKC");
    return s.trim().toLowerCase().replace(/\s+/g, " ");
  }
  // FNV-1a, 32 bits
  function hash(s) {
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }
  // mulberry32: a small seeded generator, so a name always draws the same mark
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function model(name, kind) {
    var K = KINDS[kind] || KINDS.tile;
    var key = norm(name);
    var r = rng(hash(key || "?"));
    var angle = ANGLES[Math.floor(r() * ANGLES.length)];
    var ratio = RATIOS[Math.floor(r() * RATIOS.length)];
    var turn = (r() * 2 - 1) * TURN;
    var a = (angle * Math.PI) / 180;
    // SVG's y axis points down: b2 is turned the other way so the angle reads counter-clockwise on screen
    var b1 = [Math.cos(turn), Math.sin(turn)];
    var b2 = [ratio * Math.cos(turn - a), ratio * Math.sin(turn - a)];
    var dirs = angle > 90 ? OBTUSE : ACUTE;
    var want = key ? 5 + Math.floor(r() * 4) : 0;
    var walk = [[0, 0]];
    var seen = { "0,0": 0 };
    var prev = -1;
    for (var k = 0; k < want; k++) {
      var d0 = Math.floor(r() * 6);
      var next = null;
      for (var t = 0; t < 6 && !next; t++) {
        var d = (d0 + t) % 6;
        if (prev >= 0 && d === (prev + 3) % 6) continue;
        var last = walk[walk.length - 1];
        var ni = last[0] + dirs[d][0];
        var nj = last[1] + dirs[d][1];
        if (seen[ni + "," + nj] !== undefined) continue;
        var px = ni * b1[0] + nj * b2[0];
        var py = ni * b1[1] + nj * b2[1];
        if (px * px + py * py > REACH * REACH) continue;
        next = [ni, nj];
        prev = d;
      }
      if (!next) break;
      seen[next[0] + "," + next[1]] = walk.length;
      walk.push(next);
    }
    // no name: the lattice alone, nothing lit
    if (!key) {
      walk = [];
      seen = {};
    }
    // centre the walk in the box
    var s = K.cell;
    var minX = Infinity;
    var maxX = -Infinity;
    var minY = Infinity;
    var maxY = -Infinity;
    walk.forEach(function (w) {
      var x = s * (w[0] * b1[0] + w[1] * b2[0]);
      var y = s * (w[0] * b1[1] + w[1] * b2[1]);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    });
    var cx = walk.length ? (minX + maxX) / 2 : 0;
    var cy = walk.length ? (minY + maxY) / 2 : 0;
    var pts = [];
    var order = new Array(walk.length);
    var span = Math.ceil(K.field / (s * 0.5)) + 2;
    for (var i = -span; i <= span; i++) {
      for (var j = -span; j <= span; j++) {
        var x = s * (i * b1[0] + j * b2[0]) - cx;
        var y = s * (i * b1[1] + j * b2[1]) - cy;
        var w = seen[i + "," + j];
        if (w === undefined && x * x + y * y > K.field * K.field) continue;
        if (w !== undefined) order[w] = pts.length;
        pts.push({ x: x, y: y, lit: w !== undefined, start: w === 0, dist: Math.sqrt(x * x + y * y) });
      }
    }
    return {
      key: key,
      kind: kind,
      pts: pts,
      walk: order,
      b1: [b1[0] * s, b1[1] * s],
      b2: [b2[0] * s, b2[1] * s],
      origin: [-cx, -cy],
      angle: angle,
      ratio: ratio,
      steps: Math.max(0, walk.length - 1),
      empty: !walk.length,
    };
  }
  Site.glyphModel = model;

  /* ================================================================= engine
     One animation frame loop for every mark that is moving; it stops when none is. */
  var active = [];
  var engine = null;
  function tick(time, delta) {
    var dt = Math.min(delta, 48) / 1000;
    for (var i = active.length - 1; i >= 0; i--) {
      if (!active[i].step(dt, time)) active.splice(i, 1);
    }
    if (!active.length) engine.stop();
  }
  function wake(g) {
    if (active.indexOf(g) < 0) active.push(g);
    if (!engine) engine = util.loop(tick);
    engine.start();
  }
  // a damped spring, two half steps (semi-implicit Euler): o[key] moves toward target, o[vkey] is its speed
  function spring(o, key, vkey, target, k, c, dt) {
    var h = dt / 2;
    for (var n = 0; n < 2; n++) {
      o[vkey] += (k * (target - o[key]) - c * o[vkey]) * h;
      o[key] += o[vkey] * h;
    }
    return Math.abs(target - o[key]) < 0.02 && Math.abs(o[vkey]) < 0.05;
  }

  var views = null;
  var viewFns = new Map();
  function whenSeen(el, fn) {
    if (!window.IntersectionObserver) return fn();
    if (!views) {
      views = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (e) {
            if (!e.isIntersecting) return;
            var f = viewFns.get(e.target);
            viewFns.delete(e.target);
            views.unobserve(e.target);
            if (f) f();
          });
        },
        { rootMargin: "0px 0px -6% 0px" },
      );
    }
    viewFns.set(el, fn);
    views.observe(el);
  }

  /* ================================================================== glyph */
  function createGlyph(el, o) {
    var kind = KINDS[o.kind] ? o.kind : "tile";
    var K = KINDS[kind];
    // read the attribute itself: the option parser turns an empty value into true
    var name = el.hasAttribute("data-name") ? el.getAttribute("data-name") : el.textContent;
    var svg = mk("svg", { class: "glyph__svg", viewBox: "-36 -36 72 72", "aria-hidden": "true", focusable: "false" });
    var axesEl = K.axes ? mk("g", { class: "glyph__axes" }, svg) : null;
    var dotsEl = mk("g", {}, svg);
    var walkEl = mk("polyline", { class: "glyph__walk", pathLength: "1", points: "" }, svg);
    var endEl = mk("circle", { class: "glyph__end", r: "0", cx: "0", cy: "0" }, svg);
    el.appendChild(svg);
    el.classList.add("is-drawn");

    var soft = Site.t("spring.glyph");
    var enter = Site.t("spring.entrance");
    var pop = Site.t("spring.bounce");
    var fade = Site.t("transition.reveal").duration;
    var arrive = Site.css("transition.arrive");
    var swap = Site.css("transition.swap");
    var drawEase = "cubic-bezier(" + T.ease.draw.join(",") + ")";

    var dots = []; // every circle on screen, including those leaving
    var lit = []; // the walk, in order: dots
    var end = { r: 0, vr: 0, tr: 0, wait: 0, k: pop.stiffness, c: pop.damping };
    var axes = null; // { o, p1, p2 }: points with springs
    var pointer = null;
    var waves = [];
    var played = false;
    var walkAnim = null;
    var redraw = null;
    var self = { model: null };

    function dotRadius(p) {
      return p.start ? K.start : p.lit ? K.lit : K.faint;
    }
    function newDot(p) {
      var d = {
        el: mk("circle", { class: "glyph__dot" + (p.lit ? "" : " is-faint"), r: "0" }, dotsEl),
        x: p.x,
        y: p.y,
        vx: 0,
        vy: 0,
        rx: p.x,
        ry: p.y,
        r: dotRadius(p),
        vr: 0,
        tr: dotRadius(p),
        o: 1,
        to: 1,
        wait: 0,
        k: soft.stiffness,
        c: soft.damping,
        dist: p.dist,
        lit: p.lit,
        dead: false,
      };
      return d;
    }
    function axisPoint(x, y) {
      return { x: x, y: y, vx: 0, vy: 0, tx: x, ty: y };
    }
    function buildAxes(m) {
      if (!axesEl) return;
      var ox = m.origin[0];
      var oy = m.origin[1];
      if (!axes) {
        axes = {
          o: axisPoint(ox, oy),
          p1: axisPoint(ox + m.b1[0], oy + m.b1[1]),
          p2: axisPoint(ox + m.b2[0], oy + m.b2[1]),
          l1: mk("line", { class: "glyph__axis" }, axesEl),
          l2: mk("line", { class: "glyph__axis" }, axesEl),
          h1: mk("polygon", { class: "glyph__axis-head" }, axesEl),
          h2: mk("polygon", { class: "glyph__axis-head" }, axesEl),
          t1: mk("text", { class: "glyph__label" }, axesEl),
          t2: mk("text", { class: "glyph__label" }, axesEl),
        };
        axes.t1.textContent = "b₁";
        axes.t2.textContent = "b₂";
      } else {
        axes.o.tx = ox;
        axes.o.ty = oy;
        axes.p1.tx = ox + m.b1[0];
        axes.p1.ty = oy + m.b1[1];
        axes.p2.tx = ox + m.b2[0];
        axes.p2.ty = oy + m.b2[1];
      }
    }
    // dots at rest, nothing moving: the first build, ?static, reduced motion
    function build(m, scatter) {
      dots.forEach(function (d) {
        d.el.remove();
      });
      dots = m.pts.map(newDot);
      lit = m.walk.map(function (i) {
        return dots[i];
      });
      buildAxes(m);
      self.model = m;
      if (scatter) {
        dots.forEach(function (d) {
          // each point starts a little way out from the centre and turned, and settles in
          var len = d.dist || 1;
          var ux = d.dist ? d.rx / len : Math.cos(len);
          var uy = d.dist ? d.ry / len : Math.sin(len);
          var out = 6 + Math.random() * 8;
          var side = (Math.random() - 0.5) * 7;
          d.x = d.rx + ux * out - uy * side;
          d.y = d.ry + uy * out + ux * side;
          d.o = 0;
          d.r = d.tr * 0.4;
        });
        end.r = 0;
        end.tr = 0;
        walkEl.style.strokeDashoffset = "1";
        if (axesEl) axesEl.style.opacity = "0";
      } else {
        end.r = end.tr = ringSize();
        walkEl.style.strokeDashoffset = "0";
      }
      render();
    }
    function ringSize() {
      return lit.length ? K.ring : 0;
    }

    function render() {
      for (var i = 0; i < dots.length; i++) {
        var d = dots[i];
        d.el.setAttribute("cx", f2(d.x));
        d.el.setAttribute("cy", f2(d.y));
        d.el.setAttribute("r", f2(Math.max(0, d.r)));
        d.el.setAttribute("opacity", f2(d.o));
      }
      var pts = "";
      for (var k = 0; k < lit.length; k++) pts += (k ? " " : "") + f2(lit[k].x) + "," + f2(lit[k].y);
      walkEl.setAttribute("points", pts);
      var last = lit[lit.length - 1];
      if (last) {
        endEl.setAttribute("cx", f2(last.x));
        endEl.setAttribute("cy", f2(last.y));
      }
      endEl.setAttribute("r", f2(Math.max(0, end.r)));
      if (axes) {
        arrow(axes.l1, axes.h1, axes.t1, axes.o, axes.p1, 1);
        arrow(axes.l2, axes.h2, axes.t2, axes.o, axes.p2, -1);
      }
    }
    function arrow(line, head, label, a, b, side) {
      var dx = b.x - a.x;
      var dy = b.y - a.y;
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      var ux = dx / len;
      var uy = dy / len;
      var hx = b.x - ux * 2.4;
      var hy = b.y - uy * 2.4;
      line.setAttribute("x1", f2(a.x));
      line.setAttribute("y1", f2(a.y));
      line.setAttribute("x2", f2(hx));
      line.setAttribute("y2", f2(hy));
      head.setAttribute("points", f2(b.x) + "," + f2(b.y) + " " + f2(hx - uy * 1.1) + "," + f2(hy + ux * 1.1) + " " + f2(hx + uy * 1.1) + "," + f2(hy - ux * 1.1));
      // the label sits beside the tip, on the outer side
      label.setAttribute("x", f2(b.x + ux * 1.6 + uy * 2.6 * side - 1.4));
      label.setAttribute("y", f2(b.y + uy * 1.6 - ux * 2.6 * side + 1.3));
    }

    function target(d, now) {
      var tx = d.rx;
      var ty = d.ry;
      if (pointer) {
        var dx = d.rx - pointer.x;
        var dy = d.ry - pointer.y;
        var dd = Math.sqrt(dx * dx + dy * dy) || 1;
        var h = K.push * Math.exp(-(dd * dd) / (2 * K.sigma * K.sigma));
        tx += (dx / dd) * h;
        ty += (dy / dd) * h;
      }
      for (var i = 0; i < waves.length; i++) {
        var wv = waves[i];
        var age = (now - wv.t) / 1000;
        var wx = d.rx - wv.x;
        var wy = d.ry - wv.y;
        var wd = Math.sqrt(wx * wx + wy * wy) || 1;
        var ring = wd - age * WAVE.speed;
        var amp = WAVE.amp * Math.exp(-age / WAVE.decay) * Math.exp(-(ring * ring) / (2 * WAVE.width * WAVE.width));
        tx += (wx / wd) * amp;
        ty += (wy / wd) * amp;
      }
      tmp.x = tx;
      tmp.y = ty;
      return tmp;
    }
    var tmp = { x: 0, y: 0 };

    self.step = function (dt, now) {
      var busy = false;
      if (waves.length) {
        waves = waves.filter(function (wv) {
          return (now - wv.t) / 1000 < WAVE.life;
        });
        if (waves.length) busy = true;
      }
      for (var i = dots.length - 1; i >= 0; i--) {
        var d = dots[i];
        if (d.wait > 0) {
          d.wait -= dt;
          busy = true;
          continue;
        }
        var t = target(d, now);
        var still = spring(d, "x", "vx", t.x, d.k, d.c, dt);
        still = spring(d, "y", "vy", t.y, d.k, d.c, dt) && still;
        still = spring(d, "r", "vr", d.tr, d.k, d.c, dt) && still;
        if (d.o !== d.to) {
          d.o = d.o < d.to ? Math.min(d.to, d.o + dt / fade) : Math.max(d.to, d.o - dt / fade);
          still = false;
        }
        if (d.dead && d.o <= 0) {
          d.el.remove();
          dots.splice(i, 1);
          continue;
        }
        if (!still) busy = true;
      }
      if (end.wait > 0) {
        end.wait -= dt;
        busy = true;
      } else if (!spring(end, "r", "vr", end.tr, end.k, end.c, dt)) busy = true;
      if (axes) {
        ["o", "p1", "p2"].forEach(function (key) {
          var p = axes[key];
          var a = spring(p, "x", "vx", p.tx, soft.stiffness, soft.damping, dt);
          if (!(spring(p, "y", "vy", p.ty, soft.stiffness, soft.damping, dt) && a)) busy = true;
        });
      }
      render();
      return busy;
    };

    function drawWalk(delay, duration) {
      if (walkAnim) walkAnim.cancel();
      walkEl.style.strokeDashoffset = "0";
      walkEl.style.opacity = "";
      if (!walkEl.animate) return;
      walkAnim = walkEl.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], {
        duration: duration || arrive.duration,
        easing: drawEase,
        delay: Math.max(0, delay * 1000),
        fill: "backwards",
      });
    }
    function hideWalk() {
      if (!walkEl.animate) return;
      var from = getComputedStyle(walkEl).opacity;
      if (walkAnim) walkAnim.cancel();
      walkEl.style.opacity = "0";
      walkAnim = walkEl.animate([{ opacity: from }, { opacity: 0 }], { duration: swap.duration, easing: swap.easing });
    }

    self.play = function (delay) {
      if (played) return;
      played = true;
      var s = (delay || 0) / 1000;
      if (env.static) return;
      if (env.reduce) {
        // nothing moves: the mark clears from a light blur where it stands
        svg.style.opacity = "";
        if (svg.animate) svg.animate([{ opacity: 0, filter: "blur(" + T.blur.icon + "px)" }, { opacity: 1, filter: "blur(0px)" }], { duration: Site.css("transition.reveal").duration, easing: Site.css("transition.reveal").easing, delay: delay || 0, fill: "backwards" });
        return;
      }
      dots.forEach(function (d) {
        d.wait = s + (d.dist / K.field) * 0.26;
        d.to = 1;
        d.k = enter.stiffness;
        d.c = enter.damping;
      });
      var walkAt = s + 0.3;
      drawWalk(walkAt);
      end.wait = walkAt + (arrive.duration / 1000) * 0.85;
      end.tr = ringSize();
      if (axesEl && axesEl.animate) {
        axesEl.style.opacity = "";
        axesEl.animate([{ opacity: 0 }, { opacity: 1 }], { duration: arrive.duration, easing: arrive.easing, delay: (walkAt + 0.2) * 1000, fill: "backwards" });
      }
      // once settled, the points answer the pointer on the quicker spring
      setTimeout(function () {
        dots.forEach(function (d) {
          d.k = soft.stiffness;
          d.c = soft.damping;
        });
      }, (s + 1.4) * 1000);
      wake(self);
    };

    self.set = function (next) {
      var m = model(next, kind);
      if (self.model && m.key === self.model.key) return;
      if (!played || env.static) {
        build(m, !played && !env.static && !env.reduce);
      } else if (env.reduce) {
        build(m, false);
        if (svg.animate) svg.animate([{ opacity: 0.2, filter: "blur(" + T.blur.icon + "px)" }, { opacity: 1, filter: "blur(0px)" }], { duration: swap.duration, easing: swap.easing });
      } else {
        morph(m);
      }
      el.dispatchEvent(new CustomEvent("kit:glyph-change", { bubbles: true, detail: { model: m } }));
    };

    // the points that stay glide to their new places; the others fade where they are or come in where they will be
    function morph(m) {
      var live = dots.filter(function (d) {
        return !d.dead;
      });
      var used = [];
      var order = m.pts
        .map(function (p, i) {
          return i;
        })
        .sort(function (a, b) {
          return m.pts[a].dist - m.pts[b].dist;
        });
      var next = new Array(m.pts.length);
      var reach = K.cell * 1.4;
      order.forEach(function (i) {
        var p = m.pts[i];
        var best = -1;
        var bestD = reach * reach;
        for (var k = 0; k < live.length; k++) {
          if (used[k]) continue;
          var dx = live[k].rx - p.x;
          var dy = live[k].ry - p.y;
          var dd = dx * dx + dy * dy;
          if (dd < bestD) {
            bestD = dd;
            best = k;
          }
        }
        var d;
        if (best >= 0) {
          used[best] = true;
          d = live[best];
          d.rx = p.x;
          d.ry = p.y;
        } else {
          d = newDot(p);
          d.o = 0;
          d.r = 0;
          d.wait = 0.06;
          dots.push(d);
        }
        d.tr = dotRadius(p);
        d.dist = p.dist;
        d.lit = p.lit;
        d.k = soft.stiffness;
        d.c = soft.damping;
        d.to = 1;
        d.el.setAttribute("class", "glyph__dot" + (p.lit ? "" : " is-faint"));
        next[i] = d;
      });
      live.forEach(function (d, k) {
        if (used[k]) return;
        d.dead = true;
        d.to = 0;
        d.tr = 0;
      });
      lit = m.walk.map(function (i) {
        return next[i];
      });
      buildAxes(m);
      self.model = m;
      // the walk goes at once and draws again when the typing pauses
      hideWalk();
      end.tr = 0;
      end.wait = 0;
      end.k = soft.stiffness;
      end.c = soft.damping;
      clearTimeout(redraw);
      redraw = setTimeout(function () {
        drawWalk(0);
        end.wait = (arrive.duration / 1000) * 0.85;
        end.tr = ringSize();
        end.k = pop.stiffness;
        end.c = pop.damping;
        wake(self);
      }, 240);
      wake(self);
    }

    // the mark re-forms: its points step out a little and settle back on the entrance spring, a beat after the
    // card around it has answered; the walk draws again and its end ring pops. At most once per REFORM.every.
    var lastReform = 0;
    var settleTimer = null;
    self.reform = function () {
      if (!played || env.static || env.reduce || !self.model) return;
      var now = performance.now();
      if (now - lastReform < REFORM.every * 1000) return;
      lastReform = now;
      dots.forEach(function (d) {
        if (d.dead) return;
        var len = d.dist || 1;
        var ux = d.dist ? d.rx / len : 0;
        var uy = d.dist ? d.ry / len : 0;
        var side = (Math.random() - 0.5) * REFORM.jitter;
        var out = REFORM.out * (0.6 + Math.random() * 0.8);
        d.x = d.rx + ux * out - uy * side;
        d.y = d.ry + uy * out + ux * side;
        d.vx = d.vy = 0;
        d.r = d.tr * 0.55;
        d.wait = REFORM.wait + (d.dist / K.field) * REFORM.spread;
        d.k = enter.stiffness;
        d.c = enter.damping;
      });
      var draw = arrive.duration * REFORM.draw;
      drawWalk(REFORM.wait + 0.08, draw);
      end.r = 0;
      end.vr = 0;
      end.k = pop.stiffness;
      end.c = pop.damping;
      end.wait = REFORM.wait + 0.08 + (draw / 1000) * 0.85;
      end.tr = ringSize();
      clearTimeout(settleTimer);
      settleTimer = setTimeout(function () {
        dots.forEach(function (d) {
          d.k = soft.stiffness;
          d.c = soft.damping;
        });
      }, 1100);
      wake(self);
    };

    // under the pointer: a ripple from where it came in (a student's card: the mark re-forms instead), then the
    // points near it give way
    var host = el.closest("[data-glyph-host], .person, .alum") || el;
    var reformsOnEnter = kind === "tile" && !!el.closest(".person");
    function local(e) {
      var r = svg.getBoundingClientRect();
      if (!r.width) return null;
      return { x: ((e.clientX - r.left) / r.width) * 72 - 36, y: ((e.clientY - r.top) / r.height) * 72 - 36 };
    }
    function onEnter(e) {
      if (e.pointerType === "touch" || !played || env.reduce || !env.hover) return;
      var p = local(e);
      if (!p) return;
      if (reformsOnEnter) {
        self.reform();
        pointer = p;
        return;
      }
      var len = Math.sqrt(p.x * p.x + p.y * p.y) || 1;
      var rim = Math.min(len, 40);
      waves.push({ x: (p.x / len) * rim, y: (p.y / len) * rim, t: performance.now() });
      if (waves.length > 3) waves.shift();
      pointer = p;
      wake(self);
    }
    function onMove(e) {
      if (e.pointerType === "touch" || !played || env.reduce || !env.hover) return;
      pointer = local(e);
      wake(self);
    }
    function onLeave() {
      if (!pointer) return;
      pointer = null;
      wake(self);
    }
    function onFocus(e) {
      if (e.target === host && reformsOnEnter && host.matches(":focus-visible")) self.reform();
    }
    host.addEventListener("pointerenter", onEnter);
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    host.addEventListener("focus", onFocus);

    // first state, then wait for the trigger
    var trigger = o.trigger || (el.closest("[data-reveal-item], [data-kit~='reveal']") ? "reveal" : "view");
    var delay = Number(o.delay) || 0;
    if (env.static) {
      played = true;
      build(model(name, kind), false);
    } else {
      build(model(name, kind), !env.reduce);
      if (env.reduce) svg.style.opacity = "0";
      if (trigger === "load") {
        setTimeout(function () {
          self.play(0);
        }, delay);
      } else if (trigger !== "manual") {
        var item = trigger === "reveal" ? el.closest("[data-reveal-item], [data-kit~='reveal']") : null;
        if (item) {
          item.addEventListener("kit:reveal", function (e) {
            if (e.target === item) self.play(((e.detail && e.detail.delay) || 0) + delay + 60);
          });
        }
        whenSeen(el, function () {
          if (item) {
            // the row's entrance normally says when; if it never does, play anyway
            setTimeout(function () {
              self.play(delay);
            }, 400);
          } else self.play(delay);
        });
      }
    }

    self.destroy = function () {
      clearTimeout(redraw);
      clearTimeout(settleTimer);
      host.removeEventListener("focus", onFocus);
      host.removeEventListener("pointerenter", onEnter);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      var i = active.indexOf(self);
      if (i > -1) active.splice(i, 1);
      svg.remove();
      el.classList.remove("is-drawn");
    };
    return self;
  }

  Site.register("glyph", function (el, opts) {
    return createGlyph(el, opts);
  });

  /* =============================================== the name-to-mark view
     The button at the end of the head's students row opens #gtoy (kit expand): the large mark and a field. The mark
     settles in the first time the view has landed; typing morphs it; the field keeps its name between openings. */
  function initToy(trigger) {
    var sel = trigger.getAttribute("data-expand");
    var view = sel && document.querySelector(sel);
    if (!view) return;
    var glyph = view.querySelector("[data-kit~='glyph']");
    var input = view.querySelector("[data-glyph-input]");
    var c = glyph && Site.get(glyph, "glyph");
    if (!c || !input) return;
    var first = true;
    trigger.addEventListener("kit:expand-opened", function () {
      if (first) {
        first = false;
        c.play(0);
      }
      input.focus({ preventScroll: true });
    });
    input.addEventListener("input", function () {
      c.set(input.value.trim());
    });
  }

  /* ================================================================ the head
     Two rows of marks (students, alumni). Under the pointer a row swells: each mark grows and lifts by how close the
     pointer is to it (a gaussian over the row), every mark on its own spring (spring.pop), written as CSS scale and
     translate on the list item, so the link's own press and magnetic stay free. A mark is a link to its person: the
     page glides there and the person lights up for a moment. Hovering a row, or the count under the rule, lets the
     other row recede. */
  var SWELL = { now: 0.26, past: 0.42, sigma: 1.15, lift: 0.3 };
  function initBand(band) {
    var rows = all(band, "[data-band-row]");
    var stats = all(document, "[data-band-for]");
    function focusRow(key) {
      if (key) band.setAttribute("data-focus", key);
      else band.removeAttribute("data-focus");
    }
    rows.forEach(function (row) {
      var key = row.getAttribute("data-band-row");
      row.addEventListener("pointerenter", function (e) {
        if (e.pointerType !== "touch") focusRow(key);
      });
      row.addEventListener("pointerleave", function () {
        focusRow(null);
      });
      if (env.hover && !env.reduce && !env.static) swell(row, SWELL[key] || SWELL.now);
    });
    stats.forEach(function (st) {
      var key = st.getAttribute("data-band-for");
      st.addEventListener("pointerenter", function (e) {
        if (e.pointerType !== "touch") focusRow(key);
      });
      st.addEventListener("pointerleave", function () {
        focusRow(null);
      });
    });
    all(band, "a.gband__m").forEach(function (a) {
      a.addEventListener("click", function (e) {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        var id = (a.getAttribute("href") || "").slice(1);
        var target = id && document.getElementById(id);
        if (!target) return;
        e.preventDefault();
        goTo(target);
        if (history.replaceState) history.replaceState(null, "", "#" + id);
      });
    });
  }

  function swell(row, amp) {
    var items = all(row, ":scope > li").map(function (li) {
      return { el: li, s: 1, v: 0, t: 1, cx: 0, w: 0 };
    });
    var sp = Site.t("spring.pop");
    var px = null;
    var loop = null;
    function measure() {
      items.forEach(function (it) {
        var r = it.el.getBoundingClientRect();
        // the box without the swell's own scale
        it.w = r.width / (it.s || 1);
        it.cx = r.left + r.width / 2;
      });
    }
    function aim() {
      items.forEach(function (it) {
        if (px === null) {
          it.t = 1;
          return;
        }
        var sigma = it.w * SWELL.sigma * 1.2;
        var dx = px - it.cx;
        it.t = 1 + amp * Math.exp(-(dx * dx) / (2 * sigma * sigma));
      });
    }
    function tick(time, delta) {
      var dt = Math.min(delta, 48) / 1000;
      var busy = false;
      items.forEach(function (it) {
        if (!spring(it, "s", "v", it.t, sp.stiffness, sp.damping, dt)) busy = true;
        if (Math.abs(it.s - 1) < 0.001 && it.t === 1) {
          it.el.style.scale = "";
          it.el.style.translate = "";
          return;
        }
        it.el.style.scale = it.s.toFixed(4);
        it.el.style.translate = "0 " + (-(it.s - 1) * it.w * SWELL.lift).toFixed(2) + "px";
      });
      if (!busy) loop.stop();
    }
    function wakeRow() {
      if (!loop) loop = util.loop(tick);
      loop.start();
    }
    row.addEventListener("pointerenter", function (e) {
      if (e.pointerType === "touch") return;
      measure();
      px = e.clientX;
      aim();
      wakeRow();
    });
    row.addEventListener("pointermove", function (e) {
      if (e.pointerType === "touch") return;
      px = e.clientX;
      aim();
      wakeRow();
    });
    row.addEventListener("pointerleave", function () {
      px = null;
      aim();
      wakeRow();
    });
  }

  // glide the page to a person and light them for a moment (a student's card fills, an alumni row takes the surface)
  var landTimer = null;
  function goTo(target) {
    var card = target.classList.contains("person") ? target : null;
    if (card && card.hidden) {
      var all0 = document.querySelector("[data-filter] .chip[data-degree='']");
      if (all0) all0.click();
    }
    var r = target.getBoundingClientRect();
    var nav = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--nav-h")) || 64;
    var top = window.scrollY + r.top - Math.max((window.innerHeight - r.height) / 2, nav + 24);
    window.scrollTo({ top: Math.max(0, top), behavior: env.reduce || env.static ? "auto" : "smooth" });
    whenStill(function () {
      land(target);
    });
  }
  function whenStill(fn) {
    var t = null;
    var done = false;
    function fin() {
      if (done) return;
      done = true;
      window.removeEventListener("scroll", onScroll);
      fn();
    }
    function onScroll() {
      clearTimeout(t);
      t = setTimeout(fin, 140);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    t = setTimeout(fin, 220);
  }
  function land(target) {
    clearTimeout(landTimer);
    if (target.classList.contains("person")) {
      var fill = Site.get(target, "hover-fill");
      var g = target.querySelector("[data-kit~='glyph']");
      var gc = g && Site.get(g, "glyph");
      target.classList.add("is-landed");
      if (fill) fill.set(true);
      if (gc) gc.reform();
      landTimer = setTimeout(function () {
        target.classList.remove("is-landed");
        if (fill && !target.matches(":hover")) fill.set(false);
      }, 1600);
    } else {
      var list = target.closest("[data-alumni]");
      var hl = list && Site.get(list, "highlight");
      if (hl && env.hover) hl.moveTo(target);
      landTimer = setTimeout(function () {
        if (hl && env.hover && !target.matches(":hover")) hl.moveTo(null);
      }, 1600);
    }
  }

  /* ======================================================= students filter */
  function initFilter(group) {
    var list = document.querySelector("[data-people]");
    if (!list) return;
    var chips = all(group, ".chip");
    var items = all(list, ".person");
    var empty = document.querySelector("[data-people-empty]");
    chips.forEach(function (chip) {
      chip.addEventListener("click", function () {
        if (chip.getAttribute("aria-pressed") === "true") return;
        chips.forEach(function (c) {
          c.setAttribute("aria-pressed", c === chip ? "true" : "false");
        });
        var degree = chip.getAttribute("data-degree") || "";
        var shown = 0;
        Site.flip(
          list,
          function () {
            items.forEach(function (it) {
              var on = !degree || it.getAttribute("data-degree") === degree;
              it.hidden = !on;
              if (on) shown++;
            });
            if (empty) empty.hidden = shown > 0;
          },
          { items: ".person" },
        );
        Site.announce(shown + (shown === 1 ? " student" : " students") + (degree ? ", " + degree : "") + " shown");
      });
    });
  }

  /* ========================================================= alumni order */
  var DEGREE_ORDER = { PhD: 0, MSc: 1, Master: 1 };
  function initAlumni(head) {
    var list = document.querySelector("[data-alumni]");
    if (!list) return;
    var buttons = all(head, ".alumni__sort");
    var rows = all(list, ".alum");
    var cur = { key: "year", dir: 1 };
    function year(row) {
      var y = parseInt(row.getAttribute("data-year"), 10);
      return isNaN(y) ? null : y;
    }
    function text(row, attr) {
      return (row.getAttribute(attr) || "").toLowerCase();
    }
    function compare(key, dir) {
      return function (a, b) {
        var ia = Number(a.getAttribute("data-i"));
        var ib = Number(b.getAttribute("data-i"));
        var v = 0;
        if (key === "year") {
          var ya = year(a);
          var yb = year(b);
          // people without a year stay at the end, in the order of the data, either way round
          if (ya === null || yb === null) return ya === yb ? ia - ib : ya === null ? 1 : -1;
          v = ya - yb;
        } else if (key === "degree") {
          var da = DEGREE_ORDER[a.getAttribute("data-degree")];
          var db = DEGREE_ORDER[b.getAttribute("data-degree")];
          da = da === undefined ? 9 : da;
          db = db === undefined ? 9 : db;
          if (da === 9 || db === 9) return da === db ? ia - ib : da === 9 ? 1 : -1;
          v = da - db;
        } else {
          v = text(a, "data-" + key).localeCompare(text(b, "data-" + key));
        }
        return v ? v * dir : ia - ib;
      };
    }
    buttons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var key = btn.getAttribute("data-sort");
        var dir = key === cur.key ? -cur.dir : 1;
        cur = { key: key, dir: dir };
        buttons.forEach(function (b) {
          b.setAttribute("aria-pressed", b === btn ? "true" : "false");
          if (b === btn && dir < 0) b.setAttribute("data-desc", "");
          else b.removeAttribute("data-desc");
        });
        var sorted = rows.slice().sort(compare(key, dir));
        var surfaces = all(list, ":scope > .k-highlight__surface");
        Site.flip(
          list,
          function () {
            sorted.forEach(function (r) {
              list.appendChild(r);
            });
            surfaces.forEach(function (s) {
              list.appendChild(s);
            });
          },
          { items: ".alum" },
        );
        Site.announce("Alumni ordered by " + btn.textContent.trim().toLowerCase() + (dir < 0 ? ", reversed" : ""));
      });
    });
  }

  Site.ready(function () {
    var band = document.querySelector("[data-band]");
    if (band) initBand(band);
    all(document, "[data-expand='#gtoy']").forEach(initToy);
    var filter = document.querySelector("[data-filter]");
    if (filter) initFilter(filter);
    var sort = document.querySelector("[data-alumni-sort]");
    if (sort) initAlumni(sort);
  });
})();
