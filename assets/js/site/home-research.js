/*
 * Home page, research block: the area cards circle a small 3D lattice and settle into a grid as the page scrolls
 * (after the "every primitive, alive" piece on animate-ui.com); a plain list where the scene does not run.
 * Everything here is an enhancement: without this file the block is a complete, static list.
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
      var s = Math.min(1.25, root.clientWidth / ORBIT.stage.w, (window.innerHeight - 40) / ORBIT.stage.h);
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

  /* ================================================================== start */
  Site.ready(function () {
    var orbit = document.querySelector("[data-orbit]");
    if (orbit) initOrbit(orbit);
  });
})();
