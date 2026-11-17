/*
 * News page (/news/): the timeline.
 *   - the rail names the year being read: its figures roll as one year hands over to the next (scrollspy on the
 *     years, sliding-number), with the number of items shown in that year and their noun ("6 papers")
 *   - the hairline fills in down to the reading line and the dots of the items already passed are filled
 *   - the filter (All, Activities, Papers, Code, Calls) moves the list with Site.flip; years left empty fold away
 *   - every date says how long ago it was in a tooltip that glides from date to date
 * Without this file the page is complete: every item, every year, links that jump to the years.
 */
(function () {
  "use strict";

  var Site = window.Site;
  if (!Site) return;
  var util = Site.util;
  var READ = 0.3; // the reading line, as a share of the viewport's height (the scrollspy's default too)

  function all(scope, selector) {
    return Array.prototype.slice.call(scope.querySelectorAll(selector));
  }

  /* how long ago a date was, in words ("3 weeks ago", "Last year") */
  var rtf = window.Intl && Intl.RelativeTimeFormat ? new Intl.RelativeTimeFormat("en", { numeric: "auto" }) : null;
  function ago(date, now) {
    if (!rtf || isNaN(date)) return null;
    var days = Math.round((now - date) / 86400000);
    var text;
    if (days < 1) text = rtf.format(0, "day");
    else if (days < 7) text = rtf.format(-days, "day");
    else if (days < 56) text = rtf.format(-Math.round(days / 7), "week");
    else if (days < 640) text = rtf.format(-Math.round(days / 30.44), "month");
    else text = rtf.format(-Math.round(days / 365.25), "year");
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  Site.register("news", function (root) {
    var body = root.querySelector(".ntl__body");
    if (!body) return null;
    var groups = all(root, ".ntl__group").map(function (el) {
      return {
        el: el,
        year: Number(el.getAttribute("data-year")),
        head: el.querySelector(".ntl__yearhead"),
        items: all(el, ".nitem"),
        link: root.querySelector('.ntl__yearlink[href="#' + el.id + '"]'),
      };
    });
    var items = all(body, ".nitem");
    var buttons = all(root, ".nfilter");
    var spyEl = root.querySelector(".ntl__years");
    var yearEl = root.querySelector("[data-news-year]");
    var countEl = root.querySelector("[data-news-count]");
    var nounEl = root.querySelector("[data-news-noun]");
    var progress = body.querySelector(".ntl__progress");
    var filter = "all";
    var nouns = ["item", "items"];
    var shown = { year: null, count: null, noun: null };

    function kit(el, name) {
      return el ? Site.get(el, name) : null;
    }
    function count(g) {
      var n = 0;
      for (var i = 0; i < g.items.length; i++) if (!g.items[i].hidden) n++;
      return n;
    }

    /* ---------------------------------------------- the year being read */
    function readingGroup() {
      var spy = kit(spyEl, "scrollspy");
      var id = spy && spy.id;
      var g = null;
      for (var i = 0; i < groups.length; i++) if (groups[i].el.id === id) g = groups[i];
      if (g && count(g)) return g;
      // above the first year, or on a year the filter emptied: the first year that still has items after it
      var from = g ? groups.indexOf(g) : 0;
      for (var k = from; k < groups.length; k++) if (count(groups[k])) return groups[k];
      for (var j = 0; j < groups.length; j++) if (count(groups[j])) return groups[j];
      return null;
    }
    function showYear() {
      var g = readingGroup();
      if (!g) return;
      var n = count(g);
      var noun = n === 1 ? nouns[0] : nouns[1];
      var y = kit(yearEl, "sliding-number");
      var c = kit(countEl, "sliding-number");
      var w = kit(nounEl, "swap-text");
      if (y && shown.year !== g.year) y.set(g.year);
      if (c && shown.count !== n) c.set(n);
      if (w && shown.noun !== noun) w.set(noun);
      else if (!w && nounEl && shown.noun !== noun) nounEl.textContent = noun;
      shown.year = g.year;
      shown.count = n;
      shown.noun = noun;
    }
    if (spyEl) spyEl.addEventListener("kit:spy-change", showYear);

    /* ------------------------------------------- the hairline, read down to here */
    var marks = []; // { el, y }: the dot of each item shown, in page coordinates
    var top = 0;
    var height = 1;
    function measure() {
      var sy = window.scrollY;
      var r = body.getBoundingClientRect();
      top = r.top + sy;
      height = Math.max(1, r.height);
      marks = [];
      items.forEach(function (it) {
        if (it.hidden) return;
        var node = it.querySelector(".nitem__node");
        var nr = (node || it).getBoundingClientRect();
        marks.push({ el: it, y: nr.top + nr.height / 2 + sy });
      });
    }
    function update() {
      var line = window.scrollY + window.innerHeight * READ;
      var p = util.clamp((line - top) / height, 0, 1);
      if (progress) progress.style.setProperty("--ntl-read", p.toFixed(4));
      body.classList.toggle("is-reading", p > 0);
      for (var i = 0; i < marks.length; i++) marks[i].el.classList.toggle("is-read", marks[i].y <= line);
    }
    var onScroll = util.throttle(update);
    window.addEventListener("scroll", onScroll, { passive: true });
    var relayout = util.throttle(function () {
      measure();
      update();
    });
    var ro = window.ResizeObserver ? new ResizeObserver(relayout) : null;
    if (ro) ro.observe(body);
    var offResize = Site.on("resize", relayout);

    /* ------------------------------------------------------------ the filter */
    function setFilter(button) {
      var next = button.getAttribute("data-filter") || "all";
      if (next === filter) return;
      filter = next;
      nouns = (button.getAttribute("data-noun") || "item,items").split(",");
      buttons.forEach(function (b) {
        b.setAttribute("aria-pressed", b === button ? "true" : "false");
      });
      var total = 0;
      var done = Site.flip(
        body,
        function () {
          items.forEach(function (it) {
            var on = next === "all" || it.getAttribute("data-cat") === next;
            it.hidden = !on;
            if (on) total++;
          });
          groups.forEach(function (g) {
            var empty = count(g) === 0;
            g.head.hidden = empty;
            g.el.classList.toggle("is-empty", empty);
            if (g.link) g.link.hidden = empty;
          });
        },
        { items: ".nitem, .ntl__yearhead" },
      );
      function settle() {
        var spy = kit(spyEl, "scrollspy");
        if (spy) spy.refresh();
        measure();
        update();
        showYear();
      }
      settle();
      done.then(settle);
      Site.announce(total + " " + (total === 1 ? nouns[0] : nouns[1]) + " shown");
    }
    buttons.forEach(function (b) {
      b.addEventListener("click", function () {
        setFilter(b);
      });
    });

    /* ------------------------------------------------ how long ago, over each date */
    var now = Date.now();
    all(body, "time.nitem__date").forEach(function (t) {
      var text = ago(new Date(t.getAttribute("datetime")), now);
      if (text) t.setAttribute("data-tip", text);
    });

    // pictures change the layout as they arrive
    all(body, "img").forEach(function (img) {
      if (!img.complete) img.addEventListener("load", relayout, { once: true });
    });

    // the kits inside (numbers, scrollspy) attach after this one: start on the next frame
    requestAnimationFrame(function () {
      measure();
      update();
      showYear();
    });

    return {
      filter: function (name) {
        var b = buttons.filter(function (x) {
          return x.getAttribute("data-filter") === name;
        })[0];
        if (b) setFilter(b);
      },
      destroy: function () {
        window.removeEventListener("scroll", onScroll);
        if (ro) ro.disconnect();
        offResize();
        if (spyEl) spyEl.removeEventListener("kit:spy-change", showYear);
      },
    };
  });
})();
