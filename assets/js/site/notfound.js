/*
 * 404 page: a small lattice that answers the pointer.
 * The pointer is the target, a point that is not on the lattice; the lattice point closest to it is ringed, joined to it
 * by the short error vector, and its cell (the points of the plane that round to it) is outlined, gliding from cell to
 * cell as the target moves. The drawing is annotated as a geometry figure would be: the closest point's coordinates
 * beside its ring, the error's length (in basis lengths) along the vector. A click, or Enter on the focused plate, puts
 * the target on the lattice. The arrow keys move it. Without the pointer the target drifts slowly. Colours come from the tokens; the loop runs only while the plate can
 * be seen, and not at all under reduced motion (the figure then answers the pointer directly).
 * Also: the address that was asked for is shown in the row under the rule.
 */
(function () {
  "use strict";

  var Site = window.Site;
  if (!Site) return;
  var util = Site.util;
  var root = document.documentElement;
  var MINUS = "−";

  function cssVar(name, fallback) {
    return getComputedStyle(root).getPropertyValue(name).trim() || fallback;
  }
  function signed(n) {
    return n < 0 ? MINUS + Math.abs(n) : String(n);
  }

  /* clip a convex polygon by the half-plane { p : p . v <= c } */
  function clip(poly, vx, vy, c) {
    var out = [];
    for (var i = 0; i < poly.length; i++) {
      var a = poly[i];
      var b = poly[(i + 1) % poly.length];
      var da = a[0] * vx + a[1] * vy - c;
      var db = b[0] * vx + b[1] * vy - c;
      if (da <= 0) out.push(a);
      if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
        var t = da / (da - db);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    return out;
  }
  /* the Voronoi cell of a 2D lattice point, around the origin */
  function cellOf(b1, b2) {
    var r = 4 * Math.max(Math.hypot(b1[0], b1[1]), Math.hypot(b2[0], b2[1]));
    var poly = [
      [-r, -r],
      [r, -r],
      [r, r],
      [-r, r],
    ];
    var vs = [b1, b2, [b1[0] + b2[0], b1[1] + b2[1]], [b1[0] - b2[0], b1[1] - b2[1]]];
    vs.forEach(function (v) {
      var c = (v[0] * v[0] + v[1] * v[1]) / 2;
      poly = clip(poly, v[0], v[1], c);
      poly = clip(poly, -v[0], -v[1], c);
    });
    return poly;
  }

  function initLattice(fig) {
    var plate = fig.querySelector("[data-nf-plate]");
    var canvas = fig.querySelector("[data-nf-canvas]");
    var ctx = canvas && canvas.getContext ? canvas.getContext("2d") : null;
    if (!ctx) return;
    var live = fig.querySelector("[data-nf-live]");
    var colors = {};
    var w = 0;
    var h = 0;
    var mode = "drift"; // drift | pointer | key | snap
    var target = { x: 0, y: 0 }; // where the target is asked to be (pointer, keys)
    var cur = { x: null, y: null }; // where it is drawn (follows the target)
    var cell = { x: null, y: null }; // where the outlined cell is drawn (follows the closest point)
    var snapAt = null; // pointer position at a click: moving away from it lets go of the lattice
    var pulses = [];
    var shownAt = null; // the figure appears from its middle outwards
    var lastFrame = 0;
    var visible = false;

    function readColors() {
      colors.ink = cssVar("--ink", "#2b2d33");
      colors.ink2 = cssVar("--ink-2", "#4b4e56");
      colors.line = cssVar("--line-strong", "rgba(43,45,51,.24)");
      colors.accent = cssVar("--accent", "#2f5d54");
      colors.wash = cssVar("--accent-wash", "rgba(47,93,84,.05)");
      colors.surface = cssVar("--surface", "#fbfaf7");
      colors.mono = cssVar("--font-mono", "monospace");
    }
    function resize() {
      var r = canvas.getBoundingClientRect();
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width;
      h = r.height;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paint(performance.now());
    }
    function geometry(time) {
      var s = util.clamp(w / 10.5, 30, 48);
      var a = -0.16 + (Site.env.reduce ? 0 : 0.05 * Math.sin(time * 0.00012));
      var c = Math.cos(a);
      var n = Math.sin(a);
      var v2 = [0.36 * s, -0.95 * s];
      return {
        s: s,
        ox: w / 2,
        oy: h / 2,
        b1: [s * c, s * n],
        b2: [v2[0] * c - v2[1] * n, v2[0] * n + v2[1] * c],
      };
    }
    function drift(time, g) {
      if (Site.env.reduce) return { x: g.ox + 0.43 * g.s, y: g.oy - 0.31 * g.s };
      return { x: g.ox + Math.cos(time * 0.00023) * g.s * 1.7, y: g.oy + Math.sin(time * 0.00031) * g.s * 1.05 };
    }
    function closest(g, x, y) {
      var b1 = g.b1;
      var b2 = g.b2;
      var det = b1[0] * b2[1] - b1[1] * b2[0];
      var u = ((x - g.ox) * b2[1] - (y - g.oy) * b2[0]) / det;
      var v = (b1[0] * (y - g.oy) - b1[1] * (x - g.ox)) / det;
      var best = null;
      var bestD = Infinity;
      for (var di = -2; di <= 2; di++) {
        for (var dj = -2; dj <= 2; dj++) {
          var i = Math.round(u) + di;
          var j = Math.round(v) + dj;
          var px = g.ox + i * b1[0] + j * b2[0];
          var py = g.oy + i * b1[1] + j * b2[1];
          var d = (px - x) * (px - x) + (py - y) * (py - y);
          if (d < bestD) {
            bestD = d;
            best = { i: i, j: j, x: px, y: py, d: Math.sqrt(d) };
          }
        }
      }
      return best;
    }

    /* a small label on a chip of the plate's own surface (so the points behind it do not cut it), set off from (x, y) in the
       direction dx (left of it when dx < 0), kept inside the plate */
    function label(text, x, y, dx, color, size) {
      ctx.font = size + "px " + colors.mono;
      var tw = ctx.measureText(text).width;
      var left = dx < -0.2 ? x - tw : dx > 0.2 ? x : x - tw / 2;
      left = Math.round(util.clamp(left, 5, w - tw - 5));
      var top = Math.round(util.clamp(y, size, h - size));
      var a = ctx.globalAlpha;
      ctx.globalAlpha = a * 0.92;
      ctx.fillStyle = colors.surface;
      ctx.fillRect(left - 3, top - size * 0.72, tw + 6, size * 1.44);
      ctx.globalAlpha = a;
      ctx.fillStyle = color;
      ctx.textAlign = "left";
      ctx.fillText(text, left, top + 0.5);
    }

    function paint(time) {
      if (!w || !h) return;
      var g = geometry(time);
      var reduce = Site.env.reduce;
      var follow = reduce ? 1 : 0.2;

      // where the target is asked to be
      var t;
      if (mode === "drift") t = drift(time, g);
      else if (mode === "snap") {
        var p = closest(g, target.x, target.y);
        target.x = p.x;
        target.y = p.y;
        t = target;
      } else t = target;
      if (cur.x === null) {
        cur.x = t.x;
        cur.y = t.y;
      }
      cur.x += (t.x - cur.x) * follow;
      cur.y += (t.y - cur.y) * follow;
      var best = closest(g, cur.x, cur.y);
      if (cell.x === null) {
        cell.x = best.x;
        cell.y = best.y;
      }
      cell.x += (best.x - cell.x) * (reduce ? 1 : 0.24);
      cell.y += (best.y - cell.y) * (reduce ? 1 : 0.24);

      var shown = reduce || shownAt === null ? 1 : util.clamp((time - shownAt) / 1400, 0, 1);
      var reach = Math.hypot(w, h) / 2;
      var sigma = g.s * 1.6;

      ctx.clearRect(0, 0, w, h);

      // the cell of the closest point: every point of the plane inside it rounds to that lattice point
      var poly = cellOf(g.b1, g.b2);
      var cellIn = util.smooth(util.clamp(shown * 1.6 - 0.5, 0, 1));
      if (cellIn > 0) {
        ctx.globalAlpha = cellIn;
        ctx.beginPath();
        poly.forEach(function (q, k) {
          if (k === 0) ctx.moveTo(cell.x + q[0], cell.y + q[1]);
          else ctx.lineTo(cell.x + q[0], cell.y + q[1]);
        });
        ctx.closePath();
        ctx.fillStyle = colors.wash;
        ctx.fill();
        ctx.strokeStyle = colors.line;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // the lattice
      var span = Math.ceil(Math.hypot(w, h) / g.s) + 2;
      ctx.fillStyle = colors.ink;
      for (var i = -span; i <= span; i++) {
        for (var j = -span; j <= span; j++) {
          var x = g.ox + i * g.b1[0] + j * g.b2[0];
          var y = g.oy + i * g.b1[1] + j * g.b2[1];
          if (x < -8 || x > w + 8 || y < -8 || y > h + 8) continue;
          var far = Math.hypot(x - g.ox, y - g.oy) / reach;
          var appear = util.smooth(util.clamp(shown * 2 - far * 1.2, 0, 1));
          if (appear <= 0) continue;
          var near = Math.exp(-((x - cur.x) * (x - cur.x) + (y - cur.y) * (y - cur.y)) / (2 * sigma * sigma));
          ctx.globalAlpha = (0.34 + 0.5 * near) * appear;
          ctx.beginPath();
          ctx.arc(x, y, 1.3 + 1.1 * near, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (cellIn > 0) {
        ctx.globalAlpha = cellIn;
        // the error vector, the closest point ringed
        ctx.strokeStyle = colors.accent;
        ctx.fillStyle = colors.accent;
        ctx.lineWidth = 1.25;
        if (best.d > 1.5) {
          ctx.beginPath();
          ctx.moveTo(cur.x, cur.y);
          ctx.lineTo(best.x, best.y);
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(best.x, best.y, 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(best.x, best.y, 2.6, 0, Math.PI * 2);
        ctx.fill();

        // the target: a mark that sits between the points
        ctx.strokeStyle = colors.ink;
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.moveTo(cur.x - 5, cur.y);
        ctx.lineTo(cur.x + 5, cur.y);
        ctx.moveTo(cur.x, cur.y - 5);
        ctx.lineTo(cur.x, cur.y + 5);
        ctx.stroke();

        // rings sent out when the target lands on the lattice
        pulses = pulses.filter(function (pl) {
          return time - pl.t < 700;
        });
        pulses.forEach(function (pl) {
          var k = (time - pl.t) / 700;
          ctx.globalAlpha = (1 - k) * 0.8 * cellIn;
          ctx.strokeStyle = colors.accent;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(pl.x, pl.y, 8 + k * g.s * 0.9, 0, Math.PI * 2);
          ctx.stroke();
        });
      }
      ctx.globalAlpha = 1;

      // the reading, written on the drawing: the closest point's coordinates beside its ring (on the side away from the
      // target, so the vector never crosses it), the error's length in basis lengths along the vector
      var dist = best.d / g.s;
      if (cellIn > 0) {
        var on = dist < 0.005;
        var ux = best.d > 2 ? (best.x - cur.x) / best.d : 0.71;
        var uy = best.d > 2 ? (best.y - cur.y) / best.d : -0.71;
        ctx.globalAlpha = cellIn;
        ctx.textBaseline = "middle";
        label("(" + signed(best.i) + ", " + signed(best.j) + ")", best.x + ux * 17, best.y + uy * 17, ux, on ? colors.accent : colors.ink2, 11);
        if (best.d > 15) {
          // beside the vector's middle, off to one side of it
          label(dist.toFixed(2), (best.x + cur.x) / 2 + uy * 10, (best.y + cur.y) / 2 - ux * 10, uy, colors.accent, 10);
        }
        ctx.globalAlpha = 1;
      }
      fig.classList.toggle("is-on-lattice", dist < 0.005);
    }

    // about 30 frames a second is plenty for something this slow
    var loop = util.loop(function (time) {
      if (time - lastFrame < 32) return;
      lastFrame = time;
      paint(time);
    });
    function refresh() {
      if (visible && !Site.env.reduce && !Site.env.static) loop.start();
      else {
        loop.stop();
        paint(performance.now());
      }
    }
    var once = util.throttle(function () {
      if (!loop.running) paint(performance.now());
    });

    function local(e) {
      var r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    function snap(at) {
      mode = "snap";
      var g = geometry(performance.now());
      var p = closest(g, at.x, at.y);
      target.x = p.x;
      target.y = p.y;
      if (!Site.env.reduce) pulses.push({ x: p.x, y: p.y, t: performance.now() });
      if (live) live.textContent = "On the lattice at (" + signed(p.i) + ", " + signed(p.j) + ").";
      once();
    }
    plate.addEventListener("pointermove", function (e) {
      if (e.pointerType === "touch") return;
      var p = local(e);
      if (mode === "snap" && snapAt && Math.hypot(p.x - snapAt.x, p.y - snapAt.y) < 10) return;
      snapAt = null;
      mode = "pointer";
      target.x = p.x;
      target.y = p.y;
      once();
    });
    plate.addEventListener("pointerleave", function (e) {
      if (e.pointerType === "touch") return;
      if (mode === "pointer") mode = "drift";
      once();
    });
    plate.addEventListener("pointerdown", function (e) {
      var p = local(e);
      if (e.pointerType === "touch") {
        // a tap puts the target there; a tap on the same spot puts it on the lattice
        if (mode === "pointer" && Math.hypot(p.x - target.x, p.y - target.y) < 18) return snap(p);
        mode = "pointer";
        target.x = p.x;
        target.y = p.y;
        return once();
      }
      snapAt = p;
      snap({ x: cur.x === null ? p.x : cur.x, y: cur.y === null ? p.y : cur.y });
    });
    plate.addEventListener("keydown", function (e) {
      var g = geometry(performance.now());
      var step = g.s * 0.22;
      var dx = { ArrowLeft: -1, ArrowRight: 1 }[e.key] || 0;
      var dy = { ArrowUp: -1, ArrowDown: 1 }[e.key] || 0;
      if (dx || dy) {
        e.preventDefault();
        if (mode !== "key") {
          target.x = cur.x === null ? g.ox : cur.x;
          target.y = cur.y === null ? g.oy : cur.y;
        }
        mode = "key";
        target.x = util.clamp(target.x + dx * step * (e.shiftKey ? 3 : 1), 6, w - 6);
        target.y = util.clamp(target.y + dy * step * (e.shiftKey ? 3 : 1), 6, h - 6);
        once();
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        snap({ x: cur.x, y: cur.y });
      } else if (e.key === "Escape" && mode !== "drift") {
        mode = "drift";
        once();
      }
    });

    readColors();
    util.visible(plate, function (on) {
      visible = on;
      refresh();
    });
    Site.on("reduce", refresh);
    Site.on("theme", function () {
      readColors();
      once();
    });
    if (window.ResizeObserver) new ResizeObserver(resize).observe(plate);
    else window.addEventListener("resize", resize);
    resize();

    // the plate follows the page head in: the points spread from the middle once the aside has faded in
    var delay = Site.env.reduce ? 0 : 560;
    setTimeout(function () {
      canvas.classList.add("is-on");
      shownAt = performance.now();
      once();
    }, Site.env.static ? 0 : delay);
  }

  Site.ready(function () {
    var path = document.querySelector("[data-nf-path]");
    if (path) {
      var p = window.location.pathname;
      try {
        p = decodeURI(p);
      } catch (e) {
        /* keep it as it is */
      }
      path.textContent = p;
      path.title = p;
    }
    var fig = document.querySelector(".nf__fig");
    if (fig) initLattice(fig);
  });
})();
