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
  function fade(el, o) {
    if (el) el.style.opacity = o >= 1 ? "" : String(util.round(Math.max(0, o), 3));
  }
  /** A small critically-tuned spring in two dimensions, stepped by the loop (for marks that hop to a moving goal). */
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
