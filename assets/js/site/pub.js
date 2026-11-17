/*
 * Publications: the behaviour of the publication lists.
 *
 * 1. Every list of entries (_layouts/bib.liquid inside .publist[data-publist]): one hover surface gliding over the rows,
 *    one tooltip gliding between the small labels, rows arriving in reading order. The publications page has these in
 *    its markup; the home page's "Selected publications" gets them here, before the kits attach.
 * 2. The publications page ([data-pubs], _includes/site/pub_page.liquid): the list and Fig. 1 are one instrument.
 *    Filters (area, kind, search) live in the URL hash (#area=pqc&q=kyber&type=journal); the list changes through
 *    Site.flip, the counts roll, the bars of Fig. 1 glide to the filtered counts, the rail rolls to the year being read.
 */
(function () {
  "use strict";
  var S = window.Site;
  if (!S) return;
  var doc = document;
  var root = doc.documentElement;
  var each = function (list, fn) {
    Array.prototype.forEach.call(list, fn);
  };

  /* ------------------------------------------------------------------ 1. any list */
  each(doc.querySelectorAll(".publist--selected[data-publist]"), function (list) {
    if (list.hasAttribute("data-kit")) return;
    list.setAttribute("data-kit", "highlight reveal-group tooltip-group");
    list.setAttribute("data-mode", "hover");
    list.setAttribute("data-items", ".pub");
    list.setAttribute("data-reveal", "rise");
    S.init(list); // safe if the kits attach again at boot
  });

  /* ------------------------------------------------------------ 2. the page */
  var page = doc.querySelector("[data-pubs]");
  if (!page) return;

  S.ready(function () {
    var body = page.querySelector("[data-publist-body]");
    var bar = page.querySelector("[data-pubbar]");
    var field = page.querySelector("[data-pubq]");
    var search = field ? field.closest(".pubbar__search") : null;
    var clearBtn = page.querySelector("[data-pubclear]");
    var areaGroup = page.querySelector("[data-pubareas]");
    var typeGroup = page.querySelector("[data-pubtypes]");
    var countEl = page.querySelector("[data-pubcount]");
    var empty = page.querySelector("[data-pubempty]");
    var emptyText = page.querySelector("[data-pubempty-text]");
    var chart = page.querySelector("[data-pubchart]");
    var rail = page.querySelector("[data-pubrail]");
    if (!body || !bar || !field) return;

    var num = function (el) {
      return el ? S.get(el, "sliding-number") : null;
    };
    var swap = function (el) {
      return el ? S.get(el, "swap-text") : null;
    };
    var nav = doc.querySelector("[data-nav]");
    var navH = function () {
      return nav ? nav.offsetHeight : 0;
    };

    /* ---------- the entries, read once ---------- */
    function fold(text) {
      // lower case, accents dropped, one character for one character (so match positions map back)
      var out = "";
      for (var i = 0; i < text.length; i++) {
        var c = text.charAt(i).normalize ? text.charAt(i).normalize("NFD").charAt(0) : text.charAt(i);
        out += c.toLowerCase().charAt(0) || " ";
      }
      return out;
    }
    var rows = [];
    each(body.querySelectorAll(".pub[data-pub]"), function (el) {
      var t = el.querySelector(".pub__t");
      var text = function (sel) {
        var n = el.querySelector(sel);
        return n ? n.textContent : "";
      };
      var title = t ? t.textContent : "";
      rows.push({
        el: el,
        li: el.parentNode,
        year: el.getAttribute("data-year"),
        area: el.getAttribute("data-area") || "",
        type: el.getAttribute("data-type") || "",
        title: t,
        titleText: title,
        titleFold: fold(title),
        plain: !!t && t.childNodes.length === 1 && t.firstChild.nodeType === 3,
        hay: fold([title, text(".pub__authors"), text(".pub__venue"), el.getAttribute("data-year")].join(" ").replace(/\s+/g, " ")),
        marked: "",
      });
    });
    var sections = Array.prototype.slice.call(body.querySelectorAll("[data-pubyear]"));
    var byYear = {};
    sections.forEach(function (s) {
      byYear[s.getAttribute("data-pubyear")] = { section: s, head: s.querySelector(".pubyear__head"), total: 0, shown: 0 };
    });
    rows.forEach(function (r) {
      if (byYear[r.year]) byYear[r.year].total++;
    });

    var areaNames = {};
    var chips = areaGroup ? Array.prototype.slice.call(areaGroup.querySelectorAll(".chip")) : [];
    chips.forEach(function (c) {
      areaNames[c.getAttribute("data-area")] = (c.firstChild && c.firstChild.nodeType === 3 ? c.firstChild.nodeValue : c.textContent).trim();
    });
    var types = typeGroup ? Array.prototype.slice.call(typeGroup.querySelectorAll("[data-type]")) : [];

    /* ---------- Fig. 1 ---------- */
    var bars = {};
    var barLinks = [];
    var peak = 1;
    if (chart) {
      each(chart.querySelectorAll(".pubchart__bar"), function (b) {
        var y = b.getAttribute("data-year");
        var n = Number(b.getAttribute("data-n")) || 0;
        bars[y] = { el: b, total: n };
        if (n > peak) peak = n;
        if (b.tagName === "A") barLinks.push(b);
      });
      // one stop in the tab order; the arrow keys go from year to year
      barLinks.forEach(function (b, i) {
        b.tabIndex = i === barLinks.length - 1 ? 0 : -1;
      });
      // the bars grow once the page head has arrived (and are simply there under ?static)
      if (S.env.static) chart.classList.add("is-grown");
      else
        setTimeout(function () {
          chart.classList.add("is-grown");
        }, 640);
    }

    /* ---------- state: #area=pqc&q=kyber&type=journal ---------- */
    var state = { area: "", type: "", q: "" };
    var validAreas = {};
    chips.forEach(function (c) {
      validAreas[c.getAttribute("data-area")] = true;
    });
    function fromHash() {
      var h = window.location.hash.slice(1);
      var st = { area: "", type: "", q: "" };
      if (h.indexOf("=") < 0) return st; // a paper's own anchor (#key) or nothing
      var p;
      try {
        p = new URLSearchParams(h);
      } catch (e) {
        return st;
      }
      var a = p.get("area") || "";
      var t = p.get("type") || "";
      st.area = validAreas[a] ? a : "";
      st.type = t === "journal" || t === "conference" ? t : "";
      st.q = (p.get("q") || "").slice(0, 120);
      return st;
    }
    function toHash(st) {
      var parts = [];
      if (st.area) parts.push("area=" + encodeURIComponent(st.area));
      if (st.q) parts.push("q=" + encodeURIComponent(st.q).replace(/%20/g, "+"));
      if (st.type) parts.push("type=" + st.type);
      return parts.length ? "#" + parts.join("&") : "";
    }
    var searchEntry = false; // the history entry in use was made by typing: the next keystrokes replace it
    function commit(kind) {
      var url = window.location.pathname + window.location.search + toHash(state);
      if (url === window.location.pathname + window.location.search + window.location.hash) return;
      var typing = kind === "q";
      var push = !(typing && searchEntry);
      try {
        window.history[push ? "pushState" : "replaceState"]({ pubs: true }, "", url);
      } catch (e) {
        /* a sandboxed page: the filters still work */
      }
      searchEntry = typing;
    }

    /* ---------- matching ---------- */
    function terms(q) {
      return fold(q.trim())
        .split(/\s+/)
        .filter(function (w) {
          return w.length > 0;
        });
    }
    function matchQ(r, words) {
      for (var i = 0; i < words.length; i++) if (r.hay.indexOf(words[i]) < 0) return false;
      return true;
    }

    /* titles: the words found are marked; the original text comes back when the search is cleared */
    function escapeHTML(s) {
      return s.replace(/[&<>"]/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
      });
    }
    function markTitle(r, words) {
      if (!r.plain) return;
      var key = words.join(" ");
      if (r.marked === key) return;
      r.marked = key;
      if (!words.length) {
        r.title.textContent = r.titleText;
        return;
      }
      var hits = [];
      words.forEach(function (w) {
        var from = 0;
        var at;
        while ((at = r.titleFold.indexOf(w, from)) > -1) {
          hits.push([at, at + w.length]);
          from = at + w.length;
        }
      });
      if (!hits.length) {
        r.title.textContent = r.titleText;
        return;
      }
      hits.sort(function (a, b) {
        return a[0] - b[0];
      });
      var merged = [hits[0]];
      for (var i = 1; i < hits.length; i++) {
        var last = merged[merged.length - 1];
        if (hits[i][0] <= last[1]) last[1] = Math.max(last[1], hits[i][1]);
        else merged.push(hits[i]);
      }
      var html = "";
      var pos = 0;
      merged.forEach(function (h) {
        html += escapeHTML(r.titleText.slice(pos, h[0])) + '<mark class="pub__hit">' + escapeHTML(r.titleText.slice(h[0], h[1])) + "</mark>";
        pos = h[1];
      });
      r.title.innerHTML = html + escapeHTML(r.titleText.slice(pos));
    }

    /* ---------- apply a state: rows, counts, chips, Fig. 1, the rail ---------- */
    var revealOff = false;
    var announceTimer = null;
    var shownTotal = rows.length;
    function apply(animate, userAction) {
      var words = terms(state.q);
      var areaCount = {};
      var typeCount = { journal: 0, conference: 0 };
      var all = 0;
      var shown = 0;
      Object.keys(byYear).forEach(function (y) {
        byYear[y].shown = 0;
      });
      rows.forEach(function (r) {
        var q = !words.length || matchQ(r, words);
        var a = !state.area || r.area === state.area;
        var t = !state.type || r.type === state.type;
        if (q && t) {
          areaCount[r.area] = (areaCount[r.area] || 0) + 1;
          all++;
        }
        if (q && a) typeCount[r.type] = (typeCount[r.type] || 0) + 1;
        r.next = q && a && t;
        if (r.next) {
          shown++;
          if (byYear[r.year]) byYear[r.year].shown++;
        }
      });
      shownTotal = shown;

      function mutate() {
        rows.forEach(function (r) {
          if (r.li.hidden === !r.next) return;
          r.li.hidden = !r.next;
        });
        Object.keys(byYear).forEach(function (y) {
          var g = byYear[y];
          if (g.head) g.head.hidden = g.shown === 0;
        });
        if (empty) empty.hidden = shown > 0;
      }

      // the user is reading further down: the filtered list starts under the bar again
      if (animate && stuck) {
        var top = body.getBoundingClientRect().top + window.scrollY - stickTop() - 8;
        if (window.scrollY > top) window.scrollTo(0, top);
      }

      var changes = rows.some(function (r) {
        return r.li.hidden === r.next;
      });
      if (animate && changes && !S.env.static) {
        if (!revealOff) {
          // the arrival of rows is for the first reading; from now on Site.flip brings them
          var rg = S.get(body, "reveal-group");
          if (rg) rg.destroy();
          revealOff = true;
        }
        S.flip(body, mutate, { items: "ol.bibliography > li, .pubyear__head, .pubempty" });
      } else mutate();

      rows.forEach(function (r) {
        if (r.next) markTitle(r, words);
        else if (r.marked) markTitle(r, []);
      });

      // controls
      chips.forEach(function (c) {
        var key = c.getAttribute("data-area");
        var n = key ? areaCount[key] || 0 : all;
        c.setAttribute("aria-pressed", String(key === state.area));
        c.classList.toggle("is-zero", n === 0);
        var sn = num(c.querySelector("[data-kit~='sliding-number']"));
        if (sn && sn.value !== n) sn.set(n, { instant: !animate });
      });
      types.forEach(function (b) {
        var key = b.getAttribute("data-type");
        b.setAttribute("aria-pressed", String(key === state.type));
        var sn = num(b.querySelector("[data-kit~='sliding-number']"));
        var n = typeCount[key] || 0;
        if (sn && sn.value !== n) sn.set(n, { instant: !animate });
      });
      if (field.value !== state.q && doc.activeElement !== field) field.value = state.q;
      if (search) search.classList.toggle("has-q", !!field.value);
      if (clearBtn) clearBtn.tabIndex = field.value ? 0 : -1;
      var countNum = num(countEl && countEl.querySelector("[data-kit~='sliding-number']"));
      if (countNum && countNum.value !== shown) countNum.set(shown, { instant: !animate });
      var countWord = swap(countEl && countEl.querySelector("[data-kit~='swap-text']"));
      if (countWord) countWord.set(shown === 1 ? "paper" : "papers");
      var filtered = !!(state.area || state.type || words.length);
      page.classList.toggle("is-filtered", filtered);

      if (empty && emptyText && !shown) {
        var kind = state.type === "journal" ? "journal papers" : state.type === "conference" ? "conference papers" : "papers";
        emptyText.textContent =
          "No " + kind + (state.area ? " in " + areaNames[state.area] : "") + (state.q.trim() ? " match “" + state.q.trim() + "”" : "") + ".";
      }

      // Fig. 1 follows: each bar glides to its filtered count, the whole year stays faintly behind it
      if (chart) {
        if (animate) chart.classList.add("is-live");
        Object.keys(bars).forEach(function (y) {
          var b = bars[y];
          var n = byYear[y] ? byYear[y].shown : 0;
          b.el.style.setProperty("--f", String(Math.round((n / peak) * 10000) / 10000));
          if (b.total) {
            var tip = filtered ? y + ", " + n + " of " + b.total + " paper" + (b.total === 1 ? "" : "s") : y + ", " + b.total + " paper" + (b.total === 1 ? "" : "s");
            b.el.setAttribute("data-tip", tip);
            b.el.setAttribute("aria-label", tip.replace(", ", ": "));
          }
        });
      }

      if (userAction) {
        clearTimeout(announceTimer);
        announceTimer = setTimeout(function () {
          S.announce(shown === 1 ? "1 paper" : shown + " papers");
        }, 700);
      }
      // the rail's count follows the year it shows
      railShow(peekYear || currentYear || firstShownYear(), !animate);
    }

    /* ---------- the rail: the year being read rolls in, with its count ---------- */
    var railYear = num(rail && rail.querySelector(".pubrail__year [data-kit~='sliding-number']"));
    var railCountEl = rail && rail.querySelector(".pubrail__count");
    var railCount = num(railCountEl && railCountEl.querySelector("[data-kit~='sliding-number']"));
    var railWord = swap(railCountEl && railCountEl.querySelector("[data-kit~='swap-text']"));
    var currentYear = null;
    var peekYear = null;
    function firstShownYear() {
      for (var i = 0; i < sections.length; i++) {
        var y = sections[i].getAttribute("data-pubyear");
        if (byYear[y].shown) return y;
      }
      return sections.length ? sections[0].getAttribute("data-pubyear") : null;
    }
    function railShow(y, instant) {
      if (!y) return;
      var n = byYear[y] ? byYear[y].shown : 0;
      if (railYear && railYear.value !== Number(y)) railYear.set(Number(y), { instant: !!instant });
      if (railCount && railCount.value !== n) railCount.set(n, { instant: !!instant });
      if (railWord) railWord.set(n === 1 ? "paper" : "papers");
    }
    function setCurrent(y) {
      if (y === currentYear) return;
      currentYear = y;
      Object.keys(bars).forEach(function (k) {
        bars[k].el.classList.toggle("is-current", k === y);
      });
      // the tab stop of Fig. 1 follows the year being read
      if (y && bars[y] && bars[y].el.tagName === "A" && !chart.contains(doc.activeElement)) {
        barLinks.forEach(function (b) {
          b.tabIndex = b === bars[y].el ? 0 : -1;
        });
      }
      if (!peekYear) railShow(y || firstShownYear(), false);
    }

    /* one observer: the section crossing a line just under the tool bar is the year being read */
    var io = null;
    function stickTop() {
      return navH() + bar.offsetHeight;
    }
    function watchYears() {
      if (io) io.disconnect();
      if (!window.IntersectionObserver) return;
      var line = Math.round(stickTop() + 40);
      var vh = window.innerHeight;
      if (line > vh - 2) line = Math.round(vh / 2);
      io = new IntersectionObserver(
        function () {
          // read the line where it is now, so every callback gives one answer
          var hit = null;
          for (var i = 0; i < sections.length; i++) {
            var s = sections[i];
            var y = s.getAttribute("data-pubyear");
            if (!byYear[y].shown) continue;
            var r = s.getBoundingClientRect();
            if (r.top <= line && r.bottom > line) {
              hit = y;
              break;
            }
          }
          if (!hit) {
            // above the list nothing is being read; below it the last year stays
            var b = body.getBoundingClientRect();
            if (b.bottom <= line) hit = lastShownYear();
          }
          setCurrent(hit);
        },
        { rootMargin: -line + "px 0px " + -(vh - line - 1) + "px 0px", threshold: 0 },
      );
      sections.forEach(function (s) {
        io.observe(s);
      });
      io.observe(body);
    }
    function lastShownYear() {
      for (var i = sections.length - 1; i >= 0; i--) {
        var y = sections[i].getAttribute("data-pubyear");
        if (byYear[y].shown) return y;
      }
      return null;
    }

    /* ---------- the tool bar sticks under the header, and takes its place when the header leaves ---------- */
    function measureBar() {
      page.style.setProperty("--pubbar-h", bar.offsetHeight + "px");
      watchYears();
    }
    if (window.ResizeObserver) new ResizeObserver(S.util.debounce(measureBar, 80)).observe(bar);
    S.on("resize", measureBar);
    measureBar();

    var stuck = false;
    var sentinel = page.querySelector("[data-pubbar-sentinel]");
    var narrow = window.matchMedia("(max-width: 860px)");
    var sticky = function () {
      return !narrow.matches;
    };
    var onScroll = S.util.throttle(function () {
      var next = sticky() && !!sentinel && sentinel.getBoundingClientRect().top < navH() && body.getBoundingClientRect().bottom > navH();
      if (next !== stuck) {
        stuck = next;
        bar.classList.toggle("is-stuck", stuck);
      }
    });
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    if (nav) {
      var syncNav = function () {
        var hidden = nav.classList.contains("is-hidden");
        page.classList.toggle("is-navless", hidden);
        page.classList.toggle("is-nav", !hidden);
      };
      new MutationObserver(syncNav).observe(nav, { attributes: true, attributeFilter: ["class"] });
      syncNav();
    }

    /* ---------- controls ---------- */
    if (areaGroup)
      areaGroup.addEventListener("click", function (e) {
        var c = e.target.closest(".chip");
        if (!c) return;
        var key = c.getAttribute("data-area");
        state.area = key === state.area ? "" : key;
        apply(true, true);
        commit("area");
      });
    if (typeGroup)
      typeGroup.addEventListener("click", function (e) {
        var b = e.target.closest("[data-type]");
        if (!b) return;
        state.type = b.getAttribute("data-type");
        apply(true, true);
        commit("type");
      });

    var typing = null;
    field.addEventListener("input", function () {
      if (search) search.classList.toggle("has-q", !!field.value);
      if (clearBtn) clearBtn.tabIndex = field.value ? 0 : -1;
      clearTimeout(typing);
      typing = setTimeout(function () {
        if (state.q === field.value) return;
        state.q = field.value;
        apply(true, true);
        commit("q");
      }, 140);
    });
    field.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        if (field.value) {
          e.preventDefault();
          clearSearch(false);
        } else field.blur();
      } else if (e.key === "Enter") {
        e.preventDefault();
        clearTimeout(typing);
        if (state.q !== field.value) {
          state.q = field.value;
          apply(true, true);
          commit("q");
        }
      }
    });
    function clearSearch(refocus) {
      clearTimeout(typing);
      field.value = "";
      if (state.q) {
        state.q = "";
        apply(true, true);
        commit("clear");
      } else if (search) search.classList.remove("has-q");
      if (refocus) field.focus();
    }
    if (clearBtn)
      clearBtn.addEventListener("click", function () {
        clearSearch(true);
      });
    var reset = page.querySelector("[data-pubreset]");
    if (reset)
      reset.addEventListener("click", function () {
        clearTimeout(typing);
        state = { area: "", type: "", q: "" };
        field.value = "";
        apply(true, true);
        commit("reset");
        field.focus({ preventScroll: true });
      });

    // "/" anywhere on the page goes to the search field
    doc.addEventListener("keydown", function (e) {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      var t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      field.focus();
      field.select();
    });

    // Back and Forward walk through the filters
    function fromHistory() {
      var next = fromHash();
      if (next.area === state.area && next.type === state.type && next.q === state.q) return;
      state = next;
      searchEntry = false;
      clearTimeout(typing);
      field.value = state.q;
      apply(true, true);
    }
    window.addEventListener("popstate", fromHistory);
    window.addEventListener("hashchange", fromHistory);

    /* ---------- Fig. 1: hover names the year (tooltip) and shows it in the rail; a click goes there ---------- */
    function peek(y) {
      if (y === peekYear) return;
      peekYear = y;
      if (rail) rail.classList.toggle("is-peek", !!y);
      railShow(y || currentYear || firstShownYear(), false);
    }
    function goToYear(y, focus) {
      var g = byYear[y];
      if (!g || !g.shown) return;
      var r = g.section.getBoundingClientRect();
      var down = r.top > stickTop();
      // reading down, the header leaves; reading up, it comes back
      var offset = sticky() ? bar.offsetHeight + 24 + (down ? 0 : navH()) : navH() + 16;
      var top = Math.max(0, r.top + window.scrollY - offset);
      window.scrollTo({ top: top, behavior: S.env.reduce ? "auto" : "smooth" });
      if (focus && g.head) g.head.focus({ preventScroll: true });
    }
    if (chart) {
      var plot = chart.querySelector(".pubchart__plot");
      plot.addEventListener("pointerover", function (e) {
        if (e.pointerType === "touch" || !S.env.hover) return;
        var b = e.target.closest(".pubchart__bar");
        peek(b ? b.getAttribute("data-year") : null);
      });
      plot.addEventListener("pointerleave", function () {
        peek(null);
      });
      plot.addEventListener("focusin", function (e) {
        var b = e.target.closest(".pubchart__bar");
        if (b) peek(b.getAttribute("data-year"));
      });
      plot.addEventListener("focusout", function (e) {
        if (!plot.contains(e.relatedTarget)) peek(null);
      });
      plot.addEventListener("click", function (e) {
        var b = e.target.closest("a.pubchart__bar");
        if (!b || e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        goToYear(b.getAttribute("data-year"), e.detail === 0);
      });
      plot.addEventListener("keydown", function (e) {
        var i = barLinks.indexOf(doc.activeElement);
        if (i < 0) return;
        var to = null;
        if (e.key === "ArrowLeft" || e.key === "ArrowDown") to = Math.max(0, i - 1);
        else if (e.key === "ArrowRight" || e.key === "ArrowUp") to = Math.min(barLinks.length - 1, i + 1);
        else if (e.key === "Home") to = 0;
        else if (e.key === "End") to = barLinks.length - 1;
        if (to === null) return;
        e.preventDefault();
        barLinks.forEach(function (b, k) {
          b.tabIndex = k === to ? 0 : -1;
        });
        barLinks[to].focus();
      });
    }

    /* ---------- start ---------- */
    state = fromHash();
    field.value = state.q;
    apply(false, false);
    railShow(firstShownYear(), true);
  });
})();
