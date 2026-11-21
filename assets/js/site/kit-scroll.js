/*
 * kit-scroll: components driven by the scroll and by the pointer (group S of _work/KIT_SPEC.md).
 *
 *   reveal, reveal-group     content coming in as it scrolls into view, staggered within each view
 *   scroll-progress          --progress (0..1) for the page or for a target's passage
 *   parallax                 a drift against the scroll
 *   word-scrub               a paragraph's words lighting up as it is read
 *   marquee                  an endless strip that speeds up with the scroll
 *   pin-x                    a pinned section whose track moves sideways with the scroll
 *   scrollspy                aria-current on the link of the section being read
 *   scroll-fade              a scroll container fading at the edges where there is more
 *   draw                     SVG strokes drawing themselves
 *   auto-height              a box whose height follows its content
 *   magnetic, tilt, cursor, hover-preview, avatar-group   pointer details
 *
 * Usage notes for page authors: _work/agent_notes/kit-scroll.md.
 * Values come from Site.tokens; the few a component has of its own are the constants below,
 * each with the Animate UI source it was read from.
 */
(function () {
  "use strict";

  var Site = window.Site;
  var M = window.Motion;
  if (!Site || !Site.register) return;
  if (!M || !M.motionValue || !M.springValue) {
    // The animation library did not load: content waiting for an entrance must still show.
    var showAll = function (el, opts) {
      var list = el.matches('[data-kit~="reveal-group"]') ? (typeof opts.items === "string" ? el.querySelectorAll(opts.items) : el.children) : [el];
      Array.prototype.forEach.call(list, function (n) {
        n.classList.add("is-in");
      });
    };
    Site.register("reveal", showAll);
    Site.register("reveal-group", showAll);
    Site.register("draw", function (el) {
      el.classList.add("k-draw");
    });
    return;
  }
  var env = Site.env;
  var util = Site.util;
  var clamp = util.clamp;
  var root = document.documentElement;

  /* ------------------------------------------------------------- constants */

  // recipes/page.md: "80-100ms between items"; the token is stagger.items (0.09 s).
  var REVEAL_STEP = Site.tokens.stagger.items;
  // internal/stagger.ts: past CALM items in one batch the step shrinks by sqrt(CALM / n), so a big view stays short.
  var STAGGER_CALM = 10;
  // Own: an element starts once it is a little way into the viewport, not on its first pixel.
  var REVEAL_MARGIN = "0px 0px -6% 0px";
  // Own: the zoom variant grows from where Site.flip's new items grow from (interactions/filter-grid.md).
  var REVEAL_ZOOM_FROM = 0.95;
  // rules.md B4: an image zooms inside its card to 1.05; the clip reveal settles it from there.
  var REVEAL_CLIP_ZOOM = 1.05;
  // ROUND2_SPEC 4.3 ("about 0.8 s in all"): the wipe's block sweeps in, holds a moment, sweeps out (s), on ease.inOut.
  var WIPE = { in: 0.36, hold: 0.06, out: 0.38 };
  // Own: a manual reveal that is never played shows when it is in view this long after the page is ready (ms),
  // so a page script that fails cannot leave content hidden. data-fallback="false" turns it off.
  var MANUAL_FALLBACK = 8000;

  // primitives/scroll-progress: the provider's own spring.
  var PROGRESS_SPRING = { type: "spring", stiffness: 250, damping: 40, bounce: 0 };

  // Own (no Animate UI source): the band of words lighting at once, and the default viewport window.
  var SCRUB_BAND = 4;
  var SCRUB_START = 0.85;
  var SCRUB_END = 0.45;

  // Own: a marquee is constant motion (rules B2: linear). Scroll velocity adds speed: +MARQUEE_GAIN per 1000 px/s,
  // capped, smoothed by Motion's documented scroll-velocity spring (motion.dev "scroll velocity" example: 400 / 50).
  var MARQUEE_SPEED = 36;
  var MARQUEE_GAIN = 2.5;
  var MARQUEE_MAX_BOOST = 5;
  var MARQUEE_VELOCITY_SPRING = { type: "spring", stiffness: 400, damping: 50 };

  // Own: below this width pin-x is a swipeable row.
  var PIN_MIN_WIDTH = 760;

  // primitives/effects/scroll-fade: size of the fade, how much items shrink and blur in it, its reach and gesture gap.
  var FADE_SIZE = 40;
  var FADE_SHRINK = 0.03;
  var FADE_BLUR = 4;
  var FADE_ZONE = 1.75;
  var FADE_GESTURE_GAP = 150;

  // references/icons.md: "draws ... in 0.4 to 0.6s; repeated rays draw one after the other, 0.15s apart".
  var DRAW_DURATION = 0.6;
  var DRAW_STAGGER = 0.15;

  // primitives/effects/magnetic: strength, range (px) and its spring.
  var MAGNETIC_STRENGTH = 0.5;
  var MAGNETIC_RANGE = 120;
  var MAGNETIC_SPRING = { type: "spring", stiffness: 100, damping: 10, mass: 0.5 };
  // Own (data-inner, the owner's "magnetic button"): the pull holds over the element and PAD px around it, at
  // STRENGTH of the pointer's offset, softly capped at MAX px; the inner part moves INNER further (button and label
  // part a little) on a softer spring, so it follows a beat later. Released, both come back on WOBBLE springs that
  // overshoot twice (damping ratio about 0.36: 30%, then 9%), the inner one slightly out of step.
  var MAGNETIC_PAD = 16;
  var MAGNETIC_BTN_STRENGTH = 0.3;
  var MAGNETIC_MAX = 14;
  var MAGNETIC_INNER = 0.4;
  var MAGNETIC_INNER_SPRING = { stiffness: 80, damping: 9, mass: 0.5 };
  var MAGNETIC_WOBBLE = { stiffness: 260, damping: 9, mass: 0.6 };
  var MAGNETIC_INNER_WOBBLE = { stiffness: 210, damping: 8, mass: 0.6 };

  // primitives/effects/tilt: maximum tilt (deg), perspective (px) and its spring.
  var TILT_MAX = 10;
  var TILT_PERSPECTIVE = 800;
  var TILT_SPRING = { type: "spring", stiffness: 300, damping: 25, mass: 0.5 };
  // primitives/effects/shine: the sweep's duration, curve and angle.
  var SHINE_SWEEP = { duration: 1.2, ease: [0.4, 0, 0.2, 1] };
  var SHINE_DEG = -15;

  // primitives/cursor (CursorFollow): the spring the ring follows the pointer on.
  var CURSOR_FOLLOW = { type: "spring", stiffness: 500, damping: 50, bounce: 0 };
  // ROUND2_SPEC 4.2: a dot of about 6 px, a ring of about 34 px that grows to about 56 px over controls.
  // The ring is drawn at its large size and scaled down at rest (a hairline that stays a hairline when it grows).
  var CURSOR_RING = 34;
  var CURSOR_BIG = 56;
  // Own: over a control the dot shrinks to this share; under a press the ring tightens to this share.
  var CURSOR_DOT_GROW = 0.5;
  var CURSOR_PRESS = 0.8;
  // Own (reduced motion): the word sits below-right of the native arrow.
  var CURSOR_OFFSET = { x: 14, y: 20 };

  // internal/follow-cursor.tsx: the spring of a popup following the pointer.
  var PREVIEW_FOLLOW = { type: "spring", stiffness: 200, damping: 17 };
  // Own: the lean, in degrees per px/s of horizontal speed, and its limit; the gap to the pointer.
  var PREVIEW_LEAN = 0.012;
  var PREVIEW_LEAN_MAX = 6;
  var PREVIEW_GAP = 28;

  // primitives/avatar-group: the lift (a share of the avatar's height) and its spring.
  var AVATAR_SPRING = { type: "spring", stiffness: 300, damping: 17 };
  var AVATAR_LIFT = "-30%";
  // Own (the source only lifts): how far the neighbours make room, in px, and how it falls off.
  var AVATAR_ROOM = 7;
  var AVATAR_ROOM_FALLOFF = 0.45;

  /* ---------------------------------------------------------------- shared */

  function reduced() {
    return env.reduce;
  }
  function px(v) {
    return parseFloat(v) || 0;
  }
  function closest(el, sel) {
    return el && el.closest ? el.closest(sel) : null;
  }
  function emit(el, name, detail) {
    el.dispatchEvent(new CustomEvent("kit:" + name, { bubbles: true, detail: detail }));
  }
  /** A value springing toward another one; under reduced motion (or without Motion) it follows at once. */
  function follower(spring, initial, onChange) {
    var raw = M.motionValue(initial || 0);
    var smooth = M.springValue(raw, Site.t(spring));
    var off = smooth.on("change", onChange);
    var api = {
      raw: raw,
      smooth: smooth,
      set: function (v) {
        if (reduced()) api.jump(v);
        else raw.set(v);
      },
      jump: function (v) {
        raw.jump(v);
        smooth.jump(v);
        onChange(v);
      },
      get: function () {
        return smooth.get();
      },
      destroy: function () {
        off();
        smooth.destroy();
        raw.destroy();
      },
    };
    return api;
  }
  /**
   * A number driving a style through a motion value, animated with M.animate(value). Motion 14's element
   * animate() does not run a spring for `scale` when it starts from a value it reads back (it stays where it
   * was), so entrances that scale go through values: they retarget with their velocity all the same.
   */
  function styleValue(initial, write) {
    var mv = M.motionValue(initial);
    var off = mv.on("change", write);
    var anim = null;
    write(initial);
    return {
      to: function (v, transition) {
        if (anim) anim.stop();
        anim = null;
        if (!transition || env.static) {
          mv.jump(v);
          write(v);
        } else anim = M.animate(mv, v, transition);
      },
      get: function () {
        return mv.get();
      },
      destroy: function () {
        if (anim) anim.stop();
        off();
        mv.destroy();
      },
    };
  }
  /** WAAPI timing of a token: { duration, easing } in ms, with an optional delay in ms. */
  function timing(token, delay) {
    var c = Site.css(token);
    return { duration: c.duration, easing: c.easing, delay: delay || 0, fill: "backwards" };
  }

  /* One passive scroll listener and one layout watcher for every scroll-driven kit. Subscribers get
   * { y, vh, vw } once per frame; layout subscribers re-measure (window resize, the page's height
   * changing, fonts arriving) and are followed by a scroll pass. */
  var view = { y: window.scrollY, vh: window.innerHeight, vw: root.clientWidth };
  var scrollSubs = [];
  var layoutSubs = [];
  var scrollMV = M.motionValue(window.scrollY); // its getVelocity() is the scroll's velocity, 0 once it stops
  var scrollQueued = false;
  function readView() {
    view.y = window.scrollY;
    view.vh = window.innerHeight;
    view.vw = root.clientWidth;
  }
  function runScroll() {
    scrollQueued = false;
    readView();
    scrollMV.set(view.y);
    for (var i = 0; i < scrollSubs.length; i++) scrollSubs[i](view);
  }
  function queueScroll() {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(runScroll);
  }
  var layoutQueued = false;
  function runLayout() {
    layoutQueued = false;
    readView();
    for (var i = 0; i < layoutSubs.length; i++) layoutSubs[i](view);
    runScroll();
  }
  function queueLayout() {
    if (layoutQueued) return;
    layoutQueued = true;
    requestAnimationFrame(runLayout);
  }
  window.addEventListener("scroll", queueScroll, { passive: true });
  Site.on("resize", queueLayout);
  if (window.ResizeObserver) {
    var bodyHeight = 0;
    new ResizeObserver(function (entries) {
      var h = entries[0].contentRect.height;
      if (Math.abs(h - bodyHeight) < 1) return;
      bodyHeight = h;
      queueLayout();
    }).observe(document.body || root);
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(queueLayout);
  window.addEventListener("load", queueLayout);

  function watchScroll(fn) {
    scrollSubs.push(fn);
    return function () {
      var i = scrollSubs.indexOf(fn);
      if (i > -1) scrollSubs.splice(i, 1);
    };
  }
  function watchLayout(fn) {
    layoutSubs.push(fn);
    return function () {
      var i = layoutSubs.indexOf(fn);
      if (i > -1) layoutSubs.splice(i, 1);
    };
  }
  /** An element's box in page coordinates, without a translate the kit itself applied (dx, dy). */
  function pageBox(el, dx, dy) {
    var r = el.getBoundingClientRect();
    return { top: r.top + window.scrollY - (dy || 0), left: r.left + window.scrollX - (dx || 0), width: r.width, height: r.height };
  }

  /* --------------------------------------------------------------- reveal */
  /*
   * One IntersectionObserver for every reveal. Whatever enters in the same callback is one view:
   * it is sorted by position and staggered from 0, so a long list staggers within each view, never by index.
   * The hidden state is in CSS (opacity 0 under html.js); the kit adds .is-in and plays from the hidden
   * state with WAAPI (fill: backwards), so nothing flashes and the element ends on its own styles.
   */
  var VARIANTS = {
    text: { blur: "icon", rise: true },
    fade: { blur: "icon" },
    rise: { rise: true },
    card: { blur: "surface", rise: true },
    zoom: { blur: "surface", zoom: true },
    clip: { clip: true },
    wipe: { wipe: true },
  };
  var reveals = new Map(); // element -> record
  var revealIO = null;

  function revealObserver() {
    if (revealIO) return revealIO;
    revealIO = new IntersectionObserver(onRevealEntries, { rootMargin: REVEAL_MARGIN, threshold: 0 });
    return revealIO;
  }
  function onRevealEntries(entries) {
    var batch = [];
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      var r = reveals.get(e.target);
      if (!r || r.state !== "waiting") continue;
      if (e.isIntersecting) batch.push({ r: r, top: e.boundingClientRect.top, left: e.boundingClientRect.left });
      else if (e.boundingClientRect.bottom <= 0 && e.boundingClientRect.height > 0) {
        // already scrolled past (anchor jump, restored scroll): it is simply there
        revealIO.unobserve(e.target);
        showNow(r);
      }
    }
    if (!batch.length) return;
    // reading order within the view: rows (to 8px), then left to right
    batch.sort(function (a, b) {
      return Math.round(a.top / 8) - Math.round(b.top / 8) || a.left - b.left;
    });
    var shrink = batch.length > STAGGER_CALM ? Math.sqrt(STAGGER_CALM / batch.length) : 1;
    var at = 0;
    for (var k = 0; k < batch.length; k++) {
      var rec = batch[k].r;
      revealIO.unobserve(rec.el);
      playReveal(rec, rec.delay + at);
      at += rec.step * 1000 * shrink;
    }
  }
  function showNow(r) {
    r.state = "done";
    r.el.classList.add("is-in");
  }
  function cancelReveal(r) {
    if (!r.anims) return;
    for (var i = 0; i < r.anims.length; i++) r.anims[i].cancel();
    r.anims = null;
  }
  function playReveal(r, delay) {
    var el = r.el;
    if (env.static || !el.animate) return showNow(r);
    cancelReveal(r);
    r.state = "playing";
    r.startAt = performance.now() + delay;
    var v = VARIANTS[r.variant] || VARIANTS.text;
    var reduce = reduced();
    var anims = [];
    var fadeFrom = { opacity: 0 };
    if (v.blur) fadeFrom.filter = "blur(" + Site.tokens.blur[v.blur] + "px)";
    if (v.wipe && r.block && !reduce) {
      // a block sweeps in from the left over the element (which appears beneath it) and out to the right
      var ms = function (sec) {
        return sec * 1000 * Site.tempo;
      };
      var curve = "cubic-bezier(" + Site.tokens.ease.inOut.join(",") + ")";
      var total = ms(WIPE.in + WIPE.hold + WIPE.out);
      anims.push(el.animate([{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0 0 0)" }], { duration: ms(WIPE.in), easing: curve, delay: delay, fill: "backwards" }));
      anims.push(
        r.block.animate(
          [
            { transform: "scaleX(0)", transformOrigin: "0 50%", easing: curve },
            { transform: "scaleX(1)", transformOrigin: "0 50%", offset: ms(WIPE.in) / total },
            { transform: "scaleX(1)", transformOrigin: "100% 50%", offset: ms(WIPE.in + WIPE.hold) / total, easing: curve },
            { transform: "scaleX(0)", transformOrigin: "100% 50%" },
          ],
          { duration: total, delay: delay, fill: "backwards" },
        ),
      );
    } else if (v.clip && !reduce) {
      // a wipe upward, the picture inside settling from REVEAL_CLIP_ZOOM; both on transition.arrive
      var arrive = timing("transition.arrive", delay);
      anims.push(el.animate([{ clipPath: "inset(100% 0 0 0)" }, { clipPath: "inset(0 0 0 0)" }], arrive));
      var img = el.tagName === "IMG" ? null : el.querySelector("img, picture, video, svg");
      if (img) anims.push(img.animate([{ scale: String(REVEAL_CLIP_ZOOM) }, {}], arrive));
    } else {
      anims.push(el.animate([fadeFrom, {}], timing("transition.reveal", delay)));
      if (!reduce && v.rise) anims.push(el.animate([{ translate: "0 " + Site.tokens.shift.rise + "px" }, {}], timing("spring.entrance", delay)));
      if (!reduce && v.zoom) anims.push(el.animate([{ scale: String(REVEAL_ZOOM_FROM) }, {}], timing("spring.entrance", delay)));
    }
    // the class goes on in the same frame as the animations, whose backwards fill holds the hidden state
    el.classList.add("is-in");
    r.anims = anims;
    emit(el, "reveal", { delay: delay });
    Promise.all(
      anims.map(function (a) {
        return a.finished;
      }),
    ).then(
      function () {
        if (r.anims === anims) {
          r.anims = null;
          r.state = "done";
        }
      },
      function () {},
    );
  }
  /** Focus landing inside something still hidden (or waiting for its turn) plays it at once. */
  function onFocusIn(e) {
    for (var node = e.target; node && node !== document; node = node.parentNode) {
      var r = reveals.get(node);
      if (!r) continue;
      if (r.state === "waiting") {
        if (revealIO) revealIO.unobserve(node);
        playReveal(r, 0);
      } else if (r.state === "playing" && performance.now() < r.startAt) playReveal(r, 0);
    }
  }
  document.addEventListener("focusin", onFocusIn, true);

  var VOID = /^(IMG|INPUT|VIDEO|CANVAS|IFRAME|TEXTAREA|SELECT|BR|HR|EMBED|OBJECT|SVG)$/i;
  function addReveal(el, variant, delay, step, manual, fallback) {
    if (reveals.has(el)) return reveals.get(el);
    // the wipe needs a child for its block: on an image (or another element without children) it is the clip
    if (variant === "wipe" && VOID.test(el.tagName)) variant = "clip";
    var r = { el: el, variant: variant || "text", delay: delay || 0, step: step == null ? REVEAL_STEP : step, state: "waiting", anims: null, manual: !!manual, block: null };
    if (r.variant === "wipe") {
      r.block = document.createElement("span");
      r.block.className = "k-wipe";
      r.block.setAttribute("aria-hidden", "true");
      el.appendChild(r.block);
      if (getComputedStyle(el).position === "static") el.style.position = "relative";
    }
    reveals.set(el, r);
    if (env.static || !window.IntersectionObserver) showNow(r);
    else if (!manual) revealObserver().observe(el);
    else if (fallback !== false) {
      // a page sequences it itself; should it never play, it shows when in view after a while
      Site.ready(function () {
        setTimeout(function () {
          if (reveals.get(el) === r && r.state === "waiting") revealObserver().observe(el);
        }, MANUAL_FALLBACK);
      });
    }
    return r;
  }
  function removeReveal(el) {
    var r = reveals.get(el);
    if (!r) return;
    cancelReveal(r);
    if (revealIO) revealIO.unobserve(el);
    if (r.block) r.block.remove();
    el.classList.add("is-in");
    reveals.delete(el);
  }
  /** Play several waiting reveals now as one view: reading order, staggered (a group's play()). */
  function playBatch(list) {
    var batch = [];
    list.forEach(function (el) {
      var r = reveals.get(el);
      if (!r || r.state === "done" || r.state === "playing") return;
      var b = el.getBoundingClientRect();
      batch.push({ r: r, top: b.top, left: b.left });
    });
    batch.sort(function (a, b) {
      return Math.round(a.top / 8) - Math.round(b.top / 8) || a.left - b.left;
    });
    var shrink = batch.length > STAGGER_CALM ? Math.sqrt(STAGGER_CALM / batch.length) : 1;
    var at = 0;
    batch.forEach(function (x) {
      if (revealIO) revealIO.unobserve(x.r.el);
      playReveal(x.r, x.r.delay + at);
      at += x.r.step * 1000 * shrink;
    });
  }
  /** Hide again and wait for the next view (demos, content swapped in place). */
  function rearm(el) {
    var r = reveals.get(el);
    if (!r || env.static) return;
    cancelReveal(r);
    r.state = "waiting";
    el.classList.remove("is-in");
    revealObserver().unobserve(el);
    if (!r.manual) revealIO.observe(el);
  }

  Site.register("reveal", function (el, opts) {
    var r = addReveal(el, opts.reveal, opts.delay, REVEAL_STEP, opts.trigger === "manual", opts.fallback);
    return {
      play: function () {
        if (r.state === "waiting" && revealIO) revealIO.unobserve(el);
        if (r.state !== "done") playReveal(r, 0);
      },
      reset: function () {
        rearm(el);
      },
      get state() {
        return r.state;
      },
      destroy: function () {
        removeReveal(el);
      },
    };
  });

  Site.register("reveal-group", function (el, opts) {
    var sel = typeof opts.items === "string" ? opts.items : null;
    var step = typeof opts.stagger === "number" ? opts.stagger : REVEAL_STEP;
    var mine = [];
    function scan() {
      var list = sel ? el.querySelectorAll(sel) : el.children;
      for (var i = 0; i < list.length; i++) {
        var item = list[i];
        if (reveals.has(item) || /\breveal\b/.test(item.getAttribute("data-kit") || "")) continue;
        if (item.tagName === "TEMPLATE" || item.tagName === "SCRIPT") continue;
        if (sel) item.setAttribute("data-reveal-item", "");
        addReveal(item, opts.reveal, opts.delay, step, opts.trigger === "manual", opts.fallback);
        mine.push(item);
      }
    }
    scan();
    // items added later (a "show more", a filter bringing rows back) come in like the rest
    var mo = new MutationObserver(scan);
    mo.observe(el, { childList: true, subtree: !!sel });
    return {
      refresh: scan,
      play: function () {
        playBatch(mine);
      },
      reset: function () {
        mine.forEach(rearm);
      },
      destroy: function () {
        mo.disconnect();
        mine.forEach(removeReveal);
      },
    };
  });

  /* ------------------------------------------------------- scroll-progress */
  Site.register("scroll-progress", function (el, opts) {
    var target = opts.target ? document.querySelector(opts.target) : null;
    var box = null;
    var maxY = 1;
    var f = follower(PROGRESS_SPRING, 0, function (v) {
      el.style.setProperty("--progress", v.toFixed(4));
    });
    function measure() {
      if (target) box = pageBox(target);
      maxY = Math.max(1, root.scrollHeight - view.vh);
    }
    function update(v) {
      var p = target && box ? clamp((v.y + v.vh - box.top) / (v.vh + box.height), 0, 1) : clamp(v.y / maxY, 0, 1);
      if (env.static) f.jump(p);
      else f.set(p);
    }
    measure();
    var first = true;
    var offL = watchLayout(measure);
    var offS = watchScroll(function (v) {
      if (first) {
        first = false;
        measure();
        f.jump(target && box ? clamp((v.y + v.vh - box.top) / (v.vh + box.height), 0, 1) : clamp(v.y / maxY, 0, 1));
      } else update(v);
    });
    queueScroll();
    return {
      get progress() {
        return f.get();
      },
      destroy: function () {
        offL();
        offS();
        f.destroy();
        el.style.removeProperty("--progress");
      },
    };
  });

  /* -------------------------------------------------------------- parallax */
  Site.register("parallax", function (el, opts) {
    var speed = typeof opts.speed === "number" ? opts.speed : -0.12;
    var center = 0;
    var near = false;
    var y = 0;
    var f = follower("spring.follow", 0, function (v) {
      y = v;
      el.style.transform = Math.abs(v) < 0.05 ? "" : "translate3d(0," + v.toFixed(2) + "px,0)";
    });
    function measure() {
      var b = pageBox(el, 0, y);
      center = b.top + b.height / 2;
    }
    function target(v) {
      return reduced() ? 0 : (center - (v.y + v.vh / 2)) * speed;
    }
    measure();
    var offL = watchLayout(measure);
    var offS = watchScroll(function (v) {
      if (near) f.set(target(v));
    });
    var offV = util.visible(
      el,
      function (on) {
        near = on;
        if (on) f.jump(target(view));
      },
      "40% 0px",
    );
    var offR = Site.on("reduce", function () {
      f.jump(target(view));
    });
    return {
      destroy: function () {
        offL();
        offS();
        offV();
        offR();
        f.destroy();
        el.style.transform = "";
      },
    };
  });

  /* ------------------------------------------------------------ word-scrub */
  /** Wrap every word of el's text in a span, keeping nested inline elements (links, em) as they are. */
  function splitWords(el, cls) {
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        return /\S/.test(n.nodeValue) && !closest(n.parentNode, "script, style, .sr-only") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    var texts = [];
    while (walker.nextNode()) texts.push(walker.currentNode);
    var words = [];
    texts.forEach(function (node) {
      var frag = document.createDocumentFragment();
      node.nodeValue.split(/(\s+)/).forEach(function (part) {
        if (!part) return;
        if (/^\s+$/.test(part)) frag.appendChild(document.createTextNode(part));
        else {
          var s = document.createElement("span");
          s.className = cls;
          s.textContent = part;
          frag.appendChild(s);
          words.push(s);
        }
      });
      node.parentNode.replaceChild(frag, node);
    });
    return words;
  }
  function unsplit(el, words) {
    words.forEach(function (s) {
      if (s.parentNode) s.parentNode.replaceChild(document.createTextNode(s.textContent), s);
    });
    el.normalize();
  }

  Site.register("word-scrub", function (el, opts) {
    var start = typeof opts.start === "number" ? opts.start : SCRUB_START;
    var end = typeof opts.end === "number" ? opts.end : SCRUB_END;
    var words = splitWords(el, "k-scrub__w");
    var lit = new Float32Array(words.length).fill(-1);
    var box = { top: 0, height: 0 };
    el.classList.add("k-scrub");
    function paint(p) {
      var n = words.length;
      var front = p * (n + SCRUB_BAND);
      for (var i = 0; i < n; i++) {
        var t = Math.round(clamp((front - i) / SCRUB_BAND, 0, 1) * 100) / 100;
        if (t === lit[i]) continue;
        lit[i] = t;
        words[i].style.setProperty("--k-w", t);
      }
    }
    var f = follower("spring.follow", 0, paint);
    function measure() {
      box = pageBox(el);
    }
    function progress(v) {
      var top = box.top - v.y;
      var span = (start - end) * v.vh + box.height;
      return clamp((start * v.vh - top) / span, 0, 1);
    }
    measure();
    var offL = watchLayout(measure);
    var first = true;
    var offS = watchScroll(function (v) {
      if (env.static) return f.jump(1);
      if (first) {
        first = false;
        f.jump(progress(v));
      } else f.set(progress(v));
    });
    if (env.static) f.jump(1);
    queueScroll();
    return {
      destroy: function () {
        offL();
        offS();
        f.destroy();
        unsplit(el, words);
        el.classList.remove("k-scrub");
      },
    };
  });

  /* --------------------------------------------------------------- marquee */
  Site.register("marquee", function (el, opts) {
    var speed = typeof opts.speed === "number" ? opts.speed : MARQUEE_SPEED;
    var gain = typeof opts.boost === "number" ? Math.max(0, opts.boost) : 1; // data-boost="0": the scroll does not speed it up
    var dir = opts.direction === "right" ? 1 : -1;
    var pauseOnHover = opts.pauseOnHover === true || opts.pauseOnHover === "";
    var track = document.createElement("div");
    track.className = "k-marquee__track";
    var group = document.createElement("div");
    group.className = "k-marquee__group";
    while (el.firstChild) group.appendChild(el.firstChild);
    track.appendChild(group);
    el.appendChild(track);
    el.classList.add("k-marquee");
    var clones = [];
    var width = 0;
    var x = 0;
    var hoverMV = M.motionValue(1); // 0 while hovered or focused: the strip slows to a stop and starts again
    var velocity = M.motionValue(0);
    var smoothV = M.springValue(velocity, Site.t(MARQUEE_VELOCITY_SPRING));
    var seen = false;

    function fill() {
      width = group.offsetWidth;
      if (!width) return;
      var need = Math.ceil(el.clientWidth / width) + 1;
      while (clones.length < need) {
        var c = group.cloneNode(true);
        c.setAttribute("aria-hidden", "true");
        c.inert = true;
        c.querySelectorAll("[id]").forEach(function (n) {
          n.removeAttribute("id");
        });
        c.removeAttribute("id");
        track.appendChild(c);
        clones.push(c);
      }
    }
    function render() {
      track.style.transform = "translate3d(" + x.toFixed(2) + "px,0,0)";
    }
    var loop = util.loop(function (t, dt) {
      velocity.set(scrollMV.getVelocity());
      var boost = gain ? Math.min((Math.abs(smoothV.get()) / 1000) * MARQUEE_GAIN * gain, MARQUEE_MAX_BOOST) : 0;
      var rate = speed * (1 + boost) * hoverMV.get();
      if (!width) return;
      x += (dir * rate * dt) / 1000;
      // keep x in (-width, 0]: the strip is one group wide, repeated
      x = x % width;
      if (x > 0) x -= width;
      render();
    });
    function still() {
      return reduced() || !el.animate;
    }
    function sync() {
      var stop = still();
      el.classList.toggle("k-marquee--still", stop);
      if (stop) {
        loop.stop();
        x = 0;
        track.style.transform = "";
      } else if (seen) loop.start();
    }
    function slow(to) {
      if (still()) return;
      M.animate(hoverMV, to, Site.t("spring.slide"));
    }
    function onEnter() {
      if (pauseOnHover && env.hover) slow(0);
    }
    function onLeave() {
      if (!el.contains(document.activeElement)) slow(1);
    }
    function onFocusIn() {
      slow(0);
    }
    function onFocusOut(e) {
      if (!el.contains(e.relatedTarget) && !(pauseOnHover && el.matches(":hover"))) slow(1);
    }
    el.addEventListener("pointerenter", onEnter);
    el.addEventListener("pointerleave", onLeave);
    el.addEventListener("focusin", onFocusIn);
    el.addEventListener("focusout", onFocusOut);
    fill();
    var offL = watchLayout(fill);
    // shown later (a layer that was display: none), fonts arriving, a resized banner: measure again
    var ro = window.ResizeObserver
      ? new ResizeObserver(function () {
          fill();
        })
      : null;
    if (ro) {
      ro.observe(el);
      ro.observe(group);
    }
    var offV = util.visible(el, function (on) {
      seen = on;
      if (on && !still()) loop.start();
      else loop.stop();
    });
    var offR = Site.on("reduce", sync);
    sync();
    return {
      pause: function () {
        slow(0);
      },
      play: function () {
        slow(1);
      },
      destroy: function () {
        loop.stop();
        offL();
        offV();
        offR();
        if (ro) ro.disconnect();
        el.removeEventListener("pointerenter", onEnter);
        el.removeEventListener("pointerleave", onLeave);
        el.removeEventListener("focusin", onFocusIn);
        el.removeEventListener("focusout", onFocusOut);
        smoothV.destroy();
        clones.forEach(function (c) {
          c.remove();
        });
        while (group.firstChild) el.insertBefore(group.firstChild, track);
        track.remove();
        el.classList.remove("k-marquee", "k-marquee--still");
      },
    };
  });

  /* ----------------------------------------------------------------- pin-x */
  /*
   * Pinned mode: the section is as tall as its stage plus the track's overflow; the stage sticks while the
   * page scrolls through that extra height, and the track moves sideways by the same distance (smoothed on
   * spring.follow). Native mode (touch, narrow screens, reduced motion, ?static, no JavaScript): the track
   * is a swipeable row with snap points, which is also what the CSS gives before the kit runs.
   */
  Site.register("pin-x", function (el, opts) {
    var track = el.querySelector("[data-pin-track]");
    if (!track) return null;
    var items = Array.prototype.slice.call(track.querySelectorAll("[data-pin-item]"));
    var stage = el.querySelector("[data-pin-stage]");
    var madeStage = false;
    if (!stage) {
      stage = document.createElement("div");
      while (el.firstChild) stage.appendChild(el.firstChild);
      el.appendChild(stage);
      madeStage = true;
    }
    stage.classList.add("k-pin__stage");
    el.classList.add("k-pin");
    var minWidth = typeof opts.min === "number" ? opts.min : PIN_MIN_WIDTH;
    var mode = null;
    var dist = 0;
    var start = 0;
    var lefts = [];
    var index = -1;
    var progress = 0;
    var f = follower("spring.follow", 0, function (p) {
      progress = p;
      track.style.transform = "translate3d(" + (-p * dist).toFixed(2) + "px,0,0)";
      el.style.setProperty("--progress", p.toFixed(4));
      setIndex(items.length > 1 ? Math.round(p * (items.length - 1)) : 0, p);
    });

    function setIndex(i, p) {
      if (i === index) return;
      if (items[index]) items[index].classList.remove("is-current");
      index = i;
      if (items[i]) items[i].classList.add("is-current");
      emit(el, "pin-change", { index: i, progress: p });
    }
    function wantPin() {
      return !reduced() && env.hover && view.vw >= minWidth;
    }
    function measureTrack() {
      var cs = getComputedStyle(track);
      var last = items[items.length - 1] || track.lastElementChild;
      var padL = px(cs.paddingLeft);
      var end = last ? last.offsetLeft + last.offsetWidth + px(cs.paddingRight) : track.scrollWidth;
      dist = Math.max(0, end - track.clientWidth);
      lefts = items.map(function (it) {
        return Math.max(0, it.offsetLeft - padL);
      });
    }
    function measure() {
      var pin = wantPin();
      if (mode === null || pin !== (mode === "pin")) setMode(pin ? "pin" : "native");
      if (mode !== "pin") return;
      measureTrack();
      if (dist <= 0) return;
      var cs = getComputedStyle(el);
      var stageH = stage.offsetHeight;
      el.style.height = stageH + dist + px(cs.paddingTop) + px(cs.paddingBottom) + px(cs.borderTopWidth) + px(cs.borderBottomWidth) + "px";
      var top = px(getComputedStyle(stage).top);
      start = pageBox(el).top + px(cs.paddingTop) + px(cs.borderTopWidth) - top;
    }
    function pinProgress(v) {
      return dist > 0 ? clamp((v.y - start) / dist, 0, 1) : 0;
    }
    function onTrackScroll() {
      var max = track.scrollWidth - track.clientWidth;
      var p = max > 0 ? clamp(track.scrollLeft / max, 0, 1) : 0;
      progress = p;
      el.style.setProperty("--progress", p.toFixed(4));
      var best = 0;
      for (var i = 0; i < lefts.length; i++) if (Math.abs(lefts[i] - track.scrollLeft) < Math.abs(lefts[best] - track.scrollLeft)) best = i;
      setIndex(p > 0.995 ? items.length - 1 : best, p);
    }
    function setMode(next) {
      var keep = index;
      mode = next;
      var pin = next === "pin";
      el.classList.toggle("k-pin--pinned", pin);
      el.classList.toggle("k-pin--native", !pin);
      if (pin) {
        track.removeEventListener("scroll", onTrackScroll);
        track.scrollLeft = 0;
      } else {
        el.style.height = "";
        track.style.transform = "";
        track.addEventListener("scroll", onTrackScroll, { passive: true });
        measureTrack();
        if (keep > 0 && lefts[keep] != null) track.scrollLeft = lefts[keep];
        onTrackScroll();
      }
    }
    /* Item i is current at progress i / (n - 1): the same mapping the index uses, and with items of one
     * width it shows item i whole (its left edge at i / (n - 1) of the stage's spare width). */
    function go(i, behavior) {
      i = clamp(i | 0, 0, items.length - 1);
      var smooth = behavior || (reduced() ? "auto" : "smooth");
      if (mode === "pin" && dist > 0) {
        var p = items.length > 1 ? i / (items.length - 1) : 0;
        window.scrollTo({ top: start + p * dist, behavior: smooth });
      } else track.scrollTo({ left: lefts[i], behavior: smooth });
    }
    // Tab moving into an item off to the side brings it into view by scrolling the page to it
    function onFocusIn(e) {
      if (mode !== "pin") return;
      var item = closest(e.target, "[data-pin-item]");
      var i = items.indexOf(item);
      if (i < 0) return;
      var x = lefts[i] - progress * dist;
      if (x < 0 || x + item.offsetWidth > track.clientWidth) go(i);
    }
    track.addEventListener("focusin", onFocusIn);
    measure();
    var offL = watchLayout(measure);
    var first = true;
    var offS = watchScroll(function (v) {
      if (mode !== "pin") return;
      if (first) {
        first = false;
        f.jump(pinProgress(v));
      } else f.set(pinProgress(v));
    });
    var offR = Site.on("reduce", queueLayout);
    var offH = Site.on("hover", queueLayout);
    queueScroll();
    return {
      go: go,
      get index() {
        return index;
      },
      get progress() {
        return progress;
      },
      destroy: function () {
        offL();
        offS();
        offR();
        offH();
        f.destroy();
        track.removeEventListener("focusin", onFocusIn);
        track.removeEventListener("scroll", onTrackScroll);
        el.style.height = "";
        el.style.removeProperty("--progress");
        track.style.transform = "";
        el.classList.remove("k-pin", "k-pin--pinned", "k-pin--native");
        stage.classList.remove("k-pin__stage");
        if (madeStage) {
          while (stage.firstChild) el.insertBefore(stage.firstChild, stage);
          stage.remove();
        }
      },
    };
  });

  /* ------------------------------------------------------------- scrollspy */
  Site.register("scrollspy", function (el, opts) {
    var links = Array.prototype.filter.call(el.querySelectorAll('a[href*="#"]'), function (a) {
      return a.hash && a.pathname === location.pathname && a.hostname === location.hostname;
    });
    var targets = links.map(function (a) {
      return document.getElementById(decodeURIComponent(a.hash.slice(1)));
    });
    var tops = [];
    var docH = 0;
    var current = -2;
    var lockUntil = 0;
    var lockY = null;
    var smoothClick = opts.smooth !== false;
    /** After a click the mark holds until the page has arrived (a scroll that never moves, as a click's
     * own scrollend, must not release it), or for 2 s at most. */
    function locked(y) {
      if (lockY === null) return false;
      if (Math.abs(y - lockY) < 2 || performance.now() > lockUntil) {
        lockY = null;
        return false;
      }
      return true;
    }
    function offset() {
      return typeof opts.offset === "number" ? opts.offset : Math.round(view.vh * 0.3);
    }
    function measure() {
      tops = targets.map(function (t) {
        return t ? pageBox(t).top : Infinity;
      });
      docH = root.scrollHeight;
    }
    function set(i) {
      if (i === current) return;
      current = i;
      links.forEach(function (a, k) {
        if (k === i) a.setAttribute("aria-current", "true");
        else a.removeAttribute("aria-current");
      });
      emit(el, "spy-change", { id: i > -1 && targets[i] ? targets[i].id : null, index: i });
    }
    function update(v) {
      if (locked(v.y)) return;
      var line = v.y + offset();
      var i = -1;
      for (var k = 0; k < tops.length; k++) if (tops[k] <= line) i = k;
      // at the very bottom, the last section counts as read if it is on screen
      if (v.y + v.vh >= docH - 2) {
        for (var j = tops.length - 1; j > i; j--)
          if (tops[j] < v.y + v.vh) {
            i = j;
            break;
          }
      }
      set(i);
    }
    // a click marks its link at once and holds it while the page scrolls there, so the mark does not
    // step through every section on the way
    function onClick(e) {
      var a = closest(e.target, "a");
      var i = links.indexOf(a);
      if (i < 0 || !targets[i] || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
      set(i);
      var pad = px(getComputedStyle(root).scrollPaddingTop);
      lockY = clamp(Math.round(pageBox(targets[i]).top - pad), 0, Math.max(0, root.scrollHeight - window.innerHeight));
      lockUntil = performance.now() + 2000;
      if (!smoothClick) return;
      e.preventDefault();
      var t = targets[i];
      history.pushState(null, "", a.hash);
      t.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" });
      if (!t.matches("a, button, input, select, textarea, [tabindex]")) t.setAttribute("tabindex", "-1");
      t.focus({ preventScroll: true });
    }
    function onScrollEnd() {
      readView();
      update(view);
    }
    el.addEventListener("click", onClick);
    window.addEventListener("scrollend", onScrollEnd);
    measure();
    var offL = watchLayout(measure);
    var offS = watchScroll(update);
    queueScroll();
    return {
      refresh: function () {
        measure();
        update(view);
      },
      get id() {
        return current > -1 && targets[current] ? targets[current].id : null;
      },
      destroy: function () {
        offL();
        offS();
        el.removeEventListener("click", onClick);
        window.removeEventListener("scrollend", onScrollEnd);
        links.forEach(function (a) {
          a.removeAttribute("aria-current");
        });
      },
    };
  });

  /* ----------------------------------------------------------- scroll-fade */
  /* A port of primitives/effects/scroll-fade: a mask fades each edge where there is more to scroll
   * (amount ramps over half the fade's size), and the items in the fade shrink a little and blur. */
  var FADE_VAR = { top: "--k-fade-top", bottom: "--k-fade-bottom", left: "--k-fade-left", right: "--k-fade-right" };
  var EDGES = ["top", "bottom", "left", "right"];
  function edgeStop(edge) {
    return "rgb(0 0 0 / calc(1 - var(" + FADE_VAR[edge] + ", 0)))";
  }
  function edgeDepth(edge) {
    return "calc(var(--k-fade-size) * min(1, var(" + FADE_VAR[edge] + ", 0) * 1000))";
  }
  var FADE_MASK = {
    vertical: "linear-gradient(to bottom, " + edgeStop("top") + " 0, #000 " + edgeDepth("top") + ", #000 calc(100% - " + edgeDepth("bottom") + "), " + edgeStop("bottom") + " 100%)",
    horizontal: "linear-gradient(to right, " + edgeStop("left") + " 0, #000 " + edgeDepth("left") + ", #000 calc(100% - " + edgeDepth("right") + "), " + edgeStop("right") + " 100%)",
  };
  FADE_MASK.both = FADE_MASK.vertical + ", " + FADE_MASK.horizontal;
  var FADE_GROUP = 'ul, ol, [role="list"], [role="group"]';
  function fadeItems(parent, out) {
    for (var i = 0; i < parent.children.length; i++) {
      var child = parent.children[i];
      var isGroup =
        child.matches(FADE_GROUP) ||
        Array.prototype.some.call(child.children, function (c) {
          return c.matches(FADE_GROUP);
        });
      if (isGroup) fadeItems(child, out);
      else out.push(child);
    }
    return out;
  }
  function smoothstep(v) {
    return v * v * (3 - 2 * v);
  }

  Site.register("scroll-fade", function (el, opts) {
    var orientation = opts.orientation;
    if (orientation !== "vertical" && orientation !== "horizontal" && orientation !== "both") {
      // overflow-x: auto alone computes overflow-y to auto too, so the axis that overflows decides
      var cs = getComputedStyle(el);
      var sx = /auto|scroll/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1;
      var sy = /auto|scroll/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1;
      orientation = sx && sy ? "both" : sx ? "horizontal" : "vertical";
    }
    var size = typeof opts.size === "number" ? opts.size : FADE_SIZE;
    var shrink = typeof opts.shrink === "number" ? opts.shrink : FADE_SHRINK;
    var blur = typeof opts.blur === "number" ? opts.blur : FADE_BLUR;
    var vertical = orientation !== "horizontal";
    var horizontal = orientation !== "vertical";
    el.classList.add("k-fade", "k-fade--" + orientation);
    el.style.setProperty("--k-fade-size", size + "px");
    var values = {};
    EDGES.forEach(function (edge) {
      values[edge] = M.motionValue(0);
    });
    var masked = false;
    var shrunk = new Set();
    var blurred = new Set();
    var slots = [];
    var width = 0;
    var height = 0;
    var dirty = true;
    var zone = size * FADE_ZONE;
    var ramp = size / 2;

    function restore() {
      shrunk.forEach(function (it) {
        it.style.removeProperty("scale");
      });
      blurred.forEach(function (it) {
        it.style.removeProperty("filter");
      });
      shrunk.clear();
      blurred.clear();
    }
    function measureItems() {
      if (!shrink && !blur) return (slots = []);
      var box = el.getBoundingClientRect();
      var scx = el.offsetWidth && Math.abs(box.width - el.offsetWidth) >= 1 ? box.width / el.offsetWidth : 1;
      var scy = el.offsetHeight && Math.abs(box.height - el.offsetHeight) >= 1 ? box.height / el.offsetHeight : 1;
      width = el.clientWidth;
      height = el.clientHeight;
      var base = el;
      while (base.children.length === 1) base = base.children[0];
      slots = fadeItems(base, []).map(function (item) {
        var r = item.getBoundingClientRect();
        return {
          item: item,
          x: (r.left + r.width / 2 - box.left) / scx + el.scrollLeft,
          y: (r.top + r.height / 2 - box.top) / scy + el.scrollTop,
          ownFilter: !blurred.has(item) && getComputedStyle(item).filter !== "none",
        };
      });
    }
    function reach(d) {
      return zone > 0 ? smoothstep(clamp(1 - d / zone, 0, 1)) : 0;
    }
    function paintItems() {
      if (dirty) {
        dirty = false;
        measureItems();
      }
      var sc = reduced() ? 0 : shrink;
      if (!slots.length || (!sc && !blur)) return restore();
      for (var i = 0; i < slots.length; i++) {
        var s = slots[i];
        var depth = 0;
        if (vertical) {
          var cy = s.y - el.scrollTop;
          depth = Math.max(reach(cy) * values.top.get(), reach(height - cy) * values.bottom.get());
        }
        if (horizontal) {
          var cx = s.x - el.scrollLeft;
          depth = Math.max(depth, reach(cx) * values.left.get(), reach(width - cx) * values.right.get());
        }
        if (depth > 0.001 && sc) {
          s.item.style.scale = String(1 - sc * depth);
          shrunk.add(s.item);
        } else if (shrunk.delete(s.item)) s.item.style.removeProperty("scale");
        if (depth > 0.001 && blur && !s.ownFilter) {
          s.item.style.filter = "blur(" + (blur * depth).toFixed(2) + "px)";
          blurred.add(s.item);
        } else if (blurred.delete(s.item)) s.item.style.removeProperty("filter");
      }
    }
    var paintQueued = false;
    function queuePaint() {
      if (paintQueued) return;
      paintQueued = true;
      requestAnimationFrame(function () {
        paintQueued = false;
        paintItems();
      });
    }
    function write() {
      var any = false;
      EDGES.forEach(function (edge) {
        var a = clamp(values[edge].get(), 0, 1);
        if (a > 0.001) any = true;
        el.style.setProperty(FADE_VAR[edge], a.toFixed(4));
      });
      if (any !== masked) {
        masked = any;
        el.style.maskImage = el.style.webkitMaskImage = any ? FADE_MASK[orientation] : "";
        el.style.maskComposite = any ? "intersect" : "";
        el.style.webkitMaskComposite = any ? "source-in" : "";
      }
      queuePaint();
    }
    var offs = EDGES.map(function (edge) {
      return values[edge].on("change", write);
    });
    function amount(d) {
      return ramp > 0 ? clamp(d / ramp, 0, 1) : d > 0.5 ? 1 : 0;
    }
    function measure(follow) {
      var t = { top: 0, bottom: 0, left: 0, right: 0 };
      if (vertical) {
        var maxY = el.scrollHeight - el.clientHeight;
        if (maxY > 1) {
          t.top = amount(el.scrollTop);
          t.bottom = amount(maxY - el.scrollTop);
        }
      }
      if (horizontal) {
        var maxX = el.scrollWidth - el.clientWidth;
        if (maxX > 1) {
          var fromStart = Math.abs(el.scrollLeft);
          var rtl = getComputedStyle(el).direction === "rtl";
          t.left = amount(rtl ? maxX - fromStart : fromStart);
          t.right = amount(rtl ? fromStart : maxX - fromStart);
        }
      }
      EDGES.forEach(function (edge) {
        if (follow || reduced() || env.static) values[edge].jump(t[edge]);
        else if (Math.abs(values[edge].get() - t[edge]) > 0.001) M.animate(values[edge], t[edge], Site.t("transition.fade"));
      });
      write();
    }
    var lastScroll = 0;
    function onScroll() {
      var now = performance.now();
      if (now - lastScroll > FADE_GESTURE_GAP) dirty = true;
      lastScroll = now;
      measure(true);
    }
    el.addEventListener("scroll", onScroll, { passive: true });
    var ro = new ResizeObserver(function () {
      dirty = true;
      measure(false);
    });
    function observeChildren() {
      ro.disconnect();
      ro.observe(el);
      for (var i = 0; i < el.children.length; i++) ro.observe(el.children[i]);
    }
    observeChildren();
    var mo = new MutationObserver(function (records) {
      if (records.some(function (r) { return r.target === el; })) observeChildren();
      dirty = true;
      measure(false);
    });
    mo.observe(el, { childList: true, subtree: true });
    measure(true);
    return {
      destroy: function () {
        el.removeEventListener("scroll", onScroll);
        ro.disconnect();
        mo.disconnect();
        offs.forEach(function (off) {
          off();
        });
        el.style.maskImage = el.style.webkitMaskImage = el.style.maskComposite = el.style.webkitMaskComposite = "";
        restore();
        EDGES.forEach(function (edge) {
          el.style.removeProperty(FADE_VAR[edge]);
        });
        el.style.removeProperty("--k-fade-size");
        el.classList.remove("k-fade", "k-fade--" + orientation);
      },
    };
  });

  /* ------------------------------------------------------------------ draw */
  /*
   * Each stroke gets pathLength="1" and a dash of 1 with a gap of 2 (a gap of 1 leaves a round-cap dot at the
   * end), so its dash offset 1 -> 0 draws it. A value per path (0..1) springs or tweens and writes the offset;
   * opacity comes in over the first tenth so a zero-length stroke shows nothing. Re-triggering retargets.
   */
  var DRAWABLE = "path, line, polyline, polygon, circle, ellipse, rect";
  Site.register("draw", function (el, opts) {
    var trigger = opts.trigger === "hover" || opts.trigger === "manual" ? opts.trigger : opts.scrub ? "scrub" : "view";
    var dur = typeof opts.duration === "number" ? opts.duration : DRAW_DURATION;
    var step = typeof opts.stagger === "number" ? opts.stagger : DRAW_STAGGER;
    var shapes = el.matches(DRAWABLE) ? [el] : Array.prototype.slice.call(el.querySelectorAll(DRAWABLE));
    var strokes = [];
    shapes.forEach(function (s) {
      if (s.closest("[data-draw-skip], defs, clipPath, mask")) return;
      var cs = getComputedStyle(s);
      if (cs.stroke === "none" || (cs.strokeDasharray && cs.strokeDasharray !== "none")) return;
      strokes.push({ el: s, length: s.getAttribute("pathLength"), mv: M.motionValue(1), anim: null });
    });
    var svg = el.ownerSVGElement || el;
    function paint(s, v) {
      var reduceMode = reduced();
      s.el.style.strokeDashoffset = reduceMode ? "0" : String(1 - v);
      s.el.style.opacity = reduceMode ? String(v) : String(clamp(v * 10, 0, 1));
    }
    strokes.forEach(function (s) {
      s.el.setAttribute("pathLength", "1");
      s.el.style.strokeDasharray = "1 2";
      s.off = s.mv.on("change", function (v) {
        paint(s, v);
      });
    });
    function setAll(v) {
      strokes.forEach(function (s) {
        if (s.anim) s.anim.stop();
        s.mv.jump(v);
        paint(s, v);
      });
    }
    /** Draw (to 1) or erase (to 0) every stroke, one after the other, from where each one is. */
    function to(target, instant) {
      if (env.static || instant) return setAll(target);
      var order = target === 1 ? strokes : strokes.slice().reverse();
      var reduce = reduced();
      order.forEach(function (s, i) {
        if (s.anim) s.anim.stop();
        var tr = reduce ? Site.t("transition.reveal") : Site.t({ duration: dur, ease: Site.tokens.ease.draw });
        // no stagger under reduced motion (tokens.md, Staggers); erasing folds back twice as fast
        tr.delay = reduce ? 0 : (target === 1 ? i * step : i * step * 0.5) * Site.tempo;
        s.anim = M.animate(s.mv, target, tr);
      });
    }
    el.classList.add("k-draw");
    var cleanup = [];
    if (trigger === "view") {
      setAll(0);
      if (env.static) setAll(1);
      else {
        var io = new IntersectionObserver(
          function (entries) {
            if (!entries[entries.length - 1].isIntersecting) return;
            io.disconnect();
            to(1);
          },
          { rootMargin: REVEAL_MARGIN },
        );
        io.observe(el);
        cleanup.push(function () {
          io.disconnect();
        });
      }
    } else if (trigger === "hover") {
      setAll(0);
      var host = closest(el, "[data-draw-trigger], a, button") || svg;
      var on = function (e) {
        if (e.type === "pointerenter" && (!env.hover || e.pointerType === "touch")) return;
        to(1);
      };
      var off = function (e) {
        if (e.type === "pointerleave" && host.contains(document.activeElement) && host.matches(":focus-within")) return;
        if (e.type === "focusout" && (host.contains(e.relatedTarget) || host.matches(":hover"))) return;
        to(0);
      };
      host.addEventListener("pointerenter", on);
      host.addEventListener("pointerleave", off);
      host.addEventListener("focusin", on);
      host.addEventListener("focusout", off);
      cleanup.push(function () {
        host.removeEventListener("pointerenter", on);
        host.removeEventListener("pointerleave", off);
        host.removeEventListener("focusin", on);
        host.removeEventListener("focusout", off);
      });
    } else if (trigger === "scrub") {
      var start = typeof opts.start === "number" ? opts.start : SCRUB_START;
      var end = typeof opts.end === "number" ? opts.end : SCRUB_END;
      var box = null;
      var spread = function (p) {
        var n = strokes.length;
        strokes.forEach(function (s, i) {
          var v = clamp(p * n - i, 0, 1);
          s.mv.jump(v);
          paint(s, v);
        });
      };
      var fl = follower("spring.follow", 0, spread);
      var measureBox = function () {
        box = pageBox(svg);
      };
      measureBox();
      var first = true;
      var offL = watchLayout(measureBox);
      var offS = watchScroll(function (v) {
        if (env.static) return fl.jump(1);
        var top = box.top - v.y;
        var p = clamp((start * v.vh - top) / ((start - end) * v.vh + box.height), 0, 1);
        if (first) {
          first = false;
          fl.jump(p);
        } else fl.set(p);
      });
      queueScroll();
      cleanup.push(offL, offS, fl.destroy);
    } else setAll(1);
    var offR = Site.on("reduce", function () {
      strokes.forEach(function (s) {
        paint(s, s.mv.get());
      });
    });
    cleanup.push(offR);
    return {
      play: function () {
        to(1);
      },
      reset: function (o) {
        to(0, !(o && o.animate));
      },
      erase: function () {
        to(0);
      },
      destroy: function () {
        cleanup.forEach(function (fn) {
          fn();
        });
        strokes.forEach(function (s) {
          if (s.anim) s.anim.stop();
          s.off();
          if (s.length == null) s.el.removeAttribute("pathLength");
          else s.el.setAttribute("pathLength", s.length);
          s.el.style.strokeDasharray = s.el.style.strokeDashoffset = s.el.style.opacity = "";
        });
        el.classList.remove("k-draw");
      },
    };
  });

  /* ----------------------------------------------------------- auto-height */
  /* A port of primitives/effects/auto-height: the content sits in an inner box whose size a ResizeObserver
   * watches; the outer box animates its height to it on spring.height (at once under reduced motion). */
  Site.register("auto-height", function (el) {
    var inner = document.createElement("div");
    inner.className = "k-autoh__inner";
    while (el.firstChild) inner.appendChild(el.firstChild);
    el.appendChild(inner);
    el.classList.add("k-autoh");
    var height = 0;
    var anim = null;
    function measure() {
      var r = inner.getBoundingClientRect().height;
      var drawn = inner.offsetHeight && Math.abs(r - inner.offsetHeight) >= 1 ? inner.offsetHeight : r;
      var cs = getComputedStyle(el);
      var extra = cs.boxSizing === "border-box" ? px(cs.paddingTop) + px(cs.paddingBottom) + px(cs.borderTopWidth) + px(cs.borderBottomWidth) : 0;
      var dpr = window.devicePixelRatio || 1;
      return Math.ceil((drawn + extra) * dpr) / dpr;
    }
    function apply() {
      var next = measure();
      if (Math.abs(next - height) < 0.5) return;
      var instant = !height || reduced() || env.static;
      height = next;
      if (anim) anim.stop();
      if (instant) {
        anim = null;
        el.style.height = next + "px";
      } else anim = M.animate(el, { height: next + "px" }, Site.t("spring.height"));
      emit(el, "height-change", { height: next });
    }
    var ro = new ResizeObserver(function () {
      requestAnimationFrame(apply);
    });
    ro.observe(inner);
    apply();
    return {
      refresh: apply,
      destroy: function () {
        ro.disconnect();
        if (anim) anim.stop();
        el.style.height = "";
        while (inner.firstChild) el.insertBefore(inner.firstChild, inner);
        inner.remove();
        el.classList.remove("k-autoh");
      },
    };
  });

  /* ------------------------------------------------------------- pointer */
  // the last pointer position, shared (magnetic keeps pulling while the page scrolls under a still pointer)
  var pointer = { x: -1e5, y: -1e5, fine: false };
  window.addEventListener(
    "pointermove",
    function (e) {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.fine = e.pointerType === "mouse" || e.pointerType === "pen";
    },
    { passive: true, capture: true },
  );

  /* -------------------------------------------------------------- magnetic */
  /* A port of primitives/effects/magnetic: within `range` px of its centre the element is pulled toward the
   * pointer by (1 - distance / range) * strength, on its own spring; it springs back outside. Its layout
   * box is measured once (and on layout changes), not on every move. Writes the `translate` property, so it
   * composes with a press scale or a reveal on the same element. */
  /** A 2D spring whose stiffness can change while it moves (a pull, then a release that wobbles). */
  function springPoint(write) {
    var p = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, k: 100, c: 10, m: 1 };
    var loop = util.loop(function (t, dt) {
      var h = Math.min(dt, 64) / 1000;
      var n = Math.ceil(h / (1 / 240));
      var step = h / n;
      for (var i = 0; i < n; i++) {
        var ax = (-p.k * (p.x - p.tx) - p.c * p.vx) / p.m;
        var ay = (-p.k * (p.y - p.ty) - p.c * p.vy) / p.m;
        p.vx += ax * step;
        p.vy += ay * step;
        p.x += p.vx * step;
        p.y += p.vy * step;
      }
      if (Math.abs(p.x - p.tx) < 0.01 && Math.abs(p.y - p.ty) < 0.01 && Math.abs(p.vx) < 0.05 && Math.abs(p.vy) < 0.05) {
        p.x = p.tx;
        p.y = p.ty;
        p.vx = p.vy = 0;
        loop.stop();
      }
      write(p.x, p.y);
    });
    return {
      to: function (x, y, spring) {
        var s = Site.t({ type: "spring", stiffness: spring.stiffness, damping: spring.damping });
        p.k = s.stiffness;
        p.c = s.damping;
        p.m = spring.mass || 1;
        p.tx = x;
        p.ty = y;
        if (env.static) {
          p.x = x;
          p.y = y;
          p.vx = p.vy = 0;
          write(x, y);
          return;
        }
        loop.start();
      },
      jump: function (x, y) {
        p.x = p.tx = x;
        p.y = p.ty = y;
        p.vx = p.vy = 0;
        loop.stop();
        write(x, y);
      },
      pos: function () {
        return p;
      },
      destroy: function () {
        loop.stop();
      },
    };
  }
  function translateOf(node) {
    return function (x, y) {
      node.style.translate = Math.abs(x) < 0.01 && Math.abs(y) < 0.01 ? "" : x.toFixed(2) + "px " + y.toFixed(2) + "px";
    };
  }
  /* data-inner: the owner's "magnetic button". Over the element (and PAD px around it) it follows the pointer by
   * a share of its offset, softly capped; the inner part goes a little further and a beat later; leaving, both
   * wobble back. */
  function magneticInner(el, opts) {
    var strength = typeof opts.strength === "number" ? opts.strength : MAGNETIC_BTN_STRENGTH;
    var pad = typeof opts.pad === "number" ? opts.pad : MAGNETIC_PAD;
    var max = typeof opts.max === "number" ? opts.max : MAGNETIC_MAX;
    var inner = typeof opts.inner === "string" && opts.inner ? el.querySelector(opts.inner) : el.firstElementChild;
    if (getComputedStyle(el).display === "inline") el.style.display = "inline-block";
    if (inner && getComputedStyle(inner).display === "inline") inner.style.display = "inline-block";
    var outer = springPoint(translateOf(el));
    var inn = inner ? springPoint(translateOf(inner)) : null;
    var held = false;
    var box = null;
    var inView = false;
    function enabled() {
      return env.hover && !reduced() && !env.static;
    }
    function measure() {
      var at = outer.pos(); // measured without the pull it has now
      box = pageBox(el, at.x, at.y);
    }
    function cap(v) {
      return max * Math.tanh(v / max);
    }
    function release() {
      if (!held) return;
      held = false;
      outer.to(0, 0, MAGNETIC_WOBBLE);
      if (inn) inn.to(0, 0, MAGNETIC_INNER_WOBBLE);
    }
    function compute() {
      if (!box || !inView || !enabled() || !pointer.fine) return release();
      var left = box.left - window.scrollX;
      var top = box.top - window.scrollY;
      var x = pointer.x;
      var y = pointer.y;
      if (x < left - pad || x > left + box.width + pad || y < top - pad || y > top + box.height + pad) return release();
      held = true;
      var tx = cap((x - (left + box.width / 2)) * strength);
      var ty = cap((y - (top + box.height / 2)) * strength);
      outer.to(tx, ty, MAGNETIC_SPRING);
      if (inn) inn.to(tx * MAGNETIC_INNER, ty * MAGNETIC_INNER, MAGNETIC_INNER_SPRING);
    }
    var onMove = util.throttle(compute);
    window.addEventListener("pointermove", onMove, { passive: true });
    measure();
    var offL = watchLayout(function () {
      if (!held) measure();
    });
    var offS = watchScroll(function () {
      if (inView) compute();
    });
    var offV = util.visible(el, function (on) {
      inView = on;
      if (on && !held) measure();
      else if (!on) release();
    });
    var offR = Site.on("reduce", function () {
      if (!enabled()) {
        held = false;
        outer.jump(0, 0);
        if (inn) inn.jump(0, 0);
      }
    });
    function onLeaveWindow(e) {
      if (!e.relatedTarget) release();
    }
    document.addEventListener("pointerout", onLeaveWindow);
    return {
      destroy: function () {
        window.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerout", onLeaveWindow);
        offL();
        offS();
        offV();
        offR();
        outer.destroy();
        el.style.translate = "";
        if (inn) {
          inn.destroy();
          inner.style.translate = "";
        }
      },
    };
  }

  Site.register("magnetic", function (el, opts) {
    if (opts.inner !== undefined && opts.inner !== false) return magneticInner(el, opts);
    var strength = typeof opts.strength === "number" ? opts.strength : MAGNETIC_STRENGTH;
    var range = typeof opts.range === "number" ? opts.range : MAGNETIC_RANGE;
    var ox = 0;
    var oy = 0;
    function write() {
      el.style.translate = Math.abs(ox) < 0.01 && Math.abs(oy) < 0.01 ? "" : ox.toFixed(2) + "px " + oy.toFixed(2) + "px";
    }
    var fx = follower(MAGNETIC_SPRING, 0, function (v) {
      ox = v;
      write();
    });
    var fy = follower(MAGNETIC_SPRING, 0, function (v) {
      oy = v;
      write();
    });
    if (getComputedStyle(el).display === "inline") el.style.display = "inline-block";
    var box = null;
    var inView = false;
    function enabled() {
      return env.hover && !reduced() && !env.static;
    }
    function measure() {
      box = pageBox(el, ox, oy);
    }
    function reset() {
      fx.set(0);
      fy.set(0);
    }
    function compute() {
      if (!box || !inView || !enabled() || !pointer.fine) return reset();
      // the centre as drawn (with the current pull), as the source measures it
      var cx = box.left - window.scrollX + box.width / 2 + ox;
      var cy = box.top - window.scrollY + box.height / 2 + oy;
      var dx = pointer.x - cx;
      var dy = pointer.y - cy;
      var dist = Math.hypot(dx, dy);
      if (dist <= range) {
        var k = (1 - dist / range) * strength;
        fx.set(dx * k);
        fy.set(dy * k);
      } else reset();
    }
    var onMove = util.throttle(compute);
    window.addEventListener("pointermove", onMove, { passive: true });
    measure();
    var offL = watchLayout(measure);
    var offS = watchScroll(function () {
      if (inView) compute();
    });
    var offV = util.visible(el, function (on) {
      inView = on;
      if (on) measure();
      else reset();
    });
    var offR = Site.on("reduce", function () {
      if (!enabled()) {
        fx.jump(0);
        fy.jump(0);
      }
    });
    function onLeaveWindow(e) {
      if (!e.relatedTarget) reset();
    }
    document.addEventListener("pointerout", onLeaveWindow);
    return {
      destroy: function () {
        window.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerout", onLeaveWindow);
        offL();
        offS();
        offV();
        offR();
        fx.destroy();
        fy.destroy();
        el.style.translate = "";
      },
    };
  });

  /* ------------------------------------------------------------------ tilt */
  /* A port of primitives/effects/tilt (rotateX/rotateY toward the pointer, up to maxTilt, on its own spring,
   * back to flat on leave) with an optional light: data-shine follows the pointer (spring-linked to the tilt),
   * data-shine="sweep" is primitives/effects/shine's sweep on hover. Writes `transform` on the element. */
  Site.register("tilt", function (el, opts) {
    var max = typeof opts.max === "number" ? opts.max : TILT_MAX;
    var persp = typeof opts.perspective === "number" ? opts.perspective : TILT_PERSPECTIVE;
    var shine = opts.shine === true ? "light" : opts.shine === "sweep" ? "sweep" : null;
    var rx = 0;
    var ry = 0;
    var light = null;
    var sweep = null;
    el.classList.add("k-tilt");
    if (shine) {
      light = document.createElement("span");
      light.className = "k-tilt__shine k-tilt__shine--" + shine;
      light.setAttribute("aria-hidden", "true");
      if (shine === "sweep") light.appendChild(document.createElement("span")).className = "k-tilt__band";
      el.appendChild(light);
      if (getComputedStyle(el).position === "static") el.style.position = "relative";
    }
    function write() {
      var flat = Math.abs(rx) < 0.01 && Math.abs(ry) < 0.01;
      el.style.transform = flat ? "" : "perspective(" + persp + "px) rotateX(" + rx.toFixed(3) + "deg) rotateY(" + ry.toFixed(3) + "deg)";
      if (shine === "light") {
        // the light sits where the pointer is: rotateY = nx * max, rotateX = -ny * max
        light.style.setProperty("--k-x", ((ry / max + 1) * 50).toFixed(2) + "%");
        light.style.setProperty("--k-y", ((-rx / max + 1) * 50).toFixed(2) + "%");
      }
    }
    var fx = follower(TILT_SPRING, 0, function (v) {
      rx = v;
      write();
    });
    var fy = follower(TILT_SPRING, 0, function (v) {
      ry = v;
      write();
    });
    var rect = null;
    function enabled() {
      return env.hover && !reduced() && !env.static;
    }
    function onEnter(e) {
      if (!enabled() || e.pointerType === "touch") return;
      rect = el.getBoundingClientRect();
      if (shine) el.classList.add("is-lit");
      if (shine === "sweep" && light.animate) {
        if (sweep) sweep.cancel();
        sweep = light.firstChild.animate(
          [
            { transform: "translateX(-100%) skewX(" + SHINE_DEG + "deg)" },
            { transform: "translateX(100%) skewX(" + SHINE_DEG + "deg)" },
          ],
          { duration: Site.t(SHINE_SWEEP).duration * 1000, easing: "cubic-bezier(" + SHINE_SWEEP.ease.join(",") + ")" },
        );
      }
    }
    function onMove(e) {
      if (!enabled() || e.pointerType === "touch") return;
      if (!rect) rect = el.getBoundingClientRect();
      var nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      var ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      fy.set(clamp(nx, -1, 1) * max);
      fx.set(-clamp(ny, -1, 1) * max);
    }
    function onLeave() {
      rect = null;
      fx.set(0);
      fy.set(0);
      el.classList.remove("is-lit");
    }
    function onScroll() {
      rect = null;
    }
    el.addEventListener("pointerenter", onEnter);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    window.addEventListener("scroll", onScroll, { passive: true });
    var offR = Site.on("reduce", function () {
      if (reduced()) {
        fx.jump(0);
        fy.jump(0);
        el.classList.remove("is-lit");
      }
    });
    return {
      destroy: function () {
        el.removeEventListener("pointerenter", onEnter);
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerleave", onLeave);
        window.removeEventListener("scroll", onScroll);
        offR();
        fx.destroy();
        fy.destroy();
        if (light) light.remove();
        el.style.transform = "";
        el.classList.remove("k-tilt", "is-lit");
      },
    };
  });

  /* ---------------------------------------------------------------- cursor */
  /*
   * The page's pointer: a dot at the pointer and a hairline ring that follows on CursorFollow's spring, so it
   * trails a little. Over a control the ring grows (with a faint fill) and the dot shrinks; over [data-cursor="Word"]
   * the ring becomes a filled disc carrying the word (the text swaps through blur.icon while the width glides on
   * spring.tooltip); a press tightens the ring and it springs back. Over text fields the native I-beam shows and
   * ours hides. Fine pointers only. Under reduced motion the native cursor stays and only the word shows, beside
   * it. Decorative (aria-hidden), never takes pointer events. One per page (the footer prints its element).
   */
  var CURSOR_GROW = 'a[href], button, [role="button"], [role="link"], [role="tab"], [role="checkbox"], [role="switch"], summary, label, select, input[type="checkbox"], input[type="radio"], input[type="range"], input[type="submit"], input[type="button"], input[type="reset"], input[type="file"], input[type="color"], [data-cursor-grow]';
  var CURSOR_FIELD = 'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="file"]):not([type="color"]):not([type="image"]), textarea, [contenteditable]:not([contenteditable="false"])';
  var cursorInstance = null;
  function cursorState(target) {
    if (!target || target.nodeType !== 1) return { s: "rest" };
    if (closest(target, CURSOR_FIELD)) return { s: "native" };
    var zone = closest(target, "[data-cursor]");
    var ctl = closest(target, CURSOR_GROW);
    if (ctl && ctl.matches(':disabled, [aria-disabled="true"]')) ctl = null;
    if (zone) {
      var w = zone.getAttribute("data-cursor");
      if (w === "none") return { s: "hidden" };
      if (w === "native") return { s: "native" };
      // a control inside a word zone is the nearer thing
      if (ctl && ctl !== zone && zone.contains(ctl)) return { s: "grow" };
      if (w && w !== "grow") return { s: "word", w: w };
      return { s: "grow" };
    }
    return { s: ctl ? "grow" : "rest" };
  }
  function topLayerModal() {
    try {
      return !!document.querySelector(":modal");
    } catch (e) {
      return false;
    }
  }
  function createCursor(el) {
    if (cursorInstance) return null;
    el.classList.add("k-cursor");
    el.setAttribute("aria-hidden", "true");
    el.hidden = false; // the markup hides it until the script runs (footer.liquid)
    el.innerHTML = "";
    el.style.setProperty("--k-cursor-blur", Site.tokens.blur.icon + "px");
    el.style.setProperty("--k-cursor-big", CURSOR_BIG + "px");
    function part(cls, parent) {
      var n = document.createElement("span");
      n.className = cls;
      parent.appendChild(n);
      return n;
    }
    var ring = part("k-cursor__ring", el);
    var shape = part("k-cursor__shape", ring);
    var dot = part("k-cursor__dot", el);
    var dotc = part("k-cursor__dotc", dot);
    var mode = null; // "full" (dot + ring), "label" (reduced motion: the word beside the native cursor) or null
    var state = "rest";
    var word = "";
    var label = null;
    var seen = false; // a mouse has moved over the page
    var inside = false; // the pointer is in the window
    var away = true; // it has been out of the window (or never in): the ring starts at the pointer, not from where it was
    var byTouch = false; // the last pointer was a finger
    var suspended = false; // a top-layer modal is open: the native cursor is back
    var px = -100;
    var py = -100;
    var rx = -100;
    var ry = -100;
    var base = CURSOR_RING / CURSOR_BIG;
    var press = 1;
    var widthAnim = null;
    function writeShape() {
      shape.style.transform = mode === "label" ? "" : "translate(-50%,-50%) scale(" + (base * press).toFixed(4) + ")";
    }
    var sBase = styleValue(base, function (v) {
      base = v;
      writeShape();
    });
    var sPress = styleValue(1, function (v) {
      press = v;
      writeShape();
    });
    var sDot = styleValue(1, function (v) {
      dotc.style.transform = Math.abs(v - 1) < 0.001 ? "" : "scale(" + Math.max(0, v).toFixed(4) + ")";
    });
    function placeRing() {
      ring.style.transform = "translate3d(" + rx.toFixed(2) + "px," + ry.toFixed(2) + "px,0)";
    }
    var fx = follower(CURSOR_FOLLOW, 0, function (v) {
      rx = v;
      placeRing();
    });
    var fy = follower(CURSOR_FOLLOW, 0, function (v) {
      ry = v;
      placeRing();
    });
    function placeDot() {
      dot.style.transform = "translate3d(" + px + "px," + py + "px,0)";
    }
    function sync() {
      var show = !!mode && seen && inside && !byTouch && !suspended && (mode === "full" ? state !== "hidden" && state !== "native" : state === "word");
      el.classList.toggle("is-visible", show);
      root.classList.toggle("has-cursor", mode === "full" && seen && !byTouch && !suspended);
    }
    function swapText(next) {
      if (label && label.textContent === next && !label.classList.contains("is-leaving")) return;
      var old = label;
      label = null;
      if (old) {
        old.classList.remove("is-current");
        old.classList.add("is-leaving");
        setTimeout(function () {
          old.remove();
        }, Site.css("transition.swap").duration + 40);
      }
      if (next == null) return;
      label = part("k-cursor__text", shape);
      label.textContent = next;
      // next frame: the CSS transition plays from the hidden state (opacity, blur)
      requestAnimationFrame(function () {
        if (label && label.parentNode) label.classList.add("is-current");
      });
    }
    function setState(next) {
      var s = next.s;
      var w = next.w || "";
      if (s === state && w === word) return;
      var fromW = shape.offsetWidth;
      state = s;
      word = w;
      el.classList.toggle("is-grow", s === "grow");
      el.classList.toggle("is-word", s === "word");
      swapText(s === "word" ? w : null);
      // the disc's width glides to its word (A8: the resizing indicator)
      var toW = shape.offsetWidth;
      if (widthAnim) widthAnim.cancel();
      widthAnim = null;
      if (!env.static && shape.animate && fromW && Math.abs(toW - fromW) > 0.5) {
        var c = Site.css("spring.tooltip");
        widthAnim = shape.animate([{ width: fromW + "px" }, { width: toW + "px" }], { duration: c.duration, easing: c.easing });
      }
      if (mode === "full") {
        if (s === "rest" || s === "grow" || s === "word") sBase.to(s === "rest" ? CURSOR_RING / CURSOR_BIG : 1, Site.t("spring.pop"));
        sDot.to(s === "grow" ? CURSOR_DOT_GROW : s === "word" ? 0 : 1, Site.t("spring.pop"));
      }
      sync();
    }
    function modeNow() {
      if (!env.hover || env.static) return null;
      return env.reduce ? "label" : "full";
    }
    function applyMode() {
      var m = modeNow();
      if (m === mode) return sync();
      mode = m;
      el.classList.toggle("k-cursor--label", m === "label");
      sBase.to(m === "label" ? 1 : state === "rest" ? CURSOR_RING / CURSOR_BIG : 1, null);
      writeShape();
      sync();
    }
    function retarget() {
      if (!mode || !seen) return;
      setState(cursorState(document.elementFromPoint(px, py)));
    }
    var onScroll = util.throttle(retarget);
    function onMove(e) {
      if (e.pointerType === "touch") {
        byTouch = true;
        return sync();
      }
      byTouch = false;
      if (!mode) return;
      px = e.clientX;
      py = e.clientY;
      if (mode === "label") {
        fx.jump(px + CURSOR_OFFSET.x);
        fy.jump(py + CURSOR_OFFSET.y);
      } else {
        placeDot();
        if (away) {
          fx.jump(px);
          fy.jump(py);
        } else {
          fx.set(px);
          fy.set(py);
        }
      }
      away = false;
      if (!seen || !inside) {
        seen = true;
        inside = true;
        setState(cursorState(e.target));
      }
      sync();
    }
    function onOver(e) {
      if (e.pointerType === "touch" || !mode) return;
      inside = true;
      setState(cursorState(e.target));
    }
    function onOut(e) {
      if (!e.relatedTarget) {
        inside = false;
        away = true;
        sync();
      }
    }
    function onDown(e) {
      if (e.pointerType === "touch") {
        byTouch = true;
        return sync();
      }
      if (mode === "full") sPress.to(CURSOR_PRESS, Site.t("spring.press"));
    }
    function onUp() {
      if (mode === "full") sPress.to(1, Site.t("spring.bounce")); // springs back past its size
    }
    function onHidden() {
      if (document.hidden) {
        inside = false;
        away = true;
        sync();
      }
    }
    var mo = new MutationObserver(function () {
      var next = root.classList.contains("is-modal") && topLayerModal();
      if (next !== suspended) {
        suspended = next;
        sync();
      }
    });
    mo.observe(root, { attributes: true, attributeFilter: ["class"] });
    document.addEventListener("pointermove", onMove, { passive: true, capture: true });
    document.addEventListener("pointerover", onOver, { passive: true });
    document.addEventListener("pointerout", onOut, { passive: true });
    document.addEventListener("pointerdown", onDown, { passive: true, capture: true });
    document.addEventListener("pointerup", onUp, { passive: true, capture: true });
    document.addEventListener("pointercancel", onUp, { passive: true, capture: true });
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("scroll", onScroll, { passive: true });
    var offH = Site.on("hover", applyMode);
    var offR = Site.on("reduce", applyMode);
    applyMode();
    cursorInstance = {
      get state() {
        return mode ? state : "off";
      },
      destroy: function () {
        document.removeEventListener("pointermove", onMove, { capture: true });
        document.removeEventListener("pointerover", onOver);
        document.removeEventListener("pointerout", onOut);
        document.removeEventListener("pointerdown", onDown, { capture: true });
        document.removeEventListener("pointerup", onUp, { capture: true });
        document.removeEventListener("pointercancel", onUp, { capture: true });
        document.removeEventListener("visibilitychange", onHidden);
        window.removeEventListener("scroll", onScroll);
        mo.disconnect();
        offH();
        offR();
        fx.destroy();
        fy.destroy();
        sBase.destroy();
        sPress.destroy();
        sDot.destroy();
        if (widthAnim) widthAnim.cancel();
        root.classList.remove("has-cursor");
        el.innerHTML = "";
        el.classList.remove("k-cursor", "k-cursor--label", "is-visible", "is-grow", "is-word");
        cursorInstance = null;
      },
    };
    return cursorInstance;
  }
  Site.register("cursor", function (el) {
    return createCursor(el);
  });
  // a page without the footer's cursor element gets one
  Site.ready(function () {
    if (cursorInstance) return;
    var el = document.createElement("div");
    el.setAttribute("data-kit", "cursor");
    document.body.appendChild(el);
    Site.init(el);
  });

  /* --------------------------------------------------------- hover-preview */
  /* One picture floating beside the pointer over a list: it comes in like a preview card (from scale.popover,
   * opacity on spring.pop, growing from the side facing the pointer) and leaves the same way; it follows on
   * internal/follow-cursor.tsx's spring and leans with its horizontal speed. A new row's picture wipes in over
   * the last one from the direction the pointer went (crossfade under reduced motion). Keyboard focus on a row
   * shows its picture beside the row. Decorative (aria-hidden): the rows carry their own text. */
  Site.register("hover-preview", function (el, opts) {
    var sel = typeof opts.items === "string" ? opts.items : "[data-preview]";
    var box = document.createElement("div");
    box.className = "k-preview";
    box.setAttribute("aria-hidden", "true");
    var card = document.createElement("div");
    card.className = "k-preview__card";
    box.appendChild(card);
    document.body.appendChild(box);
    var row = null;
    var shown = false;
    var side = 1; // 1: right of the pointer, -1: left
    var lastY = 0;
    var x = 0;
    var y = 0;
    var lean = 0;
    var cardScale = styleValue(reduced() ? 1 : Site.tokens.scale.popover, function (v) {
      card.style.transform = v === 1 ? "" : "scale(" + v.toFixed(4) + ")";
    });
    var cardFade = styleValue(0, function (v) {
      card.style.opacity = String(clamp(v, 0, 1));
    });
    var preloaded = false;
    var w = 0;
    var h = 0;
    function place() {
      box.style.transform = "translate3d(" + x.toFixed(1) + "px," + y.toFixed(1) + "px,0) rotate(" + lean.toFixed(2) + "deg)";
    }
    var leanF = follower("spring.highlight", 0, function (v) {
      lean = v;
      place();
    });
    var fx = follower(PREVIEW_FOLLOW, 0, function (v) {
      x = v;
      if (!reduced()) leanF.set(clamp(fx.smooth.getVelocity() * PREVIEW_LEAN, -PREVIEW_LEAN_MAX, PREVIEW_LEAN_MAX));
      place();
    });
    var fy = follower(PREVIEW_FOLLOW, 0, function (v) {
      y = v;
      place();
    });
    function size() {
      w = card.offsetWidth;
      h = card.offsetHeight;
    }
    function preload() {
      if (preloaded) return;
      preloaded = true;
      el.querySelectorAll(sel).forEach(function (r) {
        var img = new Image();
        img.src = r.getAttribute("data-preview");
      });
    }
    function targetFor(px0, py0) {
      // beside the pointer, vertically centred on it, flipped to the left near the right edge, kept on screen
      side = px0 + PREVIEW_GAP + w > view.vw - 8 ? -1 : 1;
      var tx = side > 0 ? px0 + PREVIEW_GAP : px0 - PREVIEW_GAP - w;
      var ty = clamp(py0 - h / 2, 8, view.vh - h - 8);
      card.style.transformOrigin = side > 0 ? "left center" : "right center";
      return [tx, ty];
    }
    function swapImage(r, down, instant) {
      var src = r.getAttribute("data-preview");
      var img = document.createElement("img");
      img.className = "k-preview__img";
      img.alt = "";
      img.decoding = "async";
      img.src = src;
      var prev = card.lastElementChild;
      card.appendChild(img);
      if (!prev || instant || env.static || !img.animate) {
        // coming in from hidden: the card's own entrance is the motion
        while (card.firstElementChild !== img) card.firstElementChild.remove();
        return;
      }
      var done = function () {
        // the older pictures go once the new one covers them
        while (card.firstElementChild && card.firstElementChild !== img) card.firstElementChild.remove();
      };
      var anims = [];
      if (reduced()) anims.push(img.animate([{ opacity: 0 }, {}], timing("transition.panelIn")));
      else {
        var from = down ? "inset(100% 0 0 0)" : "inset(0 0 100% 0)";
        var slide = timing("spring.slide");
        anims.push(img.animate([{ clipPath: from }, { clipPath: "inset(0 0 0 0)" }], slide));
        anims.push(img.animate([{ scale: String(REVEAL_CLIP_ZOOM), translate: "0 " + (down ? 1 : -1) * Site.tokens.shift.tabs + "px" }, {}], slide));
      }
      anims[0].finished.then(done, function () {});
    }
    function show(r, px0, py0) {
      var fresh = !shown;
      size();
      var t = targetFor(px0, py0);
      if (!shown) {
        shown = true;
        box.classList.add("is-shown");
        fx.jump(t[0]);
        fy.jump(t[1]);
        leanF.jump(0);
        if (!reduced()) cardScale.to(1, Site.t("spring.pop"));
        else cardScale.to(1, null);
        cardFade.to(1, Site.t("spring.pop"));
      } else {
        fx.set(t[0]);
        fy.set(t[1]);
      }
      if (r !== row) {
        var down = !row || py0 >= lastY;
        row = r;
        swapImage(r, down, fresh);
        box.setAttribute("data-alt", r.getAttribute("data-preview-alt") || "");
      }
      lastY = py0;
    }
    function hide() {
      if (!shown) return;
      shown = false;
      row = null;
      box.classList.remove("is-shown");
      // the exit replays the entrance (rules B5): back to scale.popover, fading on the same spring
      if (!reduced()) cardScale.to(Site.tokens.scale.popover, Site.t("spring.pop"));
      cardFade.to(0, Site.t("spring.pop"));
    }
    function onMove(e) {
      if (e.pointerType === "touch" || !env.hover) return;
      preload();
      var r = closest(e.target, sel);
      if (!r || !el.contains(r)) return hide();
      show(r, e.clientX, e.clientY);
    }
    function onLeave(e) {
      if (e.pointerType === "touch") return;
      hide();
    }
    function onFocusIn(e) {
      var r = closest(e.target, sel);
      if (!r || !e.target.matches(":focus-visible")) return;
      var rr = r.getBoundingClientRect();
      show(r, rr.left + rr.width * 0.6, rr.top + rr.height / 2);
    }
    function onFocusOut(e) {
      if (!el.contains(e.relatedTarget)) hide();
    }
    function onScroll() {
      if (shown && !el.matches(":hover") && !el.contains(document.activeElement)) hide();
    }
    el.addEventListener("pointermove", onMove, { passive: true });
    el.addEventListener("pointerleave", onLeave);
    el.addEventListener("focusin", onFocusIn);
    el.addEventListener("focusout", onFocusOut);
    var offS = watchScroll(onScroll);
    return {
      hide: hide,
      destroy: function () {
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerleave", onLeave);
        el.removeEventListener("focusin", onFocusIn);
        el.removeEventListener("focusout", onFocusOut);
        offS();
        fx.destroy();
        fy.destroy();
        leanF.destroy();
        cardScale.destroy();
        cardFade.destroy();
        box.remove();
      },
    };
  });

  /* ---------------------------------------------------------- avatar-group */
  /* A port of primitives/avatar-group: overlapping avatars (each later one on top), the hovered, focused or
   * pressed one lifting AVATAR_LIFT of its height on the group's own spring. Added here: its neighbours step
   * aside a few pixels, less the farther they are, so the lifted one has room. */
  Site.register("avatar-group", function (el, opts) {
    var sel = typeof opts.items === "string" ? opts.items : null;
    var invert = opts.invert === true;
    el.classList.add("k-avatars");
    var items = Array.prototype.slice.call(sel ? el.querySelectorAll(sel) : el.children);
    var states = items.map(function (it, i) {
      it.classList.add("k-avatars__item");
      it.style.zIndex = String(invert ? items.length - i : i + 1);
      var st = { el: it, x: 0, y: 0 };
      st.fy = follower(AVATAR_SPRING, 0, function (v) {
        st.y = v;
        write(st);
      });
      st.fx = follower(AVATAR_SPRING, 0, function (v) {
        st.x = v;
        write(st);
      });
      return st;
    });
    var lift = parseFloat(AVATAR_LIFT) / 100;
    function write(st) {
      // y is a share of the avatar's own height, as the source's "-30%"
      st.el.style.translate = Math.abs(st.x) < 0.01 && Math.abs(st.y) < 0.001 ? "" : st.x.toFixed(2) + "px " + (st.y * 100).toFixed(2) + "%";
    }
    var active = -1;
    function setActive(i) {
      if (i === active) return;
      active = i;
      var room = reduced() ? 0 : AVATAR_ROOM;
      states.forEach(function (st, k) {
        if (i < 0 || reduced()) {
          st.fy.set(0);
          st.fx.set(0);
          return;
        }
        st.fy.set(k === i ? lift : 0);
        var d = k - i;
        st.fx.set(d === 0 ? 0 : Math.sign(d) * room * Math.pow(AVATAR_ROOM_FALLOFF, Math.abs(d) - 1));
      });
    }
    function indexOf(t) {
      for (var i = 0; i < items.length; i++) if (items[i] === t || items[i].contains(t)) return i;
      return -1;
    }
    function onOver(e) {
      if (e.pointerType === "touch" || !env.hover) return;
      setActive(indexOf(e.target));
    }
    function onLeave(e) {
      if (e.pointerType === "touch") return;
      setActive(el.contains(document.activeElement) ? indexOf(document.activeElement) : -1);
    }
    function onDown(e) {
      if (e.pointerType === "touch") setActive(indexOf(e.target));
    }
    function onUp(e) {
      if (e.pointerType === "touch") setActive(-1);
    }
    function onFocusIn(e) {
      setActive(indexOf(e.target));
    }
    function onFocusOut(e) {
      if (!el.contains(e.relatedTarget)) setActive(-1);
    }
    el.addEventListener("pointerover", onOver);
    el.addEventListener("pointerleave", onLeave);
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("focusin", onFocusIn);
    el.addEventListener("focusout", onFocusOut);
    return {
      destroy: function () {
        el.removeEventListener("pointerover", onOver);
        el.removeEventListener("pointerleave", onLeave);
        el.removeEventListener("pointerdown", onDown);
        el.removeEventListener("pointerup", onUp);
        el.removeEventListener("pointercancel", onUp);
        el.removeEventListener("focusin", onFocusIn);
        el.removeEventListener("focusout", onFocusOut);
        states.forEach(function (st) {
          st.fx.destroy();
          st.fy.destroy();
          st.el.style.translate = st.el.style.zIndex = "";
          st.el.classList.remove("k-avatars__item");
        });
        el.classList.remove("k-avatars");
      },
    };
  });
})();
