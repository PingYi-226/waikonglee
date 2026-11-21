/*
 * Research page (/research/). Five parts that the scroll stepper (kit-snap, soft mode) moves between.
 *   1. rail: the four figures of the head are links to the parts. Once the page has left the head they fly into a
 *      rail at the side of the viewport (each from its place in the row to its place in the rail: measured, then
 *      moved and scaled frame by frame, the same elements), and a gliding mark shows the part being read. Back at
 *      the head they fly home. Driven by the stepper's kit:snap-change events.
 *   2. steps: the research areas as a pinned stage, one step per area (the stepper's points). The plate changes its
 *      diagram, the text changes in place (old lines out, new lines in), the mark of seven steps follows. Anchors
 *      (#pqc ...) land on their step. Without the pinned layout: the diagrams draw when they are first seen.
 *   3. papers: the cells arrive in a wave, the totals roll; a row under the pointer stays while the others recede,
 *      its name and the year light up; a click on a row opens the publication list filtered by its area.
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

  /* ================================================================ 1. the rail */
  function initRail(page, parts) {
    var nav = page.querySelector("[data-rfig]");
    var list = nav && nav.querySelector("[data-rfig-list]");
    if (!list) return;
    var meta = nav.closest(".pagehead__meta");
    var links = all(list, "[data-rfig-link]");
    var targets = links.map(function (a) {
      return document.getElementById(a.hash.slice(1));
    });
    var pieces = links.map(function (a) {
      return {
        num: a.querySelector('[data-rfig-part="num"]'),
        q: a.querySelector('[data-rfig-part="q"]'),
        noun: a.querySelector('[data-rfig-part="noun"]'),
      };
    });
    var mq = window.matchMedia(RAIL_Q);
    var current = 0; // the part being read (0: the head)
    var railed = false; // the layout: in the rail (true) or at home in the head
    var flight = null;

    function partOf(el) {
      for (var i = 0; i < parts.length; i++) if (parts[i] === el || parts[i].contains(el)) return i;
      return parts.length - 1; // the stepper's extra stop at the very end of the page
    }

    /* the mark: the link of the part being read, while the figures rest in the rail */
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

    /** Fly the figures to the rail (toRail) or home: measure where they are seen now, switch the layout, then move
     *  and scale each piece from there to its new place, frame by frame (the home places move with the page). */
    function fly(toRail, instant) {
      var els = [];
      pieces.forEach(function (p, k) {
        els.push({ el: p.num, kind: "num", k: k }, { el: p.noun, kind: "noun", k: k }, { el: p.q, kind: "q", k: k });
      });
      els.forEach(function (it) {
        it.from = it.el.getBoundingClientRect();
        var o = parseFloat(it.el.style.opacity);
        it.op = isNaN(o) ? parseFloat(getComputedStyle(it.el).opacity) : o;
      });
      if (flight) cancelAnimationFrame(flight.raf);
      flight = null;
      els.forEach(function (it) {
        it.el.style.transform = "";
        it.el.style.opacity = "";
      });
      if (toRail && !railed) {
        // the head keeps the row's room while its figures are away
        nav.style.minHeight = nav.getBoundingClientRect().height + "px";
        if (meta) meta.classList.add("is-in");
      }
      nav.classList.toggle("is-railed", toRail);
      railed = toRail;
      if (!toRail) nav.style.minHeight = "";
      if (instant || env.static || env.reduce) {
        mark();
        if (env.reduce && !instant && !env.static) {
          stop(list._rFade);
          list._rFade = Site.animate(list, { opacity: [0, 1] }, Site.t("transition.fade"));
        }
        return;
      }
      var sx = window.scrollX;
      var sy = window.scrollY;
      els.forEach(function (it) {
        it.to = it.el.getBoundingClientRect();
        it.delay = it.k * 45 + (it.kind === "num" ? 0 : 55);
      });
      var curve = springCurve(Site.t("spring.glide"));
      var span = curve.ms + 3 * 45 + 55;
      var start = performance.now();
      var f = { raf: 0, toRail: toRail };
      flight = f;
      mark(); // the mark waits for the landing
      nav.classList.add("is-flying");
      function frame(now) {
        if (flight !== f) return;
        var t = now - start;
        // the home places scroll with the page; the rail's are fixed
        var dx = toRail ? 0 : window.scrollX - sx;
        var dy = toRail ? 0 : window.scrollY - sy;
        els.forEach(function (it) {
          var p = curve.at(t - it.delay);
          var lx = it.to.left - dx;
          var ly = it.to.top - dy;
          var x = it.from.left + (lx - it.from.left) * p;
          var y = it.from.top + (ly - it.from.top) * p;
          var s0 = it.to.width > 0 ? it.from.width / it.to.width : 1;
          var s = s0 + (1 - s0) * p;
          it.el.style.transform = "translate(" + util.round(x - lx, 2) + "px, " + util.round(y - ly, 2) + "px) scale(" + util.round(s, 4) + ")";
          if (it.kind === "q") {
            // the qualifier ("peer-reviewed", "open-source" ...) fades on the way out and comes back last
            var o = toRail ? it.op * (1 - util.smooth(util.clamp(t / (span * 0.3), 0, 1))) : util.smooth(util.clamp((t - span * 0.45) / (span * 0.45), 0, 1));
            it.el.style.opacity = String(util.round(o, 3));
          }
        });
        if (t < span) {
          f.raf = requestAnimationFrame(frame);
          return;
        }
        els.forEach(function (it) {
          it.el.style.transform = "";
          it.el.style.opacity = "";
        });
        flight = null;
        nav.classList.remove("is-flying");
        mark();
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
      // the page opened somewhere: put the figures there without a flight
      if (d.initial) sync(true);
      else if (was !== current) sync(false);
      else mark();
    });
    onMq(mq, function () {
      sync(true);
    });
    Site.on("resize", function () {
      if (!railed) nav.style.minHeight = "";
    });

    // a click goes to the part (its first step), with or without the stepper
    list.addEventListener("click", function (e) {
      var a = e.target.closest("[data-rfig-link]");
      if (!a || !plainClick(e)) return;
      var t = targets[links.indexOf(a)];
      if (!t) return;
      e.preventDefault();
      pushHash(a.hash);
      Site.snap.go(t);
      if (!t.hasAttribute("tabindex")) t.setAttribute("tabindex", "-1");
      t.focus({ preventScroll: true });
    });
    // focus on a link in the rail must not send the page back to the head (the stepper follows focus to its part)
    list.addEventListener("focusin", function (e) {
      if (railed) e.stopPropagation();
    });
  }

  /* ================================================================ 2. the research areas */
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

  /* ================================================================ 3. the papers */
  function initPapers(sec) {
    var table = sec.querySelector("[data-rmat]");
    if (!table) return;
    var rows = all(table, "[data-rmat-row]");
    var heads = all(table, ".rmat__line--years [data-col]");
    var feet = all(table, ".rmat__foot [data-col]");
    var nums = all(table, "[data-rmat-num]");

    function arrive() {
      if (table.classList.contains("is-in")) return;
      table.classList.add("is-in");
      var cols = heads.length;
      var wave = env.reduce || env.static ? 0 : (rows.length + cols) * 26 + 400;
      setTimeout(function () {
        table.classList.add("is-settled");
      }, wave + 200);
      // the totals roll once the cells are there: the rows one after the other, then the sum
      nums.forEach(function (el, n) {
        setTimeout(
          function () {
            var c = Site.get(el, "sliding-number");
            if (c && c.play) c.play();
          },
          env.reduce || env.static ? 0 : 260 + n * 70,
        );
      });
    }
    if (env.static || !("IntersectionObserver" in window)) arrive();
    else {
      var io = new IntersectionObserver(
        function (entries) {
          if (!entries[entries.length - 1].isIntersecting) return;
          io.disconnect();
          arrive();
        },
        { threshold: 0.3 },
      );
      io.observe(table);
    }

    /* the row and the year under the pointer */
    var hotRow = null;
    var hotCol = -1;
    function light(row, col) {
      if (row !== hotRow) {
        if (hotRow) hotRow.classList.remove("is-hot");
        hotRow = row;
        if (row) {
          row.classList.add("is-hot");
          table.setAttribute("data-hot-row", "");
        } else table.removeAttribute("data-hot-row");
      }
      if (col !== hotCol) {
        hotCol = col;
        heads.concat(feet).forEach(function (el) {
          el.classList.toggle("is-hot", +el.getAttribute("data-col") === col);
        });
      }
    }
    if (env.hover) {
      table.addEventListener("pointerover", function (e) {
        var row = e.target.closest("[data-rmat-row]");
        var cell = e.target.closest(".rmat__c");
        light(row, cell && row ? +cell.getAttribute("data-col") : -1);
      });
      table.addEventListener("pointerleave", function () {
        light(null, -1);
      });
    }
    table.addEventListener("focusin", function (e) {
      var row = e.target.closest("[data-rmat-row]");
      if (row && e.target.matches(":focus-visible")) light(row, -1);
    });
    table.addEventListener("focusout", function () {
      light(null, -1);
    });
    // a row takes you to the publication list filtered by its area
    table.addEventListener("click", function (e) {
      if (!plainClick(e)) return;
      var row = e.target.closest("[data-rmat-row]");
      if (!row || e.target.closest("a")) return;
      var a = row.querySelector("[data-rmat-link]");
      if (a) a.click();
    });
  }

  Site.ready(function () {
    var page = document.querySelector("[data-rpage]");
    if (!page) return;
    var parts = all(page, ":scope > [data-snap]");
    initRail(page, parts);
    var steps = page.querySelector("[data-rsteps]");
    if (steps) initSteps(page, steps);
    var papers = page.querySelector("[data-rpapers]");
    if (papers) initPapers(papers);
  });
})();
