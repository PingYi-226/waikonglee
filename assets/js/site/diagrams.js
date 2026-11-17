/*
 * The "diagram" kit: seven small drawings, one per research area (_includes/site/diagrams/<key>.liquid).
 *
 *   <svg class="diagram diagram--pqc" viewBox="0 0 320 180" data-kit="diagram" data-live="hover" data-trigger="view" ...>
 *   var d = Site.get(svg, "diagram");   d.play()   d.reset()   d.live(true | false)
 *
 * Three states, as classes on the svg (the looks are in diagrams.css):
 *   blank   no class. Only while html.js is present and this script runs, so without JavaScript the drawing shows.
 *   drawn   .is-drawn: the strokes draw in sequence (about 1.2 s), then .dg-done drops the dashes.
 *   live    a slow loop that shows something true of the subject. It is built of beats; each beat ends in a
 *           state the drawing can rest in. data-live="hover": runs while the closest a, button or
 *           [data-diagram-host] is hovered (fine pointers) or has keyboard focus, and finishes its cycle when
 *           left; "always": runs while on screen; "off": never. Nothing runs off screen or in a hidden tab.
 * data-trigger="view" (default) draws once when first seen (and visibly so: an element faded by its
 * ancestors waits); "manual" shows the finished drawing until play() is called.
 * Reduced motion and ?static: the finished drawing (a fade under reduced motion), no loop.
 * Events: "kit:diagram" (bubbles) with detail { state: "drawn" } when the drawing has finished.
 */
(function () {
  "use strict";

  var Site = window.Site;
  if (!Site || !Site.register) return;
  var M = window.Motion;
  var env = Site.env;
  var util = Site.util;
  var root = document.documentElement;
  // the blank state in diagrams.css needs this script: without it the drawings simply show
  root.classList.add("dg-js");

  var VIEW = { w: 320, h: 180 };
  // the drawing's own pacing (seconds, paced by Site.tempo): the sequence spreads over span, each stroke takes dur
  var DRAW = { span: 0.7, dur: 0.5, sub: 0.022 };

  /* ------------------------------------------------------------- easing */
  function bezier(c) {
    return M && M.cubicBezier ? M.cubicBezier(c[0], c[1], c[2], c[3]) : util.smooth;
  }
  var ease = {
    inOut: bezier(Site.tokens.ease.inOut), // moving on screen
    out: bezier(Site.tokens.ease.out), // entering, leaving
    soft: bezier(Site.tokens.ease.soft),
  };
  /** A spring token as an easing of time: { at(p) -> value, ms }. */
  var springs = {};
  function spring(path) {
    if (springs[path]) return springs[path];
    var t = Site.t(path);
    var s = { at: ease.out, ms: 450 };
    if (M && M.createGeneratorEasing && M.spring) {
      try {
        var g = M.createGeneratorEasing(t, 100, M.spring);
        s = { at: g.ease, ms: g.duration * 1000 };
      } catch (e) {
        /* keep the fallback */
      }
    }
    springs[path] = s;
    return s;
  }
  /** Progress of a segment that starts at `from` ms and lasts `ms`, inside a beat at time `now` ms; eased. */
  function seg(now, from, ms, fn) {
    var p = util.clamp((now - from) / ms, 0, 1);
    return fn ? (p >= 1 ? 1 : fn(p)) : p;
  }
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }
  function num(el, name) {
    return parseFloat(el.getAttribute(name)) || 0;
  }
  function move(el, x, y) {
    if (el) el.setAttribute("transform", "translate(" + util.round(x, 2) + " " + util.round(y, 2) + ")");
  }
  function scaleAbout(el, cx, cy, sx, sy) {
    if (!el) return;
    if (sx === 1 && sy === 1) return el.removeAttribute("transform");
    el.setAttribute(
      "transform",
      "translate(" + util.round(cx, 2) + " " + util.round(cy, 2) + ") scale(" + util.round(sx, 4) + " " + util.round(sy, 4) + ") translate(" + util.round(-cx, 2) + " " + util.round(-cy, 2) + ")",
    );
  }
  /** Opacity of a shape the loop alone shows (.dg-x, wrappers): an inline style, above the stylesheet. */
  function show(el, o) {
    if (el) el.style.opacity = String(util.round(util.clamp(o, 0, 1), 3));
  }
  /** Opacity of a shape that also draws itself in: the attribute, so the blank state of the stylesheet still wins. */
  function ink(el, o) {
    if (!el) return;
    if (o >= 1) el.removeAttribute("opacity");
    else el.setAttribute("opacity", String(util.round(Math.max(0, o), 3)));
  }
  function all(svg, name) {
    return Array.prototype.slice.call(svg.querySelectorAll('[data-dg="' + name + '"]'));
  }
  /** A small spring in two dimensions, stepped by the loop (for marks that hop to a moving goal). */
  function Spring2(path, x, y) {
    var t = Site.t(path);
    var k = t.stiffness || 300;
    var c = t.damping || 30;
    var m = t.mass || 1;
    var s = { x: x, y: y, vx: 0, vy: 0, gx: x, gy: y };
    s.jump = function (px, py) {
      s.x = s.gx = px;
      s.y = s.gy = py;
      s.vx = s.vy = 0;
    };
    s.step = function (dt) {
      var left = Math.min(dt, 64) / 1000;
      while (left > 0) {
        var h = Math.min(left, 0.004);
        s.vx += ((-k * (s.x - s.gx) - c * s.vx) / m) * h;
        s.vy += ((-k * (s.y - s.gy) - c * s.vy) / m) * h;
        s.x += s.vx * h;
        s.y += s.vy * h;
        left -= h;
      }
    };
    return s;
  }

  /* ------------------------------------------------------------- scenes
   * A scene animates one drawing. make(svg, detail) returns
   *   { beat: ms, cycle: beats per rest (default 1), rest(n), frame(n, ms, dt) }
   * rest(n) shows the state at the start of beat n; frame(n, ms, dt) the moment ms (0..beat) of beat n, dt ms after
   * the last frame (both in the scene's own time: the kit applies Site.tempo).
   * frame(n, beat) must equal rest(n + 1), so the loop never jumps. The markup is rest(0).
   */
  var SCENES = {};

  /* pqc: a target point drifts between three Voronoi cells; the closest lattice point (ringed) hops after it. */
  SCENES.pqc = function (svg) {
    var pts = Array.prototype.map.call(svg.querySelectorAll('[data-dg="pt"]'), function (c) {
      return [num(c, "cx"), num(c, "cy")];
    });
    var target = svg.querySelector('[data-dg="target"]');
    var ring = svg.querySelector('[data-dg="ring"]');
    var err = svg.querySelector('[data-dg="err"]');
    if (!pts.length || !target || !ring || !err) return null;
    var T0 = [num(target, "data-x"), num(target, "data-y")]; // where the markup draws the target
    var V0 = [num(ring, "data-x"), num(ring, "data-y")]; // and the ring
    // rest positions of the target, one in each of three neighbouring cells (around one Voronoi vertex)
    var W = [T0, [230, 88], [190, 96]];
    var cx = (W[0][0] + W[1][0] + W[2][0]) / 3;
    var cy = (W[0][1] + W[1][1] + W[2][1]) / 3;
    function closest(x, y) {
      var best = pts[0];
      var bd = Infinity;
      for (var i = 0; i < pts.length; i++) {
        var d = (pts[i][0] - x) * (pts[i][0] - x) + (pts[i][1] - y) * (pts[i][1] - y);
        if (d < bd) {
          bd = d;
          best = pts[i];
        }
      }
      return best;
    }
    var hop = Spring2("spring.selection", V0[0], V0[1]);
    var MOVE = 1600;
    function draw(tx, ty) {
      move(target, tx - T0[0], ty - T0[1]);
      move(ring, hop.x - V0[0], hop.y - V0[1]);
      err.setAttribute("x1", util.round(hop.x, 2));
      err.setAttribute("y1", util.round(hop.y, 2));
      err.setAttribute("x2", util.round(tx, 2));
      err.setAttribute("y2", util.round(ty, 2));
    }
    return {
      beat: 2600,
      rest: function (n) {
        var w = W[n % 3];
        var v = closest(w[0], w[1]);
        hop.jump(v[0], v[1]);
        draw(w[0], w[1]);
      },
      frame: function (n, ms, dt) {
        var a = W[n % 3];
        var b = W[(n + 1) % 3];
        // along a gentle arc that bows away from the shared vertex
        var mx = (a[0] + b[0]) / 2;
        var my = (a[1] + b[1]) / 2;
        var qx = mx + (mx - cx) * 0.7;
        var qy = my + (my - cy) * 0.7;
        var s = seg(ms, 0, MOVE, ease.inOut);
        var u = 1 - s;
        var tx = u * u * a[0] + 2 * u * s * qx + s * s * b[0];
        var ty = u * u * a[1] + 2 * u * s * qy + s * s * b[1];
        var v = closest(tx, ty);
        hop.gx = v[0];
        hop.gy = v[1];
        hop.step(dt);
        draw(tx, ty);
      },
    };
  };

  /* accel: ShiftRows, once per beat. Row r slides left by r cells (rows set off one after another); bytes leaving on the
     left come back on the right (each row is clipped and drawn three times over). Its arrow nudges as it goes. */
  SCENES.accel = function (svg) {
    var C = 28;
    var rows = [];
    var arrows = [];
    all(svg, "row").forEach(function (g) {
      rows[num(g, "data-r")] = g;
    });
    all(svg, "arrow").forEach(function (g) {
      arrows[num(g, "data-r")] = g;
    });
    if (rows.length !== 4) return null;
    function off(r, n) {
      return (r * n) % 4;
    }
    return {
      beat: 2200,
      rest: function (n) {
        for (var r = 0; r < 4; r++) {
          move(rows[r], -off(r, n) * C, 0);
          move(arrows[r], 0, 0);
        }
      },
      frame: function (n, ms) {
        for (var r = 1; r < 4; r++) {
          var from = (r - 1) * 120;
          move(rows[r], -(off(r, n) + r * seg(ms, from, 900, ease.inOut)) * C, 0);
          move(arrows[r], -3 * Math.sin(Math.PI * seg(ms, from, 900)), 0);
        }
      },
    };
  };

  /* privacy: two tokens run the input wires into the operation, the node answers with a ring, one token runs on to the
     result, whose noise breathes out as it arrives. One beat is the whole cycle. */
  SCENES.privacy = function (svg) {
    var wires = all(svg, "wire");
    var toks = all(svg, "tok");
    var ping = svg.querySelector('[data-dg="ping"]');
    var node = svg.querySelector('[data-dg="node"]');
    var out = svg.querySelector('[data-dg="out"]');
    if (wires.length < 3 || toks.length < 3 || !out || !node) return null;
    var O = [num(out, "data-x"), num(out, "data-y")];
    var dots = Array.prototype.map.call(out.querySelectorAll("circle"), function (c) {
      return { el: c, dx: num(c, "cx") - O[0], dy: num(c, "cy") - O[1] };
    });
    var lens = wires.map(function (w) {
      return w.getTotalLength();
    });
    function ride(i, tok, s, o) {
      var pt = wires[i].getPointAtLength(s * lens[i]);
      move(tok, pt.x, pt.y);
      show(tok, o);
    }
    function breathe(b) {
      dots.forEach(function (d) {
        if (b <= 0) d.el.removeAttribute("transform");
        else move(d.el, d.dx * 0.24 * b, d.dy * 0.24 * b);
      });
    }
    return {
      beat: 3800,
      rest: function () {
        toks.forEach(function (t) {
          show(t, 0);
        });
        show(ping, 0);
        breathe(0);
      },
      frame: function (n, ms) {
        var o = Math.min(seg(ms, 0, 200), 1 - seg(ms, 1160, 160));
        var s = seg(ms, 0, 1320, ease.inOut);
        ride(0, toks[0], s, o);
        ride(1, toks[1], s, o);
        var q = seg(ms, 1260, 760);
        ping.setAttribute("transform", "scale(" + util.round(1 + 0.75 * ease.out(q), 4) + ")"); // circles scale about their centre (diagrams.css)
        show(ping, q > 0 && q < 1 ? 0.9 * (1 - q) : 0);
        ride(2, toks[2], seg(ms, 1340, 1000, ease.inOut), Math.min(seg(ms, 1340, 160), 1 - seg(ms, 2200, 160)));
        breathe(Math.sin(Math.PI * seg(ms, 2200, 1200)));
      },
    };
  };

  /* ml: the window steps one cell per beat; the cell it leaves is written (a dot sized by the response) and the accent
     moves on to the next output cell. After the last cell the output clears and the window goes back to the start. */
  SCENES.ml = function (svg) {
    var C = 16;
    var IN = [44, 42];
    var OUT = [212, 58];
    var K0 = 5; // the step the markup shows
    var win = svg.querySelector('[data-dg="win"]');
    var cell = svg.querySelector('[data-dg="cell"]');
    var rays = all(svg, "ray");
    var outs = all(svg, "o");
    if (!win || !cell || rays.length < 2 || outs.length !== 16) return null;
    var W0 = [num(win, "data-x"), num(win, "data-y")];
    var O0 = [num(cell, "data-x"), num(cell, "data-y")];
    var pop = spring("spring.pop");
    function at(k) {
      return { x: C * (k % 4), y: C * Math.floor(k / 4) };
    }
    function place(p) {
      var wx = IN[0] + p.x;
      var wy = IN[1] + p.y;
      var ox = OUT[0] + p.x;
      var oy = OUT[1] + p.y;
      move(win, wx - W0[0], wy - W0[1]);
      move(cell, ox - O0[0], oy - O0[1]);
      rays[0].setAttribute("x1", util.round(wx + 3 * C, 2));
      rays[0].setAttribute("y1", util.round(wy, 2));
      rays[0].setAttribute("x2", util.round(ox, 2));
      rays[0].setAttribute("y2", util.round(oy, 2));
      rays[1].setAttribute("x1", util.round(wx + 3 * C, 2));
      rays[1].setAttribute("y1", util.round(wy + 3 * C, 2));
      rays[1].setAttribute("x2", util.round(ox, 2));
      rays[1].setAttribute("y2", util.round(oy + C, 2));
    }
    return {
      beat: 760,
      rest: function (n) {
        var k = (K0 + n) % 16;
        place(at(k));
        outs.forEach(function (o, i) {
          ink(o, i < k ? 1 : 0);
          o.removeAttribute("transform");
        });
      },
      frame: function (n, ms) {
        var k0 = (K0 + n) % 16;
        var k1 = (k0 + 1) % 16;
        var a = at(k0);
        var b = at(k1);
        var s = seg(ms, 60, k1 === 0 ? 640 : 420, ease.inOut);
        place({ x: lerp(a.x, b.x, s), y: lerp(a.y, b.y, s) });
        if (k1 === 0) {
          var gone = 1 - seg(ms, 0, 360, ease.out);
          outs.forEach(function (o, i) {
            ink(o, i < k0 ? gone : 0);
          });
          return;
        }
        var q = seg(ms, 90, pop.ms);
        ink(outs[k0], seg(ms, 90, 120));
        var sc = q >= 1 ? 1 : Math.max(0.01, pop.at(q));
        if (sc === 1) outs[k0].removeAttribute("transform");
        else outs[k0].setAttribute("transform", "scale(" + util.round(sc, 4) + ")");
      },
    };
  };

  /* iot: the clock scrolls left one period per beat; when a rising edge reaches the probe (a quarter into the beat)
     every instruction hops one stage, one enters, one retires; the memory stage is gated while it holds an instruction
     that does not use memory (hollow). */
  SCENES.iot = function (svg) {
    var P = 50;
    var X = 60; // centre of the first stage
    var KIND = "mmamamm";
    var toks = all(svg, "tok");
    var clk = svg.querySelector('[data-dg="clk"]');
    var probe = svg.querySelector('[data-dg="probe"]');
    var memOn = svg.querySelector('[data-dg="mem-on"]');
    var memOff = svg.querySelector('[data-dg="mem-off"]');
    if (toks.length !== 6 || !clk || !probe) return null;
    var Y = (function () {
      var m = /translate\(\s*[-\d.]+[ ,]+([-\d.]+)/.exec(toks[0].getAttribute("transform") || "");
      return m ? parseFloat(m[1]) : 64;
    })();
    var EDGE = 172.5; // a rising edge of the wave, in the wave's own coordinates
    var LOW = num(probe, "data-y");
    var HIGH = LOW - 12;
    var level = Spring2("spring.press", 0, LOW);
    var hop = spring("spring.pop");
    function kind(j) {
      return KIND.charAt(((j % 7) + 7) % 7);
    }
    function mod(a, b) {
      return ((a % b) + b) % b;
    }
    function tokens(n, e) {
      for (var j = n - 4; j <= n + 1; j++) {
        var g = toks[mod(j, 6)];
        var stage = n - j; // before the hop
        move(g, X + P * (stage + e), Y);
        show(g, stage === -1 ? Math.min(1, e * 1.6) : stage === 4 ? 1 - Math.min(1, e * 1.6) : 1);
        var solid = kind(j) === "m";
        ink(g.children[0], solid ? 1 : 0);
        ink(g.children[1], solid ? 0 : 1);
      }
      // the memory stage: gated while it holds an instruction that does not use memory
      var before = kind(n - 3) === "a" ? 1 : 0;
      var after = kind(n - 2) === "a" ? 1 : 0;
      var gated = lerp(before, after, util.clamp(e, 0, 1));
      ink(memOff, gated);
      show(memOn, 1 - gated);
    }
    function wave(shift) {
      move(clk, -shift, 0);
      var high = mod(160 + shift - EDGE, P) < P / 2;
      level.gy = high ? HIGH : LOW;
      return high;
    }
    return {
      beat: 1200,
      rest: function (n) {
        tokens(n, 0);
        wave(0);
        level.jump(0, LOW);
        move(probe, 0, 0);
      },
      frame: function (n, ms, dt) {
        var shift = (P * ms) / 1200;
        wave(shift);
        level.step(dt);
        move(probe, 0, level.y - LOW);
        var q = seg(ms, 300, hop.ms);
        tokens(n, q <= 0 ? 0 : q >= 1 ? 1 : hop.at(q));
      },
    };
  };

  /* hpc: the factors close up, the fill-in clears, the pivot runs down the diagonal (the elimination front, the
     trailing submatrix, shrinking behind it), fill-in appears where its pivot creates it, and L and U part again. */
  SCENES.hpc = function (svg) {
    var C = 16;
    var X0 = 96;
    var Y0 = 26;
    var NN = 8;
    var SP = 6; // how far each factor stands off, at rest
    var Lg = svg.querySelector('[data-dg="L"]');
    var Ug = svg.querySelector('[data-dg="U"]');
    var front = svg.querySelector('[data-dg="front"]');
    var pivot = svg.querySelector('[data-dg="pivot"]');
    var fills = all(svg, "fill");
    if (!Lg || !Ug || !front || !pivot) return null;
    var P0 = [num(pivot, "data-x"), num(pivot, "data-y")];
    var corner = [X0 + NN * C, Y0 + NN * C];
    var pop = spring("spring.pop");
    var T0 = 700;
    var STEP = 520;
    function arrive(k) {
      return T0 + k * STEP;
    }
    function draw(sep, kpos, frontAt, frontO) {
      move(Lg, -sep, sep);
      move(Ug, sep, -sep);
      var c = X0 + C * kpos + C / 2;
      var r = Y0 + C * kpos + C / 2;
      move(pivot, c + sep - P0[0], r - sep - P0[1]);
      var f = util.clamp((NN - frontAt) / NN, 0, 1);
      scaleAbout(front, corner[0], corner[1], Math.max(f, 0.001), Math.max(f, 0.001));
      show(front, frontO);
    }
    return {
      beat: 6400,
      rest: function () {
        draw(SP, NN - 1, NN, 0);
        fills.forEach(function (el) {
          ink(el, 1);
          el.removeAttribute("transform");
        });
      },
      frame: function (n, ms) {
        var split = arrive(NN - 1) + 420;
        var sep = ms < split ? SP * (1 - seg(ms, 0, 600, ease.inOut)) : SP * seg(ms, split, 650, ease.inOut);
        var kpos = (NN - 1) * (1 - seg(ms, 0, 640, ease.inOut));
        for (var k = 1; k < NN; k++) if (ms >= arrive(k) - 320) kpos = k - 1 + seg(ms, arrive(k) - 320, 320, ease.inOut);
        var frontO = Math.min(seg(ms, arrive(0) - 260, 260), 1 - seg(ms, arrive(NN - 1) + 60, 260));
        draw(sep, kpos, kpos + 1, frontO * 0.9);
        fills.forEach(function (el) {
          var made = arrive(num(el, "data-k")) + 120;
          if (ms < made) {
            ink(el, 1 - seg(ms, 0, 340));
            el.removeAttribute("transform");
            return;
          }
          var q = seg(ms, made, pop.ms);
          ink(el, seg(ms, made, 140));
          var sc = q >= 1 ? 1 : Math.max(0.01, pop.at(q));
          if (sc === 1) el.removeAttribute("transform");
          else el.setAttribute("transform", "scale(" + util.round(sc, 4) + ")");
        });
      },
    };
  };

  /* security: one Grover iteration per beat. A marker steps along the wires; at the Hadamards the bars even out, at the
     oracle the marked bar dips below zero, the mean shows, and at the diffusion every bar turns about it: the marked
     state ends with the most amplitude, which is where the drawing rests. */
  SCENES.security = function (svg) {
    var bars = all(svg, "bar");
    var marker = svg.querySelector('[data-dg="marker"]');
    var mean = svg.querySelector('[data-dg="mean"]');
    if (bars.length !== 8 || !marker) return null;
    var MX = num(marker, "data-x");
    var REST = bars.map(function (b) {
      return num(b, "data-a");
    });
    var U = 1 / Math.sqrt(8);
    var top = 0;
    REST.forEach(function (a, i) {
      if (a > REST[top]) top = i;
    });
    var pop = spring("spring.pop");
    var land = spring("spring.entrance");
    function setBars(fn) {
      bars.forEach(function (b, i) {
        var s = fn(i) / REST[i];
        b.style.transform = s === 1 ? "" : "scaleY(" + util.round(s, 4) + ")";
      });
    }
    // where the marker goes: [start ms, length ms, x]; it fades in at the first and out after the last
    var path = [
      [150, 500, 58],
      [1250, 500, 94],
      [2450, 500, 132],
      [3550, 500, 170],
    ];
    function markerX(ms) {
      var x = MX - 12;
      for (var i = 0; i < path.length; i++) x = lerp(x, path[i][2], seg(ms, path[i][0], path[i][1], ease.inOut));
      return x;
    }
    return {
      beat: 5600,
      rest: function () {
        setBars(function (i) {
          return REST[i];
        });
        show(marker, 0);
        show(mean, 0);
      },
      frame: function (n, ms) {
        move(marker, markerX(ms) - MX, 0);
        show(marker, Math.min(seg(ms, 0, 250), 1 - seg(ms, 3950, 350)));
        show(mean, Math.min(seg(ms, 2050, 300), 1 - seg(ms, 3450, 400)) * 0.9);
        var even = seg(ms, 450, 750, ease.soft);
        var flip = seg(ms, 1650, pop.ms);
        var turn = seg(ms, 2900, land.ms);
        flip = flip <= 0 ? 0 : flip >= 1 ? 1 : pop.at(flip);
        turn = turn <= 0 ? 0 : turn >= 1 ? 1 : land.at(turn);
        setBars(function (i) {
          var a = lerp(REST[i], U, even); // the Hadamards: an even superposition
          var o = i === top ? lerp(U, -U, flip) : U; // the oracle: the marked sign flips
          if (flip > 0) a = o;
          if (turn > 0) a = lerp(i === top ? -U : U, REST[i], turn); // the diffusion: about the mean
          return a;
        });
      },
    };
  };

  /* ------------------------------------------------------------- the loop: one for every running drawing */
  var running = [];
  var clock = util.loop(function (time, delta) {
    for (var i = running.length - 1; i >= 0; i--) running[i](delta);
    if (!running.length) clock.stop();
  });
  function run(fn) {
    if (running.indexOf(fn) === -1) running.push(fn);
    clock.start();
  }
  function halt(fn) {
    var i = running.indexOf(fn);
    if (i > -1) running.splice(i, 1);
  }

  /** The opacity an element is painted with, its ancestors' included (a card fading in an orbit counts). */
  function seenOpacity(el) {
    var o = 1;
    for (var n = el; n && n.nodeType === 1 && n !== document.body; n = n.parentElement) {
      o *= parseFloat(getComputedStyle(n).opacity);
      if (o < 0.05) break;
    }
    return o;
  }
  function focusVisible(el) {
    try {
      return el.matches(":focus-visible") || el.matches(":has(:focus-visible)");
    } catch (e) {
      return el.matches(":focus");
    }
  }

  /* ------------------------------------------------------------- the kit */
  Site.register("diagram", function (svg, opts) {
    var key = ((svg.getAttribute("class") || "").match(/diagram--([a-z]+)/) || [])[1];
    var liveMode = opts.live === "always" || opts.live === "off" ? opts.live : "hover";
    var trigger = opts.trigger === "manual" ? "manual" : "view";
    var scene = null;
    try {
      scene = SCENES[key] ? SCENES[key](svg, opts.detail === "full") : null;
    } catch (e) {
      Site.errors.push({ where: "diagram " + key, message: String(e && e.message), stack: String((e && e.stack) || "").slice(0, 600) });
      scene = null;
    }
    var cycle = (scene && scene.cycle) || 1;

    var state = "blank"; // blank | drawing | drawn
    var n = 0; // beats played
    var t = 0; // ms into the beat
    var on = false; // the loop is ticking
    var finishing = false; // asked to stop at the end of the cycle
    var hovered = false;
    var focused = false;
    var forced = null; // live(true | false) from a page
    var visible = false;
    var doneTimer = null;
    var cleanup = [];

    /* the sequence: per-drawing timing from the constants, and how long it lasts */
    var tempo = Site.tempo || 1;
    svg.style.setProperty("--dg-span", Math.round(DRAW.span * 1000 * tempo) + "ms");
    svg.style.setProperty("--dg-dur", Math.round(DRAW.dur * 1000 * tempo) + "ms");
    svg.style.setProperty("--dg-sub", Math.round(DRAW.sub * 1000 * tempo) + "ms");
    function lastStart() {
      var most = 0;
      Array.prototype.forEach.call(svg.querySelectorAll(".dg-d, .dg-p, .dg-g, .dg-f"), function (el) {
        var tt = 0;
        for (var g = el; g && g !== svg; g = g.parentNode) {
          var v = g.style && g.style.getPropertyValue("--t");
          if (v) {
            tt = parseFloat(v) || 0;
            break;
          }
        }
        var k = parseFloat(el.style.getPropertyValue("--k")) || 0;
        most = Math.max(most, tt * DRAW.span + k * DRAW.sub);
      });
      return most;
    }
    var total = (lastStart() + Math.max(DRAW.dur, spring("spring.pop").ms / 1000, spring("spring.entrance").ms / 1000)) * 1000 * tempo + 60;

    /* dashes are counted in screen pixels under non-scaling-stroke: measure the scale before each drawing */
    function measure() {
      var r = svg.getBoundingClientRect();
      var s = Math.max(r.width, svg.clientWidth || 0) / VIEW.w;
      svg.style.setProperty("--dg-len", String(util.round(Math.max(1, s) * 1.03, 3)));
    }

    function rest() {
      n = 0;
      t = 0;
      if (scene) scene.rest(0);
    }
    function finished() {
      clearTimeout(doneTimer);
      doneTimer = null;
      svg.classList.add("is-drawn", "dg-done");
      state = "drawn";
      svg.dispatchEvent(new CustomEvent("kit:diagram", { bubbles: true, detail: { state: "drawn" } }));
      update();
    }
    function play() {
      stop();
      rest();
      clearTimeout(doneTimer);
      svg.classList.remove("is-drawn", "dg-done");
      if (env.static) return finished();
      if (env.reduce) {
        void svg.getBoundingClientRect();
        svg.classList.add("is-drawn");
        return finished();
      }
      measure();
      void svg.getBoundingClientRect(); // the blank state is painted before the drawing starts
      svg.classList.add("is-drawn");
      state = "drawing";
      doneTimer = setTimeout(finished, total);
    }
    function reset() {
      stop();
      rest();
      clearTimeout(doneTimer);
      doneTimer = null;
      svg.classList.remove("is-drawn", "dg-done");
      state = "blank";
    }

    /* the live loop */
    function wanted() {
      if (forced !== null) return forced;
      if (liveMode === "always") return true;
      if (liveMode === "hover") return hovered || focused;
      return false;
    }
    function tick(dt) {
      var tempo = Site.tempo || 1;
      dt = dt / tempo; // the scene's own time
      var beat = scene.beat;
      t += dt;
      while (t >= beat) {
        t -= beat;
        n += 1;
        if (finishing && n % cycle === 0) {
          t = 0;
          scene.rest(n);
          stop();
          return;
        }
      }
      scene.frame(n, t, dt);
    }
    function start() {
      finishing = false;
      if (on) return;
      on = true;
      svg.classList.add("is-live");
      run(tick);
    }
    function pause() {
      if (!on) return;
      on = false;
      halt(tick);
    }
    function stop() {
      pause();
      finishing = false;
      svg.classList.remove("is-live");
    }
    function update() {
      var can = scene && state === "drawn" && visible && !env.reduce;
      if (wanted() && can) return start();
      if (!on) return;
      if (!can) return pause(); // off screen or hidden: hold where it is, go on from there
      finishing = true; // let go: finish the cycle, then rest
    }

    /* triggers */
    if (trigger === "manual" || env.static) {
      svg.classList.add("is-drawn", "dg-done");
      state = "drawn";
    } else {
      var io = null;
      var poll = null;
      var inView = false;
      var check = function () {
        clearTimeout(poll);
        if (!inView || state !== "blank") return;
        if (seenOpacity(svg) >= 0.5) {
          if (io) io.disconnect();
          play();
        } else poll = setTimeout(check, 200);
      };
      io = new IntersectionObserver(
        function (entries) {
          var e = entries[entries.length - 1];
          inView = e.isIntersecting && e.intersectionRatio >= 0.3;
          check();
        },
        { threshold: [0, 0.3, 0.6] },
      );
      io.observe(svg);
      cleanup.push(function () {
        io.disconnect();
        clearTimeout(poll);
      });
    }
    cleanup.push(
      util.visible(svg, function (v) {
        visible = v;
        update();
      }),
    );

    /* the host: hover (fine pointers) or keyboard focus runs the loop */
    if (liveMode === "hover") {
      var host = svg.closest("a, button, [data-diagram-host]") || svg;
      var enter = function (e) {
        if (e.pointerType === "touch" || !env.hover) return;
        hovered = true;
        update();
      };
      var leave = function (e) {
        if (e.pointerType === "touch") return;
        hovered = false;
        update();
      };
      var fin = function () {
        focused = focusVisible(host);
        update();
      };
      var fout = function () {
        // focus may move inside the host
        setTimeout(function () {
          focused = host.contains(document.activeElement) && focusVisible(host);
          update();
        }, 0);
      };
      host.addEventListener("pointerenter", enter);
      host.addEventListener("pointerleave", leave);
      host.addEventListener("focusin", fin);
      host.addEventListener("focusout", fout);
      cleanup.push(function () {
        host.removeEventListener("pointerenter", enter);
        host.removeEventListener("pointerleave", leave);
        host.removeEventListener("focusin", fin);
        host.removeEventListener("focusout", fout);
      });
    }
    cleanup.push(
      Site.on("reduce", function () {
        if (env.reduce && state !== "blank") finished();
        update();
      }),
    );

    return {
      /** Draw from blank (again: restarts cleanly). */
      play: play,
      /** Back to blank, the loop stopped and at rest. */
      reset: reset,
      /** live(true) runs the loop (when drawn and on screen), live(false) lets it finish its cycle; live() tells whether it runs. */
      live: function (v) {
        if (v === undefined) return on;
        forced = v ? true : liveMode === "always" ? false : null;
        update();
        return on;
      },
      destroy: function () {
        stop();
        clearTimeout(doneTimer);
        cleanup.forEach(function (fn) {
          fn();
        });
      },
    };
  });
})();
