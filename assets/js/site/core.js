/*
 * Site core: namespace, motion tokens, environment and the component registry.
 * Loaded after vendor/motion.js (global `Motion`) and before every kit-*.js and page script.
 *
 * Components ("kits") are plain functions registered by name and attached to elements with
 * a data attribute, so pages stay declarative:
 *
 *     <span data-kit="sliding-number" data-value="2801">2,801</span>
 *     Site.register("sliding-number", function (el, opts) { ...; return { set: fn, destroy: fn }; });
 *
 * The motion values are Animate UI's tokens (stiffness / damping springs, tweens and curves by role).
 * Rules every kit follows (see _work/KIT_SPEC.md): reduced motion keeps fades and blurs and drops
 * movement; hover effects only on hover-capable fine pointers; only transform, opacity and filter
 * animate; re-triggering retargets; loops pause off screen and in hidden tabs.
 */
(function () {
  "use strict";

  var M = window.Motion;
  var root = document.documentElement;
  var Site = (window.Site = window.Site || {});

  /* ------------------------------------------------------------------ tokens */
  function spring(stiffness, damping, extra) {
    var s = { type: "spring", stiffness: stiffness, damping: damping };
    if (extra) for (var k in extra) s[k] = extra[k];
    return s;
  }
  var ease = {
    out: [0.23, 1, 0.32, 1], // enters or leaves
    soft: [0.215, 0.61, 0.355, 1], // unfolds, dims the page, a menu opens, a sheet slides in
    drawer: [0.34, 1.2, 0.64, 1],
    draw: [0, 0, 0.58, 1], // a mark draws itself
    inOut: [0.77, 0, 0.175, 1], // moves or morphs on screen
    away: [0.33, 0.17, 0.67, 0.5], // dismissed, speeding away
    in: [0.4, 0, 1, 1],
    arrive: [0.11, 0, 0.5, 0],
    color: [0.25, 0.1, 0.25, 1], // a highlight showing up, going or changing colour
    leave: [0, 0, 0.58, 1], // fades out to make way for the next
    enter: [0.25, 0.1, 0.35, 1], // fades in where other content just left
    resize: [0.4, 0, 0.1, 1], // resizes to new content
    fill: [0.4, 0, 0.2, 1],
  };
  function tween(duration, curve, extra) {
    var t = { duration: duration, ease: curve };
    if (extra) for (var k in extra) t[k] = extra[k];
    return t;
  }
  var tokens = {
    ease: ease,
    spring: {
      press: spring(550, 30, { restSpeed: 10 }), // press feedback, there in ~120ms
      pop: spring(400, 29), // tooltips, popovers, tags
      tooltip: spring(400, 31),
      dialog: spring(150, 25), // calm, no overshoot, ~450ms
      toast: spring(280, 24),
      selection: spring(300, 30), // a selection sliding between items
      highlight: spring(500, 40), // a surface following the pointer
      reflow: spring(500, 40), // items making room, a list reordered
      handoff: spring(450, 43),
      morph: spring(660, 52),
      height: spring(300, 30, { bounce: 0, restDelta: 0.01 }),
      slide: spring(300, 35, { restDelta: 0.01 }), // panels sliding, never past
      thumb: spring(300, 25),
      slider: spring(400, 32),
      bounce: spring(200, 16), // small marks popping
      glyph: spring(500, 45),
      checkPop: spring(500, 24),
      entrance: spring(200, 20), // effects bringing content in
      progress: spring(300, 35, { restDelta: 0.01, restSpeed: 0.1 }),
      number: spring(90, 50), // numbers rolling to their value
      // site-specific characters (not Animate UI roles)
      glide: spring(150, 24, { mass: 0.9 }), // a large element travelling across the page
      follow: spring(160, 32, { mass: 0.4 }), // smoothing scroll progress
    },
    transition: {
      menu: tween(0.22, ease.soft),
      overlay: tween(0.4, ease.soft),
      fade: tween(0.2, ease.out),
      color: tween(0.2, ease.color),
      reveal: tween(0.3, ease.out),
      disclosure: tween(0.35, ease.soft),
      panelOut: tween(0.15, ease.leave),
      panelIn: tween(0.3, ease.enter),
      tooltipIn: tween(0.34, ease.enter),
      tooltipOut: tween(0.13, ease.leave),
      panelHeight: tween(0.45, ease.resize),
      check: tween(0.3, ease.draw, { delay: 0.2 }),
      uncheck: tween(0.3, ease.draw),
      fill: tween(0.3, ease.fill),
      popOut: tween(0.15, ease.out),
      swap: tween(0.15, ease.out),
      spin: tween(0.3, ease.out),
      collapse: tween(0.28, ease.inOut),
      dismiss: tween(0.2, ease.away),
      sheet: tween(0.4, ease.soft),
      instant: { duration: 0 },
      // page content arriving (the reference site's hero words): 0.7s on ease.out
      arrive: tween(0.7, ease.out),
    },
    scale: { press: 0.97, choice: 0.985, tooltip: 0.7, popover: 0.8, menu: 0.9, dialog: 0.8, icon: 0.5, toast: 0.96, fill: 0.7, action: 0.9 },
    blur: { tooltip: 6, icon: 2, disclosure: 2, surface: 4, panel: 5, arrive: 12 }, // px
    rotate: { icon: 90 },
    shift: { handoff: 6, navigation: 24, tabs: 12, step: 24, tooltip: 40, shake: 3, rise: 16, arrive: 24 }, // px
    stagger: { stack: 0.03, chars: 0.03, words: 0.07, items: 0.09 }, // s
  };
  Site.tokens = tokens;
  Site.tempo = 1; // multiply every duration; springs keep their shape on the new time scale

  function copy(o) {
    var c = {};
    for (var k in o) c[k] = o[k];
    return c;
  }
  /** A token by path ("spring.pop", "transition.menu"), paced by Site.tempo, with optional overrides ({ delay }). */
  Site.t = function (path, extra) {
    var t = typeof path === "string" ? path.split(".").reduce(function (v, k) { return v && v[k]; }, tokens) : path;
    if (!t) throw new Error("no motion token " + path);
    t = copy(t);
    var tempo = Site.tempo;
    if (tempo !== 1) {
      if (t.type === "spring") {
        t.stiffness = t.stiffness / (tempo * tempo);
        t.damping = t.damping / tempo;
      } else if (t.duration != null) t.duration = t.duration * tempo;
      if (t.delay != null) t.delay = t.delay * tempo;
    }
    if (extra) for (var k in extra) t[k] = extra[k];
    return t;
  };
  /** The CSS timing of a token: { duration (ms), easing }. A spring becomes the linear() curve it plays. */
  Site.css = function (path) {
    var t = Site.t(path);
    if (t.type === "spring" && M && M.createGeneratorEasing) {
      var g = M.createGeneratorEasing(t, 100, M.spring);
      var ms = Math.round(g.duration * 1000);
      return { duration: ms, easing: M.generateLinearEasing(g.ease, ms) };
    }
    return { duration: Math.round((t.duration == null ? 0.3 : t.duration) * 1000), easing: "cubic-bezier(" + (t.ease || ease.out).join(",") + ")" };
  };

  /* ------------------------------------------------------------- environment */
  var mqReduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  var mqHover = window.matchMedia("(hover: hover) and (pointer: fine)");
  var isStatic = /(^|[?&])static(=|&|$)/.test(window.location.search.slice(1));
  var env = (Site.env = {
    static: isStatic, // "?static": every page in its final state, nothing animates (screenshots, printing)
    reduce: isStatic || mqReduce.matches, // fades and blurs stay, movement goes, loops stop
    hover: mqHover.matches, // hover effects only when true
    touch: "ontouchstart" in window || navigator.maxTouchPoints > 0,
  });
  if (isStatic) root.classList.add("is-static");
  root.classList.toggle("is-reduced", env.reduce);
  root.classList.toggle("can-hover", env.hover);

  var listeners = {};
  Site.on = function (name, fn) {
    (listeners[name] = listeners[name] || []).push(fn);
    return function () {
      var a = listeners[name];
      var i = a ? a.indexOf(fn) : -1;
      if (i > -1) a.splice(i, 1);
    };
  };
  Site.emit = function (name, data) {
    (listeners[name] || []).slice().forEach(function (fn) {
      try {
        fn(data);
      } catch (e) {
        report(name, e);
      }
    });
  };
  function report(where, e) {
    if (window.console && console.warn) console.warn("[site] " + where, e);
  }
  function onChange(mq, fn) {
    if (mq.addEventListener) mq.addEventListener("change", fn);
    else if (mq.addListener) mq.addListener(fn);
  }
  onChange(mqReduce, function (e) {
    env.reduce = isStatic || e.matches;
    root.classList.toggle("is-reduced", env.reduce);
    Site.emit("reduce", env.reduce);
  });
  onChange(mqHover, function (e) {
    env.hover = e.matches;
    root.classList.toggle("can-hover", env.hover);
    Site.emit("hover", env.hover);
  });
  /** The colour theme in use: "light" or "dark". Site.on("theme", fn) fires when it changes. */
  Site.theme = function () {
    return root.getAttribute("data-theme") === "dark" ? "dark" : "light";
  };
  new MutationObserver(function () {
    Site.emit("theme", Site.theme());
  }).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
  var resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      Site.emit("resize");
    }, 150);
  });

  /* ------------------------------------------------------------------- utils */
  var util = (Site.util = {
    clamp: function (v, lo, hi) {
      return v < lo ? lo : v > hi ? hi : v;
    },
    lerp: function (a, b, t) {
      return a + (b - a) * t;
    },
    /** Map v from [a, b] to [c, d], clamped. */
    map: function (v, a, b, c, d) {
      var t = b === a ? 0 : (v - a) / (b - a);
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      return c + (d - c) * t;
    },
    smooth: function (t) {
      return t * t * (3 - 2 * t);
    },
    round: function (v, digits) {
      var p = Math.pow(10, digits || 0);
      return Math.round(v * p) / p;
    },
    uid: (function () {
      var n = 0;
      return function (prefix) {
        return (prefix || "k") + "-" + ++n;
      };
    })(),
    debounce: function (fn, ms) {
      var t;
      return function () {
        var a = arguments;
        var self = this;
        clearTimeout(t);
        t = setTimeout(function () {
          fn.apply(self, a);
        }, ms);
      };
    },
    /** Run fn at most once per animation frame. */
    throttle: function (fn) {
      var queued = false;
      var args;
      return function () {
        args = arguments;
        if (queued) return;
        queued = true;
        requestAnimationFrame(function () {
          queued = false;
          fn.apply(null, args);
        });
      };
    },
    /**
     * Tell when an element can be seen: on screen and in a visible tab. fn(true|false) on every change.
     * Use it to pause loops (canvas, marquees, autoplay). Returns a function that stops watching.
     */
    visible: function (el, fn, margin) {
      var onScreen = false;
      var last = null;
      function update() {
        var now = onScreen && !document.hidden;
        if (now !== last) {
          last = now;
          fn(now);
        }
      }
      var io = new IntersectionObserver(
        function (entries) {
          onScreen = entries[entries.length - 1].isIntersecting;
          update();
        },
        { rootMargin: margin || "0px" },
      );
      io.observe(el);
      document.addEventListener("visibilitychange", update);
      return function () {
        io.disconnect();
        document.removeEventListener("visibilitychange", update);
      };
    },
    /** A requestAnimationFrame loop: fn(time, delta). Returns { start, stop, running }. */
    loop: function (fn) {
      var id = null;
      var last = 0;
      function tick(t) {
        var d = last ? Math.min(t - last, 64) : 16;
        last = t;
        fn(t, d);
        if (id !== null) id = requestAnimationFrame(tick);
      }
      var api = {
        running: false,
        start: function () {
          if (id !== null) return;
          last = 0;
          api.running = true;
          id = requestAnimationFrame(tick);
        },
        stop: function () {
          if (id === null) return;
          cancelAnimationFrame(id);
          id = null;
          api.running = false;
        },
      };
      return api;
    },
    /** Page scroll progress of an element: 0 when its top meets the bottom of the viewport, 1 when its bottom meets the top. */
    progress: function (el) {
      var r = el.getBoundingClientRect();
      var vh = window.innerHeight;
      return util.clamp((vh - r.top) / (vh + r.height), 0, 1);
    },
  });

  /** Travel under reduced motion: Site.m(16) is 16 normally and 0 (or `neutral`) when movement must go. */
  Site.m = function (value, neutral) {
    return env.reduce ? (neutral === undefined ? 0 : neutral) : value;
  };

  /**
   * Motion's animate(), with two additions: under "?static" it jumps to the end, and a missing library
   * (script blocked) applies the end state instead of throwing.
   */
  Site.animate = function (target, keyframes, options) {
    if (!M || !M.animate || env.static) {
      var els = typeof target === "string" ? document.querySelectorAll(target) : target && target.length !== undefined && !target.tagName ? target : [target];
      Array.prototype.forEach.call(els, function (el) {
        if (!el || !el.style) return;
        for (var k in keyframes) {
          var v = keyframes[k];
          if (Array.isArray(v)) v = v[v.length - 1];
          if (k === "x" || k === "y" || k === "scale" || k === "rotate") continue; // shorthand transforms rest at none
          el.style[k] = typeof v === "number" && k !== "opacity" && k !== "zIndex" ? v + "px" : v;
        }
      });
      var done = Promise.resolve();
      return { finished: done, then: function (a, b) { return done.then(a, b); }, stop: function () {}, cancel: function () {}, complete: function () {} };
    }
    return M.animate(target, keyframes, options);
  };

  /** Say something to screen readers ("Copied"). The live region is created on first use. */
  var live = null;
  Site.announce = function (text) {
    if (!live) {
      live = document.createElement("div");
      live.setAttribute("role", "status");
      live.setAttribute("aria-live", "polite");
      live.className = "sr-only";
      document.body.appendChild(live);
    }
    live.textContent = "";
    setTimeout(function () {
      live.textContent = text;
    }, 30);
  };

  /* ---------------------------------------------------------------- registry */
  var kits = {};
  var instances = new WeakMap();
  var booted = false;

  function parse(v) {
    if (v === "" || v === "true") return true;
    if (v === "false") return false;
    if (v !== null && v !== "" && !isNaN(Number(v))) return Number(v);
    if (v && (v.charAt(0) === "[" || v.charAt(0) === "{")) {
      try {
        return JSON.parse(v);
      } catch (e) {
        return v;
      }
    }
    return v;
  }
  /** The element's data-* attributes as options: numbers, booleans and JSON are parsed ("data-delay" -> opts.delay). */
  Site.opts = function (el, defaults) {
    var o = {};
    var k;
    if (defaults) for (k in defaults) o[k] = defaults[k];
    for (k in el.dataset) if (k !== "kit") o[k] = parse(el.dataset[k]);
    return o;
  };
  /** Register a component. init(el, opts) may return a controller ({ destroy, ... }) that Site.get(el, name) returns. */
  Site.register = function (name, init) {
    kits[name] = init;
    if (booted) Site.init(document, name);
  };
  function attach(el, only) {
    var names = (el.getAttribute("data-kit") || "").split(/\s+/);
    var map = instances.get(el);
    for (var i = 0; i < names.length; i++) {
      var name = names[i];
      if (!name || (only && name !== only) || !kits[name]) continue;
      if (map && map[name]) continue;
      if (!map) {
        map = {};
        instances.set(el, map);
      }
      try {
        map[name] = kits[name](el, Site.opts(el)) || true;
      } catch (e) {
        map[name] = true;
        report("kit " + name, e);
      }
    }
  }
  /** Attach components to every [data-kit] element inside scope (and scope itself). Safe to call again after adding markup. */
  Site.init = function (scope, only) {
    scope = scope || document;
    if (scope.nodeType === 1 && scope.hasAttribute("data-kit")) attach(scope, only);
    var els = scope.querySelectorAll("[data-kit]");
    for (var i = 0; i < els.length; i++) attach(els[i], only);
  };
  Site.get = function (el, name) {
    var map = el && instances.get(el);
    var c = map && map[name];
    return c && c !== true ? c : null;
  };
  /** Destroy the components attached to el and everything inside it (before removing markup). */
  Site.destroy = function (scope) {
    var els = Array.prototype.slice.call(scope.querySelectorAll("[data-kit]"));
    if (scope.hasAttribute && scope.hasAttribute("data-kit")) els.push(scope);
    els.forEach(function (el) {
      var map = instances.get(el);
      if (!map) return;
      for (var name in map) if (map[name] && map[name].destroy) map[name].destroy();
      instances.delete(el);
    });
  };

  var readyFns = [];
  /** Run fn once the document is parsed and the components are attached. */
  Site.ready = function (fn) {
    if (booted) fn();
    else readyFns.push(fn);
  };
  function boot() {
    if (booted) return;
    booted = true;
    Site.init(document);
    readyFns.splice(0).forEach(function (fn) {
      try {
        fn();
      } catch (e) {
        report("ready", e);
      }
    });
    // two frames, so initial (hidden) states are painted before entrances start
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        root.classList.add("is-ready");
        Site.emit("ready");
      });
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else setTimeout(boot, 0);
})();
