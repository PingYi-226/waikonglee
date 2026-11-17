/*
 * Research page (/research/).
 *   1. areas: the plate follows the area being read (scrollspy on the index says which): the old figure clears through
 *      blur toward where the page is going, the new one draws itself, the figure number rolls, the caption changes,
 *      and the other text blocks recede. A click on the plate draws the figure again; a button pauses its motion.
 *      On small screens each area's own figure draws itself when it is first seen.
 *   2. funded projects: a bar and its row light each other; a bar opens its row.
 *   3. links to sections of this page glide there.
 * Everything here is an enhancement: without this file the page is complete and static.
 *
 * The diagrams (_includes/site/diagrams/<key>.liquid) are another builder's. A finished one carries
 * data-kit="diagram" and a controller { play(), reset(), live(on) }; a placeholder has none, and gets a fade
 * through blur from here instead.
 */
(function () {
  "use strict";

  var Site = window.Site;
  if (!Site) return;
  var T = Site.tokens;
  var env = Site.env;

  function all(scope, selector) {
    return Array.prototype.slice.call(scope.querySelectorAll(selector));
  }
  function kit(el, name) {
    return el ? Site.get(el, name) : null;
  }
  function blur(px) {
    return "blur(" + px + "px)";
  }
  function stop(a) {
    if (a && a.stop) a.stop();
  }

  /* ---------------------------------------------------------- diagrams */
  function controller(holder) {
    var svg = holder && holder.querySelector("svg");
    return svg ? Site.get(svg, "diagram") : null;
  }

  /** Draw the figure inside holder: the diagram's own play(), or a fade through blur for a placeholder. */
  function drawIn(holder, live) {
    var svg = holder.querySelector("svg");
    if (!svg) return;
    var c = Site.get(svg, "diagram");
    if (c) {
      if (c.play) c.play();
      if (c.live) c.live(!!live);
      return;
    }
    stop(svg._rIn);
    svg._rIn = Site.animate(svg, { opacity: [0, 1], filter: [blur(T.blur.arrive), blur(0)] }, Site.t("transition.arrive"));
  }

  /** Back to blank, ready to draw again (the figure is not seen while this happens). */
  function blank(holder) {
    var svg = holder.querySelector("svg");
    if (!svg) return;
    var c = Site.get(svg, "diagram");
    if (c) {
      if (c.live) c.live(false);
      if (c.reset) c.reset();
      return;
    }
    stop(svg._rIn);
    svg._rIn = null;
    svg.style.opacity = "0";
  }

  /* ---------------------------------------------------------- the plate */
  function initAreas(section) {
    var plate = section.querySelector("[data-rplate]");
    var frame = plate && plate.querySelector("[data-rplate-frame]");
    var index = plate && plate.querySelector("[data-rindex]");
    var blocks = all(section, "[data-rarea]");
    if (!plate || !frame || !index || !blocks.length) return;
    var figs = all(frame, "[data-rplate-fig]");
    var tags = all(plate, "[data-rplate-tag]");
    var numEl = plate.querySelector("[data-rplate-no]");
    var pauseBtn = plate.querySelector("[data-rplate-pause]");
    var wide = window.matchMedia("(min-width: 900px)");

    var current = 0;
    var seen = false; // the plate has come into view once: from then on figures draw
    var paused = false;
    var state = figs.map(function () {
      return { drawn: false, anim: null, timer: null };
    });

    section.classList.add("is-spying");

    function show(i, dir) {
      var fig = figs[i];
      var s = state[i];
      fig.classList.add("is-current");
      clearTimeout(s.timer);
      stop(s.anim);
      var travel = Site.m(T.shift.handoff * dir);
      // a figure that was still leaving comes back from where it is; a blank one comes in from the side the page came from
      if (!s.drawn && travel) Site.animate(fig, { y: travel }, { duration: 0 });
      s.anim = Site.animate(fig, { opacity: 1, filter: blur(0), y: 0 }, Site.t("transition.panelIn", { delay: s.drawn ? 0 : 0.08 }));
      if (!s.drawn && seen) {
        s.drawn = true;
        s.timer = setTimeout(function () {
          if (current === i) drawIn(fig, !paused);
        }, env.reduce ? 0 : 80);
      } else if (s.drawn) {
        var c = controller(fig);
        if (c && c.live) c.live(!paused);
      }
    }

    function hide(i, dir) {
      var fig = figs[i];
      var s = state[i];
      fig.classList.remove("is-current");
      clearTimeout(s.timer);
      stop(s.anim);
      var c = controller(fig);
      if (c && c.live) c.live(false);
      s.anim = Site.animate(fig, { opacity: 0, filter: blur(T.blur.panel), y: Site.m(-T.shift.handoff * dir) }, Site.t("transition.panelOut"));
      s.anim.then(function () {
        if (current === i || fig.classList.contains("is-current")) return;
        Site.animate(fig, { y: 0 }, { duration: 0 });
        if (s.drawn) {
          s.drawn = false;
          blank(fig);
        }
      });
    }

    function caption(i, dir) {
      tags.forEach(function (tag, k) {
        stop(tag._rAnim);
        if (k === i) {
          tag.classList.add("is-current");
          tag._rAnim = Site.animate(
            tag,
            { opacity: 1, filter: blur(0), y: [Site.m(T.shift.handoff * dir), 0] },
            Site.t("transition.reveal", { delay: 0.06 }),
          );
        } else if (tag.classList.contains("is-current")) {
          tag.classList.remove("is-current");
          tag._rAnim = Site.animate(tag, { opacity: 0, filter: blur(T.blur.surface), y: Site.m(-T.shift.handoff * dir) }, Site.t("transition.swap"));
        }
      });
      var n = kit(numEl, "sliding-number");
      if (n) n.set(i + 1);
    }

    function select(i) {
      if (i < 0) i = 0;
      if (i === current) return;
      var dir = i > current ? 1 : -1;
      var prev = current;
      current = i;
      blocks.forEach(function (b, k) {
        b.classList.toggle("is-active", k === i);
      });
      hide(prev, dir);
      show(i, dir);
      caption(i, dir);
    }

    index.addEventListener("kit:spy-change", function (e) {
      select(e.detail ? e.detail.index : -1);
    });
    var spy = kit(index, "scrollspy");
    if (spy && spy.id) {
      var start = blocks.map(function (b) { return b.id; }).indexOf(spy.id);
      if (start > 0) {
        // the page opened on an area further down (#hpc): set the plate there without a transition
        blocks.forEach(function (b, k) { b.classList.toggle("is-active", k === start); });
        figs[0].classList.remove("is-current");
        figs[start].classList.add("is-current");
        tags[0].classList.remove("is-current");
        tags[start].classList.add("is-current");
        var n0 = kit(numEl, "sliding-number");
        if (n0) n0.set(start + 1, { instant: true });
        current = start;
      }
    }

    // the first figure draws when the plate is first seen
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(
        function (entries) {
          if (!entries[entries.length - 1].isIntersecting || !wide.matches) return;
          io.disconnect();
          // two frames, so a scrollspy that is still settling (a page opened on #hpc) has said where we are
          requestAnimationFrame(function () {
            requestAnimationFrame(function () {
              seen = true;
              var s = state[current];
              if (!s.drawn) {
                s.drawn = true;
                drawIn(figs[current], !paused);
              }
            });
          });
        },
        { threshold: 0.35 },
      );
      io.observe(frame);
    } else {
      seen = true;
      state[current].drawn = true;
      drawIn(figs[current], true);
    }

    // a click on the plate draws its figure again
    frame.addEventListener("click", function () {
      if (!seen) return;
      var fig = figs[current];
      var c = controller(fig);
      if (c) {
        if (c.reset) c.reset();
        if (c.play) c.play();
        if (c.live) c.live(!paused);
      } else drawIn(fig);
    });

    // pause / play the figure's quiet loop
    if (pauseBtn) {
      pauseBtn.addEventListener("click", function () {
        paused = !paused;
        var label = paused ? "Play the figure" : "Pause the figure";
        pauseBtn.setAttribute("aria-label", label);
        pauseBtn.setAttribute("data-tip", label);
        if (Site.icons && Site.icons.swap) Site.icons.swap(pauseBtn, paused ? "play" : "pause");
        var c = controller(figs[current]);
        if (c && c.live) c.live(!paused);
        Site.announce(paused ? "Figure paused" : "Figure playing");
      });
    }

    // small screens: each area's own figure draws itself the first time it is seen
    if ("IntersectionObserver" in window) {
      var own = all(section, "[data-rarea-fig]");
      var io2 = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (e) {
            if (!e.isIntersecting || wide.matches) return;
            io2.unobserve(e.target);
            drawIn(e.target, true);
          });
        },
        { threshold: 0.3 },
      );
      own.forEach(function (el) {
        io2.observe(el);
      });
    }
  }

  /* ---------------------------------------------------- funded projects */
  function initProjects(section) {
    var bars = all(section, "[data-proj-bar]");
    var list = section.querySelector("[data-rproj-rows]");
    if (!bars.length || !list) return;
    var rows = all(list, "[data-proj-row]");

    function bar(i) {
      return bars[i];
    }
    function row(i) {
      return rows[i];
    }
    function trigger(i) {
      var r = row(i);
      return r && r.querySelector("[data-proj-trigger]");
    }
    function light(i, on) {
      var b = bar(i);
      if (b) b.classList.toggle("is-lit", on);
    }

    bars.forEach(function (b, i) {
      function enter() {
        light(i, true);
        var h = kit(list, "highlight");
        if (h && h.moveTo && env.hover) h.moveTo(row(i));
      }
      function leave() {
        light(i, false);
        var h = kit(list, "highlight");
        if (h && h.moveTo && env.hover) h.moveTo(null);
      }
      if (env.hover) {
        b.addEventListener("pointerenter", enter);
        b.addEventListener("pointerleave", leave);
      }
      b.addEventListener("focus", function () {
        if (b.matches(":focus-visible")) light(i, true);
      });
      b.addEventListener("blur", function () {
        light(i, false);
      });
      // a bar opens its row
      b.addEventListener("click", function () {
        var t = trigger(i);
        var d = kit(t, "disclosure");
        if (d && d.open) d.open();
        else if (t) t.click();
        var r = row(i);
        if (!r) return;
        var box = r.getBoundingClientRect();
        if (box.bottom > window.innerHeight - 40 || box.top < 0) {
          r.scrollIntoView({ behavior: env.reduce ? "auto" : "smooth", block: "nearest" });
        }
      });
    });

    rows.forEach(function (r, i) {
      if (env.hover) {
        r.addEventListener("pointerenter", function () {
          light(i, true);
        });
        r.addEventListener("pointerleave", function () {
          light(i, false);
        });
      }
      r.addEventListener("focusin", function (e) {
        if (e.target.matches(":focus-visible")) light(i, true);
      });
      r.addEventListener("focusout", function () {
        light(i, false);
      });
    });

    list.addEventListener("kit:disclosure-change", function (e) {
      var r = e.target.closest("[data-proj-row]");
      var i = rows.indexOf(r);
      var b = bar(i);
      if (b) b.classList.toggle("is-open", !!(e.detail && e.detail.open));
    });
  }

  /* ------------------------------------------- links within this page glide */
  function initJumps() {
    all(document, ".rtoc a[href^='#']").forEach(function (a) {
      a.addEventListener("click", function (e) {
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
        var t = document.getElementById(decodeURIComponent(a.hash.slice(1)));
        if (!t) return;
        e.preventDefault();
        history.pushState(null, "", a.hash);
        t.scrollIntoView({ behavior: env.reduce ? "auto" : "smooth", block: "start" });
        if (!t.hasAttribute("tabindex")) t.setAttribute("tabindex", "-1");
        t.focus({ preventScroll: true });
      });
    });
  }

  Site.ready(function () {
    var areas = document.querySelector("[data-rareas]");
    if (areas) initAreas(areas);
    var projects = document.querySelector("[data-rproj]");
    if (projects) initProjects(projects);
    initJumps();
  });
})();
