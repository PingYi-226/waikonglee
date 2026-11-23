/*
 * Home page, about block (one slide).
 *   1. entrance, once, when the slide is first reached (the stepper's kit:snap-change, or the first view where it does
 *      not run): the portrait, then the strip draws itself along the time axis; once the slide is there the lede is
 *      typed where it stands while the portrait sways as if it were saying the words (see speak())
 *   2. the strip: the light runs along the bars the moment they are drawn, then now and then while the slide is current,
 *      each bar lifting as it passes; a bar under the pointer or the keyboard raises a plate with its details (what,
 *      where, when) while the other bars recede
 * Without this file the block is complete and still.
 */
(function () {
  "use strict";

  var Site = window.Site;
  if (!Site) return;
  var M = window.Motion;
  var util = Site.util;
  var T = Site.tokens;
  var root = document.documentElement;

  var STEP = 0.08; // s between the entrance's parts (the lede, the portrait, the strip): the same beat as the first screen
  var DRAW = 1.5; // s for the axis to draw itself from the first year to today
  var SHIMMER = 1.9; // s for the light to cross the axis
  var SHIMMER_EVERY = 6.5; // s between two crossings
  var GLINT = 15; // the light's width, in percent of the axis
  var DRAW_SEEN = 0.86; // the share of the drawing's time after which nothing more of it can be seen (ease.soft)
  var LEAVE = 140; // ms the plate waits after the pointer has left the bars (it may be on its way to the next one)

  function all(scope, selector) {
    return Array.prototype.slice.call(scope.querySelectorAll(selector));
  }
  function ms(s) {
    return s * 1000 * (Site.tempo || 1);
  }
  function bezier(c) {
    return "cubic-bezier(" + c.join(",") + ")";
  }
  /** A token's cubic-bezier curve as a function of time (0..1). */
  function bezierFn(p) {
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
      for (var i = 0; i < 8; i++) {
        var fx = ((ax * x + bx) * x + cx) * x - t;
        var d = (3 * ax * x + 2 * bx) * x + cx;
        if (Math.abs(fx) < 1e-5 || !d) break;
        x -= fx / d;
      }
      return ((ay * x + by) * x + cy) * x;
    };
  }

  /* ================================================================== strip */
  function initStrip(strip, about) {
    var segs = all(strip, ".strip__seg");
    if (!segs.length) return null;
    var animate = Site.animate;
    var reduce = function () {
      return Site.env.reduce;
    };

    // the plate: one for the strip, it travels from bar to bar
    var pin = document.createElement("div");
    pin.className = "strip__pin";
    pin.setAttribute("aria-hidden", "true");
    var stem = document.createElement("span");
    stem.className = "strip__stem";
    var lift = document.createElement("div");
    lift.className = "strip__lift";
    var plate = document.createElement("div");
    plate.className = "strip__plate";
    var lines = ["strip__what", "strip__where", "strip__when t-data"].map(function (cls) {
      var s = document.createElement("span");
      s.className = cls;
      plate.appendChild(s);
      return s;
    });
    pin.appendChild(stem);
    lift.appendChild(plate);
    pin.appendChild(lift);
    strip.appendChild(pin);

    var current = null;
    var leaveTimer = null;
    var plateW = 0;

    // every plate is as wide as the widest one, so moving from bar to bar is a glide and never a resize
    function measurePlate() {
      plate.style.width = "";
      var widest = 0;
      segs.forEach(function (seg) {
        fill(seg);
        widest = Math.max(widest, plate.offsetWidth);
      });
      var room = strip.clientWidth;
      plateW = Math.min(Math.ceil(widest) + 1, room);
      plate.style.width = plateW + "px";
      if (current) fill(current);
    }
    function fill(seg) {
      var src = all(seg, ".strip__detail > span");
      lines.forEach(function (l, i) {
        l.textContent = src[i] ? src[i].textContent : "";
      });
    }
    // where the plate goes for a bar: the pin on the bar's top centre; every plate stands at one level just above the
    // first lane (a bar in the second lane has a longer stem), over the bar but inside the strip
    var GAP = 11; // px of stem between the first lane and the plate
    function place(seg) {
      var r = seg.querySelector(".strip__fill").getBoundingClientRect();
      var first = strip.querySelector(".strip__lane .strip__fill").getBoundingClientRect();
      var s = strip.getBoundingClientRect();
      var x = r.left + r.width / 2 - s.left;
      var y = r.top - s.top;
      var len = Math.round(r.top - first.top + GAP);
      var px = util.clamp(-plateW / 2, -x, s.width - x - plateW);
      return { x: x, y: y, px: px, len: len, origin: -px + "px 100%" };
    }

    function show(seg) {
      clearTimeout(leaveTimer);
      if (seg === current) return;
      var was = current;
      current = seg;
      segs.forEach(function (s) {
        s.classList.toggle("is-active", s === seg);
      });
      strip.classList.add("is-picking");
      stopShimmer();
      var at = place(seg);
      plate.style.transformOrigin = at.origin;

      if (!was || !pin.classList.contains("is-shown") || reduce()) {
        // springing up from the bar: the stem first, the plate a beat later, its lines one after the other
        fill(seg);
        animate(pin, { x: at.x, y: at.y }, Site.t("transition.instant"));
        animate(lift, { x: at.px, y: -at.len }, Site.t("transition.instant"));
        pin.classList.add("is-shown");
        if (reduce()) {
          animate(stem, { scaleY: at.len, opacity: 1 }, Site.t("transition.instant"));
          animate(plate, { opacity: [0, 1] }, Site.t("transition.fade"));
          return;
        }
        animate(stem, { scaleY: [0, at.len], opacity: [0, 1] }, Site.t("transition.reveal"));
        animate(plate, { opacity: [0, 1], scale: [0.55, 1], y: [10, 0], filter: ["blur(" + T.blur.surface + "px)", "blur(0px)"] }, Site.t("spring.checkPop", { delay: 0.03 }));
        lineIn(0.1);
        return;
      }
      // from bar to bar: the plate glides, its lines change in place
      animate(pin, { x: at.x, y: at.y }, Site.t("spring.selection"));
      animate(lift, { x: at.px, y: -at.len }, Site.t("spring.selection"));
      animate(plate, { opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }, Site.t("spring.pop"));
      animate(stem, { scaleY: at.len, opacity: 1 }, Site.t("spring.selection"));
      var out = animate(lines, { opacity: 0, y: -4 }, Site.t("transition.swap"));
      var token = seg;
      Promise.resolve(out && out.finished ? out.finished : out).then(function () {
        if (current !== token) return;
        fill(seg);
        lineIn(0);
      }, function () {});
    }
    function lineIn(delay) {
      lines.forEach(function (l, i) {
        animate(
          l,
          { opacity: [0, 1], y: [8, 0], filter: ["blur(" + T.blur.icon + "px)", "blur(0px)"] },
          Site.t("spring.pop", { delay: delay + i * T.stagger.words }),
        );
      });
    }
    function hide() {
      clearTimeout(leaveTimer);
      if (!current) return;
      current = null;
      segs.forEach(function (s) {
        s.classList.remove("is-active");
      });
      strip.classList.remove("is-picking");
      if (reduce()) {
        pin.classList.remove("is-shown");
        return;
      }
      animate(stem, { scaleY: 0, opacity: 0 }, Site.t("transition.popOut"));
      var a = animate(plate, { opacity: 0, scale: 0.7, y: 8, filter: "blur(" + T.blur.icon + "px)" }, Site.t("transition.popOut"));
      Promise.resolve(a && a.finished ? a.finished : a).then(function () {
        if (!current) pin.classList.remove("is-shown");
      }, function () {});
      scheduleShimmer();
    }
    function leaveSoon() {
      clearTimeout(leaveTimer);
      leaveTimer = setTimeout(function () {
        if (!strip.contains(document.activeElement) || !strip.querySelector(".strip__bar:focus-visible")) hide();
      }, LEAVE);
    }

    segs.forEach(function (seg) {
      var bar = seg.querySelector(".strip__bar");
      bar.addEventListener("pointerenter", function (e) {
        if (e.pointerType === "touch") return;
        show(seg);
      });
      bar.addEventListener("focus", function () {
        show(seg);
      });
      bar.addEventListener("click", function () {
        show(seg);
      });
      bar.addEventListener("pointerleave", function (e) {
        if (e.pointerType !== "touch") leaveSoon();
      });
      bar.addEventListener("blur", function () {
        leaveSoon();
      });
    });
    strip.addEventListener("pointerleave", function (e) {
      if (e.pointerType === "touch") return;
      leaveSoon();
    });
    strip.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && current) {
        hide();
        e.stopPropagation();
      }
    });
    document.addEventListener("pointerdown", function (e) {
      if (current && !strip.contains(e.target)) hide();
    });

    /* ---- the axis draws itself */
    var drawn = false;
    function draw() {
      if (drawn) return;
      drawn = true;
      if (Site.env.static || reduce() || !strip.animate) {
        strip.classList.add("is-drawn");
        scheduleShimmer();
        return;
      }
      var a = strip.animate([{ "--strip-draw": 0 }, { "--strip-draw": 100 }], {
        duration: ms(DRAW),
        easing: bezier(T.ease.soft),
        fill: "forwards",
      });
      var done = function () {
        if (strip.classList.contains("is-drawn")) return;
        strip.classList.add("is-drawn");
        a.cancel();
        if (!shimmerRaf) shimmer();
      };
      a.onfinish = done;
      // the light sets off from the first bar the moment the drawing has reached the present (its curve has all but
      // come to rest by then; the last hundredths of the time move nothing that can be seen)
      setTimeout(function () {
        if (!shimmerRaf) shimmer();
      }, ms(DRAW * DRAW_SEEN));
      // never leave the strip undrawn (a tab hidden while it plays, a timeline that does not run)
      setTimeout(function () {
        if (!strip.classList.contains("is-drawn")) done();
      }, ms(DRAW) + 1500);
    }

    /* ---- the shimmer: light along the bars, now and then, only while the slide is current. One front crosses the
       whole axis (each bar's glint is placed in axis units, so they line up); a bar lifts a little while the light is
       on it, so the eye follows the light from the first bar to the present one. */
    var shimmerTimer = null;
    var shimmerRaf = null;
    var onScreen = false;
    var lift = segs.map(function (seg) {
      return {
        l: parseFloat(seg.style.getPropertyValue("--l")) || 0,
        w: parseFloat(seg.style.getPropertyValue("--w")) || 0,
        fill: seg.querySelector(".strip__fill"),
        glint: seg.querySelector(".strip__glint"),
      };
    });
    var pass = bezierFn(T.ease.enter);
    var first = lift.reduce(function (m, b) {
      return Math.min(m, b.l);
    }, 100);
    util.visible(strip, function (v) {
      onScreen = v;
      if (v) scheduleShimmer();
      else stopShimmer();
    });
    function isCurrent() {
      if (root.classList.contains("has-snap")) return about.classList.contains("is-snap-current") && !root.classList.contains("is-snapping");
      return onScreen;
    }
    function scheduleShimmer(delay) {
      clearTimeout(shimmerTimer);
      shimmerTimer = null;
      if (!drawn || reduce() || Site.env.static) return;
      shimmerTimer = setTimeout(shimmer, delay == null ? ms(SHIMMER_EVERY) : delay);
    }
    function shimmer() {
      // (called by its timer or directly: stopShimmer below clears a pending timer either way)
      if (current || document.hidden || !isCurrent()) {
        if (onScreen) scheduleShimmer();
        return;
      }
      stopShimmer();
      var start = performance.now();
      var dur = ms(SHIMMER);
      var from = first - GLINT * 0.3; // the light's centre, in percent of the axis: it appears on the first bar
      var to = 100 + GLINT * 0.6;
      function frame(now) {
        var t = Math.min(1, (now - start) / dur);
        var x = from + (to - from) * pass(t);
        lift.forEach(function (b) {
          if (b.glint) b.glint.style.translate = (x - GLINT / 2 - b.l).toFixed(2) + "cqw 0";
          // how much of the light is on this bar: 1 inside it, falling off over half the light's width outside
          var d = x < b.l ? b.l - x : x > b.l + b.w ? x - b.l - b.w : 0;
          var on = Math.exp(-(d * d) / ((GLINT * GLINT) / 5));
          b.fill.style.transform = on > 0.01 ? "translateY(" + (-0.12 * on).toFixed(3) + "rem) scaleY(" + (1 + 0.32 * on).toFixed(3) + ")" : "";
        });
        if (t < 1) shimmerRaf = requestAnimationFrame(frame);
        else shimmerRaf = null;
      }
      shimmerRaf = requestAnimationFrame(frame);
      scheduleShimmer(ms(SHIMMER + SHIMMER_EVERY));
    }
    function stopShimmer() {
      clearTimeout(shimmerTimer);
      shimmerTimer = null;
      if (shimmerRaf) cancelAnimationFrame(shimmerRaf);
      shimmerRaf = null;
      lift.forEach(function (b) {
        if (b.glint) b.glint.style.translate = "";
        b.fill.style.transform = "";
      });
    }
    about.addEventListener("kit:snap-arrive", function () {
      if (drawn) scheduleShimmer(ms(1.2));
    });
    about.addEventListener("kit:snap-leave", function () {
      stopShimmer();
      hide();
    });

    var remeasure = util.debounce(function () {
      measurePlate();
      if (current) {
        var at = place(current);
        animate(pin, { x: at.x, y: at.y }, Site.t("transition.instant"));
        animate(lift, { x: at.px, y: -at.len }, Site.t("transition.instant"));
        animate(stem, { scaleY: at.len }, Site.t("transition.instant"));
      }
    }, 120);
    window.addEventListener("resize", remeasure);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measurePlate);
    measurePlate();

    return { draw: draw, hide: hide };
  }

  /* ===================================================== the portrait speaks
     While the lede is typed, the portrait moves as if the person in it were saying the words: it turns toward the
     viewer as the first words come (the glare crossing the picture), sways while characters arrive (livelier when they
     come fast, calmer at a breath), nods a little at each full stop, and settles still when the paragraph ends. It
     drives the tilt kit (aim / release): the rotations are those a pointer would make, and a real pointer over the
     portrait takes over at once (the tilt ignores aim while it is there; its springs carry the hand-over). */
  var SAY = {
    open: 1.15, // s: the first turn, from one side across toward the viewer
    swayX: 2.7, // s: the slow sway, side to side
    swayY: 1.9, // s: ... and up and down
    chatter: 0.62, // s: the small quick movement while characters stream in
    nod: 0.6, // s: a nod at a full stop
    settle: 0.9, // s: back to still after the last character
  };
  function smooth(t) {
    t = util.clamp(t, 0, 1);
    return t * t * (3 - 2 * t);
  }
  function speak(frame, lede) {
    var tilt = frame && Site.get(frame, "tilt");
    if (!tilt || !tilt.aim || Site.env.reduce || Site.env.static) return null;
    var tempo = Site.tempo || 1;
    var t0 = performance.now();
    var last = t0;
    var energy = 0; // characters arriving (each adds, it fades in a third of a second)
    var flow = 0; // the same, smoothed
    var nods = [];
    var endAt = -1;
    var raf = null;
    var over = false;
    function now() {
      return (performance.now() - t0) / 1000 / tempo;
    }
    function onChar(e) {
      energy = Math.min(1, energy + 0.07);
      if (e.detail && e.detail.pause === "stop") nods.push(now());
    }
    function onDone(e) {
      if (endAt >= 0) return;
      // a quiet finish (the visitor has left) settles at once, an ordinary one after the caret's first blink
      endAt = now() + (e && e.detail && e.detail.quiet ? 0 : 0.15);
    }
    lede.addEventListener("kit:typing-char", onChar);
    lede.addEventListener("kit:typing-done", onDone);
    frame.classList.add("is-speaking");
    function tick(ts) {
      raf = null;
      if (over) return;
      var t = (ts - t0) / 1000 / tempo;
      var dt = Math.min(0.05, Math.max(0, (ts - last) / 1000 / tempo));
      last = ts;
      energy *= Math.exp(-dt / 0.3);
      flow += (energy - flow) * (1 - Math.exp(-dt / 0.18));
      // the opening turn: a glance to one side, then across toward the viewer, the chin up a little
      var o = t / SAY.open;
      var nx = o < 0.32 ? -0.62 * smooth(o / 0.32) : -0.62 + 1.04 * smooth((o - 0.32) / 0.68);
      var ny = -0.3 * smooth(o / 0.5);
      // then the sway of speech, coming in as the turn ends
      var s = smooth((t - SAY.open * 0.7) / 0.6);
      var amp = 0.32 + 0.3 * flow;
      var TAU = Math.PI * 2;
      nx = nx * (1 - s) + s * (0.42 * Math.cos(TAU * (t - SAY.open) / SAY.swayX) * amp / 0.47 + 0.14 * flow * Math.sin(TAU * t / SAY.chatter));
      ny = ny * (1 - s) + s * (-0.3 * Math.cos(TAU * (t - SAY.open) / (SAY.swayX * 2)) + 0.22 * amp * Math.sin(TAU * t / SAY.swayY) + 0.08 * flow * Math.sin(TAU * t / (SAY.chatter * 0.76)));
      // a nod at each full stop: down and back
      nods.forEach(function (n) {
        var u = (t - n) / SAY.nod;
        if (u > 0 && u < 1) ny += 0.75 * Math.sin(Math.PI * u) * (1 - u * 0.4);
      });
      // still at the end
      var still = endAt < 0 ? 1 : 1 - smooth((t - endAt) / SAY.settle);
      tilt.aim(nx * still, ny * still);
      if (endAt >= 0 && t > endAt + SAY.settle) return stop();
      raf = requestAnimationFrame(tick);
    }
    function stop() {
      if (over) return;
      over = true;
      if (raf) cancelAnimationFrame(raf);
      raf = null;
      lede.removeEventListener("kit:typing-char", onChar);
      lede.removeEventListener("kit:typing-done", onDone);
      tilt.release();
      // the stronger glare of the performance goes once the portrait is flat again
      setTimeout(function () {
        frame.classList.remove("is-speaking");
      }, 600 * tempo);
    }
    raf = requestAnimationFrame(tick);
    return { stop: stop };
  }

  /* =============================================================== entrance */
  Site.ready(function () {
    var about = document.querySelector("[data-about]");
    if (!about) return;
    var lede = about.querySelector(".about__lede");
    var photo = about.querySelector(".about__photo");
    var frame = about.querySelector(".about__frame");
    var strip = about.querySelector("[data-strip]");
    var stripCtl = null;
    try {
      stripCtl = strip ? initStrip(strip, about) : null;
    } catch (e) {
      if (strip) strip.classList.add("is-drawn");
      Site.errors.push({ where: "home-about strip", message: String(e && e.message), stack: String((e && e.stack) || "").slice(0, 600) });
    }

    var entered = false;
    var arrived = false;
    var speaking = null;
    function typing() {
      return lede && Site.get(lede, "typing-text");
    }
    function say() {
      var c = typing();
      if (!c || !c.play || c.done || c.typing) return;
      try {
        speaking = speak(frame, lede);
      } catch (e) {
        Site.errors.push({ where: "home-about portrait", message: String(e && e.message), stack: String((e && e.stack) || "").slice(0, 600) });
      }
      c.play();
    }
    // source: "change" (the stepper is bringing the slide in), "arrive" (it is there) or "view" (no stepper)
    function enter(source) {
      if (entered) return;
      entered = true;
      var run = function (fn) {
        try {
          fn();
        } catch (e) {
          Site.errors.push({ where: "home-about entrance", message: String(e && e.message), stack: "" });
        }
      };
      var parts = [
        function () {
          var c = photo && Site.get(photo, "reveal");
          if (c && c.play) c.play();
        },
        function () {
          if (stripCtl) stripCtl.draw();
          else if (strip) strip.classList.add("is-drawn");
        },
      ];
      if (Site.env.static) {
        parts.forEach(run);
        return;
      }
      // the portrait first (it is there before it speaks), then the strip draws itself while the slide comes to rest;
      // the lede is typed once the slide has arrived (or soon after the first view where nothing moves the page)
      var at = [STEP * 2, STEP * 5];
      parts.forEach(function (fn, i) {
        setTimeout(function () {
          run(fn);
        }, ms(at[i]));
      });
      if (source !== "change" || arrived) setTimeout(say, ms(0.45));
      else
        setTimeout(function () {
          if (!arrived) say();
        }, ms(1.6));
    }
    // the stepper says when the slide is coming and when it is there; where it does not run, the first good view
    about.addEventListener("kit:snap-change", function () {
      enter("change");
    });
    about.addEventListener("kit:snap-arrive", function () {
      var first = !arrived;
      arrived = true;
      if (!entered) enter("arrive");
      else if (first) setTimeout(say, ms(0.1));
    });
    // leaving before the end: the rest of the lede at once, the portrait still (a later visit finds the block at rest)
    about.addEventListener("kit:snap-leave", function () {
      var c = typing();
      if (c && c.finish) c.finish();
      if (speaking) speaking.stop();
    });
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(
        function (entries) {
          if (entries[entries.length - 1].isIntersecting) {
            enter();
            io.disconnect();
          }
        },
        { threshold: 0.3 },
      );
      io.observe(about);
    } else enter();
    if (Site.env.static) enter();
  });
})();
