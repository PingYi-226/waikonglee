/*
 * Home page, about block (one slide).
 *   1. entrance, once, when the slide is first reached: the lede's words arrive, the portrait a beat later, then the
 *      strip draws itself along the time axis (the stepper's kit:snap-change, or the first view where it does not run)
 *   2. the strip: a shimmer of light travels along the bars now and then while the slide is current; a bar under the
 *      pointer or the keyboard raises a plate with its details (what, where, when) while the other bars recede
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
  var SHIMMER = 1.7; // s for the light to cross the axis
  var SHIMMER_EVERY = 6.5; // s between two crossings
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

  /* ================================================================== strip */
  function initStrip(strip, about) {
    var segs = all(strip, ".strip__seg");
    if (!segs.length) return null;
    var glints = all(strip, ".strip__glint");
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
        strip.classList.add("is-drawn");
        a.cancel();
        scheduleShimmer(ms(0.6));
      };
      a.onfinish = done;
      // never leave the strip undrawn (a tab hidden while it plays, a timeline that does not run)
      setTimeout(function () {
        if (!strip.classList.contains("is-drawn")) done();
      }, ms(DRAW) + 1500);
    }

    /* ---- the shimmer: light along the bars, now and then, only while the slide is current */
    var shimmerTimer = null;
    var shimmering = [];
    var onScreen = false;
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
      shimmerTimer = null;
      if (current || document.hidden || !isCurrent()) {
        if (onScreen) scheduleShimmer();
        return;
      }
      var easing = bezier(T.ease.inOut);
      shimmering = glints.map(function (g) {
        var l = parseFloat(getComputedStyle(g.closest(".strip__seg")).getPropertyValue("--l")) || 0;
        return g.animate([{ translate: (-12 - l).toFixed(3) + "cqw 0" }, { translate: (106 - l).toFixed(3) + "cqw 0" }], {
          duration: ms(SHIMMER),
          easing: easing,
        });
      });
      scheduleShimmer(ms(SHIMMER + SHIMMER_EVERY));
    }
    function stopShimmer() {
      clearTimeout(shimmerTimer);
      shimmerTimer = null;
      shimmering.forEach(function (a) {
        a.cancel();
      });
      shimmering = [];
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

  /* =============================================================== entrance */
  Site.ready(function () {
    var about = document.querySelector("[data-about]");
    if (!about) return;
    var lede = about.querySelector(".about__lede");
    var photo = about.querySelector(".about__photo");
    var strip = about.querySelector("[data-strip]");
    var stripCtl = null;
    try {
      stripCtl = strip ? initStrip(strip, about) : null;
    } catch (e) {
      if (strip) strip.classList.add("is-drawn");
      Site.errors.push({ where: "home-about strip", message: String(e && e.message), stack: String((e && e.stack) || "").slice(0, 600) });
    }

    var entered = false;
    function enter() {
      if (entered) return;
      entered = true;
      var parts = [
        function () {
          var c = lede && Site.get(lede, "split");
          if (c && c.play) c.play();
        },
        function () {
          var c = photo && Site.get(photo, "reveal");
          if (c && c.play) c.play();
        },
        function () {
          if (stripCtl) stripCtl.draw();
          else if (strip) strip.classList.add("is-drawn");
        },
      ];
      // the lede first, the portrait a beat later, then the strip (which waits for the words to be well on their way)
      var at = [0, STEP * 2, STEP * 5];
      parts.forEach(function (fn, i) {
        if (Site.env.static) return fn();
        setTimeout(function () {
          try {
            fn();
          } catch (e) {
            Site.errors.push({ where: "home-about entrance", message: String(e && e.message), stack: "" });
          }
        }, ms(at[i]));
      });
    }
    // the stepper says when the slide is coming; where it does not run, the first good view of the block
    about.addEventListener("kit:snap-change", enter);
    about.addEventListener("kit:snap-arrive", enter);
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
