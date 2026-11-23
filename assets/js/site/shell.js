/*
 * Shell behaviour: the header (veil, hide on the way down, small-screen menu), the theme switch
 * (the new theme opens as a circle from the switch), leaving a page in browsers without
 * cross-document view transitions, the back-to-top ring, the footer clock and the footer reveal.
 */
(function () {
  "use strict";

  var Site = window.Site;
  if (!Site) return;
  var root = document.documentElement;
  var util = Site.util;

  /* ------------------------------------------------------------------ header */
  var sheetOpen = false;

  function initHeader() {
    var nav = document.querySelector("[data-nav]");
    if (!nav) return;
    var lastY = window.scrollY;
    var hidden = false;

    function setHidden(next) {
      if (next === hidden) return;
      hidden = next;
      nav.classList.toggle("is-hidden", hidden);
    }
    var update = util.throttle(function () {
      var y = window.scrollY;
      nav.classList.toggle("is-scrolled", y > 12);
      if (Math.abs(y - lastY) < 6) return;
      // out of the way while reading down; back as soon as the page moves up
      // (not while the page moves in steps: there the header is part of every slide)
      // nor under reduced motion, where the header stays put and pages read the class to place their sticky bars
      setHidden(
        y > lastY && y > 520 && !sheetOpen && !Site.env.reduce && !nav.contains(document.activeElement) && !root.classList.contains("has-snap"),
      );
      lastY = y;
    });
    window.addEventListener("scroll", update, { passive: true });
    nav.addEventListener("focusin", function () {
      setHidden(false);
    });
    update();

    initSheet(nav);
  }

  /* The small-screen menu: a sheet that slides down over the page. Focus stays inside while it is open. */
  function initSheet(nav) {
    var button = nav.querySelector("[data-nav-menu]");
    var sheet = document.getElementById("navsheet");
    if (!button || !sheet) return;
    var closeTimer = null;
    sheet.setAttribute("aria-modal", "true");
    Array.prototype.forEach.call(sheet.querySelectorAll(".navsheet__list li"), function (li, i) {
      li.style.setProperty("--i", i);
    });

    function focusables() {
      return Array.prototype.filter.call(sheet.querySelectorAll("a[href], button:not([disabled])"), function (el) {
        return el.offsetParent !== null;
      });
    }
    function open() {
      if (sheetOpen) return;
      sheetOpen = true;
      clearTimeout(closeTimer);
      sheet.hidden = false;
      void sheet.offsetHeight; // paint the closed state first so the slide runs
      sheet.classList.add("is-open");
      button.setAttribute("aria-expanded", "true");
      root.classList.add("is-menu-open");
      if (Site.modal) Site.modal.open("menu", { lock: true });
      else root.classList.add("is-modal");
      var first = focusables()[0];
      if (first) first.focus({ preventScroll: true });
    }
    function close(returnFocus) {
      if (!sheetOpen) return;
      sheetOpen = false;
      sheet.classList.remove("is-open");
      button.setAttribute("aria-expanded", "false");
      root.classList.remove("is-menu-open");
      if (Site.modal) Site.modal.close("menu");
      else root.classList.remove("is-modal");
      if (returnFocus !== false) button.focus({ preventScroll: true });
      closeTimer = setTimeout(
        function () {
          sheet.hidden = true;
        },
        Site.env.reduce ? 0 : 220,
      );
    }
    button.addEventListener("click", function () {
      if (sheetOpen) close();
      else open();
    });
    document.addEventListener("keydown", function (e) {
      if (!sheetOpen) return;
      if (e.key === "Escape") {
        close();
        return;
      }
      if (e.key !== "Tab") return;
      var list = [button].concat(focusables());
      var i = list.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) {
        e.preventDefault();
        list[list.length - 1].focus();
      } else if (!e.shiftKey && i === list.length - 1) {
        e.preventDefault();
        list[0].focus();
      }
    });
    // the sheet is for small screens only: close it if the window grows
    window.matchMedia("(min-width: 881px)").addEventListener("change", function (e) {
      if (e.matches) close(false);
    });
  }

  /* ------------------------------------------------------------ theme switch */
  function initTheme() {
    var button = document.getElementById("light-toggle");
    if (!button || button.hidden) return;

    function setTheme(next) {
      // setThemeSetting comes from the template's theme.js (stores the choice and applies it everywhere)
      if (typeof setThemeSetting === "function") setThemeSetting(next);
      else root.setAttribute("data-theme", next);
    }
    // capture phase: this replaces the template's own click handler (which cycles system / light / dark)
    button.addEventListener(
      "click",
      function (e) {
        e.stopImmediatePropagation();
        var next = Site.theme() === "dark" ? "light" : "dark";
        if (!document.startViewTransition || Site.env.reduce) {
          setTheme(next);
          return;
        }
        var r = button.getBoundingClientRect();
        var x = r.left + r.width / 2;
        var y = r.top + r.height / 2;
        var far = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
        root.style.setProperty("--vt-x", x + "px");
        root.style.setProperty("--vt-y", y + "px");
        root.style.setProperty("--vt-r", Math.ceil(far) + "px");
        root.setAttribute("data-vt", "theme");
        var done = function () {
          root.removeAttribute("data-vt");
        };
        try {
          document
            .startViewTransition(function () {
              setTheme(next);
              // the template's own colour cross-fade is not wanted under the wipe (and it would hold back other transitions)
              root.classList.remove("transition");
            })
            .finished.then(done, done);
        } catch (err) {
          done();
          setTheme(next);
        }
      },
      true,
    );
  }

  /* ----------------------------------------------------------- leaving a page */
  // Browsers with cross-document view transitions animate the change themselves (shell.css).
  // The others get a short fade-out before the navigation; the next page fades in from its stylesheet.
  function initLeave() {
    var native = "CSSViewTransitionRule" in window;
    root.classList.toggle("no-vt", !native);
    window.addEventListener("pageshow", function () {
      root.classList.remove("is-leaving");
    });
    if (native) return;
    document.addEventListener("click", function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || Site.env.reduce) return;
      var a = e.target.closest ? e.target.closest("a[href]") : null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      var url;
      try {
        url = new URL(a.href, window.location.href);
      } catch (err) {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return; // same page (hash)
      if (/\.(pdf|zip|png|jpe?g|webp|svg|bib)$/i.test(url.pathname)) return;
      e.preventDefault();
      root.classList.add("is-leaving");
      setTimeout(function () {
        window.location.href = url.href;
      }, 190);
    });
  }

  /* ------------------------------------------------------------- back to top */
  function initToTop() {
    var wrap = document.querySelector("[data-totop]");
    if (!wrap) return;
    wrap.hidden = false;
    var shown = false;
    var update = util.throttle(function () {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      var y = window.scrollY;
      wrap.style.setProperty("--progress", max > 0 ? util.clamp(y / max, 0, 1).toFixed(4) : 0);
      var next = y > window.innerHeight * 0.9;
      if (next !== shown) {
        shown = next;
        wrap.classList.toggle("is-in", shown);
      }
    });
    window.addEventListener("scroll", update, { passive: true });
    Site.on("resize", update);
    update();
    wrap.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: Site.env.reduce ? "auto" : "smooth" });
    });
  }

  /* ------------------------------------------------------------------ footer */
  function initFooter() {
    var foot = document.querySelector(".foot");
    if (!foot) return;
    // the "page lifts off the footer" effect only works when the whole footer fits on screen
    // (on the home deck the footer is one whole screen: the page lifts off it completely)
    function measure() {
      root.classList.toggle("has-foot-reveal", foot.offsetHeight <= window.innerHeight + 1 && !Site.env.static);
      depth();
    }
    // while the page lifts off, the footer's content comes up the last stretch and clears (shell.css reads --foot-p:
    // 0 covered, 1 in full view)
    var lastP = -1;
    function depth() {
      var p = 1;
      if (root.classList.contains("has-foot-reveal") && !Site.env.reduce) {
        var h = foot.offsetHeight || 1;
        p = util.clamp((window.scrollY + window.innerHeight - (document.documentElement.scrollHeight - h)) / h, 0, 1);
      }
      p = Math.round(p * 1000) / 1000;
      if (p === lastP) return;
      lastP = p;
      foot.style.setProperty("--foot-p", String(p));
    }
    measure();
    Site.on("resize", measure);
    window.addEventListener("scroll", depth, { passive: true });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
    // the footer's own height changes when the stepper switches on or off (home deck)
    if (window.ResizeObserver) new ResizeObserver(measure).observe(foot);

    initMark(foot);

    // local time where the group works; the digits roll when the sliding-number kit is present
    var clock = foot.querySelector("[data-clock]");
    var out = clock && clock.querySelector("[data-clock-out]");
    if (!out) return;
    var zone = clock.getAttribute("data-zone") || "UTC";
    var fmt;
    try {
      fmt = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hour12: false });
    } catch (err) {
      clock.hidden = true;
      return;
    }
    out.innerHTML =
      '<span data-kit="sliding-number" data-trigger="manual" data-pad="2" data-value="0">00</span>:<span data-kit="sliding-number" data-trigger="manual" data-pad="2" data-value="0">00</span>';
    Site.init(out);
    var parts = out.querySelectorAll("[data-kit]");
    function tick() {
      var text = fmt.format(new Date()); // "14:32"
      var hm = text.split(":");
      for (var i = 0; i < 2; i++) {
        var c = Site.get(parts[i], "sliding-number");
        if (c && c.set) c.set(Number(hm[i]));
        else parts[i].textContent = hm[i];
      }
      clock.setAttribute("aria-label", "Local time in Kampar: " + text);
    }
    tick();
    var timer = null;
    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(
        function () {
          tick();
          schedule();
        },
        60000 - (Date.now() % 60000) + 50,
      );
    }
    util.visible(foot, function (on) {
      if (on) {
        tick();
        schedule();
      } else clearTimeout(timer);
    });
  }

  /* The large name at the very end. Its letters roll under the pointer (the kit's own hover trigger) and also once
     each time the page arrives at its very end: again after moving up a little and coming back. One roll at a time,
     whichever trigger asked for it. A page that is already at its end when it loads (too short to scroll, or a
     restored position) does not roll by itself. */
  function initMark(foot) {
    var mark = foot.querySelector(".foot__mark");
    if (!mark) return;
    var REARM = 24; // px the page must move up from its end before the next arrival counts
    var busy = false;
    function gap() {
      return document.documentElement.scrollHeight - (window.scrollY + window.innerHeight);
    }
    var armed = gap() > 2;
    function roll() {
      var c = Site.get(mark, "rolling-text");
      if (!c || !c.roll || busy || c.rolling === true || Site.env.reduce) return;
      busy = true;
      var free = function () {
        busy = false;
      };
      var p = c.roll();
      if (p && typeof p.then === "function") p.then(free, free);
      else setTimeout(free, 1400);
    }
    mark.addEventListener("kit:rolling-done", function () {
      busy = false;
    });
    window.addEventListener(
      "scroll",
      function () {
        var g = gap();
        if (armed && g <= 2) {
          armed = false;
          roll();
        } else if (!armed && g > REARM) armed = true;
      },
      { passive: true },
    );
  }

  /* ---------- [data-inview]: .is-in the first time an element is seen; what happens then is CSS ----------
     For entrances that are drawn rather than faded: a rule that draws, bars that grow. data-inview="0.4" asks for
     that share of the element to be on screen first. Hidden states go in CSS under html.js ... :not(.is-in). */
  function initInview(scope) {
    var list = (scope || document).querySelectorAll("[data-inview]:not(.is-in)");
    if (!list.length) return;
    if (Site.env.static || !window.IntersectionObserver) {
      list.forEach(function (el) {
        el.classList.add("is-in");
      });
      return;
    }
    var byShare = {};
    list.forEach(function (el) {
      var share = Math.min(1, Math.max(0, parseFloat(el.getAttribute("data-inview")) || 0));
      (byShare[share] = byShare[share] || []).push(el);
    });
    Object.keys(byShare).forEach(function (share) {
      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (e) {
            // seen, or already scrolled past (an anchor jump, a restored scroll position)
            if (!e.isIntersecting && !(e.boundingClientRect.bottom <= 0 && e.boundingClientRect.height > 0)) return;
            io.unobserve(e.target);
            e.target.classList.add("is-in");
          });
        },
        { rootMargin: "0px 0px -8% 0px", threshold: Number(share) },
      );
      byShare[share].forEach(function (el) {
        io.observe(el);
      });
    });
  }
  Site.inview = initInview;

  Site.ready(function () {
    initHeader();
    initTheme();
    initLeave();
    initToTop();
    initFooter();
    initInview();
  });
})();
