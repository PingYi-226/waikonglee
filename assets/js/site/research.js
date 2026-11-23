/*
 * Research page (/research/). Four parts that the scroll stepper (kit-snap, soft mode) moves between.
 *   1. rail: once the page has left the head, the three part names of the head's contents fly into a rail at the
 *      side of the viewport (the rail's own words do the flying: drawn where the names are, then moved and scaled
 *      frame by frame to the rail), and a gliding mark shows the part being read. Back at the head they fly home.
 *      Driven by the stepper's kit:snap-change events.
 *   2. contents: the head lists the parts and what is inside them. A part name goes to the part, an area to its step
 *      (3. does that), a software group or a project to its part, where it opens once the page has landed there.
 *   3. steps: the research areas as a pinned stage, one step per area (the stepper's points). The plate changes its
 *      diagram, the text changes in place (old lines out, new lines in), the mark of seven steps follows. Anchors
 *      (#pqc ...) land on their step. Without the pinned layout: the diagrams draw when they are first seen.
 * Everything here is an enhancement: without this file the page is complete and static.
 */
(function () {
  "use strict";

  var Site = window.Site;
  if (!Site) return;
  var T = Site.tokens;
  var env = Site.env;
  var util = Site.util;
  var root = document.documentElement;

  /* the two layouts; research.css uses the same conditions (and kit-snap.js shouldRun the pinned one's) */
  var RAIL_Q = "(min-width: 1100px) and (min-aspect-ratio: 1001/1000)";
  var PIN_Q =
    "(hover: hover) and (pointer: fine) and (min-width: 760px) and (min-aspect-ratio: 1001/1000) and (prefers-reduced-motion: no-preference)";

  function all(scope, selector) {
    return Array.prototype.slice.call(scope.querySelectorAll(selector));
  }
  function blur(px) {
    return "blur(" + px + "px)";
  }
  function stop(a) {
    if (a && a.stop) a.stop();
  }
  function plainClick(e) {
    return !(e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey);
  }
  function onMq(mq, fn) {
    if (mq.addEventListener) mq.addEventListener("change", fn);
    else if (mq.addListener) mq.addListener(fn);
  }
  function pushHash(hash) {
    if (window.location.hash === hash) return;
    try {
      history.pushState(null, "", hash);
    } catch (err) {
      /* file:// and the like */
    }
  }
  /** The progress of a spring from 0 to 1 over time (ms), sampled once: { ms, at(t) }. */
  function springCurve(token) {
    var k = token.stiffness;
    var c = token.damping;
    var m = token.mass || 1;
    var x = 0;
    var v = 0;
    var pts = [0];
    for (var i = 1; i <= 4000; i++) {
      var a = (-k * (x - 1) - c * v) / m;
      v += a / 1000;
      x += v / 1000;
      pts.push(x);
      if (i > 60 && Math.abs(x - 1) < 0.0006 && Math.abs(v) < 0.02) break;
    }
    pts[pts.length - 1] = 1;
    return {
      ms: pts.length - 1,
      at: function (t) {
        if (t <= 0) return 0;
        if (t >= pts.length - 1) return 1;
        var j = Math.floor(t);
        return pts[j] + (pts[j + 1] - pts[j]) * (t - j);
      },
    };
  }

  /** Focus an element without scrolling (a part reached from a link: Tab goes on from there). */
  function focusQuiet(el) {
    if (!el) return;
    if (!el.hasAttribute("tabindex") && !el.matches("a[href], button, input, select, textarea, summary")) el.setAttribute("tabindex", "-1");
    el.focus({ preventScroll: true });
  }
  /** Go to a part (its first stop, with or without the stepper), push its hash, take the focus there. */
  function goPart(t, hash) {
    if (!t) return;
    pushHash(hash);
    Site.snap.go(t);
    focusQuiet(t);
  }

  /* ================================================================ 1. the rail */
  function initRail(page, parts) {
    var rail = page.querySelector("[data-rrail]");
    var nav = page.querySelector("[data-rnav]");
    var list = rail && rail.querySelector("[data-rrail-list]");
    if (!list || !nav) return;
    var links = all(list, "[data-rrail-link]");
    var targets = links.map(function (a) {
      return document.getElementById(a.hash.slice(1));
    });
    var railWords = links.map(function (a) {
      return a.querySelector("[data-rnav-word]");
    });
    var headWords = all(nav, "[data-rnav-name] [data-rnav-word]");
    if (headWords.length !== railWords.length) return;
    var lists = all(nav, ".rnav__items");
    var listsAway = false;
    var mq = window.matchMedia(RAIL_Q);
    var current = 0; // the part being read (0: the head)
    var railed = false; // the names: in the rail (true) or at home in the head
    var flight = null;

    // from here on the script shows the rail (.is-on); without it the rail never shows
    rail.hidden = false;

    function partOf(el) {
      for (var i = 0; i < parts.length; i++) if (parts[i] === el || parts[i].contains(el)) return i;
      return parts.length - 1; // the stepper's extra stop at the very end of the page
    }

    /* the mark: the link of the part being read, while the names rest in the rail */
    function mark() {
      links.forEach(function (a, k) {
        var on = railed && !flight && current === k + 1;
        if (on) a.setAttribute("aria-current", "true");
        else a.removeAttribute("aria-current");
      });
    }

    function want() {
      return mq.matches && current > 0;
    }

    /* at rest: the rail shown (railed) or the names at home in the head */
    function settle() {
      railWords.forEach(function (w) {
        w.style.transform = "";
      });
      rail.classList.toggle("is-on", railed);
      rail.classList.remove("is-flying");
      nav.classList.toggle("is-away", railed);
    }

    /* while the names fly off, the head's lists dissolve (they would pass under the names as the page scrolls on);
       once the names are home again, the lists come back part by part. Only where the stepper moves the page: there
       the head is out of sight whenever the names are in the rail. */
    function listsOut() {
      if (listsAway || !Site.snap.active) return;
      listsAway = true;
      lists.forEach(function (ul) {
        stop(ul._rAnim);
        ul._rAnim = Site.animate(ul, { opacity: 0, filter: blur(T.blur.icon) }, Site.t("transition.fade"));
      });
    }
    function listsIn(instant) {
      if (!listsAway) return;
      listsAway = false;
      lists.forEach(function (ul, k) {
        stop(ul._rAnim);
        if (instant) {
          ul.style.opacity = "";
          ul.style.filter = "";
          return;
        }
        ul._rAnim = Site.animate(ul, { opacity: 1, filter: blur(0) }, Site.t("transition.reveal", { delay: k * T.stagger.words }));
        ul._rAnim.then(function () {
          if (listsAway) return;
          ul.style.opacity = "";
          ul.style.filter = "";
        });
      });
    }

    /** Fly the part names to the rail (toRail) or home. The rail's own words do the flying: shown at their places,
     *  drawn (translate + scale) where the names are seen now, then moved frame by frame to where they go; home, the
     *  target is the name's place in the head as the page scrolls it in. At the end the head's word and the rail's
     *  word, the same text in the same face at the same size and place, hand over. */
    function fly(toRail, instant) {
      var from = null;
      if (flight) {
        // turned round on the way: from where they are
        from = railWords.map(function (w) {
          return w.getBoundingClientRect();
        });
        cancelAnimationFrame(flight.raf);
        flight = null;
      } else if (!instant) {
        from = (railed ? railWords : headWords).map(function (w) {
          return w.getBoundingClientRect();
        });
      }
      railed = toRail;
      if (instant || env.static || env.reduce) {
        listsIn(true);
        settle();
        mark();
        if (env.reduce && !instant && !env.static) {
          stop(list._rFade);
          list._rFade = Site.animate(list, { opacity: toRail ? [0, 1] : [1, 0] }, Site.t("transition.fade"));
          list._rFade.then(function () {
            list.style.opacity = "";
          });
          if (!toRail) {
            // fading out: the rail stays shown until it has faded
            rail.classList.add("is-on");
            list._rFade.then(function () {
              if (!railed) rail.classList.remove("is-on");
            });
          }
        }
        return;
      }
      railWords.forEach(function (w) {
        w.style.transform = "";
      });
      rail.classList.add("is-on", "is-flying");
      nav.classList.add("is-away");
      if (toRail) listsOut();
      var base = railWords.map(function (w) {
        return w.getBoundingClientRect();
      });
      var to = toRail
        ? base
        : headWords.map(function (w) {
            return w.getBoundingClientRect();
          });
      var sx = window.scrollX;
      var sy = window.scrollY;
      var curve = springCurve(Site.t("spring.glide"));
      var lag = 45;
      var span = curve.ms + (railWords.length - 1) * lag;
      var start = performance.now();
      var f = { raf: 0 };
      flight = f;
      mark(); // the mark waits for the landing
      function place(t) {
        // the home places scroll with the page; the rail's are fixed
        var dx = toRail ? 0 : window.scrollX - sx;
        var dy = toRail ? 0 : window.scrollY - sy;
        railWords.forEach(function (w, k) {
          // to the rail the first name leaves first; home the last one does (the names never cross)
          var p = curve.at(t - (toRail ? k : railWords.length - 1 - k) * lag);
          var a = from[k];
          var b = to[k];
          var o = base[k];
          var bx = b.left - dx;
          var by = b.top - dy;
          var x = a.left + (bx - a.left) * p;
          var y = a.top + (by - a.top) * p;
          var s = o.width > 0 ? (a.width + (b.width - a.width) * p) / o.width : 1;
          w.style.transform = "translate(" + util.round(x - o.left, 2) + "px, " + util.round(y - o.top, 2) + "px) scale(" + util.round(s, 4) + ")";
        });
      }
      place(0); // drawn where the names are before the first frame paints
      function frame(now) {
        if (flight !== f) return;
        var t = now - start;
        if (t < span) {
          place(t);
          f.raf = requestAnimationFrame(frame);
          return;
        }
        flight = null;
        settle();
        mark();
        if (!railed) listsIn(false);
      }
      f.raf = requestAnimationFrame(frame);
    }

    function sync(instant) {
      var w = want();
      if (w !== railed) fly(w, instant);
      else mark();
    }

    page.addEventListener("kit:snap-change", function (e) {
      current = partOf(e.target);
      // at the very end the footer comes out from under the page: the rail steps aside
      list.classList.toggle("is-away", !!(e.detail && e.detail.end));
      sync(false);
    });
    page.addEventListener("kit:snap-arrive", function (e) {
      var d = e.detail || {};
      var was = current;
      current = partOf(e.target);
      list.classList.toggle("is-away", !!d.end);
      // the page opened somewhere: put the names there without a flight
      if (d.initial) sync(true);
      else if (was !== current) sync(false);
      else mark();
    });
    onMq(mq, function () {
      sync(true);
    });

    // a click goes to the part (its first step), with or without the stepper
    list.addEventListener("click", function (e) {
      var a = e.target.closest("[data-rrail-link]");
      if (!a || !plainClick(e)) return;
      var t = targets[links.indexOf(a)];
      if (!t) return;
      e.preventDefault();
      goPart(t, a.hash);
    });
  }

  /* ================================================================ 2. the contents in the head */
  function initContents(page) {
    var nav = page.querySelector("[data-rnav]");
    if (!nav) return;

    function byHash(hash) {
      var id = (hash || "").slice(1);
      try {
        id = decodeURIComponent(id);
      } catch (err) {
        /* keep it */
      }
      return id ? document.getElementById(id) : null;
    }
    /** A software group or a project row named by a hash, with its section and its disclosure. */
    function rowOf(hash) {
      var row = byHash(hash);
      if (!row || !row.matches(".rgroup, .rproj__row") || !page.contains(row)) return null;
      var btn = row.querySelector("[aria-controls]");
      var sec = row.closest("[data-snap]");
      if (!btn || !sec) return null;
      return { row: row, btn: btn, sec: sec };
    }
    function openRow(r) {
      var c = Site.get(r.btn, "disclosure");
      if (c && !c.isOpen) c.open();
    }
    function inView(el) {
      var b = el.getBoundingClientRect();
      return b.top < window.innerHeight * 0.6 && b.bottom > window.innerHeight * 0.4;
    }
    /** fn once the stepper has landed on sec; not if the page went somewhere else on the way. */
    var waiting = null;
    function whenLanded(sec, fn) {
      if (waiting) waiting.cancel();
      var timer = 0;
      var w = {
        cancel: function () {
          clearTimeout(timer);
          page.removeEventListener("kit:snap-arrive", onArrive);
          page.removeEventListener("kit:snap-change", onChange);
          if (waiting === w) waiting = null;
        },
      };
      function done() {
        w.cancel();
        fn();
      }
      function onArrive(e) {
        if (e.target === sec) done();
      }
      function onChange(e) {
        if (e.target !== sec) w.cancel();
      }
      page.addEventListener("kit:snap-arrive", onArrive);
      page.addEventListener("kit:snap-change", onChange);
      // a move that sends no arrival (it was already there, or it was cut short): look where the page is
      timer = setTimeout(function () {
        if (inView(sec)) done();
        else w.cancel();
      }, 2400);
      waiting = w;
    }

    /** The row being landed on is a snap area until the visitor scrolls on. */
    var landing = null;
    function land(row) {
      if (landing) landing.classList.remove("is-landing");
      landing = row;
      row.classList.add("is-landing");
    }
    function leaveLanding() {
      if (!landing) return;
      landing.classList.remove("is-landing");
      landing = null;
    }
    ["wheel", "touchstart", "keydown"].forEach(function (type) {
      window.addEventListener(type, leaveLanding, { passive: true });
    });

    /** fn once a native scroll has come to rest (scrollend, else no scroll for 160 ms; 1.6 s at most). */
    function whenStill(fn) {
      var done = false;
      var quiet = 0;
      function finish() {
        if (done) return;
        done = true;
        clearTimeout(quiet);
        clearTimeout(cap);
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("scrollend", finish);
        fn();
      }
      function onScroll() {
        clearTimeout(quiet);
        quiet = setTimeout(finish, 160);
      }
      var cap = setTimeout(finish, 1600);
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("scrollend", finish);
      onScroll();
    }

    /** Go to a group of software or a project and open it (push: the hash goes into the history). */
    function goRow(r, push) {
      if (push) pushHash("#" + r.row.id);
      if (Site.snap.active) {
        var st = Site.snap.stops.filter(function (s) {
          return s.element === r.sec && !s.end;
        })[0];
        var there = st && Site.snap.index === st.index && !Site.snap.moving && Math.abs(window.scrollY - st.y) < 3;
        Site.snap.go(r.sec);
        if (there) openRow(r);
        else
          whenLanded(r.sec, function () {
            openRow(r);
          });
      } else {
        // scrolling natively: the rows above it close at once, the page glides to its row, and it opens once the
        // page is still (opening on the way, the browser's scroll anchoring would push the page on). For the landing
        // the row is a snap area itself (research.css .is-landing), so the proximity snapping of the native mode
        // lands on it and not on a section's start nearby.
        var shift = 0;
        var rows = all(r.row.parentNode, ":scope > li");
        for (var i = 0; i < rows.length && rows[i] !== r.row; i++) {
          var b = rows[i].querySelector("[aria-controls]");
          var c = b && Site.get(b, "disclosure");
          var p = b && document.getElementById(b.getAttribute("aria-controls"));
          if (c && c.isOpen && p) {
            shift += p.offsetHeight;
            c.close();
          }
        }
        land(r.row);
        var pad = parseFloat(getComputedStyle(root).scrollPaddingTop) || 0;
        var y = Math.max(0, r.row.getBoundingClientRect().top + window.scrollY - shift - pad);
        var glide = !(env.reduce || env.static) && Math.abs(window.scrollY - y) > 2;
        window.scrollTo({ top: y, behavior: glide ? "smooth" : "instant" });
        if (glide)
          whenStill(function () {
            openRow(r);
          });
        else openRow(r);
      }
      focusQuiet(r.btn);
    }

    nav.addEventListener("click", function (e) {
      var a = e.target.closest("a[href^='#']");
      if (!a || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      // an area: the research areas' own handler (capture phase) has gone to its step; the focus follows
      if (a.getAttribute("data-rnav-to") === "area") {
        if (e.defaultPrevented) focusQuiet(byHash(a.getAttribute("href")));
        return;
      }
      if (e.defaultPrevented) return;
      var r = rowOf(a.getAttribute("href"));
      if (r) {
        e.preventDefault();
        goRow(r, true);
        return;
      }
      if (a.hasAttribute("data-rnav-name")) {
        var t = byHash(a.getAttribute("href"));
        if (!t) return;
        e.preventDefault();
        goPart(t, a.hash);
      }
    });

    // Back / Forward to a group or a project, or a hash set by a script: there, open
    window.addEventListener("hashchange", function () {
      var r = rowOf(window.location.hash);
      if (r) goRow(r, false);
    });
    // a page opened on one: once the stepper has landed (after load), open it
    function landOnRow() {
      var r = rowOf(window.location.hash);
      if (!r) return;
      if (Site.snap.active) goRow(r, false);
      else openRow(r);
    }
    var again = function () {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          requestAnimationFrame(landOnRow);
        });
      });
    };
    if (rowOf(window.location.hash)) {
      if (document.readyState === "complete") again();
      else window.addEventListener("load", again);
    }
  }

  /* ================================================================ 3. the research areas */
  function initSteps(page, sec) {
    var areas = all(sec, "[data-rarea]");
    if (!areas.length) return;
    var keys = areas.map(function (a) {
      return a.id;
    });
    var steps = all(sec, "[data-rprog-step]");
    var plate = sec.querySelector("[data-rsteps-plate]");
    var plateIn = plate && plate.querySelector(".rsteps__plate-in");
    var mq = window.matchMedia(PIN_Q);
    var pinned = false;
    var cur = 0;
    var stageSeen = false; // the stage is in view (enough of it): figures draw
    var pending = -1; // a figure to draw once the stage is seen
    var plainIo = null;

    function fig(k) {
      return areas[k].querySelector("[data-rarea-fig]");
    }
    function dg(k) {
      var svg = fig(k).querySelector("svg");
      return svg ? Site.get(svg, "diagram") : null;
    }
    function lines(k) {
      return all(areas[k], "[data-rarea-line]");
    }
    function isPinned() {
      return mq.matches && root.classList.contains("js") && !env.static;
    }
    /** The stepper's stops in this section, in order (one per area while pinned). */
    function stopsHere() {
      return Site.snap.stops.filter(function (s) {
        return s.element === sec && !s.end;
      });
    }

    /* ---- drawing */
    function draw(k) {
      var c = dg(k);
      if (!c) return;
      if (!stageSeen) {
        pending = k;
        return;
      }
      pending = -1;
      c.reset();
      c.play();
      c.live(true);
    }

    /* ---- the mark of seven steps */
    function marks(i, dir) {
      steps.forEach(function (s, k) {
        var was = s.classList.contains("is-current");
        s.classList.toggle("is-current", k === i);
        s.classList.toggle("is-past", k < i);
        if (k === i) s.setAttribute("aria-current", "step");
        else s.removeAttribute("aria-current");
        var fill = s.querySelector(".rprog__fill");
        if (!fill || dir === 0 || env.static) return;
        // the new step fills from the side the page came from; the old one empties toward the new
        if (k === i && !was) {
          stop(fill._rAnim);
          fill.style.transformOrigin = dir > 0 ? "0 50%" : "100% 50%";
          fill._rAnim = Site.animate(fill, { transform: env.reduce ? "none" : ["scaleX(0)", "scaleX(1)"], opacity: env.reduce ? [0, 1] : 1 }, Site.t("spring.selection"));
        } else if (k !== i && was) {
          stop(fill._rAnim);
          fill.style.transformOrigin = dir > 0 ? "100% 50%" : "0 50%";
          fill._rAnim = Site.animate(fill, { transform: ["scaleX(1)", "scaleX(0)"] }, Site.t("transition.panelHeight"));
          fill._rAnim.then(function () {
            fill.style.transform = "";
          });
        }
      });
    }

    /* ---- an area leaves: its lines go in reading order, its figure clears */
    function leave(k, dir) {
      var a = areas[k];
      var gen = (a._rGen = (a._rGen || 0) + 1);
      a.classList.remove("is-current");
      a.classList.add("is-leaving");
      a.inert = true;
      var c = dg(k);
      if (c) c.live(false);
      var anims = [];
      lines(k).forEach(function (el, n) {
        stop(el._rAnim);
        el._rAnim = Site.animate(
          el,
          { opacity: 0, y: Site.m(-dir * T.shift.tabs), filter: blur(T.blur.surface) },
          Site.t("transition.panelOut", { delay: n * 0.03 }),
        );
        anims.push(el._rAnim);
      });
      var f = fig(k);
      stop(f._rAnim);
      f._rAnim = Site.animate(f, { opacity: 0, y: Site.m(-dir * T.shift.handoff), filter: blur(T.blur.panel) }, Site.t("transition.panelOut"));
      anims.push(f._rAnim);
      Promise.all(anims).then(function () {
        if (a._rGen !== gen || a.classList.contains("is-current")) return;
        a.classList.remove("is-leaving");
        if (c) c.reset();
      });
    }

    /* ---- an area arrives: the figure draws itself, the lines come in one after the other */
    function enter(k, dir) {
      var a = areas[k];
      var gen = (a._rGen = (a._rGen || 0) + 1);
      var wasShown = a.classList.contains("is-leaving");
      a.classList.remove("is-leaving");
      a.classList.add("is-current");
      a.inert = false;
      var f = fig(k);
      stop(f._rAnim);
      if (wasShown) {
        // turned round on its way out: back from where it is, the drawing as it was
        f._rAnim = Site.animate(f, { opacity: 1, y: 0, filter: blur(0) }, Site.t("transition.panelIn"));
        var c = dg(k);
        if (c) c.live(true);
      } else {
        f.style.filter = "";
        f._rAnim = Site.animate(f, { opacity: [0, 1], y: [Site.m(dir * T.shift.handoff), 0] }, Site.t("transition.fade"));
        setTimeout(function () {
          if (a._rGen === gen && cur === k) draw(k);
        }, env.reduce ? 0 : 70);
      }
      lines(k).forEach(function (el, n) {
        stop(el._rAnim);
        var opts = Site.t("transition.arrive", { delay: (wasShown ? 0.04 : 0.15) + n * T.stagger.words });
        var to = { opacity: 1, y: 0, filter: blur(0) };
        if (!wasShown) {
          to = { opacity: [0, 1], y: [Site.m(dir * T.shift.rise), 0], filter: [blur(T.blur.surface), blur(0)] };
        }
        el._rAnim = Site.animate(el, to, opts);
      });
    }

    function plate_breathe() {
      if (!plateIn || env.reduce || env.static) return;
      stop(plateIn._rAnim);
      plateIn._rAnim = Site.animate(plateIn, { scale: T.scale.choice }, Site.t("transition.swap"));
      plateIn._rAnim.then(function () {
        plateIn._rAnim = Site.animate(plateIn, { scale: 1 }, Site.t("spring.bounce"));
      });
    }

    /** Show area i (dir: +1 down, -1 up, 0 at once). */
    function show(i, dir, instant) {
      if (i < 0 || i >= areas.length) return;
      if (instant) {
        cur = i;
        areas.forEach(function (a, k) {
          a._rGen = (a._rGen || 0) + 1;
          a.classList.toggle("is-current", k === i);
          a.classList.remove("is-leaving");
          a.inert = k !== i;
          lines(k).concat([fig(k)]).forEach(function (el) {
            stop(el._rAnim);
            el.style.opacity = "";
            el.style.transform = "";
            el.style.filter = "";
          });
          var c = dg(k);
          if (c && k !== i) {
            c.live(false);
            c.reset();
          }
        });
        marks(i, 0);
        draw(i);
        return;
      }
      if (i === cur) return;
      if (!dir) dir = i > cur ? 1 : -1;
      var from = cur;
      cur = i;
      marks(i, dir);
      plate_breathe();
      leave(from, dir);
      enter(i, dir);
    }

    /* ---- the pinned layout on and off (a resize can cross the line) */
    function setup() {
      var p = isPinned();
      if (p === pinned) return;
      pinned = p;
      if (plainIo) {
        plainIo.disconnect();
        plainIo = null;
      }
      // the plate draws its figure again on a click; the cursor says so with a word
      areas.forEach(function (a, k) {
        if (pinned) fig(k).setAttribute("data-cursor", "Redraw");
        else fig(k).removeAttribute("data-cursor");
      });
      if (pinned) {
        show(cur, 0, true);
        return;
      }
      // one after the other: everything shown; each figure draws when it is first seen
      areas.forEach(function (a, k) {
        a._rGen = (a._rGen || 0) + 1;
        a.inert = false;
        a.classList.remove("is-leaving");
        lines(k).concat([fig(k)]).forEach(function (el) {
          stop(el._rAnim);
          el.style.opacity = "";
          el.style.transform = "";
          el.style.filter = "";
        });
      });
      if (env.reduce || env.static || !("IntersectionObserver" in window)) {
        areas.forEach(function (a, k) {
          var c = dg(k);
          if (c) {
            c.play();
            c.live(true);
          }
        });
        return;
      }
      areas.forEach(function (a, k) {
        var c = dg(k);
        if (c) c.reset();
      });
      plainIo = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (e) {
            if (!e.isIntersecting) return;
            plainIo.unobserve(e.target);
            var c = dg(areas.indexOf(e.target.closest("[data-rarea]")));
            if (c) {
              c.play();
              c.live(true);
            }
          });
        },
        { threshold: 0.3 },
      );
      areas.forEach(function (a, k) {
        plainIo.observe(fig(k));
      });
    }

    /* ---- where the stage is: figures draw only once it is seen */
    if ("IntersectionObserver" in window && !env.static) {
      new IntersectionObserver(
        function (entries) {
          var e = entries[entries.length - 1];
          stageSeen = e.isIntersecting;
          if (stageSeen && pinned && pending > -1) draw(pending);
        },
        { threshold: 0.35 },
      ).observe(plate || sec);
    } else stageSeen = true;

    /* ---- the stepper says which point the page is going to */
    sec.addEventListener("kit:snap-change", function (e) {
      if (!pinned || e.target !== sec) return;
      var d = e.detail || {};
      show(d.point || 0, d.direction || 0, false);
    });
    // resting outside the section while the stage is out of sight: the stage waits at the end the page will come from
    page.addEventListener("kit:snap-arrive", function (e) {
      if (!pinned || e.target === sec) return;
      var r = sec.getBoundingClientRect();
      if (r.bottom > 0 && r.top < window.innerHeight) return;
      var edge = r.top >= window.innerHeight ? 0 : areas.length - 1;
      if (edge !== cur) show(edge, 0, true);
    });

    /* ---- anchors: #pqc ... land on their step */
    function stepOfHash(hash) {
      var id = (hash || "").slice(1);
      try {
        id = decodeURIComponent(id);
      } catch (err) {
        /* keep it */
      }
      return keys.indexOf(id);
    }
    function goStep(k, instant) {
      var st = stopsHere()[k];
      if (!st) return false;
      if (instant || !Site.snap.active) {
        if (instant) window.scrollTo({ top: st.y, behavior: "instant" });
        else window.scrollTo({ top: st.y, behavior: "smooth" });
        show(k, 0, true);
        return true;
      }
      Site.snap.go(st.index);
      return true;
    }
    // capture: before the stepper's own handler for in-page links (which would go to the section's nearest stop)
    document.addEventListener(
      "click",
      function (e) {
        if (!pinned || !plainClick(e)) return;
        var a = e.target.closest ? e.target.closest('a[href^="#"]') : null;
        if (!a) return;
        var k = stepOfHash(a.getAttribute("href"));
        if (k < 0) return;
        if (!goStep(k, false)) return;
        e.preventDefault();
        pushHash("#" + keys[k]);
      },
      true,
    );
    // a hash typed or set by a script: the browser jumps first (its scroll event comes a frame later), then we go
    window.addEventListener("hashchange", function () {
      var k = stepOfHash(window.location.hash);
      if (!pinned || k < 0) return;
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          goStep(k, false);
        });
      });
    });
    function landOnHash() {
      var k = stepOfHash(window.location.hash);
      if (!pinned || k < 0) return;
      var st = stopsHere()[k];
      if (st && Math.abs(window.scrollY - st.y) > 2) goStep(k, true);
      else if (st && cur !== k) show(k, 0, true);
    }

    /* ---- a click on the plate draws its figure again */
    areas.forEach(function (a, k) {
      fig(k).addEventListener("click", function () {
        if (!pinned || k !== cur || !stageSeen) return;
        draw(k);
      });
    });

    setup();
    onMq(mq, setup);
    if (pinned) {
      // the finished drawings of the markup wait blank until their area is shown and seen
      areas.forEach(function (a, k) {
        var c = dg(k);
        if (!c) return;
        c.live(false);
        c.reset();
      });
      var k0 = stepOfHash(window.location.hash);
      if (k0 > -1) cur = k0;
      show(cur, 0, true);
      landOnHash();
      // the browser's own jump to the fragment and the stepper's landing come after load: look again then
      var again = function () {
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            requestAnimationFrame(landOnHash);
          });
        });
      };
      if (document.readyState === "complete") again();
      else window.addEventListener("load", again);
    }
  }

  Site.ready(function () {
    var page = document.querySelector("[data-rpage]");
    if (!page) return;
    var parts = all(page, ":scope > [data-snap]");
    initRail(page, parts);
    initContents(page);
    var steps = page.querySelector("[data-rsteps]");
    if (steps) initSteps(page, steps);
  });
})();
