/*
 * CV page.
 *   1. The time axis: a reading line follows the pointer along the axis (spring.highlight) and says the month it is on;
 *      the bars it crosses step toward the accent and the caption lists them. A bar hovered or focused is named in the caption
 *      and lights its row in the ledger; a click (or Enter) goes to that row. Hovering a row lights its bar, and while the
 *      ledgers are read, the row in the middle of the view lights its bar.
 *   2. The print button: window.print() (the print stylesheet is in cv.css).
 * Without this file the figure is still drawn (CSS) and every bar has its name as its label.
 */
(function () {
  "use strict";

  var Site = window.Site;
  if (!Site) return;
  var env = Site.env;
  var T = Site.tokens;
  var util = Site.util;
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function all(scope, selector) {
    return Array.prototype.slice.call(scope.querySelectorAll(selector));
  }

  /* A caption that changes in place: the old words fade into a light blur as the new ones come out of it (rule B9, subtle). */
  function readout(el) {
    var fallback = el.getAttribute("data-default") || el.textContent;
    el.textContent = "";
    var cur = add(fallback);
    function add(text) {
      var s = document.createElement("span");
      s.textContent = text;
      el.appendChild(s);
      return s;
    }
    return {
      set: function (text) {
        text = text || fallback;
        if (text === cur.textContent) return;
        var old = cur;
        cur = add(text);
        old.setAttribute("aria-hidden", "true");
        if (env.static || !old.animate) {
          old.remove();
          return;
        }
        var sw = Site.css("transition.swap");
        var blur = "blur(" + T.blur.icon + "px)";
        var from = getComputedStyle(old).opacity;
        old.getAnimations().forEach(function (a) {
          a.cancel();
        });
        var out = old.animate([{ opacity: from }, { opacity: 0, filter: blur }], { duration: sw.duration, easing: sw.easing, fill: "forwards" });
        out.onfinish = function () {
          old.remove();
        };
        cur.animate([{ opacity: 0, filter: blur }, { opacity: 1, filter: "blur(0px)" }], { duration: sw.duration, easing: sw.easing });
      },
    };
  }

  function initAxis(fig) {
    var plot = fig.querySelector("[data-cv-plot]");
    var cursor = fig.querySelector("[data-cv-cursor]");
    var label = fig.querySelector("[data-cv-cursor-label]");
    var readEl = fig.querySelector("[data-cv-read]");
    if (!plot || !readEl) return;
    var read = readout(readEl);
    var bars = all(fig, ".cvaxis__bar");
    var t0 = Number(plot.getAttribute("data-t0"));
    var span = Number(plot.getAttribute("data-span"));
    var byRow = {};
    bars.forEach(function (b) {
      byRow[b.getAttribute("data-row")] = b;
    });
    function rowOf(bar) {
      return document.getElementById(bar.getAttribute("data-row"));
    }
    function describe(bar) {
      return bar.getAttribute("data-name") + ", " + bar.getAttribute("data-when") + ".";
    }

    /* ---- naming a bar: hover or focus ---- */
    var named = null;
    var underText = "";
    function light(bar, on) {
      bar.classList.toggle("is-lit", on);
      var row = rowOf(bar);
      if (row) row.classList.toggle("is-lit", on);
    }
    function name(bar) {
      if (named && named !== bar) light(named, false);
      named = bar;
      fig.classList.toggle("is-naming", !!bar);
      if (bar) {
        light(bar, true);
        read.set(describe(bar));
      } else read.set(underText);
    }
    var landedTimer = null;
    function go(bar) {
      var row = rowOf(bar);
      if (!row) return;
      row.scrollIntoView({ behavior: env.reduce ? "auto" : "smooth", block: "center" });
      if (!row.hasAttribute("tabindex")) row.setAttribute("tabindex", "-1");
      row.focus({ preventScroll: true });
      all(document, ".cvrow.is-landed").forEach(function (r) {
        r.classList.remove("is-landed");
      });
      row.classList.add("is-landed");
      var ledger = row.closest("[data-ledger]");
      var hl = ledger && Site.get(ledger, "highlight");
      if (hl && env.hover) hl.moveTo(row);
      clearTimeout(landedTimer);
      landedTimer = setTimeout(function () {
        row.classList.remove("is-landed");
        if (hl && env.hover && !row.matches(":hover")) hl.moveTo(null);
      }, 1800);
    }
    bars.forEach(function (b) {
      b.addEventListener("pointerenter", function (e) {
        if (e.pointerType !== "touch") name(b);
      });
      b.addEventListener("pointerleave", function () {
        if (named === b && document.activeElement !== b) name(null);
      });
      b.addEventListener("focus", function () {
        name(b);
      });
      b.addEventListener("blur", function () {
        if (named === b) name(null);
      });
      b.addEventListener("click", function () {
        go(b);
      });
    });

    /* ---- the reading line ---- */
    var line = { x: 0, v: 0, target: 0, width: 1, on: false, month: -1 };
    var spring = Site.t("spring.highlight");
    var under = [];
    function place() {
      cursor.style.transform = "translateX(" + line.x.toFixed(1) + "px)";
      var m = util.clamp(Math.floor((line.x / line.width) * span), 0, span - 1);
      // the label stays inside the plot at both ends
      var k = line.x < 44 ? "0%" : line.x > line.width - 44 ? "-100%" : "-50%";
      label.style.setProperty("--k", k);
      if (m !== line.month) {
        line.month = m;
        var t = t0 + m;
        label.textContent = MONTHS[t % 12] + " " + Math.floor(t / 12);
        var now = bars.filter(function (b) {
          return Number(b.getAttribute("data-from")) <= m && m < Number(b.getAttribute("data-to"));
        });
        under.forEach(function (b) {
          if (now.indexOf(b) < 0) b.classList.remove("is-under");
        });
        now.forEach(function (b) {
          b.classList.add("is-under");
        });
        under = now;
        underText = now.length
          ? now
              .map(function (b) {
                return b.getAttribute("data-name");
              })
              .join("; ") + "."
          : "";
        if (!named) read.set(underText);
      }
    }
    var loop = util.loop(function (time, delta) {
      var dt = Math.min(delta, 48) / 2000;
      for (var n = 0; n < 2; n++) {
        line.v += (spring.stiffness * (line.target - line.x) - spring.damping * line.v) * dt;
        line.x += line.v * dt;
      }
      if (Math.abs(line.target - line.x) < 0.1 && Math.abs(line.v) < 1) {
        line.x = line.target;
        line.v = 0;
        loop.stop();
      }
      place();
    });
    plot.addEventListener("pointermove", function (e) {
      if (e.pointerType === "touch" || !env.hover) return;
      var r = plot.getBoundingClientRect();
      line.width = r.width || 1;
      line.target = util.clamp(e.clientX - r.left, 0, line.width - 1);
      if (!line.on) {
        line.on = true;
        line.x = line.target;
        line.v = 0;
        cursor.classList.add("is-on");
      }
      if (env.reduce) {
        line.x = line.target;
        place();
      } else loop.start();
    });
    plot.addEventListener("pointerleave", function () {
      if (!line.on) return;
      line.on = false;
      line.month = -1;
      loop.stop();
      cursor.classList.remove("is-on");
      under.forEach(function (b) {
        b.classList.remove("is-under");
      });
      under = [];
      underText = "";
      if (!named) read.set("");
    });

    /* ---- rows light their bars ---- */
    var rows = all(document, ".cvrow[data-bar]");
    rows.forEach(function (row) {
      var bar = byRow[row.getAttribute("data-bar")];
      if (!bar) return;
      row.addEventListener("pointerenter", function (e) {
        if (e.pointerType !== "touch") bar.classList.add("is-lit");
      });
      row.addEventListener("pointerleave", function () {
        if (named !== bar) bar.classList.remove("is-lit");
      });
    });
    // while the ledgers are read, the row in the middle band of the view lights its bar
    var current = null;
    var check = util.throttle(function () {
      var vh = window.innerHeight;
      var best = null;
      var bestD = Infinity;
      rows.forEach(function (r) {
        var b = r.getBoundingClientRect();
        var c = (b.top + b.bottom) / 2;
        if (c < vh * 0.2 || c > vh * 0.7) return;
        var d = Math.abs(c - vh * 0.42);
        if (d < bestD) {
          bestD = d;
          best = r;
        }
      });
      var bar = best ? byRow[best.getAttribute("data-bar")] : null;
      if (bar === current) return;
      if (current) current.classList.remove("is-current");
      current = bar;
      if (bar) bar.classList.add("is-current");
    });
    window.addEventListener("scroll", check, { passive: true });
    Site.on("resize", check);
    check();
  }

  Site.ready(function () {
    var fig = document.querySelector("[data-cv-axis]");
    if (fig) initAxis(fig);
    all(document, "[data-cv-print]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        window.print();
      });
    });
  });
})();
