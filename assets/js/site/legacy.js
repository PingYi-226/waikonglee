/*
 * Site interactions. Plain JavaScript, no dependencies.
 *   1. entrance and scroll reveals      2. counting figures
 *   3. the lattice drawing in the hero  4. publication tools (chart, filters, search, panels)
 * Everything degrades gracefully: without JavaScript the pages are complete and static,
 * and with "reduce motion" switched on nothing animates.
 */
(function () {
  "use strict";

  var root = document.documentElement;
  var motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  var reduceMotion = motionQuery.matches;
  var staticMode = /(^|[?&])static(=|&|$)/.test(window.location.search.slice(1));
  // "?static" shows every page in its final state with no animation (useful for printing and screenshots).
  if (staticMode) {
    reduceMotion = true;
    root.classList.add("is-static");
  }
  var motionListeners = [];
  if (motionQuery.addEventListener) {
    motionQuery.addEventListener("change", function (e) {
      reduceMotion = staticMode || e.matches;
      motionListeners.forEach(function (fn) {
        fn();
      });
    });
  }

  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  function cssVar(name) {
    return getComputedStyle(root).getPropertyValue(name).trim();
  }

  function each(list, fn) {
    Array.prototype.forEach.call(list, fn);
  }

  /* ---------- 1. Entrance and reveals ---------- */
  function initReveals() {
    var items = Array.prototype.slice.call(document.querySelectorAll(".reveal"));
    if (!("IntersectionObserver" in window) || reduceMotion) {
      items.forEach(function (el) {
        el.classList.add("is-in");
      });
      return;
    }
    var io = new IntersectionObserver(
      function (entries) {
        var batch = entries.filter(function (e) {
          return e.isIntersecting;
        });
        batch.forEach(function (e, i) {
          e.target.style.setProperty("--d", Math.min(i, 6) * 70 + "ms");
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    items.forEach(function (el) {
      io.observe(el);
    });
  }

  function initScrollState() {
    var ticking = false;
    function update() {
      document.body.classList.toggle("is-scrolled", window.scrollY > 8);
      ticking = false;
    }
    window.addEventListener(
      "scroll",
      function () {
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(update);
        }
      },
      { passive: true },
    );
    update();
  }

  /* ---------- 2. Counting figures ----------
     The figure counts up once when it scrolls into view. Screen readers get the final
     value only: the moving digits sit in an aria-hidden span next to a hidden copy. */
  function initCounters() {
    var els = Array.prototype.slice.call(document.querySelectorAll("[data-count]"));
    if (!els.length || reduceMotion || !("IntersectionObserver" in window)) return;

    function prepare(el) {
      var raw = (el.getAttribute("data-count") || "").trim();
      var m = raw.match(/^([^\d]*)([\d,]*\.?\d+)(.*)$/);
      if (!m) return null;
      var numText = m[2];
      var target = parseFloat(numText.replace(/,/g, ""));
      if (!isFinite(target)) return null;
      var decimals = (numText.split(".")[1] || "").length;
      var grouped = numText.indexOf(",") !== -1;
      var finalText = el.textContent;
      var live = document.createElement("span");
      live.setAttribute("aria-hidden", "true");
      live.textContent = finalText;
      var fixed = document.createElement("span");
      fixed.className = "sr-only";
      fixed.textContent = finalText;
      el.textContent = "";
      el.appendChild(live);
      el.appendChild(fixed);
      return {
        live: live,
        target: target,
        finalText: finalText,
        format: function (v) {
          var s = v.toFixed(decimals);
          if (grouped) {
            var parts = s.split(".");
            parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
            s = parts.join(".");
          }
          return m[1] + s + m[3];
        },
      };
    }

    function run(c) {
      var start = null;
      var duration = 1500;
      function frame(t) {
        if (start === null) start = t;
        var p = Math.min((t - start) / duration, 1);
        c.live.textContent = p < 1 ? c.format(c.target * (1 - Math.pow(1 - p, 4))) : c.finalText;
        if (p < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }

    var counters = new Map();
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            run(counters.get(e.target));
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.4 },
    );
    els.forEach(function (el) {
      var c = prepare(el);
      if (c) {
        counters.set(el, c);
        io.observe(el);
      }
    });
  }

  /* ---------- 3. Lattice drawing ----------
     A point lattice whose basis breathes very slowly. The lattice point closest to the
     pointer is marked, with the vector that joins them: the closest-vector problem that
     lattice-based cryptography rests on, drawn the way a textbook figure would draw it. */
  function initLattice(canvas) {
    var ctx = canvas.getContext("2d");
    if (!ctx) return;
    var host = canvas.closest(".hero") || canvas.parentElement;
    var w = 0;
    var h = 0;
    var dpr = 1;
    var colors = {};
    var pointer = { x: 0, y: 0, active: false };
    var cur = { x: null, y: null };
    var running = false;
    var visible = true;
    var rafId = null;
    var lastFrame = 0;

    function readColors() {
      colors.dot = cssVar("--faint") || "#a8a7a0";
      colors.line = cssVar("--accent") || "#2f5d54";
      colors.text = cssVar("--muted") || "#686b73";
      colors.axis = cssVar("--line-strong") || "rgba(43,45,51,.24)";
    }

    function resize() {
      var r = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width;
      h = r.height;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!running) draw(0);
    }

    function geometry(time) {
      var s = Math.max(34, Math.min(54, w / 26));
      var a = 0.1 * Math.sin(time * 0.00011);
      var k = 0.36 + 0.09 * Math.sin(time * 0.00007 + 1.3);
      var narrow = w < 760;
      return {
        s: s,
        narrow: narrow,
        b1: [s * Math.cos(a), s * Math.sin(a)],
        b2: [s * k, -s * (0.92 + 0.035 * Math.cos(time * 0.00009))],
        ox: narrow ? w * 0.5 : w * 0.74,
        oy: narrow ? h - 88 : h * 0.5,
      };
    }

    function arrow(x0, y0, x1, y1) {
      var ang = Math.atan2(y1 - y0, x1 - x0);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1 - 6 * Math.cos(ang - 0.42), y1 - 6 * Math.sin(ang - 0.42));
      ctx.lineTo(x1 - 6 * Math.cos(ang + 0.42), y1 - 6 * Math.sin(ang + 0.42));
      ctx.closePath();
      ctx.fill();
    }

    function draw(time) {
      if (!w || !h) return;
      var g = geometry(time);
      var b1 = g.b1;
      var b2 = g.b2;
      var det = b1[0] * b2[1] - b1[1] * b2[0];

      var tx;
      var ty;
      if (pointer.active) {
        tx = pointer.x;
        ty = pointer.y;
      } else {
        tx = g.ox + Math.cos(time * 0.00021) * g.s * 3.4;
        ty = g.oy + Math.sin(time * 0.00033) * g.s * (g.narrow ? 1.1 : 2.6);
      }
      if (cur.x === null) {
        cur.x = tx;
        cur.y = ty;
      }
      cur.x += (tx - cur.x) * 0.12;
      cur.y += (ty - cur.y) * 0.12;

      // lattice coordinates of the target, then the nearest point among the neighbours
      var u = ((cur.x - g.ox) * b2[1] - (cur.y - g.oy) * b2[0]) / det;
      var v = (b1[0] * (cur.y - g.oy) - b1[1] * (cur.x - g.ox)) / det;
      var best = null;
      var bestD = Infinity;
      for (var di = -2; di <= 2; di++) {
        for (var dj = -2; dj <= 2; dj++) {
          var ci = Math.round(u) + di;
          var cj = Math.round(v) + dj;
          var cx = g.ox + ci * b1[0] + cj * b2[0];
          var cy = g.oy + ci * b1[1] + cj * b2[1];
          var cd = (cx - cur.x) * (cx - cur.x) + (cy - cur.y) * (cy - cur.y);
          if (cd < bestD) {
            bestD = cd;
            best = { i: ci, j: cj, x: cx, y: cy };
          }
        }
      }

      ctx.clearRect(0, 0, w, h);

      // points
      var span = Math.ceil((w + h) / g.s) + 4;
      var sigma = g.s * 1.9;
      ctx.fillStyle = colors.dot;
      for (var i = -span; i <= span; i++) {
        for (var j = -span; j <= span; j++) {
          var x = g.ox + i * b1[0] + j * b2[0];
          var y = g.oy + i * b1[1] + j * b2[1];
          if (x < -10 || x > w + 10 || y < -10 || y > h + 10) continue;
          var d2 = (x - cur.x) * (x - cur.x) + (y - cur.y) * (y - cur.y);
          var near = Math.exp(-d2 / (2 * sigma * sigma));
          ctx.globalAlpha = 0.5 + 0.45 * near;
          ctx.beginPath();
          ctx.arc(x, y, 1.15 + 1.1 * near, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // basis vectors at the origin
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = colors.axis;
      ctx.fillStyle = colors.axis;
      ctx.lineWidth = 1;
      arrow(g.ox, g.oy, g.ox + b1[0], g.oy + b1[1]);
      arrow(g.ox, g.oy, g.ox + b2[0], g.oy + b2[1]);
      ctx.font = '10px "IBM Plex Mono", ui-monospace, monospace';
      ctx.fillStyle = colors.text;
      ctx.globalAlpha = 0.85;
      ctx.fillText("b\u2081", g.ox + b1[0] + 6, g.oy + b1[1] + 12);
      ctx.fillText("b\u2082", g.ox + b2[0] + 7, g.oy + b2[1] - 4);

      // target, closest lattice point and the vector between them
      if (best) {
        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = colors.line;
        ctx.fillStyle = colors.line;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cur.x, cur.y);
        ctx.lineTo(best.x, best.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(best.x, best.y, 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(best.x, best.y, 2.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cur.x, cur.y, 1.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = colors.text;
        ctx.fillText("(" + best.i + ", " + best.j + ")", best.x + 12, best.y - 10);
      }
      ctx.globalAlpha = 1;
    }

    // about 30 frames a second is plenty for something this slow, and keeps the page quiet for the machine too
    function loop(time) {
      if (!running) return;
      if (time - lastFrame >= 32) {
        lastFrame = time;
        draw(time);
      }
      rafId = requestAnimationFrame(loop);
    }

    function refresh() {
      var on = !reduceMotion && visible && !document.hidden;
      if (on === running) return;
      running = on;
      if (running) rafId = requestAnimationFrame(loop);
      else if (rafId) cancelAnimationFrame(rafId);
      if (!running) draw(0);
    }

    host.addEventListener("pointermove", function (e) {
      if (e.pointerType === "touch") return;
      var r = canvas.getBoundingClientRect();
      pointer.x = e.clientX - r.left;
      pointer.y = e.clientY - r.top;
      pointer.active = true;
      if (!running) {
        cur.x = pointer.x;
        cur.y = pointer.y;
        draw(0);
      }
    });
    host.addEventListener("pointerleave", function () {
      pointer.active = false;
    });

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        refresh();
      }).observe(canvas);
    }
    document.addEventListener("visibilitychange", refresh);
    motionListeners.push(refresh);
    window.addEventListener("resize", resize);
    new MutationObserver(function () {
      readColors();
      if (!running) draw(0);
    }).observe(root, { attributes: true, attributeFilter: ["data-theme"] });

    readColors();
    resize();
    refresh();
  }

  /* ---------- 4. Publication tools ---------- */
  function initPublicationPanels() {
    document.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest(".pub__toggle") : null;
      if (!btn) return;
      var pub = btn.closest(".pub");
      if (!pub) return;
      var name = btn.getAttribute("data-panel");
      each(pub.querySelectorAll(".pub__panel"), function (panel) {
        var isTarget = panel.getAttribute("data-panel-body") === name;
        panel.classList.toggle("is-open", isTarget ? !panel.classList.contains("is-open") : false);
      });
      each(pub.querySelectorAll(".pub__toggle"), function (b) {
        var panel = pub.querySelector('.pub__panel[data-panel-body="' + b.getAttribute("data-panel") + '"]');
        b.setAttribute("aria-expanded", panel && panel.classList.contains("is-open") ? "true" : "false");
      });
    });
  }

  function initPublicationTools() {
    var tools = document.querySelector("[data-pubtools]");
    var list = document.querySelector("[data-publications]");
    if (!tools || !list) return;

    function textOf(node, selector) {
      var el = node.querySelector(selector);
      return el ? el.textContent : "";
    }

    var items = Array.prototype.map.call(list.querySelectorAll("ol.bibliography > li"), function (li) {
      var pub = li.querySelector(".pub");
      return {
        li: li,
        type: pub ? pub.getAttribute("data-type") : "",
        area: pub ? pub.getAttribute("data-area") : "",
        year: pub ? parseInt(pub.getAttribute("data-year"), 10) : NaN,
        // search what the reader can see: title, authors, venue line and the venue label
        text: [textOf(li, ".pub__title"), textOf(li, ".pub__authors"), textOf(li, ".pub__meta"), textOf(li, ".pub__abbr")]
          .join(" ")
          .replace(/\s+/g, " ")
          .toLowerCase(),
      };
    });
    if (!items.length) return;
    var headings = Array.prototype.slice.call(list.querySelectorAll("h2.bibliography"));
    var count = tools.querySelector("[data-pubcount]");
    var search = tools.querySelector("[data-pubsearch]");
    var empty = document.querySelector("[data-pubempty]");

    // filters can arrive as ?area=pqc or as #area=pqc; the fragment is the current state and wins
    var state = { type: "all", area: "all", q: "" };
    function known(kind, value) {
      return !!tools.querySelector("[data-filter-" + kind + '="' + String(value).replace(/["\\]/g, "") + '"]');
    }
    function readState() {
      var params = new URLSearchParams(window.location.search);
      if (window.location.hash.indexOf("=") !== -1) {
        new URLSearchParams(window.location.hash.slice(1)).forEach(function (value, key) {
          params.set(key, value);
        });
      }
      var type = params.get("type");
      var area = params.get("area");
      state.type = type && known("type", type) ? type : "all";
      state.area = area && known("area", area) ? area : "all";
      state.q = (params.get("q") || "").trim().toLowerCase();
      if (search) search.value = state.q;
    }

    // chart: one bar per year between the first and the last paper
    var chart = tools.querySelector("[data-pubchart]");
    var years = items
      .map(function (it) {
        return it.year;
      })
      .filter(function (y) {
        return !isNaN(y);
      });
    var minY = Math.min.apply(null, years);
    var maxY = Math.max.apply(null, years);
    var totals = {};
    years.forEach(function (y) {
      totals[y] = (totals[y] || 0) + 1;
    });
    var peak = Math.max.apply(
      null,
      Object.keys(totals).map(function (k) {
        return totals[k];
      }),
    );
    var bars = {};
    if (chart) {
      for (var y = minY, idx = 0; y <= maxY; y++, idx++) {
        var bar = document.createElement("button");
        bar.type = "button";
        bar.className = "pubchart__bar";
        bar.style.setProperty("--i", idx);
        bar.setAttribute("data-year", y);
        bar.innerHTML =
          '<span class="pubchart__value" aria-hidden="true"></span><span class="pubchart__fill"></span><span class="pubchart__label" aria-hidden="true">' +
          (maxY - minY > 12 ? "\u2019" + String(y).slice(2) : y) +
          "</span>";
        chart.appendChild(bar);
        bars[y] = bar;
      }
      chart.addEventListener("click", function (e) {
        var b = e.target.closest ? e.target.closest(".pubchart__bar") : null;
        if (!b || b.disabled) return;
        var yr = b.getAttribute("data-year");
        var target = headings.filter(function (hd) {
          return hd.textContent.trim() === yr && !hd.classList.contains("is-hidden");
        })[0];
        if (target) target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      });
      requestAnimationFrame(function () {
        chart.classList.add("is-in");
      });
    }

    function apply(updateUrl) {
      var shown = 0;
      var perYear = {};
      items.forEach(function (it) {
        var ok =
          (state.type === "all" || it.type === state.type) &&
          (state.area === "all" || it.area === state.area) &&
          (!state.q || it.text.indexOf(state.q) !== -1);
        it.li.classList.toggle("is-hidden", !ok);
        if (ok) {
          shown++;
          perYear[it.year] = (perYear[it.year] || 0) + 1;
        }
      });
      headings.forEach(function (hd) {
        var ol = hd.nextElementSibling;
        var any = ol && ol.querySelector("li:not(.is-hidden)");
        hd.classList.toggle("is-hidden", !any);
        if (ol) ol.classList.toggle("is-hidden", !any);
      });
      Object.keys(bars).forEach(function (yr) {
        var n = perYear[yr] || 0;
        var b = bars[yr];
        b.querySelector(".pubchart__fill").style.setProperty("--h", (n / peak).toFixed(4));
        b.querySelector(".pubchart__value").textContent = n ? n : "";
        b.disabled = n === 0;
        b.setAttribute("aria-label", n ? yr + ": " + n + (n === 1 ? " paper" : " papers") + ", jump to the list" : yr + ": no papers");
      });
      if (count) {
        count.textContent = shown === items.length ? items.length + " papers" : shown + " of " + items.length + " papers";
      }
      if (empty) empty.hidden = shown !== 0;
      each(tools.querySelectorAll("[data-filter-type]"), function (b) {
        var on = b.getAttribute("data-filter-type") === state.type;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
      each(tools.querySelectorAll("[data-filter-area]"), function (b) {
        var on = b.getAttribute("data-filter-area") === state.area;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
      if (updateUrl && window.history && history.replaceState) {
        var p = new URLSearchParams();
        if (state.type !== "all") p.set("type", state.type);
        if (state.area !== "all") p.set("area", state.area);
        if (state.q) p.set("q", state.q);
        var qs = p.toString();
        history.replaceState(null, "", window.location.pathname + window.location.search + (qs ? "#" + qs : ""));
      }
    }

    tools.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest(".chip") : null;
      if (!b) return;
      if (b.hasAttribute("data-filter-type")) state.type = b.getAttribute("data-filter-type");
      if (b.hasAttribute("data-filter-area")) state.area = b.getAttribute("data-filter-area");
      apply(true);
    });
    if (search) {
      search.addEventListener("input", function () {
        state.q = search.value.trim().toLowerCase();
        apply(true);
      });
    }
    window.addEventListener("hashchange", function () {
      if (window.location.hash.indexOf("=") === -1) return;
      readState();
      apply(false);
    });

    tools.hidden = false;
    readState();
    apply(false);
  }

  /* ---------- start ---------- */
  ready(function () {
    initScrollState();
    initReveals();
    initCounters();
    initPublicationPanels();
    initPublicationTools();
    var canvas = document.querySelector("[data-lattice]");
    if (canvas) initLattice(canvas);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        root.classList.add("is-ready");
      });
    });
  });
})();
