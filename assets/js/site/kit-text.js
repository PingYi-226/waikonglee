/*
 * kit-text: text components (group T of _work/KIT_SPEC.md).
 *
 *   split          text coming in by character, word or line (rise / arrive / fade)
 *   sliding-number digits rolling to their value like an odometer
 *   rotating-text  words taking turns inside a line; the neighbours glide
 *   rolling-text   letters rolling over like a flip board
 *   sliding-text   a label sliding out as a copy slides in (hover / focus of its link or button)
 *   swap-text      a label swapping in place through a light blur
 *   highlight-text a highlighter sweep behind inline text
 *   shimmer-text   a glint running across text
 *   typing-text    text typed out with a caret
 *   scramble       short mono labels decrypting left to right
 *
 * The behaviour and the values are Animate UI's text primitives (packages/react/src/primitives/texts/*), ported
 * without React. Values a primitive owns are named constants below, with the file they come from. Everything
 * else comes from Site.t() tokens. The documentation for page authors is _work/agent_notes/kit-text.md.
 */
(function () {
  "use strict";

  const S = window.Site;
  const M = window.Motion;
  if (!S) return;
  const env = S.env;

  /* ------------------------------------------------------------ constants */
  // Start view-triggered entrances once the element is a little inside the viewport, so the start is seen.
  const VIEW_MARGIN = "0px 0px -8% 0px";
  // sliding-number: each column follows its digit on this spring (Animate UI sliding-number ROLLER_TRANSITION)
  const ROLLER = { type: "spring", stiffness: 200, damping: 20, mass: 0.4 };
  // sliding-number: the value counts on spring.number with these rest thresholds (Animate UI COUNT_TRANSITION)
  const COUNT_REST = { restDelta: 0.001, restSpeed: 0.01 };
  // rotating-text: the word leaves upward and the next comes from below, 50px, 0.3s easeOut, one after the other
  // (Animate UI RotatingTextContainer y = -50, RotatingText DEFAULT_TRANSITION, AnimatePresence mode="wait").
  const ROTATE_TRAVEL = 50;
  const ROTATE = { duration: 0.3, ease: S.tokens.ease.leave }; // Motion's "easeOut" is ease.leave's curve
  // How far rising pieces start below their clipping line, beyond their own height (em). See riseFrom().
  const RISE_CLEAR = 0.25;

  /* -------------------------------------------------------------- helpers */
  let segmenter;
  /** The user-perceived characters of a string (Animate UI _text.ts splitGraphemes). */
  function graphemes(text) {
    if (segmenter === undefined) segmenter = typeof Intl !== "undefined" && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
    if (!segmenter) return Array.from(text);
    return Array.from(segmenter.segment(text), (s) => s.segment);
  }

  function span(cls, text) {
    const s = document.createElement("span");
    if (cls) s.className = cls;
    if (text != null) s.textContent = text;
    return s;
  }

  /** A copy of the text for screen readers, next to a visual that is aria-hidden. */
  function srText(text) {
    const s = span("sr-only k-sr", text);
    return s;
  }

  function emit(el, name, detail) {
    el.dispatchEvent(new CustomEvent("kit:" + name, { bubbles: true, detail: detail || {} }));
  }

  function isReady() {
    return document.documentElement.classList.contains("is-ready");
  }

  /**
   * Run play() when the trigger says so: "view" (once, when it scrolls in), "load" (once the page is ready),
   * "manual" (never: the page calls the controller). A delay (ms) is added; reduced motion drops it.
   * Returns a function that cancels the wait.
   */
  function whenTriggered(el, trigger, delay, play) {
    let timer = null;
    let off = null;
    const fire = () => {
      const ms = env.reduce ? 0 : Number(delay) || 0;
      if (ms) timer = setTimeout(play, ms);
      else play();
    };
    if (trigger === "manual") return () => {};
    if (trigger === "load") {
      if (isReady()) requestAnimationFrame(fire);
      else off = S.on("ready", fire);
    } else {
      const io = new IntersectionObserver(
        (entries) => {
          if (!entries.some((e) => e.isIntersecting)) return;
          io.disconnect();
          // wait for the page's first paint of initial states, so a view entrance at load still plays
          if (isReady()) fire();
          else off = S.on("ready", fire);
        },
        { rootMargin: VIEW_MARGIN },
      );
      io.observe(el);
      const prev = off;
      off = () => {
        io.disconnect();
        if (prev) prev();
      };
    }
    return () => {
      clearTimeout(timer);
      if (off) off();
    };
  }

  /** Stop a Motion animation (or our static stand-in) if there is one. */
  function stop(a) {
    if (a && a.stop) a.stop();
  }

  /* ================================================================ split */
  /*
   * Text coming in by character, word or line. The text nodes are wrapped in place, so nested inline elements
   * (links, <em>) keep their place, listeners and focus. Every word sits in its own clipping box (.k-split__m);
   * lines are the words that share a line, found by measuring, and given the same delay: a line rises as one
   * because all its words move together. So re-splitting lines on resize only re-measures, nothing is rebuilt.
   * Characters: the visual is aria-hidden and a copy of each text run is read instead (Animate UI's way).
   */
  const SPLIT_UNIT = "[data-kit], [data-split-unit], img, svg, input, select, textarea, button";
  const SPLIT_SKIP = "script, style, template, .sr-only, [aria-hidden='true']";

  S.register("split", function (el, opts) {
    const by = ["chars", "words", "lines"].indexOf(opts.split) > -1 ? opts.split : "words";
    const effect = ["rise", "arrive", "fade"].indexOf(opts.effect) > -1 ? opts.effect : "rise";
    const trigger = opts.trigger || "view";
    const undo = []; // [inserted nodes, original node] to put the original text back
    const decos = [];
    let pieces = [];
    let masks = [];
    let order = []; // stagger index of each piece
    let state = "idle"; // idle | playing | done
    let anims = [];

    function wrapWord(word) {
      const m = span("k-split__m");
      if (by === "chars") graphemes(word).forEach((c) => m.appendChild(span("k-split__p k-split__c", c)));
      else m.appendChild(span("k-split__p", word));
      return m;
    }

    function splitText(node) {
      const text = node.data;
      if (!/\S/.test(text)) return;
      const frag = document.createDocumentFragment();
      text.split(/(\s+)/).forEach((tok) => {
        if (!tok) return;
        frag.appendChild(/^\s+$/.test(tok) ? document.createTextNode(tok) : wrapWord(tok));
      });
      let nodes;
      if (by === "chars") {
        const vis = span("k-split__vis");
        vis.setAttribute("aria-hidden", "true");
        vis.appendChild(frag);
        nodes = [srText(text), vis];
      } else nodes = Array.prototype.slice.call(frag.childNodes);
      node.replaceWith.apply(node, nodes);
      undo.push([nodes, node]);
    }

    function wrapUnit(child) {
      const m = span("k-split__m");
      const p = span("k-split__p k-split__unit");
      child.replaceWith(m);
      p.appendChild(child);
      m.appendChild(p);
      undo.push([[m], child]);
    }

    function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach((child) => {
        if (child.nodeType === 3) splitText(child);
        else if (child.nodeType === 1) {
          if (child.matches(SPLIT_SKIP) || child.tagName === "BR") return;
          if (child.matches(SPLIT_UNIT)) return wrapUnit(child);
          // a link's hairline (a background) waits for its words, then draws in with the link's own transition
          if (getComputedStyle(child).backgroundImage !== "none") {
            child.classList.add("k-split__deco");
            decos.push(child);
          }
          walk(child);
        }
      });
    }

    /** translateY that takes a piece fully below its clipping line, bleed included (in % of its own height). */
    function riseFrom() {
      const cs = getComputedStyle(el);
      const fs = parseFloat(cs.fontSize) || 16;
      const lh = cs.lineHeight === "normal" ? fs * 1.2 : parseFloat(cs.lineHeight) || fs * 1.2;
      return Math.ceil((100 * (lh + RISE_CLEAR * fs)) / lh);
    }

    /** The resting and starting styles of a piece for this effect, under the current motion setting. */
    function from() {
      if (effect === "rise") return env.reduce ? { opacity: 0 } : { transform: "translateY(" + riseFrom() + "%)" };
      if (effect === "arrive")
        return { opacity: 0, transform: "translateY(" + S.m(S.tokens.shift.arrive) + "px)", filter: "blur(" + S.tokens.blur.arrive + "px)" };
      return { opacity: 0, filter: "blur(" + S.tokens.blur.icon + "px)" };
    }
    const REST = { opacity: "1", transform: "none", filter: "none" };

    function apply(target) {
      const f = target || from();
      pieces.forEach((p) => {
        p.style.opacity = f.opacity != null ? f.opacity : "";
        p.style.transform = f.transform || "";
        p.style.filter = f.filter || "";
      });
    }

    /** Lines: the words whose boxes start on the same row share an index. Measured, so it follows the layout. */
    function measureLines() {
      let line = -1;
      let top = -Infinity;
      const lineOf = new Map();
      masks.forEach((m) => {
        const r = m.getBoundingClientRect();
        if (r.top > top + r.height * 0.5) {
          line++;
          top = r.top;
        }
        lineOf.set(m, line);
      });
      order = pieces.map((p) => lineOf.get(p.closest(".k-split__m")) || 0);
    }

    function indexPieces() {
      if (by === "lines") return measureLines();
      if (by === "chars") order = pieces.map((_, i) => i);
      else order = pieces.map((p) => masks.indexOf(p.closest(".k-split__m")));
    }

    function play() {
      if (state !== "idle") return;
      state = "playing";
      el.classList.add("is-in");
      stopWait();
      if (env.static || !M) {
        apply(REST);
        return finish();
      }
      indexPieces();
      const step = opts.stagger != null ? Number(opts.stagger) : by === "chars" ? S.tokens.stagger.chars : S.tokens.stagger.words;
      const f = from();
      const to = {};
      Object.keys(f).forEach((k) => (to[k] = k === "opacity" ? 1 : k === "filter" ? "blur(0px)" : "translateY(0%)"));
      let t;
      if (effect === "rise") t = env.reduce ? "transition.reveal" : "spring.entrance";
      else t = effect === "arrive" ? "transition.arrive" : "transition.reveal";
      anims = pieces.map((p, i) => {
        // no cascade under reduced motion: the whole text fades in at once (tokens.md, Staggers)
        const delay = env.reduce ? 0 : order[i] * step;
        const kf = {};
        Object.keys(to).forEach((k) => (kf[k] = [f[k], to[k]]));
        return S.animate(p, kf, S.t(t, { delay: delay }));
      });
      Promise.all(anims.map((a) => a.finished || a)).then(() => {
        if (state !== "playing") return;
        apply(REST);
        finish();
      });
    }

    function finish() {
      state = "done";
      el.classList.add("is-done");
      emit(el, "split-done", { by: by, effect: effect });
    }

    function reset() {
      anims.forEach(stop);
      anims = [];
      state = "idle";
      el.classList.remove("is-in", "is-done");
      apply();
    }

    function revert() {
      reset();
      undo.splice(0).forEach(([nodes, orig]) => {
        nodes[0].replaceWith(orig);
        for (let i = 1; i < nodes.length; i++) nodes[i].remove();
      });
      pieces = [];
      masks = [];
      decos.splice(0).forEach((d) => d.classList.remove("k-split__deco"));
      el.classList.remove("k-split", "k-split--" + effect, "k-split--" + by);
      el.style.removeProperty("--k-split-y");
    }

    // build
    walk(el);
    masks = Array.prototype.slice.call(el.querySelectorAll(".k-split__m"));
    pieces = Array.prototype.slice.call(el.querySelectorAll(".k-split__p"));
    el.classList.add("k-split", "k-split--" + effect, "k-split--" + by);
    if (env.static) {
      state = "done";
      el.classList.add("is-in", "is-done");
    } else apply();

    let stopWait = env.static ? () => {} : whenTriggered(el, trigger, opts.delay, play);
    // a reveal plays at once when focus lands inside it (rules A17)
    const onFocus = () => {
      if (state === "idle") play();
    };
    el.addEventListener("focusin", onFocus);
    const offResize = S.on("resize", () => {
      if (by === "lines" && state === "idle") indexPieces();
    });
    const offReduce = S.on("reduce", () => {
      if (state === "idle") apply();
    });

    return {
      play: play,
      reset: () => {
        reset();
        stopWait();
        stopWait = () => {};
      },
      revert: revert,
      destroy: () => {
        stopWait();
        offResize();
        offReduce();
        el.removeEventListener("focusin", onFocus);
        revert();
      },
    };
  });

  /* ======================================================= sliding-number */
  /*
   * Animate UI's Sliding Number: the value counts on spring.number and every column rolls to its digit on its
   * own spring, each digit placed on a wheel of ten (the shortest way round). Two changes, named in the notes:
   * a column's target is unwrapped (floor(value / place), not its digit mod 10), so a count rolls every column
   * forward like an odometer instead of spinning a column back from 9 to 0; and columns that appear or leave
   * (2 -> 3 digits) grow and shrink on spring.reflow while they fade, so the other digits glide, never jump.
   */
  const NUM_RE = /^([\s\S]*?)([-−])?(\d(?:[\d.,'   ]*\d)?)([\s\S]*)$/;

  function parseNumber(text, opts) {
    const m = NUM_RE.exec(text.trim());
    const fmt = { prefix: "", suffix: "", sep: opts.separator != null ? String(opts.separator) : null, dec: opts.decimal != null ? String(opts.decimal) : ".", decimals: 0 };
    let value = typeof opts.value === "number" ? opts.value : NaN;
    const rawValue = opts.valueRaw;
    if (rawValue && /\./.test(rawValue)) fmt.decimals = rawValue.split(".")[1].length;
    if (m) {
      fmt.prefix = m[1];
      fmt.suffix = m[4];
      const body = m[3];
      let intPart = body;
      let decPart = "";
      if (rawValue) {
        if (fmt.decimals) {
          const cut = body.length - fmt.decimals;
          fmt.dec = body.charAt(cut - 1) || fmt.dec;
          intPart = body.slice(0, cut - 1);
          decPart = body.slice(cut);
        }
      } else {
        // no data-value: the last . or , starts the decimals unless it groups thousands (exactly 3 digits after)
        const k = Math.max(body.lastIndexOf("."), body.lastIndexOf(","));
        const tail = k > -1 ? body.slice(k + 1) : "";
        const both = body.indexOf(".") > -1 && body.indexOf(",") > -1;
        if (k > -1 && (both || tail.length !== 3)) {
          fmt.dec = body.charAt(k);
          fmt.decimals = tail.length;
          intPart = body.slice(0, k);
          decPart = tail;
        }
      }
      const sep = intPart.replace(/\d/g, "").charAt(0);
      if (fmt.sep == null) fmt.sep = sep || "";
      if (isNaN(value)) value = Number(intPart.replace(/\D/g, "") + (decPart ? "." + decPart : "")) * (m[2] ? -1 : 1);
    }
    if (fmt.sep == null) fmt.sep = "";
    if (opts.decimals != null) fmt.decimals = Number(opts.decimals);
    if (opts.prefix != null) fmt.prefix = String(opts.prefix);
    if (opts.suffix != null) fmt.suffix = String(opts.suffix);
    return { value: isNaN(value) ? 0 : value, fmt: fmt };
  }

  function formatNumber(value, fmt, pad) {
    const fixed = Math.abs(value).toFixed(fmt.decimals);
    const sign = value < 0 && Number(fixed) !== 0 ? "−" : "";
    const parts = fixed.split(".");
    let int = parts[0].padStart(pad || 0, "0");
    if (fmt.sep) int = int.replace(/\B(?=(\d{3})+(?!\d))/g, fmt.sep);
    return fmt.prefix + sign + int + (parts[1] ? fmt.dec + parts[1] : "") + fmt.suffix;
  }

  S.register("sliding-number", function (el, opts) {
    const original = el.textContent;
    const parsed = parseNumber(original, Object.assign({}, opts, { valueRaw: el.getAttribute("data-value") }));
    const fmt = parsed.fmt;
    const factor = Math.pow(10, fmt.decimals);
    let target = parsed.value;
    const from = typeof opts.from === "number" ? opts.from : 0;
    const trigger = opts.trigger || "view";
    const toUnits = (v) => Math.round(v * factor);
    const intLength = (units) => Math.floor(Math.abs(units) / factor).toString().length;
    const padTo = () => (opts.pad === true ? intLength(toUnits(target)) : typeof opts.pad === "number" ? opts.pad : 0);

    // structure: [sr-only value] [visual: prefix, sign, integer columns, decimal mark, decimal columns, suffix]
    el.textContent = "";
    el.classList.add("k-num");
    const sr = srText(formatNumber(target, fmt, padTo()));
    const vis = span("k-num__vis");
    vis.setAttribute("aria-hidden", "true");
    const sign = span("k-num__sign", "−");
    const ints = span("k-num__int");
    if (fmt.prefix) vis.appendChild(span("k-num__fix", fmt.prefix));
    vis.appendChild(sign);
    vis.appendChild(ints);
    const decs = span("k-num__int");
    if (fmt.decimals) {
      vis.appendChild(span("k-num__dec", fmt.dec));
      vis.appendChild(decs);
    }
    if (fmt.suffix) vis.appendChild(span("k-num__fix", fmt.suffix));
    el.appendChild(sr);
    el.appendChild(vis);

    const units = new Map(); // place -> column
    let current = env.static || from === target ? target : from; // the value shown (counting)
    let shownUnits = toUnits(current);

    function renderColumn(col, pos) {
      // each digit sits on a wheel of ten around the current position (Animate UI SlidingNumberDisplay)
      const at = ((pos % 10) + 10) % 10;
      for (let n = 0; n < 10; n++) {
        let off = (10 + n - at) % 10;
        if (off > 5) off -= 10;
        const t = "translateY(" + (off * 100).toFixed(2) + "%)";
        if (col.last[n] !== t) {
          col.digits[n].style.transform = t;
          col.last[n] = t;
        }
      }
    }

    function makeColumn(place, isInt) {
      const unit = span("k-num__unit");
      const roll = span("k-num__col");
      roll.appendChild(span("k-num__ghost", "0"));
      const digits = [];
      for (let n = 0; n < 10; n++) digits.push(roll.appendChild(span("k-num__d", String(n))));
      unit.appendChild(roll);
      const digitsRight = Math.round(Math.log10(place / factor));
      if (isInt && fmt.sep && digitsRight > 0 && digitsRight % 3 === 0) unit.appendChild(span("k-num__sep", fmt.sep));
      const start = Math.floor(Math.abs(shownUnits) / place);
      const col = { place: place, el: unit, roll: roll, digits: digits, last: [], leaving: false, anim: null };
      col.pos = M && M.springValue ? M.springValue(start, S.t(ROLLER)) : null;
      if (col.pos) col.off = col.pos.on("change", (v) => renderColumn(col, v));
      renderColumn(col, start);
      return col;
    }

    function naturalWidth(col) {
      let w = col.roll.offsetWidth;
      const s = col.el.querySelector(".k-num__sep");
      if (s) w += s.offsetWidth;
      return w;
    }

    /** A column appearing (grow from nothing, fade in) or leaving (shrink, fade out, then removed). */
    function resizeColumn(col, show) {
      stop(col.anim);
      if (env.reduce || !M) {
        if (show) {
          col.el.style.width = "";
          col.el.style.opacity = "";
          col.el.classList.remove("is-sizing");
        } else dropColumn(col);
        return;
      }
      const w = naturalWidth(col);
      if (!col.el.style.width) col.el.style.width = (show ? 0 : w) + "px";
      col.el.classList.add("is-sizing");
      const a = M.animate(col.el, { width: (show ? w : 0) + "px" }, S.t("spring.reflow"));
      const f = M.animate(col.el, { opacity: show ? 1 : 0 }, S.t("transition.fade"));
      const token = { stop: () => (a.stop(), f.stop()) };
      col.anim = token;
      a.finished.then(() => {
        if (col.anim !== token) return;
        col.anim = null;
        if (show) {
          col.el.style.width = "";
          col.el.classList.remove("is-sizing");
        } else dropColumn(col);
      });
    }

    function dropColumn(col) {
      if (col.off) col.off();
      if (col.pos) col.pos.stop && col.pos.stop();
      col.el.remove();
      units.delete(col.place);
    }

    /** Make the integer columns match the shown value: add the missing ones on the left, let the extra ones go. */
    function syncColumns(u, animate) {
      const len = Math.max(intLength(u), padTo());
      const want = new Set();
      for (let i = 0; i < len; i++) want.add(Math.pow(10, i) * factor);
      units.forEach((col, place) => {
        if (!col.isInt) return;
        if (!want.has(place) && !col.leaving) {
          col.leaving = true;
          if (animate) resizeColumn(col, false);
          else dropColumn(col);
        } else if (want.has(place) && col.leaving) {
          col.leaving = false;
          resizeColumn(col, true);
        }
      });
      want.forEach((place) => {
        if (units.has(place)) return;
        const col = makeColumn(place, true);
        col.isInt = true;
        units.set(place, col);
        // keep the columns ordered by place, highest first
        let before = null;
        units.forEach((c) => {
          if (c !== col && c.isInt && c.place < place && (!before || c.place > before.place)) before = c;
        });
        ints.insertBefore(col.el, before ? before.el : null);
        if (animate) {
          col.el.style.opacity = "0";
          resizeColumn(col, true);
        }
      });
    }

    function show(u, animate) {
      shownUnits = u;
      sign.hidden = !(u < 0);
      syncColumns(u, animate);
      units.forEach((col) => {
        // unwrapped target: a count rolls every column forward, like an odometer
        const t = Math.floor(Math.abs(u) / col.place);
        if (!col.pos) return renderColumn(col, t);
        if (animate && !env.reduce) col.pos.set(t);
        else col.pos.jump(t);
      });
    }

    // decimal columns are fixed
    for (let j = 0; j < fmt.decimals; j++) {
      const place = Math.pow(10, fmt.decimals - j - 1);
      const col = makeColumn(place, false);
      units.set(place, col);
      decs.appendChild(col.el);
    }
    show(toUnits(current), false);
    el.classList.add("is-built");

    const value = M && M.motionValue ? M.motionValue(current) : null;
    let count = null;
    const offValue = value
      ? value.on("change", (v) => {
          current = v;
          const u = toUnits(v);
          if (u !== shownUnits) show(u, true);
        })
      : null;

    function set(next, o) {
      next = Number(next);
      if (isNaN(next)) return;
      target = next;
      sr.textContent = formatNumber(target, fmt, padTo());
      stop(count);
      count = null;
      const instant = (o && o.instant) || env.reduce || !value || !M;
      if (instant) {
        if (value) value.jump(next);
        current = next;
        show(toUnits(next), false);
        return;
      }
      count = M.animate(value, next, S.t("spring.number", COUNT_REST));
      emit(el, "sliding-number-change", { value: next });
    }

    let stopWait = env.static || current === target ? () => {} : whenTriggered(el, trigger, opts.delay, () => set(target));
    const offReduce = S.on("reduce", (r) => {
      if (r && count) set(target, { instant: true });
    });

    return {
      set: set,
      play: () => set(target),
      get value() {
        return target;
      },
      destroy: () => {
        stopWait();
        offReduce();
        stop(count);
        if (offValue) offValue();
        units.forEach(dropColumn);
        el.classList.remove("k-num", "is-built");
        el.textContent = original;
      },
    };
  });

  /* ======================================================== rotating-text */
  /*
   * Animate UI's Rotating Text, inline: the word leaves upward and fades, then the next one rises in
   * (mode "wait"). The container's width follows the word, so the rest of the line glides (spring.height,
   * the token for a size following its content): it grows before the next word comes in and shrinks once the
   * previous one has gone, so a word never overlaps its neighbours. data-align reserves the widest word
   * instead (Animate UI's `align`), which reduced motion uses too: the words only crossfade and nothing moves.
   */
  S.register("rotating-text", function (el, opts) {
    const original = Array.prototype.slice.call(el.childNodes);
    let words = Array.isArray(opts.words) ? opts.words.map(String) : null;
    if (!words) {
      const kids = Array.prototype.slice.call(el.children);
      words = kids.length ? kids.map((k) => k.textContent.trim()) : [el.textContent.trim()];
    }
    words = words.filter((w) => w.length);
    if (!words.length) return null;
    const duration = Number(opts.duration) || 2600;
    const align = ["start", "center", "end"].indexOf(opts.align) > -1 ? opts.align : null;
    let index = 0;
    let cur = null;
    let timer = null;
    let onScreen = false;
    let paused = false;
    let widthAnim = null;
    let widest = 0;

    el.textContent = "";
    el.classList.add("k-rot");
    el.appendChild(srText(words.join(", ")));
    const meter = span("k-rot__meter");
    meter.setAttribute("aria-hidden", "true");
    el.appendChild(meter);
    cur = wordEl(words[0]);
    el.appendChild(cur);

    function wordEl(text) {
      const w = span("k-rot__w", text);
      w.setAttribute("aria-hidden", "true");
      return w;
    }
    // reduced motion crossfades in a box as wide as the widest word, so nothing moves; ?static never rotates,
    // so it keeps the first word's own width
    const reserving = () => !!align || (env.reduce && !env.static);

    /** The widest word, measured in the element's own font (fonts loading and resizing re-measure). */
    function measure() {
      widest = 0;
      words.forEach((w) => {
        meter.textContent = w;
        widest = Math.max(widest, meter.offsetWidth);
      });
      meter.textContent = "";
      el.classList.toggle("is-reserved", reserving());
      el.style.minWidth = reserving() && widest ? widest + "px" : "";
      el.style.textAlign = reserving() ? { start: "start", center: "center", end: "end" }[align || "start"] : "";
    }

    function setWidth(w, delay) {
      stop(widthAnim);
      if (reserving() || !M || env.static) {
        el.style.width = "";
        return;
      }
      const a = M.animate(el, { width: w + "px" }, S.t("spring.height", { delay: delay }));
      widthAnim = a;
      a.finished.then(() => {
        if (widthAnim === a) {
          el.style.width = "";
          widthAnim = null;
        }
      });
    }

    function next() {
      if (words.length < 2) return;
      index = (index + 1) % words.length;
      const old = cur;
      const travel = S.m(ROTATE_TRAVEL);
      const box = el.offsetWidth;
      if (!widthAnim && !reserving()) el.style.width = box + "px"; // hold the line while the word leaves
      // the leaving word stops taking space (popLayout) and stays where it is
      const left = old.offsetLeft;
      const top = old.offsetTop;
      old.classList.add("is-leaving");
      old.style.left = left + "px";
      old.style.top = top + "px";
      cur = wordEl(words[index]);
      cur.style.opacity = "0";
      cur.style.transform = "translateY(" + travel + "px)";
      el.appendChild(cur);
      const w = cur.offsetWidth;
      const t = S.t(ROTATE);
      const gone = S.animate(old, { opacity: 0, transform: "translateY(" + -travel + "px)" }, t);
      gone.then(() => old.remove());
      // grow before the next word comes in, shrink once the previous one has gone
      setWidth(w, w >= old.offsetWidth ? 0 : t.duration);
      S.animate(cur, { opacity: 1, transform: "translateY(0px)" }, S.t(ROTATE, { delay: t.duration }));
      emit(el, "rotating-change", { index: index, word: words[index] });
    }

    function schedule(first) {
      clearTimeout(timer);
      if (paused || !onScreen || env.static || words.length < 2) return;
      timer = setTimeout(
        () => {
          next();
          schedule(false);
        },
        duration + (first ? Number(opts.delay) || 0 : 0),
      );
    }

    measure();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
    const offResize = S.on("resize", measure);
    const offReduce = S.on("reduce", measure);
    let started = false;
    const offVisible = S.util.visible(el, (v) => {
      onScreen = v;
      if (v) {
        schedule(!started);
        started = true;
      } else clearTimeout(timer);
    });

    return {
      next: () => {
        next();
        schedule(false);
      },
      pause: () => {
        paused = true;
        clearTimeout(timer);
      },
      play: () => {
        paused = false;
        schedule(false);
      },
      get index() {
        return index;
      },
      destroy: () => {
        clearTimeout(timer);
        offVisible();
        offResize();
        offReduce();
        stop(widthAnim);
        el.classList.remove("k-rot", "is-reserved");
        el.style.width = el.style.minWidth = el.style.textAlign = "";
        el.textContent = "";
        original.forEach((n) => el.appendChild(n));
      },
    };
  });
  /* ------------------------------------------------- hover and focus hosts */
  const HOST = "a, button, [role='button'], [role='link']";

  /**
   * on(true) while the element's host (its closest link or button, else the element) is hovered by a fine
   * pointer or holds keyboard focus, on(false) when neither (rules A2, A3). Returns a function that stops.
   */
  function hoverFocus(el, on) {
    const host = (el.parentElement && el.parentElement.closest(HOST)) || el;
    let hovered = false;
    let focused = false;
    let last = false;
    const update = () => {
      const now = hovered || focused;
      if (now !== last) {
        last = now;
        on(now);
      }
    };
    const enter = (e) => {
      if (e.pointerType === "touch" || !env.hover) return;
      hovered = true;
      update();
    };
    const leave = (e) => {
      if (e.pointerType === "touch") return;
      hovered = false;
      update();
    };
    const fin = (e) => {
      let v = true;
      try {
        v = e.target.matches(":focus-visible");
      } catch (err) {
        /* old browsers: count every focus */
      }
      focused = v;
      update();
    };
    const fout = (e) => {
      if (e.relatedTarget && host.contains(e.relatedTarget)) return;
      focused = false;
      update();
    };
    host.addEventListener("pointerenter", enter);
    host.addEventListener("pointerleave", leave);
    host.addEventListener("focusin", fin);
    host.addEventListener("focusout", fout);
    return () => {
      host.removeEventListener("pointerenter", enter);
      host.removeEventListener("pointerleave", leave);
      host.removeEventListener("focusin", fin);
      host.removeEventListener("focusout", fout);
    };
  }

  /* ========================================================= rolling-text */
  /*
   * Animate UI's Rolling Text: every letter has two faces; the front one tips away (rotateX to 90deg around a
   * point near its top) while the back one rolls in from below it 0.3s later, letter after letter. The faces
   * show the same letter, so after a roll they are put back without a visible change, ready for the next one.
   */
  const ROLL = { duration: 0.5, ease: S.tokens.ease.leave }; // Animate UI rolling DEFAULT_TRANSITION (0.5s easeOut)
  const ROLL_STEP = 0.1; // s between letters (Animate UI: DEFAULT_TRANSITION.delay per character)
  const ROLL_BACK = 0.3; // s between a letter's front leaving and its back arriving (Animate UI BACK_OFFSET)

  S.register("rolling-text", function (el, opts) {
    const text = el.textContent;
    const trigger = opts.trigger || "hover";
    // on hover the cascade is tighter (stagger.chars), so a label answers within the gesture
    const step = opts.stagger != null ? Number(opts.stagger) : trigger === "hover" ? S.tokens.stagger.chars : ROLL_STEP;
    el.textContent = "";
    el.classList.add("k-roll");
    const vis = span("k-roll__vis");
    vis.setAttribute("aria-hidden", "true");
    const faces = [];
    text.split(/(\s+)/).forEach((tok) => {
      if (!tok) return;
      if (/^\s+$/.test(tok)) return vis.appendChild(document.createTextNode(tok));
      const word = span("k-roll__w");
      graphemes(tok).forEach((c) => {
        const cell = span("k-roll__c");
        const f = span("k-roll__f", c);
        const b = span("k-roll__b", c);
        cell.appendChild(f);
        cell.appendChild(b);
        cell.appendChild(span("k-roll__g", c));
        word.appendChild(cell);
        faces.push([f, b]);
      });
      vis.appendChild(word);
    });
    el.appendChild(srText(text));
    el.appendChild(vis);

    let rolling = null;
    function roll() {
      if (rolling) return rolling; // a roll in progress plays through
      if (env.reduce || env.static || !M) return Promise.resolve();
      const anims = [];
      faces.forEach(([f, b], i) => {
        anims.push(S.animate(f, { transform: ["rotateX(0deg)", "rotateX(90deg)"] }, S.t(ROLL, { delay: i * step })));
        anims.push(S.animate(b, { transform: ["rotateX(90deg)", "rotateX(0deg)"] }, S.t(ROLL, { delay: i * step + ROLL_BACK })));
      });
      rolling = Promise.all(anims.map((a) => a.finished || a)).then(() => {
        faces.forEach(([f, b]) => {
          f.style.transform = "rotateX(0deg)";
          b.style.transform = "rotateX(90deg)";
        });
        rolling = null;
        emit(el, "rolling-done");
      });
      return rolling;
    }

    let off = () => {};
    if (trigger === "hover") off = hoverFocus(el, (on) => on && roll());
    else if (!env.static) off = whenTriggered(el, trigger, opts.delay, roll);

    return {
      roll: roll,
      destroy: () => {
        off();
        el.classList.remove("k-roll");
        el.textContent = text;
      },
    };
  });

  /* ========================================================= sliding-text */
  /*
   * Animate UI's Sliding Text: the label and a copy of it stacked in a clipped box; on hover or keyboard focus
   * of the link or button around it, the copy slides in from above as the label slides out below; leaving,
   * the label comes back up. One progress value per piece, so a quick in-and-out retargets mid-slide.
   * data-by="chars" or "words" slides the pieces one after another.
   */
  const SLIDE = { duration: 0.25, ease: S.tokens.ease.fill }; // Animate UI sliding DEFAULT_TRANSITION
  const SLIDE_GAP = 0.6; // em between the label and its copy (Animate UI GAP)
  const SLIDE_STEP = 0.02; // s between pieces: a whole label still slides within the hover (site value)

  S.register("sliding-text", function (el, opts) {
    const by = ["chars", "words", "block"].indexOf(opts.by) > -1 ? opts.by : "block";
    const up = opts.direction === "up";
    const sign = up ? -1 : 1;
    const text = el.textContent;
    el.textContent = "";
    el.classList.add("k-slide");
    if (up) el.classList.add("k-slide--up");
    const tracks = [];

    function track(content) {
      const tr = span("k-slide__t", content);
      const copy = span("k-slide__copy", content);
      copy.setAttribute("aria-hidden", "true");
      tr.appendChild(copy);
      const t = { el: tr, p: M && M.motionValue ? M.motionValue(0) : null, anim: null };
      if (t.p) t.p.on("change", (v) => render(t, v));
      tracks.push(t);
      return tr;
    }

    function render(t, v) {
      // one lap per slide: at a whole number the label is back home (Animate UI's lap)
      const lap = sign * (v - Math.floor(v));
      t.el.style.transform = lap === 0 ? "" : "translateY(calc(" + (lap * 100).toFixed(3) + "% + " + (lap * SLIDE_GAP).toFixed(4) + "em))";
    }

    if (by === "block") el.appendChild(track(text));
    else {
      const vis = span("k-slide__vis");
      vis.setAttribute("aria-hidden", "true");
      text.split(/(\s+)/).forEach((tok) => {
        if (!tok) return;
        if (/^\s+$/.test(tok)) return vis.appendChild(document.createTextNode(tok));
        if (by === "words") vis.appendChild(track(tok));
        else {
          const w = span("k-slide__w");
          graphemes(tok).forEach((c) => w.appendChild(track(c)));
          vis.appendChild(w);
        }
      });
      el.appendChild(srText(text));
      el.appendChild(vis);
    }

    function slideTo(target) {
      const step = opts.stagger != null ? Number(opts.stagger) : by === "words" ? S.tokens.stagger.stack : SLIDE_STEP;
      tracks.forEach((t, i) => {
        if (!t.p) return;
        stop(t.anim);
        if (env.reduce || env.static) return t.p.jump(target);
        t.anim = M.animate(t.p, target, S.t(SLIDE, { delay: i * step }));
      });
    }

    const off = hoverFocus(el, (on) => slideTo(on ? 1 : 0));
    return {
      slide: (on) => slideTo(on === false ? 0 : 1),
      destroy: () => {
        off();
        tracks.forEach((t) => stop(t.anim));
        el.classList.remove("k-slide", "k-slide--up");
        el.textContent = text;
      },
    };
  });

  /* ============================================================ swap-text */
  /*
   * A label swapping in place at the subtle level (rules B9, recipes/swap.md): the old label fades into
   * blur.icon while the new one comes out of it, on transition.swap, never scaling. The old one stops taking
   * space where it is (popLayout); the box's width glides from the old label's to the new one's on the same
   * tween, so the neighbours do not jump. With data-texts (every label it will show), the box is as wide as
   * the widest label from the start and never resizes (the recipe's "label taking turns in a control").
   */
  S.register("swap-text", function (el, opts) {
    const original = el.textContent;
    const texts = Array.isArray(opts.texts) ? opts.texts.map(String) : null;
    el.textContent = "";
    el.classList.add("k-swap");
    if (texts) {
      el.classList.add("is-reserved");
      texts.forEach((t) => {
        const g = span("k-swap__g", t);
        g.setAttribute("aria-hidden", "true");
        el.appendChild(g);
      });
    }
    let cur = el.appendChild(span("k-swap__l", original));
    let widthAnim = null;

    function set(text) {
      text = String(text);
      if (text === cur.textContent) return;
      const old = cur;
      const t = S.t("transition.swap");
      const blur = "blur(" + S.tokens.blur.icon + "px)";
      if (!texts) {
        if (!widthAnim) el.style.width = el.offsetWidth + "px";
        const left = old.offsetLeft;
        const top = old.offsetTop;
        old.style.left = left + "px";
        old.style.top = top + "px";
      }
      old.classList.add("is-leaving");
      old.setAttribute("aria-hidden", "true");
      cur = el.appendChild(span("k-swap__l", text));
      emit(el, "swap-change", { text: text });
      if (env.static || !M) {
        old.remove();
        el.style.width = "";
        return;
      }
      // no fixed first value on the leaving label: one caught mid-entrance leaves from where it is
      S.animate(old, { opacity: 0, filter: blur }, t).then(() => old.remove());
      S.animate(cur, { opacity: [0, 1], filter: [blur, "blur(0px)"] }, t);
      if (texts) return;
      stop(widthAnim);
      if (env.reduce) {
        el.style.width = "";
        widthAnim = null;
        return;
      }
      const a = M.animate(el, { width: cur.offsetWidth + "px" }, t);
      widthAnim = a;
      a.finished.then(() => {
        if (widthAnim !== a) return;
        widthAnim = null;
        el.style.width = "";
      });
    }

    return {
      set: set,
      get text() {
        return cur.textContent;
      },
      destroy: () => {
        stop(widthAnim);
        el.classList.remove("k-swap", "is-reserved");
        el.style.width = "";
        el.textContent = original;
      },
    };
  });

  /* ======================================================= highlight-text */
  /*
   * Animate UI's Highlight Text: a background sweeping in behind the text when it scrolls into view. The text
   * stays inline (Animate UI's is an inline-block), so on a wrapped phrase the sweep runs line after line,
   * in reading order (box-decoration-break: slice). Colour --accent-soft; hooks in the notes.
   */
  const HIGHLIGHT = { duration: 2, ease: [0.42, 0, 0.58, 1] }; // Animate UI highlight DEFAULT_TRANSITION (2s easeInOut)

  S.register("highlight-text", function (el, opts) {
    el.classList.add("k-hl");
    const css = S.css(HIGHLIGHT);
    const show = () => {
      el.style.transition = env.reduce || env.static ? "none" : "background-size " + css.duration + "ms " + css.easing;
      el.classList.add("is-in");
      emit(el, "highlight-in");
    };
    if (env.static || env.reduce) {
      show();
      return { play: show, destroy: () => el.classList.remove("k-hl") };
    }
    const stopWait = whenTriggered(el, opts.trigger || "view", opts.delay, show);
    return {
      play: show,
      reset: () => {
        el.style.transition = "none";
        el.classList.remove("is-in");
      },
      destroy: () => {
        stopWait();
        el.classList.remove("k-hl", "is-in");
        el.style.transition = "";
      },
    };
  });

  /* ========================================================= shimmer-text */
  /*
   * Animate UI's Shimmering Text: each letter's colour goes to the glint colour and back, one letter after the
   * other across `duration`, then the text rests (chars x 0.05s) and it starts again. Written as CSS
   * animations (one keyframes rule per rest ratio), paused off screen and in hidden tabs; under reduced motion
   * there is no loop. Colours: --k-shimmer-base (default --muted) and --k-shimmer-glint (default --ink).
   */
  const SHIMMER_REST = 0.05; // s of rest per letter between two passes (Animate UI repeatDelay = chars * 0.05)
  const SHIMMER_EASE = "cubic-bezier(0.42, 0, 0.58, 1)"; // Motion's easeInOut, as in the primitive
  let shimmerSheet = null;
  const shimmerNames = {};

  function shimmerKeyframes(p) {
    const name = "k-shimmer-" + p;
    if (shimmerNames[name]) return name;
    if (!shimmerSheet) shimmerSheet = document.head.appendChild(document.createElement("style"));
    const half = (p / 2).toFixed(2);
    shimmerSheet.appendChild(
      document.createTextNode("@keyframes " + name + "{0%," + p + "%,100%{color:var(--k-shimmer-base)}" + half + "%{color:var(--k-shimmer-glint)}}"),
    );
    shimmerNames[name] = true;
    return name;
  }

  S.register("shimmer-text", function (el, opts) {
    const text = el.textContent;
    const chars = graphemes(text);
    const d = (Number(opts.duration) || 1000) / 1000;
    el.textContent = "";
    el.classList.add("k-shim");
    const vis = span("k-shim__vis");
    vis.setAttribute("aria-hidden", "true");
    const cells = chars.map((c) => vis.appendChild(span("k-shim__c", c)));
    el.appendChild(srText(text));
    el.appendChild(vis);

    function start() {
      const n = cells.length || 1;
      const period = d + n * SHIMMER_REST;
      const name = shimmerKeyframes(Math.round((100 * d) / period));
      const on = !env.reduce && !env.static;
      cells.forEach((c, i) => {
        c.style.animation = on ? name + " " + (period * S.tempo).toFixed(3) + "s " + SHIMMER_EASE + " " + ((i * d * S.tempo) / n).toFixed(3) + "s infinite" : "";
      });
    }
    start();
    const offVisible = S.util.visible(el, (v) => el.classList.toggle("is-paused", !v));
    const offReduce = S.on("reduce", start);
    return {
      destroy: () => {
        offVisible();
        offReduce();
        el.classList.remove("k-shim", "is-paused");
        el.textContent = text;
      },
    };
  });

  /* ========================================================== typing-text */
  /*
   * Animate UI's Typing Text: the text typed one character at a time, held, erased, and the next string typed
   * (data-loop goes round). The caret is solid while typing and blinks while waiting. Paused off screen and in
   * hidden tabs. Reduced motion and ?static show the text whole (the first string when it loops, else the last).
   */
  const TYPE_SPEED = 100; // ms per character, typing and erasing (Animate UI typing `duration`)
  const TYPE_HOLD = 1000; // ms a typed string stays before it is erased (Animate UI `holdDelay`)

  S.register("typing-text", function (el, opts) {
    const original = el.textContent;
    const strings = Array.isArray(opts.strings) ? opts.strings.map(String) : [opts.text != null ? String(opts.text) : original.trim()];
    const segs = strings.map(graphemes);
    const loop = !!opts.loop;
    const speed = Number(opts.speed) || TYPE_SPEED;
    const hold = Number(opts.hold) || TYPE_HOLD;
    el.textContent = "";
    el.classList.add("k-type");
    const out = span("k-type__text");
    out.setAttribute("aria-hidden", "true");
    const caret = span("k-type__caret");
    caret.setAttribute("aria-hidden", "true");
    el.appendChild(srText(strings.join(", ")));
    el.appendChild(out);
    el.appendChild(caret);

    let st = { index: 0, count: 0, phase: "typing" };
    let started = false;
    let visible = false;
    let timer = null;

    const write = () => (out.textContent = (segs[st.index] || []).slice(0, st.count).join(""));
    const typing = (on) => el.classList.toggle("is-typing", on);

    function whole() {
      const i = loop ? 0 : segs.length - 1;
      st = { index: i, count: segs[i].length, phase: "done" };
      write();
      typing(false);
    }

    function step() {
      const len = segs[st.index].length;
      const last = st.index === segs.length - 1;
      if (st.phase === "typing") {
        if (st.count < len) {
          st.count++;
          write();
          return schedule(speed);
        }
        typing(false);
        if (last && !loop) {
          st.phase = "done";
          return emit(el, "typing-done");
        }
        st.phase = "holding";
        return schedule(hold);
      }
      if (st.phase === "holding") {
        typing(true);
        st.phase = "erasing";
        return schedule(speed);
      }
      if (st.phase === "erasing") {
        if (st.count > 0) {
          st.count--;
          write();
        } else {
          st.index = last ? 0 : st.index + 1;
          st.phase = "typing";
        }
        return schedule(speed);
      }
    }

    function schedule(ms) {
      clearTimeout(timer);
      timer = setTimeout(step, ms);
    }

    function run() {
      clearTimeout(timer);
      if (env.reduce || env.static) return whole();
      if (!started || !visible || st.phase === "done") return;
      if (st.phase === "typing" && st.count === 0) typing(true);
      schedule(st.phase === "holding" ? hold : speed);
    }

    function play() {
      st = { index: 0, count: 0, phase: "typing" };
      write();
      started = true;
      run();
    }

    if (env.reduce || env.static) whole();
    const offVisible = S.util.visible(el, (v) => {
      visible = v;
      el.classList.toggle("is-paused", !v);
      if (v) run();
      else clearTimeout(timer);
    });
    let stopWait = env.static ? () => {} : whenTriggered(el, opts.trigger || "view", opts.delay, () => !started && play());
    const offReduce = S.on("reduce", (r) => (r ? whole() : run()));

    return {
      play: play,
      reset: () => {
        clearTimeout(timer);
        started = false;
        st = { index: 0, count: 0, phase: "typing" };
        write();
        typing(false);
      },
      destroy: () => {
        clearTimeout(timer);
        stopWait();
        offVisible();
        offReduce();
        el.classList.remove("k-type", "is-typing", "is-paused");
        el.textContent = original;
      },
    };
  });

  /* ============================================================= scramble */
  /*
   * Site-specific ("decrypt"), for short mono labels: the characters cycle through a small glyph set and
   * resolve from left to right, all of them within SCRAMBLE_MAX. Spaces stay, the font is mono, so the width
   * never changes. Screen readers get the label once (the scrambled visual is aria-hidden while it runs); at the
   * end the plain text is put back. Reduced motion: a plain fade. Plain-text labels only.
   */
  const SCRAMBLE_GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&/<>+";
  const SCRAMBLE_MAX = 700; // ms: the last character has resolved by then (spec: "at most ~700 ms")
  const SCRAMBLE_TICK = 45; // ms between glyph changes: calmer than every frame, still clearly "decrypting"

  S.register("scramble", function (el, opts) {
    const text = el.textContent;
    const chars = graphemes(text);
    const trigger = opts.trigger || "view";
    const entrance = trigger === "view" || trigger === "load";
    el.classList.add("k-scr");
    let raf = 0;
    let running = false;

    function glyph() {
      return SCRAMBLE_GLYPHS.charAt(Math.floor(Math.random() * SCRAMBLE_GLYPHS.length));
    }

    function done() {
      cancelAnimationFrame(raf);
      running = false;
      el.textContent = text;
      emit(el, "scramble-done");
    }

    function play() {
      if (running) return;
      el.classList.add("is-in");
      if (env.static) return done();
      if (env.reduce) {
        if (entrance) S.animate(el, { opacity: [0, 1] }, S.t("transition.reveal"));
        return;
      }
      running = true;
      if (entrance) S.animate(el, { opacity: [0, 1] }, S.t("transition.fade"));
      const n = chars.length;
      const total = Math.min(SCRAMBLE_MAX, 200 + n * 30);
      // each character resolves in turn over the last 70% of the run, the first one after 30% of it
      const at = chars.map((c, i) => total * (0.3 + 0.7 * (n > 1 ? i / (n - 1) : 1)));
      const vis = span("k-scr__vis");
      vis.setAttribute("aria-hidden", "true");
      el.textContent = "";
      el.appendChild(srText(text));
      el.appendChild(vis);
      let t0 = 0;
      let tick = -Infinity;
      const paint = (t) => {
        tick = t;
        let s = "";
        for (let i = 0; i < n; i++) s += /\s/.test(chars[i]) || t >= at[i] ? chars[i] : glyph();
        vis.textContent = s;
      };
      const frame = (now) => {
        if (!t0) t0 = now;
        const t = now - t0;
        if (t >= total) return done();
        if (t - tick >= SCRAMBLE_TICK) paint(t);
        raf = requestAnimationFrame(frame);
      };
      paint(0); // the label is never empty, not even for a frame
      raf = requestAnimationFrame(frame);
    }

    let off = () => {};
    if (trigger === "hover") off = hoverFocus(el, (on) => on && play());
    else if (env.static) el.classList.add("is-in");
    else off = whenTriggered(el, trigger, opts.delay, play);

    return {
      play: play,
      destroy: () => {
        off();
        cancelAnimationFrame(raf);
        el.classList.remove("k-scr", "is-in");
        el.textContent = text;
      },
    };
  });
})();
