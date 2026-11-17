/*
 * kit-pointer: components that answer the pointer and the keyboard, and the surfaces they move.
 *
 *   highlight      one surface gliding between the items of a group (hover, selection, or both)
 *   tabs           tabs with the gliding selection, panels changing by order
 *   disclosure     a panel unfolding under its trigger
 *   tooltip        one popup gliding between the triggers of a group (tooltip-group), or a single trigger
 *   press          press feedback
 *   copy           copy to clipboard, the icon swapping for a check
 *   ripple         a ripple from the click point
 *   lightbox       an image opening into a larger view and closing back to its place
 *   Site.toast()   a small message rising from the bottom edge
 *   Site.flip()    continuity when a list is filtered or reordered
 *
 * The motion is Animate UI's (_work/refs/animate-ui): every spring, curve, scale, blur and distance comes
 * from the tokens in core.js through Site.t() / Site.css(). The few values below belong to one Animate UI
 * primitive rather than to a token; each says where it comes from.
 * Markup, options and limits of every component: _work/agent_notes/kit-pointer.md.
 */
(function () {
  "use strict";

  const Site = window.Site;
  if (!Site) return;
  const M = window.Motion;
  const env = Site.env;
  const doc = document;
  const tokens = Site.tokens;

  /* ------------------------------------------------- values of single primitives */
  // internal/momentum.ts: how far past its range a speed carried over may take a curve
  const SLACK = 0.002;

  /* ------------------------------------------------------------------- helpers */
  const px = (v) => parseFloat(v) || 0;
  const NONE = (v) => !v || v === "none";
  const canAnimate = (el) => typeof el.animate === "function";
  const running = (a) => !!a && a.playState !== "finished" && a.playState !== "idle";
  const timeOf = (a) => (a && Number(a.currentTime)) || 0;
  const emit = (el, name, detail) => el.dispatchEvent(new CustomEvent(name, { bubbles: true, detail: detail || {} }));
  const frame = (fn) => requestAnimationFrame(fn);
  const blur = (name) => "blur(" + tokens.blur[name] + "px)";

  /** The CSS timing of a token ({ duration in ms, easing }), cached: a spring's linear() curve is costly to build. */
  const timings = new Map();
  function css(path) {
    const key = path + "|" + Site.tempo;
    let t = timings.get(key);
    if (!t) timings.set(key, (t = Site.css(path)));
    return t;
  }

  /** The time a mid-flight handover starts at: the frame the running animation was read on. */
  function handoverTime(animation) {
    return Math.max(Number(doc.timeline.currentTime), Number(animation.startTime)) || performance.now();
  }

  /* ------------------------------------------------------------------ momentum
   * Port of Animate UI's internal/momentum.ts. A spring played as a Web Animation is a fixed linear() curve, so
   * it cannot be retargeted like a JavaScript spring. Instead the next curve is generated with the speed the
   * previous one had at the moment it was interrupted: picked up on the way, a surface goes on from where it
   * is at the speed it had.
   */
  function shapeOf(transition, speed) {
    if (!M || !M.createGeneratorEasing || !transition || transition.type !== "spring") return null;
    // the generator runs from 0 to 100 and takes its velocity in units per second; speed is a share per millisecond
    const g = M.createGeneratorEasing(Object.assign({}, transition, { velocity: speed * 100000 }), 100, M.spring);
    const duration = Math.round(g.duration * 1000);
    let peak = 1;
    let trough = 0;
    for (let time = 0; time <= duration; time += 5) {
      const p = g.ease(time / duration);
      if (p > peak) peak = p;
      if (p < trough) trough = p;
    }
    return { ease: g.ease, duration: duration, peak: peak, trough: trough };
  }

  const INSTANT = { duration: 0, easing: "linear", at: () => 1, speed: () => 0, initial: 0 };
  const restCurves = new Map();

  /** The curve a token plays: { duration, easing, at(ms) -> share done, speed(ms) -> share per ms }. */
  function curveOf(token, initial) {
    const key = token + "|" + Site.tempo;
    if (!initial && restCurves.has(key)) return restCurves.get(key);
    const transition = Site.t(token);
    const shape = shapeOf(transition, initial || 0);
    let curve;
    if (!shape) {
      const t = css(token);
      const bezier = M && M.cubicBezier && Array.isArray(transition.ease) ? M.cubicBezier.apply(null, transition.ease) : (p) => p;
      curve = {
        duration: t.duration,
        easing: t.easing,
        at: (time) => (time >= t.duration ? 1 : bezier(Math.max(0, time) / t.duration)),
        speed: () => 0,
        initial: 0,
      };
    } else if (shape.duration === 0) curve = INSTANT;
    else {
      const ease = shape.ease;
      const duration = shape.duration;
      const step = 0.5;
      curve = {
        duration: duration,
        easing: M.generateLinearEasing(ease, duration),
        at: (time) => (time >= duration ? 1 : ease(Math.max(0, time) / duration)),
        speed: (time) => {
          if (!(time >= 0) || time >= duration) return 0;
          if (time === 0) return initial || 0;
          if (ease(time / duration) === 1) return 0;
          const before = Math.max(0, time - step);
          let after = Math.min(duration, time + step);
          if (ease(after / duration) === 1) after = time;
          return after > before ? (ease(after / duration) - ease(before / duration)) / (after - before) : initial || 0;
        },
        initial: initial || 0,
      };
    }
    if (!initial) restCurves.set(key, curve);
    return curve;
  }

  /** The speed to start with, along the way from `offset` (where it is, relative to where it goes) at `velocity` (px/ms). */
  function startSpeed(token, offset, velocity) {
    let length = 0;
    let along = 0;
    offset.forEach((value, i) => {
      length += value * value;
      along += value * (velocity[i] || 0);
    });
    const speed = length < 0.25 ? 0 : -along / length;
    if (speed <= 0) return 0;
    const transition = Site.t(token);
    const rest = shapeOf(transition, 0);
    if (!rest) return 0;
    // as much of the speed as never takes the curve past where it would go from rest
    const within = (share) => {
      const shape = shapeOf(transition, speed * share);
      return shape.trough >= -SLACK && shape.peak <= Math.max(rest.peak, 1) + SLACK;
    };
    if (within(1)) return speed;
    let low = 0;
    let high = 1;
    for (let i = 0; i < 8; i++) {
      const share = (low + high) / 2;
      if (within(share)) low = share;
      else high = share;
    }
    return speed * low;
  }

  const curveFrom = (token, offset, velocity) => curveOf(token, startSpeed(token, offset, velocity));

  /* ------------------------------------------------------------------ geometry */
  function lengthOf(value, size) {
    if (value.endsWith("%")) return (parseFloat(value) / 100) * size;
    if (value.endsWith("px") || /^-?[\d.]+$/.test(value)) return parseFloat(value);
    return null;
  }

  /**
   * The element's box as laid out, in viewport coordinates: without its own translate and scale (a press scale,
   * a magnetic pull, a glide in flight). Port of sliding-indicator.tsx's untransform.
   */
  function layoutRect(el) {
    const r = el.getBoundingClientRect();
    const box = { x: r.left, y: r.top, w: r.width, h: r.height };
    const st = getComputedStyle(el);
    if (NONE(st.translate) && NONE(st.scale) && NONE(st.transform)) return box;
    if (!NONE(st.rotate)) return box;
    let a = 1;
    let d = 1;
    let e = 0;
    let f = 0;
    if (!NONE(st.transform)) {
      const m = st.transform.match(/^matrix\(([^)]+)\)$/);
      if (!m) return box;
      const p = m[1].split(",").map(Number);
      if (Math.abs(p[1]) > 1e-6 || Math.abs(p[2]) > 1e-6) return box;
      a = p[0];
      d = p[3];
      e = p[4];
      f = p[5];
    }
    const sc = NONE(st.scale) ? [] : st.scale.split(/\s+/).map(Number);
    const sx = sc[0] == null ? 1 : sc[0];
    const sy = sc[1] == null ? sx : sc[1];
    const kx = sx * a;
    const ky = sy * d;
    if (!kx || !ky || !isFinite(kx) || !isFinite(ky)) return box;
    const w = box.w / kx;
    const h = box.h / ky;
    const tr = NONE(st.translate) ? [] : st.translate.split(/\s+(?![^(]*\))/);
    const tx = lengthOf(tr[0] || "0px", w);
    const ty = lengthOf(tr[1] || "0px", h);
    const origin = st.transformOrigin.split(/\s+/);
    const ox = lengthOf(origin[0] || "0px", w);
    const oy = lengthOf(origin[1] || "0px", h);
    if (tx === null || ty === null || ox === null || oy === null) return box;
    return { x: box.x - ox - tx - sx * (e - a * ox), y: box.y - oy - ty - sy * (f - d * oy), w: w, h: h };
  }

  /** The element's unrounded layout size (offsetWidth rounds; a hidden element reports its specified width, not pixels). */
  function layoutSize(el) {
    const st = getComputedStyle(el);
    let w = st.width.endsWith("px") ? parseFloat(st.width) : NaN;
    let h = st.height.endsWith("px") ? parseFloat(st.height) : NaN;
    if (!isFinite(w) || !isFinite(h)) return { w: el.offsetWidth, h: el.offsetHeight };
    if (st.boxSizing !== "border-box") {
      w += px(st.paddingLeft) + px(st.paddingRight) + px(st.borderLeftWidth) + px(st.borderRightWidth);
      h += px(st.paddingTop) + px(st.paddingBottom) + px(st.borderTopWidth) + px(st.borderBottomWidth);
    }
    return { w: w, h: h };
  }

  const sameBox = (a, b) =>
    Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01 && Math.abs(a.w - b.w) < 0.01 && Math.abs(a.h - b.h) < 0.01;

  /* -------------------------------------------------------------------- Glider
   * One absolutely placed surface sliding between boxes. Port of Animate UI's internal/sliding-indicator.tsx:
   * the surface is placed at its target at once (left / top / width / height) and a Web Animation of `translate`
   * brings it there from where it was, on the compositor; `width` / `height` animate only when the sizes differ
   * (a scale would distort the radius, rule A8). Picked up on the way, it goes on at the speed it had.
   */
  class Glider {
    constructor(el, token) {
      this.el = el;
      this.token = token;
      this.box = null; // where it rests: { x, y, w, h }
      this.slide = null; // { animations, offset, curve, to }
      this.onSettle = null;
    }

    get moving() {
      return !!this.slide && running(this.slide.animations[0]);
    }

    /** Where the surface is drawn right now. */
    now() {
      const s = this.slide;
      if (!s || !running(s.animations[0])) return this.box;
      const left = 1 - s.curve.at(timeOf(s.animations[0]));
      const o = s.offset;
      return { x: s.to.x + o[0] * left, y: s.to.y + o[1] * left, w: s.to.w + o[2] * left, h: s.to.h + o[3] * left };
    }

    place(box) {
      const st = this.el.style;
      st.left = box.x + "px";
      st.top = box.y + "px";
      st.width = box.w + "px";
      st.height = box.h + "px";
      this.box = box;
    }

    stop() {
      const s = this.slide;
      this.slide = null;
      if (s) s.animations.forEach((a) => a.cancel());
    }

    jump(box) {
      this.stop();
      this.place(box);
    }

    /** Slide to a box from wherever the surface is now. */
    to(box) {
      const s = this.slide;
      const moving = this.moving;
      const from = this.now();
      if (!from || env.reduce || !canAnimate(this.el)) return this.jump(box);
      const first = moving ? s.animations[0] : null;
      const speed = moving ? s.curve.speed(timeOf(first)) : 0;
      const velocity = moving ? s.offset.map((o) => -o * speed) : [0, 0, 0, 0];
      const startTime = moving ? handoverTime(first) : performance.now();
      this.stop();
      this.place(box);
      const offset = [from.x - box.x, from.y - box.y, from.w - box.w, from.h - box.h];
      if (offset.every((v) => Math.abs(v) < 0.5)) return;
      const curve = curveFrom(this.token, offset, velocity);
      if (curve.duration <= 0) return;
      const timing = { duration: curve.duration, easing: curve.easing, fill: "backwards" };
      const animations = [this.el.animate([{ translate: offset[0] + "px " + offset[1] + "px" }, { translate: "0px 0px" }], timing)];
      if (Math.abs(offset[2]) >= 0.5 || Math.abs(offset[3]) >= 0.5)
        animations.push(
          this.el.animate(
            [
              { width: from.w + "px", height: from.h + "px" },
              { width: box.w + "px", height: box.h + "px" },
            ],
            timing,
          ),
        );
      animations.forEach((a) => (a.startTime = startTime));
      const started = { animations: animations, offset: offset, curve: curve, to: box };
      this.slide = started;
      animations[0].finished.then(
        () => {
          if (this.slide !== started) return;
          this.slide = null;
          if (this.onSettle) this.onSettle();
        },
        () => {},
      );
    }

    /** The target resized or moved while nothing else changed: follow at once, or bend a slide in flight toward it. */
    follow(box) {
      if (this.moving) {
        if (!sameBox(this.slide.to, box)) this.to(box);
      } else if (!this.box || !sameBox(this.box, box)) this.jump(box);
    }
  }

  /**
   * One numeric CSS property of one element on a spring that keeps its speed when retargeted (the press scale,
   * a popup's scale and opacity). The value rests at `rest` with no animation left on the element; any other value
   * is held by the animation that brought it there. Movement is dropped under reduced motion; a fade (`always`) stays.
   */
  class Spring1 {
    constructor(el, prop, token, rest, always) {
      this.el = el;
      this.prop = prop;
      this.token = token;
      this.rest = rest;
      this.value = rest;
      this.always = !!always; // a fade: it also plays under reduced motion
      this.run = null; // { animation, offset, curve, to }
    }

    current() {
      const r = this.run;
      if (!r || !running(r.animation)) return this.value;
      return r.to + r.offset * (1 - r.curve.at(timeOf(r.animation)));
    }

    to(value) {
      const r = this.run;
      const moving = !!r && running(r.animation);
      const from = this.current();
      const velocity = moving ? -r.offset * r.curve.speed(timeOf(r.animation)) : 0;
      const startTime = moving ? handoverTime(r.animation) : performance.now();
      this.value = value;
      const offset = from - value;
      if (Math.abs(offset) < 0.0005) {
        // already there: whatever holds it stays, except a run that has not moved yet toward another value
        // (pressed and released in one frame): back at rest, it ends here
        if (r && r.to !== value && value === this.rest) {
          r.animation.cancel();
          this.run = null;
        }
        return;
      }
      this.run = null;
      if (env.static || (env.reduce && !this.always) || !canAnimate(this.el)) {
        if (r) r.animation.cancel();
        return;
      }
      // a scale is far below one unit: measure the carried speed against the distance, not in pixels
      const unit = 1 / Math.abs(offset);
      const curve = curveFrom(this.token, [offset * unit], [velocity * unit]);
      const frames = [{}, {}];
      frames[0][this.prop] = String(from);
      frames[1][this.prop] = String(value);
      const animation = this.el.animate(frames, { duration: curve.duration, easing: curve.easing, fill: "both" });
      animation.startTime = startTime;
      if (r) r.animation.cancel();
      const run = { animation: animation, offset: offset, curve: curve, to: value };
      this.run = run;
      animation.finished.then(
        () => {
          // back at rest: leave nothing on the element
          if (this.run === run && value === this.rest) {
            animation.cancel();
            this.run = null;
          }
        },
        () => {},
      );
    }

    stop() {
      if (this.run) this.run.animation.cancel();
      this.run = null;
      this.value = this.rest;
    }
  }

  /* ----------------------------------------------------------------- highlight
   * Port of Animate UI's item highlight (internal/item-highlight.tsx) and indicator (internal/sliding-indicator.tsx,
   * internal/controls/highlight.tsx, recipes/indicator.md), for plain markup:
   *  - hover: one surface follows the hovered or keyboard-focused item on spring.highlight; it fades in from
   *    nothing (transition.color) on the first item, is handed from item to item without a second copy, goes back
   *    to full on transition.fade when taken over while it was fading out, and fades out where it is;
   *  - selection: one surface sits on the selected item and slides on spring.selection when the selection changes;
   *  - both: the hover surface paints above the selection and is not lit over the selected item, except while
   *    the selection is still on its way there (so a click never shows a dip).
   */
  const SELECTED = '[aria-selected="true"], [aria-current]:not([aria-current="false"]), [aria-pressed="true"], [aria-checked="true"], .is-active';
  const DISABLED = ':disabled, [aria-disabled="true"]';
  const WATCHED = ["aria-selected", "aria-current", "aria-pressed", "aria-checked", "aria-disabled", "class", "hidden", "disabled"];
  const SELECTION_ATTRIBUTES = WATCHED.slice(0, 4);

  function focusVisible(node) {
    try {
      return node.matches(":focus-visible");
    } catch (e) {
      return true;
    }
  }

  function createHighlight(el, options) {
    const mode = options.mode === "selection" || options.mode === "both" ? options.mode : "hover";
    const selector = typeof options.items === "string" && options.items ? options.items : "[data-highlight-item]";
    const tag = /^(UL|OL)$/.test(el.tagName) ? "li" : "span";
    const inlinePosition = el.style.position;
    if (getComputedStyle(el).position === "static") el.style.position = "relative";
    el.classList.add("k-highlight");

    const ownItem = (node) => {
      const item = node && node.closest ? node.closest(selector) : null;
      return item && item !== el && el.contains(item) && item.closest(".k-highlight") === el ? item : null;
    };
    const items = () => Array.prototype.filter.call(el.querySelectorAll(selector), (item) => item.closest(".k-highlight") === el);
    const usable = (item) => !!item && item.isConnected && !item.matches(DISABLED) && item.getClientRects().length > 0;

    function makeSurface(kind, token) {
      const node = doc.createElement(tag);
      node.className = "k-highlight__surface k-highlight__surface--" + kind;
      node.setAttribute("aria-hidden", "true");
      if (tag === "li") node.setAttribute("role", "presentation");
      el.appendChild(node);
      return { node: node, glider: new Glider(node, token), scale: new Spring1(node, "scale", "spring.press", 1), item: null, pressed: null };
    }
    // the selection first: the hover surface paints above it
    const sel = mode !== "hover" ? makeSurface("selection", "spring.selection") : null;
    const hov = mode !== "selection" ? makeSurface("hover", "spring.highlight") : null;
    const isSurface = (node) => (sel && node === sel.node) || (hov && node === hov.node) || (node.classList && node.classList.contains("k-highlight__surface"));

    /** The box of an item in the container's own coordinates, for one surface (its margins are its inset). */
    function boxOf(item, node) {
      const c = el.getBoundingClientRect();
      const size = layoutSize(el);
      // an ancestor's scale (a card growing in) changes what is measured, not where things are laid out
      const sx = size.w && Math.abs(c.width - size.w) > 0.01 ? c.width / size.w : 1;
      const sy = size.h && Math.abs(c.height - size.h) > 0.01 ? c.height / size.h : 1;
      const r = layoutRect(item);
      const st = getComputedStyle(node);
      return {
        x: (r.x - c.left) / sx - el.clientLeft + el.scrollLeft,
        y: (r.y - c.top) / sy - el.clientTop + el.scrollTop,
        w: Math.max(0, r.w / sx - px(st.marginLeft) - px(st.marginRight)),
        h: Math.max(0, r.h / sy - px(st.marginTop) - px(st.marginBottom)),
      };
    }

    /** The surface takes the corners of the item it lies under, unless --k-highlight-radius says otherwise. */
    function shapeLike(surface, item) {
      const radius = getComputedStyle(item).borderRadius;
      if (radius && /[1-9]/.test(radius)) surface.node.style.setProperty("--k-item-radius", radius);
      else surface.node.style.removeProperty("--k-item-radius");
    }

    const shown = (node) => Number(getComputedStyle(node).opacity) > 0.01;

    /* hover: the pointer, the keyboard focus and moveTo() each name an item; the most recent one is lit */
    let sources = [];
    function setSource(src, item) {
      sources = sources.filter((s) => s.src !== src);
      if (item) sources.push({ src: src, item: item });
      syncHover();
    }
    function wanted() {
      for (let i = sources.length - 1; i >= 0; i--) if (usable(sources[i].item)) return sources[i].item;
      return null;
    }
    function syncHover() {
      if (!hov) return;
      let item = wanted();
      if (item && sel && sel.item === item && !sel.glider.moving) item = null;
      const node = hov.node;
      if (item) {
        if (hov.item === item) return;
        const showing = shown(node);
        shapeLike(hov, item);
        const box = boxOf(item, node);
        if (showing) hov.glider.to(box);
        else hov.glider.jump(box);
        hov.item = item;
        node.classList.toggle("is-resuming", showing);
        node.classList.add("is-lit");
      } else if (hov.item) {
        hov.item = null;
        node.classList.remove("is-lit", "is-resuming");
      }
    }

    /* selection */
    let forced; // moveTo() in selection mode: an item named by the page until the attributes say something new
    function findSelected() {
      if (forced !== undefined) return usable(forced) ? forced : null;
      const all = items();
      for (let i = 0; i < all.length; i++) if (all[i].matches(SELECTED) && usable(all[i])) return all[i];
      return null;
    }
    /** Reduced motion: the selection crossfades between items instead of sliding (a copy fades out where it was). */
    function crossfade(surface, box) {
      const node = surface.node;
      const fade = css("transition.fade");
      if (canAnimate(node) && fade.duration > 0) {
        const copy = node.cloneNode(false);
        copy.classList.add("is-leaving");
        node.before(copy);
        copy.animate([{ opacity: 1 }, { opacity: 0 }], { duration: fade.duration, easing: fade.easing, fill: "both" }).finished.then(
          () => copy.remove(),
          () => copy.remove(),
        );
        node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: fade.duration, easing: fade.easing, fill: "backwards" });
      }
      surface.glider.jump(box);
    }
    function syncSelection(first) {
      if (!sel) return;
      const node = sel.node;
      const next = findSelected();
      if (!next) {
        if (sel.item) {
          sel.item = null;
          node.classList.remove("is-lit");
        }
        return;
      }
      shapeLike(sel, next);
      const box = boxOf(next, node);
      if (sel.item === next) return sel.glider.follow(box);
      const showing = shown(node);
      if (first) {
        // nothing moves on page load: the surface is simply there
        node.classList.add("is-still");
        sel.glider.jump(box);
        frame(() => frame(() => node.classList.remove("is-still")));
      } else if (!showing || !sel.glider.box || env.static) sel.glider.jump(box);
      else if (env.reduce) crossfade(sel, box);
      else sel.glider.to(box);
      sel.item = next;
      node.classList.add("is-lit");
    }
    if (sel) sel.glider.onSettle = syncHover;

    /** Items, selection or content changed. */
    function update() {
      syncSelection(false);
      if (hov && hov.item) {
        if (usable(hov.item)) hov.glider.follow(boxOf(hov.item, hov.node));
        else hov.item = null;
      }
      syncHover();
      if (hov && !hov.item) hov.node.classList.remove("is-lit", "is-resuming");
    }
    /** Sizes changed: follow at once. */
    function refit() {
      if (sel) {
        if (sel.item && usable(sel.item)) sel.glider.follow(boxOf(sel.item, sel.node));
        else syncSelection(!sel.item); // a group shown after it was set up hidden: the surface is simply there
      }
      if (hov && hov.item && usable(hov.item)) hov.glider.follow(boxOf(hov.item, hov.node));
    }

    const onOver = (e) => {
      if (e.pointerType === "touch" || !env.hover) return;
      setSource("pointer", ownItem(e.target));
    };
    const onLeave = () => setSource("pointer", null);
    const onFocusIn = (e) => {
      const item = ownItem(e.target);
      setSource("focus", item && focusVisible(e.target) ? item : null);
    };
    const onFocusOut = () => setSource("focus", null);
    /* a pressed item scales (the press kit): the surfaces under it follow, so they stay one object */
    const onPress = (e) => {
      const item = e.target;
      [sel, hov].forEach((s) => {
        if (!s) return;
        if (e.detail.down && s.item === item) {
          s.pressed = item;
          s.scale.to(e.detail.scale);
        } else if (!e.detail.down && s.pressed === item) {
          s.pressed = null;
          s.scale.to(1);
        }
      });
    };
    /* rows about to be moved by Site.flip(): the pointer no longer names the row under it */
    const onFlip = () => setSource("pointer", null);

    el.addEventListener("pointerover", onOver);
    el.addEventListener("pointerleave", onLeave);
    el.addEventListener("focusin", onFocusIn);
    el.addEventListener("focusout", onFocusOut);
    el.addEventListener("kit:press", onPress);
    el.addEventListener("kit:flip", onFlip);

    const resize = new ResizeObserver(refit);
    const observeItems = () => {
      resize.disconnect();
      resize.observe(el);
      items().forEach((item) => resize.observe(item));
    };
    const mutations = new MutationObserver((records) => {
      if (records.every((r) => isSurface(r.target))) return;
      if (records.some((r) => r.type === "attributes" && SELECTION_ATTRIBUTES.indexOf(r.attributeName) > -1)) forced = undefined;
      if (records.some((r) => r.type === "childList" && !isSurface(r.target))) observeItems();
      update();
    });
    mutations.observe(el, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: WATCHED });
    observeItems();
    const offResize = Site.on("resize", refit);
    syncSelection(true);

    return {
      /** Measure again and put the surfaces where they belong (after a layout change the kit cannot see). */
      refresh: update,
      /** Selection modes: slide the selection to an item (until the attributes change). Hover mode: light an item, or null. */
      moveTo(item) {
        if (sel) {
          forced = item || null;
          syncSelection(false);
          syncHover();
        } else setSource("api", item || null);
      },
      destroy() {
        mutations.disconnect();
        resize.disconnect();
        offResize();
        el.removeEventListener("pointerover", onOver);
        el.removeEventListener("pointerleave", onLeave);
        el.removeEventListener("focusin", onFocusIn);
        el.removeEventListener("focusout", onFocusOut);
        el.removeEventListener("kit:press", onPress);
        el.removeEventListener("kit:flip", onFlip);
        [sel, hov].forEach((s) => {
          if (!s) return;
          s.glider.stop();
          s.scale.stop();
          s.node.remove();
        });
        el.classList.remove("k-highlight");
        el.style.position = inlinePosition;
      },
    };
  }

  Site.register("highlight", (el, opts) => createHighlight(el, { mode: opts.mode, items: opts.items }));

  /* --------------------------------------------------------------------- press
   * Animate UI's press (primitives/buttons/button, recipes/press.md, recipes/card.md): the element scales to
   * scale.press (a whole card or row: scale.choice) on spring.press while the pointer or Space / Enter is down.
   * Never on hover. It uses the `scale` property, so it composes with other kits' transforms (magnetic, tilt).
   */
  const INTERACTIVE = 'a[href], button, input, select, textarea, summary, label, [role="button"], [data-kit~="press"]';

  Site.register("press", function (el, opts) {
    const pressed = opts.press === "choice" ? tokens.scale.choice : tokens.scale.press;
    const spring = new Spring1(el, "scale", "spring.press", 1);
    let down = false;

    function set(next) {
      if (next === down) return;
      if (next && (el.disabled || el.getAttribute("aria-disabled") === "true")) return;
      down = next;
      spring.to(next ? pressed : 1);
      emit(el, "kit:press", { down: next, scale: pressed });
    }
    /* only the innermost control answers: a button inside a pressable row does not press the row */
    const owns = (target) => {
      const inner = target && target.closest ? target.closest(INTERACTIVE) : null;
      return !inner || inner === el || !el.contains(inner);
    };
    const onDown = (e) => {
      if (e.button === 0 && e.isPrimary !== false && owns(e.target)) set(true);
    };
    const onUp = () => set(false);
    const onKeyDown = (e) => {
      if ((e.key === " " || e.key === "Enter") && !e.repeat && e.target === el) set(true);
    };
    const onKeyUp = (e) => {
      if (e.key === " " || e.key === "Enter") set(false);
    };
    const events = [
      ["pointerdown", onDown],
      ["pointerup", onUp],
      ["pointercancel", onUp],
      ["pointerleave", onUp],
      ["keydown", onKeyDown],
      ["keyup", onKeyUp],
      ["blur", onUp],
    ];
    events.forEach((pair) => el.addEventListener(pair[0], pair[1]));

    return {
      destroy() {
        events.forEach((pair) => el.removeEventListener(pair[0], pair[1]));
        spring.stop();
      },
    };
  });

  /* ---------------------------------------------------------------------- tabs
   * Port of Animate UI's tabs motion (internal/tabs.tsx, recipes/indicator.md). The selection glides (a highlight
   * on the tab list) and the panels go one after the other: the one leaving fades out into blur.panel while it
   * shifts shift.tabs toward the start when a later tab was picked (transition.panelOut), kept in the page and
   * inert; the next one waits hidden until it has gone, then comes in from the other side out of the blur
   * (transition.panelIn) while its height glides from the previous panel's (transition.panelHeight).
   * Changed again on the way: a panel passed over never shows, one leaving fades out from where it is, one
   * picked again comes back from there.
   */
  function shownNow(node) {
    const st = getComputedStyle(node);
    return { opacity: st.opacity, filter: NONE(st.filter) ? "blur(0px)" : st.filter, translate: NONE(st.translate) ? "0px 0px" : st.translate };
  }
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

  Site.register("tabs", function (el, opts) {
    const list = el.querySelector('[role="tablist"]');
    if (!list) return null;
    const own = (node) => node.closest('[data-kit~="tabs"]') === el;
    const tabs = Array.prototype.filter.call(list.querySelectorAll('[role="tab"]'), own);
    if (!tabs.length) return null;
    const loose = Array.prototype.filter.call(el.querySelectorAll('[role="tabpanel"]'), own);
    const panels = tabs.map((tab, i) => {
      const id = tab.getAttribute("aria-controls");
      return (id && doc.getElementById(id)) || loose[i] || null;
    });
    const vertical = list.getAttribute("aria-orientation") === "vertical";
    const usable = (tab) => !tab.disabled && tab.getAttribute("aria-disabled") !== "true";
    const period = Number(opts.autoplay) > 0 && tabs.length > 1 ? Number(opts.autoplay) : 0;

    /* roles are the page's; the wiring between tabs and panels is completed here */
    tabs.forEach((tab, i) => {
      const panel = panels[i];
      if (!tab.id) tab.id = Site.util.uid("k-tab");
      if (tab.tagName === "BUTTON" && !tab.hasAttribute("type")) tab.type = "button";
      if (!panel) return;
      if (!panel.id) panel.id = Site.util.uid("k-tabpanel");
      tab.setAttribute("aria-controls", panel.id);
      if (!panel.hasAttribute("aria-labelledby")) panel.setAttribute("aria-labelledby", tab.id);
      // a panel with nothing to focus inside is itself a stop for the keyboard
      if (!panel.hasAttribute("tabindex") && !panel.querySelector(FOCUSABLE)) panel.tabIndex = 0;
    });

    let index = Math.max(
      0,
      tabs.findIndex((tab) => tab.getAttribute("aria-selected") === "true"),
    );
    function mark() {
      tabs.forEach((tab, i) => {
        tab.setAttribute("aria-selected", i === index ? "true" : "false");
        tab.tabIndex = i === index ? 0 : -1;
        if (i !== index) tab.style.removeProperty("--progress");
      });
    }
    mark();
    panels.forEach((panel, i) => {
      if (panel) panel.hidden = i !== index;
    });
    el.classList.add("is-on");

    /* the gliding selection, unless the page put its own highlight on the list */
    const mode = opts.highlight === undefined || opts.highlight === true ? "selection" : opts.highlight;
    const ownsHighlight = mode && mode !== "none" && !/(^|\s)highlight(\s|$)/.test(list.getAttribute("data-kit") || "");
    const highlight = ownsHighlight ? createHighlight(list, { mode: mode === "both" ? "both" : "selection", items: '[role="tab"]' }) : null;

    /* panels */
    const stage = { current: panels[index], last: panels[index], leaving: null, height: undefined };
    const fades = new WeakMap();
    const glides = new WeakMap();

    function wayOf(from, to) {
      if (!from || !to || from === to || !from.isConnected || !to.isConnected) return null;
      const later = from.compareDocumentPosition(to) & Node.DOCUMENT_POSITION_FOLLOWING ? 1 : -1;
      if (vertical) return [0, later];
      return [getComputedStyle(list).direction === "rtl" ? -later : later, 0];
    }
    function gone(way) {
      const hidden = { opacity: "0", filter: blur("panel") };
      if (way && !env.reduce) hidden.translate = way[0] * tokens.shift.tabs + "px " + way[1] * tokens.shift.tabs + "px";
      return hidden;
    }
    /** Start a fade; its keyframes were read before the one it replaces is cancelled, so it goes on from there. */
    function fade(panel, frames, options) {
      const previous = fades.get(panel);
      const animation = panel.animate(frames, options);
      if (previous) previous.cancel();
      fades.set(panel, animation);
      return animation;
    }
    function fadeIn(panel, way, back) {
      const t = css(env.reduce ? "transition.fade" : "transition.panelIn");
      const start = back ? shownNow(panel) : gone(way);
      fade(panel, [Object.assign({ offset: 0 }, start)], { duration: t.duration, easing: t.easing, fill: "backwards" });
    }
    function fadeOut(panel, way) {
      const t = css("transition.panelOut");
      const from = shownNow(panel);
      const to = gone(way ? [-way[0], -way[1]] : null);
      if (!to.translate) to.translate = from.translate;
      return fade(panel, [from, to], { duration: t.duration, easing: t.easing, fill: "both" });
    }
    /** The height glides from the previous panel's to this one's, clipped on the way. */
    function glideHeight(panel, from) {
      const to = panel.getBoundingClientRect().height;
      if (!(to > 0) || Math.abs(to - from) <= 0.5) return;
      const st = getComputedStyle(panel);
      const inset =
        st.boxSizing === "border-box" ? 0 : px(st.paddingTop) + px(st.paddingBottom) + px(st.borderTopWidth) + px(st.borderBottomWidth);
      const sizes = [Math.max(0, from - inset) + "px", Math.max(0, to - inset) + "px"];
      const frames = { minHeight: sizes, maxHeight: sizes };
      if (st.overflowY === "visible") frames.overflowY = ["clip", "clip"];
      const t = css("transition.panelHeight");
      glides.set(panel, panel.animate(frames, { duration: t.duration, easing: t.easing, fill: "backwards" }));
    }
    function still(panel) {
      [fades, glides].forEach((map) => {
        const animation = map.get(panel);
        if (animation) animation.cancel();
        map.delete(panel);
      });
    }
    function enter() {
      const panel = panels[index];
      const way = wayOf(stage.last, panel);
      stage.current = panel;
      if (!panel) return;
      stage.last = panel;
      panel.hidden = false;
      fadeIn(panel, way, false);
      if (!env.reduce && stage.height !== undefined) glideHeight(panel, stage.height);
    }
    function leave() {
      const panel = stage.current;
      if (!panel) return enter();
      // focus never stays on something that is going away
      if (panel.contains(doc.activeElement)) tabs[index].focus();
      panel.inert = true;
      const token = (stage.leaving = {});
      fadeOut(panel, wayOf(panel, panels[index])).finished.then(
        () => {
          if (stage.leaving !== token) return; // picked again on the way: it came back
          stage.leaving = null;
          stage.height = panel.getBoundingClientRect().height;
          panel.hidden = true;
          panel.inert = false;
          still(panel);
          enter();
        },
        () => {},
      );
    }
    function swap() {
      const target = panels[index];
      if (env.static || !canAnimate(el)) {
        panels.forEach((panel) => {
          if (!panel) return;
          still(panel);
          panel.hidden = panel !== target;
          panel.inert = false;
        });
        stage.current = stage.last = target;
        stage.leaving = null;
        stage.height = undefined;
        return;
      }
      if (stage.leaving) {
        // one is on its way out: the tab wanted is read once it has gone
        if (target === stage.current) {
          stage.leaving = null;
          target.inert = false;
          fadeIn(target, null, true);
        }
        return;
      }
      if (target !== stage.current) leave();
    }

    /* autoplay: a progress variable on the active tab; paused under the pointer, with focus inside, off screen */
    let elapsed = 0;
    const paused = { hover: false, focus: false, hidden: true, user: false };
    const loop = Site.util.loop((time, delta) => {
      elapsed += delta;
      const progress = Math.min(1, elapsed / period);
      tabs[index].style.setProperty("--progress", progress.toFixed(4));
      if (progress >= 1) step(1);
    });
    function syncAutoplay() {
      if (period && !env.reduce && !paused.hover && !paused.focus && !paused.hidden && !paused.user) loop.start();
      else loop.stop();
    }

    function select(next) {
      next = Number(next);
      if (!(next >= 0 && next < tabs.length) || next === index) return;
      index = next;
      elapsed = 0;
      mark();
      if (period) tabs[index].style.setProperty("--progress", "0");
      swap();
      emit(el, "kit:tabs-change", { index: index, id: tabs[index].id, tab: tabs[index], panel: panels[index] });
    }
    /** The next (or previous) tab that can be picked, wrapping around. */
    function step(by) {
      for (let i = 1; i <= tabs.length; i++) {
        const next = (index + by * i + tabs.length * i) % tabs.length;
        if (usable(tabs[next])) return select(next);
      }
    }

    const onClick = (e) => {
      const tab = e.target.closest('[role="tab"]');
      const i = tabs.indexOf(tab);
      if (i > -1 && usable(tab)) select(i);
    };
    const onKey = (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const current = tabs.indexOf(e.target.closest('[role="tab"]'));
      if (current < 0) return;
      const rtl = getComputedStyle(list).direction === "rtl";
      const next = vertical ? "ArrowDown" : rtl ? "ArrowLeft" : "ArrowRight";
      const prev = vertical ? "ArrowUp" : rtl ? "ArrowRight" : "ArrowLeft";
      if ([next, prev, "Home", "End"].indexOf(e.key) < 0) return;
      const order = tabs.map((tab, i) => i).filter((i) => i === current || usable(tabs[i]));
      const at = order.indexOf(current);
      const target =
        e.key === "Home" ? order[0] : e.key === "End" ? order[order.length - 1] : order[(at + (e.key === next ? 1 : -1) + order.length) % order.length];
      e.preventDefault();
      // the keyboard moves the selection like a click (rule A2)
      tabs[target].focus();
      select(target);
    };
    const onEnter = (e) => {
      if (e.pointerType === "touch") return;
      paused.hover = true;
      syncAutoplay();
    };
    const onLeave = () => {
      paused.hover = false;
      syncAutoplay();
    };
    const onFocusIn = () => {
      paused.focus = true;
      syncAutoplay();
    };
    const onFocusOut = (e) => {
      paused.focus = !!e.relatedTarget && el.contains(e.relatedTarget);
      syncAutoplay();
    };
    list.addEventListener("click", onClick);
    list.addEventListener("keydown", onKey);
    let unwatch = null;
    let offReduce = null;
    if (period) {
      el.addEventListener("pointerenter", onEnter);
      el.addEventListener("pointerleave", onLeave);
      el.addEventListener("focusin", onFocusIn);
      el.addEventListener("focusout", onFocusOut);
      unwatch = Site.util.visible(el, (visible) => {
        paused.hidden = !visible;
        syncAutoplay();
      });
      offReduce = Site.on("reduce", syncAutoplay);
    }

    return {
      select: select,
      next: () => step(1),
      prev: () => step(-1),
      get index() {
        return index;
      },
      /** Autoplay only: stop and resume advancing. */
      pause() {
        paused.user = true;
        syncAutoplay();
      },
      play() {
        paused.user = false;
        syncAutoplay();
      },
      destroy() {
        loop.stop();
        list.removeEventListener("click", onClick);
        list.removeEventListener("keydown", onKey);
        el.removeEventListener("pointerenter", onEnter);
        el.removeEventListener("pointerleave", onLeave);
        el.removeEventListener("focusin", onFocusIn);
        el.removeEventListener("focusout", onFocusOut);
        if (unwatch) unwatch();
        if (offReduce) offReduce();
        if (highlight) highlight.destroy();
        panels.forEach((panel) => panel && still(panel));
        el.classList.remove("is-on");
      },
    };
  });

  /* ---------------------------------------------------------------- disclosure
   * Port of Animate UI's disclosure (internal/disclosure-panel.tsx, recipes/disclosure.md): the panel's height
   * grows from 0 while its content clears from blur.disclosure, on transition.disclosure both ways; its bottom edge
   * fades while it moves; closed, it is hidden (until found by the browser's find-in-page, where that is supported).
   * Re-triggered on the way it turns round from where it is. Reduced motion: the height jumps, the fade stays.
   */
  const UNTIL_FOUND = "onbeforematch" in doc.documentElement;
  const disclosureGroups = new Map(); // data-group name -> Set of controllers

  Site.register("disclosure", function (el, opts) {
    const panel = doc.getElementById(el.getAttribute("aria-controls") || "");
    if (!panel) return null;
    const groupName = typeof opts.group === "string" || typeof opts.group === "number" ? String(opts.group) : null;
    const native = /^(BUTTON|A|SUMMARY)$/.test(el.tagName);
    let open = el.getAttribute("aria-expanded") === "true";
    let animation = null;

    panel.setAttribute("data-disclosure-panel", "");
    if (el.tagName === "BUTTON" && !el.hasAttribute("type")) el.type = "button";
    if (!native) {
      if (!el.hasAttribute("role")) el.setAttribute("role", "button");
      if (!el.hasAttribute("tabindex")) el.tabIndex = 0;
    }

    /** A closed panel takes back the gap its parent's column leaves for it, so the gap shrinks with it (fitGap). */
    function margins() {
      const parent = panel.parentElement;
      const st = parent ? getComputedStyle(parent) : null;
      const column = !!st && (st.display.endsWith("grid") || (st.display.endsWith("flex") && st.flexDirection.startsWith("column")));
      const gap = column && parent.childElementCount > 1 ? px(st.rowGap) : 0;
      const inline = panel.style.marginTop;
      panel.style.marginTop = "";
      const ownMargin = px(getComputedStyle(panel).marginTop);
      panel.style.marginTop = inline;
      return { open: ownMargin, shut: ownMargin - gap };
    }

    /** The state at rest, nothing left on the panel. */
    function settle() {
      if (animation) animation.cancel();
      animation = null;
      panel.classList.remove("is-moving");
      panel.style.removeProperty("--k-disclosure-content");
      panel.style.marginTop = "";
      panel.inert = false;
      if (open) return panel.removeAttribute("hidden");
      if (!UNTIL_FOUND) return panel.setAttribute("hidden", "");
      // still in the page, at no height, so the browser's find-in-page can open it
      const m = margins();
      panel.setAttribute("hidden", "until-found");
      if (m.open !== m.shut) panel.style.marginTop = m.shut + "px";
    }

    function run(instant) {
      // where the panel is now (a move in flight included), read before anything changes
      const wasHidden = panel.hasAttribute("hidden");
      const m = margins();
      const st = getComputedStyle(panel);
      const from = {
        height: wasHidden ? 0 : panel.getBoundingClientRect().height,
        opacity: wasHidden ? "0" : st.opacity,
        filter: wasHidden ? blur("disclosure") : NONE(st.filter) ? "blur(0px)" : st.filter,
        marginTop: wasHidden ? m.shut : px(st.marginTop),
      };
      // closed from a control inside it, the focus goes back to the trigger before the panel goes (rule A17)
      if (!open && panel.contains(doc.activeElement)) el.focus();
      if (animation) animation.cancel();
      animation = null;
      panel.removeAttribute("hidden");
      panel.style.marginTop = "";
      panel.inert = !open;
      if (instant || env.static || !canAnimate(panel)) return settle();

      const natural = panel.getBoundingClientRect().height;
      const first = { opacity: from.opacity, filter: from.filter };
      const last = open ? { opacity: "1", filter: "blur(0px)" } : { opacity: "0", filter: blur("disclosure") };
      if (!env.reduce) {
        first.height = from.height + "px";
        last.height = (open ? natural : 0) + "px";
        if (m.open !== m.shut) {
          first.marginTop = from.marginTop + "px";
          last.marginTop = (open ? m.open : m.shut) + "px";
        }
      }
      // the edge fade needs the content's height: over 16px, or over the part still hidden
      panel.style.setProperty("--k-disclosure-content", natural + "px");
      panel.classList.add("is-moving");
      const t = css("transition.disclosure");
      const mine = (animation = panel.animate([first, last], { duration: t.duration, easing: t.easing, fill: "both" }));
      mine.finished.then(
        () => {
          if (animation === mine) settle();
        },
        () => {},
      );
    }

    function set(next, instant) {
      next = !!next;
      if (next === open) return;
      open = next;
      el.setAttribute("aria-expanded", String(open));
      if (open && group) group.forEach((other) => other !== api && other.close());
      run(instant);
      emit(el, "kit:disclosure-change", { open: open, panel: panel });
    }

    const api = {
      open: () => set(true),
      close: () => set(false),
      toggle: () => set(!open),
      get isOpen() {
        return open;
      },
      destroy() {
        el.removeEventListener("click", onClick);
        el.removeEventListener("keydown", onKey);
        panel.removeEventListener("beforematch", onFound);
        if (group) group.delete(api);
        if (animation) animation.cancel();
        animation = null;
        open = true; // without the kit every panel is visible
        settle();
        panel.classList.remove("is-on");
      },
    };
    let group = null;
    if (groupName) {
      group = disclosureGroups.get(groupName);
      if (!group) disclosureGroups.set(groupName, (group = new Set()));
      group.add(api);
    }

    const onClick = (e) => {
      if (el.tagName === "A") e.preventDefault();
      set(!open);
    };
    const onKey = (e) => {
      if (native || (e.key !== "Enter" && e.key !== " ")) return;
      e.preventDefault();
      set(!open);
    };
    /* found by the browser's find-in-page: it shows at once, the browser is about to scroll to the match */
    const onFound = () => set(true, true);
    el.addEventListener("click", onClick);
    el.addEventListener("keydown", onKey);
    panel.addEventListener("beforematch", onFound);

    // from here on the script owns the panel's visibility (see the html.js rule in kit-pointer.css)
    panel.classList.add("is-on");
    settle();
    return api;
  });

  /* ----------------------------------------------------------------- Site.flip
   * Continuity when a list or grid is filtered or reordered (interactions/filter-grid.md, interactions/list.md,
   * internal/reflow.ts): the items that stay glide to their new places on spring.reflow, new ones grow in from
   * FLIP_SCALE fading on transition.fade, removed ones fade out where they were as copies, so they never hold the
   * layout (popLayout). Only what is on or near the screen is animated; the rest simply changes place.
   * Called again on the way, items go on from where they are, at the speed they had.
   *
   *   Site.flip(list, () => { rows.forEach((row) => (row.hidden = !matches(row))); }, { items: ".row" }).then(...)
   */
  const FLIP_SCALE = 0.95; // filter-grid.md: new items grow in from 0.95, removed ones shrink back to it
  const GHOST = "data-flip-ghost";
  const flights = new WeakMap(); // item -> { animation, offset: [x, y], curve }
  const resizes = new WeakMap(); // container -> its height animation
  const SHOWN_PROPERTIES = ["opacity", "transform", "scale", "translate", "filter"];

  /** A copy of an element as it is drawn now, animations in flight included (reflow.ts copyAsShown). */
  function copyAsShown(element) {
    const copy = element.cloneNode(true);
    if (element.getAnimations && element.getAnimations().length > 0) {
      const computed = getComputedStyle(element);
      SHOWN_PROPERTIES.forEach((property) => copy.style.setProperty(property, computed.getPropertyValue(property)));
    }
    return copy;
  }

  /** The copy of a removed item fades out where the item was, out of the flow. */
  function leaveAsGhost(copy, rect, parent, done) {
    [copy].concat(Array.prototype.slice.call(copy.querySelectorAll("[id]"))).forEach((node) => node.removeAttribute("id"));
    copy.setAttribute(GHOST, "");
    copy.setAttribute("aria-hidden", "true");
    copy.setAttribute("inert", "");
    Object.assign(copy.style, {
      position: "absolute",
      left: "0px",
      top: "0px",
      margin: "0px",
      boxSizing: "border-box",
      width: rect.width + "px",
      height: rect.height + "px",
      pointerEvents: "none",
    });
    parent.appendChild(copy);
    // placed by measuring, so any containing block works and the list itself is left as it is
    const at = copy.getBoundingClientRect();
    copy.style.left = rect.left - at.left + "px";
    copy.style.top = rect.top - at.top + "px";
    const fade = css("transition.fade");
    const animation = copy.animate(env.reduce ? { opacity: 0 } : { opacity: 0, scale: String(FLIP_SCALE) }, {
      duration: fade.duration,
      easing: fade.easing,
      fill: "forwards",
    });
    const remove = () => copy.remove();
    animation.finished.then(remove, remove);
    done.push(animation);
  }

  Site.flip = function (container, mutate, options) {
    options = options || {};
    const selector = options.items || ":scope > *";
    const query = () =>
      Array.prototype.filter.call(
        container.querySelectorAll(selector),
        (node) => !node.hasAttribute(GHOST) && !node.classList.contains("k-highlight__surface"),
      );
    if (env.static || !canAnimate(container)) {
      mutate();
      return Promise.resolve();
    }

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = options.margin == null ? Math.round(vh / 2) : options.margin;
    const drawn = (r) => r.width > 0 || r.height > 0;
    const near = (r) => drawn(r) && r.bottom > -margin && r.top < vh + margin && r.right > -margin && r.left < vw + margin;

    // first: where everything is drawn now, and a copy of what might leave
    const before = new Map();
    const copies = new Map();
    query().forEach((item) => {
      const rect = item.getBoundingClientRect();
      if (!drawn(rect)) return;
      before.set(item, rect);
      if (near(rect)) copies.set(item, { copy: copyAsShown(item), parent: item.parentNode });
    });
    const box = container.getBoundingClientRect();
    const scrollY = window.scrollY;
    emit(container, "kit:flip");

    mutate();

    // the glides of a previous call end here: their speed is kept for the next one
    const now = query();
    const carried = new Map();
    now.forEach((item) => {
      const flight = flights.get(item);
      if (!flight) return;
      if (running(flight.animation)) {
        const speed = flight.curve.speed(timeOf(flight.animation));
        carried.set(item, { velocity: [-flight.offset[0] * speed, -flight.offset[1] * speed], startTime: handoverTime(flight.animation) });
      }
      flight.animation.cancel();
      flights.delete(item);
    });

    // last: where everything is laid out now
    const done = [];
    const fade = css("transition.fade");
    const grow = curveOf("spring.reflow", 0);
    const stays = new Set();
    now.forEach((item) => {
      const rect = item.getBoundingClientRect();
      const was = before.get(item);
      const wasNear = !!was && near(was);
      const isNear = near(rect);
      if (wasNear && isNear) {
        stays.add(item);
        const offset = [was.left - rect.left, was.top - rect.top];
        if (env.reduce || (Math.abs(offset[0]) < 0.5 && Math.abs(offset[1]) < 0.5)) return;
        const kept = carried.get(item);
        const curve = kept ? curveFrom("spring.reflow", offset, kept.velocity) : grow;
        const animation = item.animate([{ translate: offset[0] + "px " + offset[1] + "px" }, { translate: "0px 0px" }], {
          duration: curve.duration,
          easing: curve.easing,
          fill: "backwards",
        });
        animation.startTime = kept ? kept.startTime : performance.now();
        const flight = { animation: animation, offset: offset, curve: curve };
        flights.set(item, flight);
        animation.finished.then(
          () => flights.get(item) === flight && flights.delete(item),
          () => {},
        );
        done.push(animation);
      } else if (isNear) {
        // new here (added, shown again, or brought in from far away): it fades in, growing a little
        done.push(item.animate([{ opacity: 0, offset: 0 }], { duration: fade.duration, easing: fade.easing, fill: "backwards" }));
        if (!env.reduce)
          done.push(item.animate([{ scale: String(FLIP_SCALE), offset: 0 }], { duration: grow.duration, easing: grow.easing, fill: "backwards" }));
      }
    });
    // gone (removed, hidden, or sent far away): the copy leaves in its place
    copies.forEach((entry, item) => {
      if (stays.has(item)) return;
      const parent = entry.parent && entry.parent.isConnected ? entry.parent : container;
      leaveAsGhost(entry.copy, before.get(item), parent, done);
    });

    // the container's height follows, so what comes after it does not jump (reflow.ts resize)
    const resizing = resizes.get(container);
    if (resizing) resizing.cancel(); // `box` was read with it running: the next one goes on from that height
    const after = container.getBoundingClientRect();
    const edgeNear = (r) => r.bottom > -margin && r.bottom < vh + margin;
    if (
      !env.reduce &&
      options.resize !== false &&
      Math.abs(after.height - box.height) > 0.5 &&
      window.scrollY === scrollY &&
      (edgeNear(box) || edgeNear(after))
    ) {
      const st = getComputedStyle(container);
      const inset =
        st.boxSizing === "border-box" ? 0 : px(st.paddingTop) + px(st.paddingBottom) + px(st.borderTopWidth) + px(st.borderBottomWidth);
      const resize = container.animate([{ height: box.height - inset + "px" }, { height: after.height - inset + "px" }], {
        duration: grow.duration,
        easing: grow.easing,
      });
      resizes.set(container, resize);
      done.push(resize);
    }

    return Promise.all(done.map((animation) => animation.finished.catch(() => {}))).then(() => {
      emit(container, "kit:flip-end");
    });
  };

  /* ------------------------------------------------------------------- tooltip
   * Port of Animate UI's own Tooltip (primitives/tooltip): one popup for the whole page. It grows from its trigger
   * from scale.tooltip on spring.tooltip and leaves the same way. Moving to another trigger of the same group it
   * glides there (place and size, spring.tooltip) while its label changes in place: the one leaving slides
   * shift.tooltip away from where the popup goes as it fades into blur.tooltip (transition.tooltipOut), the next one
   * comes in from there (transition.tooltipIn); a label that was leaving and is asked for again comes back from
   * where it is. Between triggers that share no group the popup is warm (rule A14): it shows at once at the next
   * one. It shows on hover (fine pointers) and on keyboard focus; Escape, scrolling, resizing and pressing the
   * trigger hide it at once.
   */
  const TOOLTIP = { openDelay: 0, closeDelay: 300, offset: 10, padding: 8 }; // primitives/tooltip: the provider's delays, sideOffset, shift({ padding })

  const tip = (function () {
    let root = null;
    let box = null;
    let clip = null;
    let glider = null;
    let opacity = null;
    let scale = null;
    let state = "closed"; // closed | open | closing
    let current = null; // { trigger, group, rect, layer, label, animation }
    let timer = 0;
    let closing = null;
    let lastClose = -Infinity;
    const leaving = new Map(); // trigger -> its label on the way out

    function build() {
      root = doc.createElement("div");
      root.className = "k-tip";
      root.id = "k-tip";
      root.setAttribute("role", "tooltip");
      root.hidden = true;
      box = doc.createElement("div");
      box.className = "k-tip__box";
      clip = doc.createElement("div");
      clip.className = "k-tip__clip";
      box.appendChild(clip);
      root.appendChild(box);
      doc.body.appendChild(root);
      glider = new Glider(root, "spring.tooltip");
      opacity = new Spring1(box, "opacity", "spring.tooltip", 1, true);
      scale = new Spring1(box, "scale", "spring.tooltip", 1);
      opacity.value = 0;
      scale.value = tokens.scale.tooltip;
      window.addEventListener("keydown", (e) => e.key === "Escape" && hideNow(), true);
      window.addEventListener("scroll", hideNow, { capture: true, passive: true });
      window.addEventListener("resize", hideNow);
    }

    function makeLabel(trigger, text) {
      const layer = doc.createElement("div");
      layer.className = "k-tip__layer";
      const label = doc.createElement("div");
      label.className = "k-tip__label";
      label.textContent = text;
      layer.appendChild(label);
      clip.appendChild(layer);
      return { trigger: trigger, layer: layer, label: label, animation: null };
    }

    const sideOf = (trigger) => {
      const own = trigger.closest("[data-tip-side]");
      return own && own.getAttribute("data-tip-side") === "bottom" ? "bottom" : "top";
    };

    /** Above (or below) its trigger, centred on it, kept inside the screen; the other side when there is no room. */
    function placeAt(rect, size, side) {
      const vw = doc.documentElement.clientWidth;
      const vh = window.innerHeight;
      const roomTop = rect.top - TOOLTIP.offset - size.h >= TOOLTIP.padding;
      const roomBottom = rect.bottom + TOOLTIP.offset + size.h <= vh - TOOLTIP.padding;
      const bottom = side === "bottom" ? roomBottom || !roomTop : !roomTop && roomBottom;
      const centre = rect.left + rect.width / 2;
      const x = Site.util.clamp(centre - size.w / 2, TOOLTIP.padding, Math.max(TOOLTIP.padding, vw - TOOLTIP.padding - size.w));
      const y = bottom ? rect.bottom + TOOLTIP.offset : rect.top - TOOLTIP.offset - size.h;
      return {
        box: { x: x, y: y, w: size.w, h: size.h },
        bottom: bottom,
        // it grows from the point facing its trigger (rule A6)
        origin: Site.util.clamp(centre - x, 0, size.w) + "px " + (bottom ? "0%" : "100%"),
      };
    }

    function wayBetween(from, to) {
      const dx = to.left + to.width / 2 - (from.left + from.width / 2);
      const dy = to.top + to.height / 2 - (from.top + from.height / 2);
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return { axis: "x", sign: 0 };
      return Math.abs(dx) >= Math.abs(dy) ? { axis: "x", sign: Math.sign(dx) } : { axis: "y", sign: Math.sign(dy) };
    }
    const shifted = (way, side) => {
      const d = tokens.shift.tooltip * way.sign * side;
      return way.axis === "x" ? d + "px 0px" : "0px " + d + "px";
    };
    function animateLabel(entry, frames, options) {
      const previous = entry.animation;
      entry.animation = entry.label.animate(frames, options);
      if (previous) previous.cancel();
      return entry.animation;
    }
    function slideOut(entry, way) {
      const t = css("transition.tooltipOut");
      leaving.set(entry.trigger, entry);
      animateLabel(entry, [shownNow(entry.label), { opacity: "0", filter: blur("tooltip"), translate: shifted(way, -1) }], {
        duration: t.duration,
        easing: t.easing,
        fill: "both",
      }).finished.then(
        () => {
          if (leaving.get(entry.trigger) !== entry) return;
          leaving.delete(entry.trigger);
          entry.layer.remove();
        },
        () => {},
      );
    }
    function slideIn(entry, way, back) {
      const t = css("transition.tooltipIn");
      const start = back ? shownNow(entry.label) : { opacity: "0", filter: blur("tooltip"), translate: shifted(way, 1) };
      animateLabel(entry, [Object.assign({ offset: 0 }, start)], { duration: t.duration, easing: t.easing, fill: "backwards" });
    }

    /** The trigger is described by the popup while it shows, unless its own name already says the same. */
    function describe(trigger, on) {
      if (!trigger) return;
      if (!on) {
        if (trigger.getAttribute("aria-describedby") === "k-tip") trigger.removeAttribute("aria-describedby");
      } else if (!trigger.hasAttribute("aria-describedby") && trigger.getAttribute("aria-label") !== trigger.getAttribute("data-tip"))
        trigger.setAttribute("aria-describedby", "k-tip");
    }

    function change(trigger, group) {
      const text = trigger.getAttribute("data-tip");
      if (!text || !trigger.isConnected) return hideNow();
      if (!root) build();
      const previous = state === "open" ? current : null;
      closing = null;
      root.hidden = false;
      const back = leaving.get(trigger);
      if (back) leaving.delete(trigger);
      const entry = back || makeLabel(trigger, text);
      if (back) entry.label.textContent = text;
      const rect = trigger.getBoundingClientRect();
      const placed = placeAt(rect, { w: entry.layer.offsetWidth, h: entry.layer.offsetHeight }, sideOf(trigger));
      root.setAttribute("data-side", placed.bottom ? "bottom" : "top");
      box.style.transformOrigin = placed.origin;
      if (previous && group && previous.group === group && !env.reduce) {
        const way = wayBetween(previous.rect, rect);
        slideOut(previous, way);
        slideIn(entry, way, !!back);
        glider.to(placed.box);
      } else {
        // the first one, or a warm one: at once at its trigger, and whatever was showing goes at once
        Array.prototype.slice.call(clip.children).forEach((layer) => layer !== entry.layer && layer.remove());
        leaving.clear();
        if (entry.animation) entry.animation.cancel();
        entry.animation = null;
        glider.jump(placed.box);
      }
      if (previous) describe(previous.trigger, false);
      describe(trigger, true);
      entry.group = group;
      entry.rect = rect;
      current = entry;
      state = "open";
      opacity.to(1);
      scale.to(1);
    }

    function reset() {
      closing = null;
      state = "closed";
      current = null;
      root.hidden = true;
      clip.textContent = "";
      leaving.clear();
      glider.stop();
      opacity.stop();
      opacity.value = 0;
      scale.stop();
      scale.value = tokens.scale.tooltip;
    }
    function close() {
      if (state !== "open") return;
      state = "closing";
      lastClose = performance.now();
      describe(current.trigger, false);
      // the exit replays the entrance
      opacity.to(0);
      scale.to(tokens.scale.tooltip);
      const token = (closing = {});
      setTimeout(() => closing === token && reset(), env.static ? 0 : css("spring.tooltip").duration);
    }
    function hideNow() {
      clearTimeout(timer);
      close();
    }

    return {
      show(trigger, group, delay) {
        clearTimeout(timer);
        if (state === "open") {
          if (current.trigger !== trigger) change(trigger, group);
          return;
        }
        // warm for a moment after the last one closed: no wait
        const wait = performance.now() - lastClose < TOOLTIP.closeDelay ? 0 : delay > 0 ? delay : TOOLTIP.openDelay;
        if (wait > 0) timer = setTimeout(() => change(trigger, group), wait);
        else change(trigger, group);
      },
      hide() {
        clearTimeout(timer);
        timer = setTimeout(close, TOOLTIP.closeDelay);
      },
      hideNow: hideNow,
      trigger: () => (state === "open" && current ? current.trigger : null),
    };
  })();

  /** Wire the triggers of a group (one popup gliding between them) or a single trigger. */
  function wireTooltips(scope, single, opts) {
    const group = single ? null : {};
    const delay = Number(opts.tipDelay) || 0;
    const triggerOf = (node) => {
      if (single) return scope;
      const trigger = node && node.closest ? node.closest("[data-tip]") : null;
      return trigger && scope.contains(trigger) ? trigger : null;
    };
    // an icon-only trigger takes its name from its tip
    Array.prototype.forEach.call(single ? [scope] : scope.querySelectorAll("[data-tip]"), (trigger) => {
      const tipText = trigger.getAttribute("data-tip");
      if (tipText && !trigger.hasAttribute("aria-label") && !trigger.hasAttribute("aria-labelledby") && !trigger.textContent.trim())
        trigger.setAttribute("aria-label", tipText);
    });

    let hovered = null;
    const onOver = (e) => {
      if (e.pointerType === "touch" || !env.hover) return;
      const trigger = triggerOf(e.target);
      if (trigger === hovered) return;
      hovered = trigger;
      if (trigger) tip.show(trigger, group, delay);
      else tip.hide();
    };
    const onLeave = () => {
      if (!hovered) return;
      hovered = null;
      tip.hide();
    };
    const onFocusIn = (e) => {
      const trigger = triggerOf(e.target);
      if (trigger && focusVisible(e.target)) tip.show(trigger, group, delay);
    };
    const onFocusOut = () => tip.hide();
    // pressed, the trigger has been found: its tip goes at once
    const onDown = (e) => {
      const trigger = triggerOf(e.target);
      if (trigger && tip.trigger() === trigger) tip.hideNow();
    };
    const events = [
      ["pointerover", onOver],
      ["pointerleave", onLeave],
      ["focusin", onFocusIn],
      ["focusout", onFocusOut],
      ["pointerdown", onDown],
    ];
    events.forEach((pair) => scope.addEventListener(pair[0], pair[1]));
    return {
      destroy() {
        events.forEach((pair) => scope.removeEventListener(pair[0], pair[1]));
        const shown = tip.trigger();
        if (shown && scope.contains(shown)) tip.hideNow();
      },
    };
  }
  Site.register("tooltip-group", (el, opts) => wireTooltips(el, false, opts));
  Site.register("tooltip", (el, opts) => wireTooltips(el, true, opts));
  Site.tooltip = { hide: tip.hideNow };

  /* ---------------------------------------------------------------------- copy
   * Animate UI's copy button (primitives/buttons/copy, buttons/_icon-swap.tsx, recipes/swap.md): the text goes to
   * the clipboard and the icon swaps for a check, both moving at once in the same cell (from scale.icon out of
   * blur.icon on transition.swap, in kit-pointer.css), then back. A label swaps the same way without the scale.
   * The button itself never changes, so it keeps the focus; the result is also said ("Copied").
   */
  const COPY_RESET = 2000; // KIT_SPEC: back after 2 s (Animate UI's CopyButton waits 3 s by default)

  function legacyCopy(value) {
    return new Promise((resolve, reject) => {
      const area = doc.createElement("textarea");
      area.value = value;
      area.setAttribute("readonly", "");
      area.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
      doc.body.appendChild(area);
      const active = doc.activeElement;
      area.select();
      let ok = false;
      try {
        ok = doc.execCommand("copy");
      } catch (e) {
        ok = false;
      }
      area.remove();
      if (active && active.focus) active.focus({ preventScroll: true });
      if (ok) resolve();
      else reject(new Error("copy"));
    });
  }
  function writeClipboard(value) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(value).catch(() => legacyCopy(value));
    return legacyCopy(value);
  }

  Site.register("copy", function (el, opts) {
    const said = typeof opts.copied === "string" && opts.copied ? opts.copied : "Copied";
    const reset = Number(opts.copyReset) > 0 ? Number(opts.copyReset) : COPY_RESET;
    let timer = 0;

    // two icons side by side in the markup become one cell holding both states
    if (!el.querySelector(".k-swap")) {
      const icons = Array.prototype.filter.call(el.children, (child) => child.tagName.toLowerCase() === "svg");
      if (icons.length === 2) {
        const cell = doc.createElement("span");
        cell.className = "k-swap";
        el.insertBefore(cell, icons[0]);
        icons.forEach((icon) => cell.appendChild(icon));
      }
    }
    // an optional label: its copied wording sits in the same cell, so the button keeps the width of the longer one
    const label = el.querySelector("[data-copy-label]");
    if (label && !label.classList.contains("k-swap")) {
      const idle = doc.createElement("span");
      while (label.firstChild) idle.appendChild(label.firstChild);
      const done = doc.createElement("span");
      done.textContent = said;
      done.setAttribute("aria-hidden", "true");
      label.appendChild(idle);
      label.appendChild(done);
      label.classList.add("k-swap", "k-swap--text");
    }
    const cells = () => el.querySelectorAll(".k-swap");

    function show(copied) {
      el.classList.toggle("is-copied", copied);
      Array.prototype.forEach.call(cells(), (cell) => {
        cell.classList.toggle("is-swapped", copied);
        if (!cell.classList.contains("k-swap--text")) return;
        if (cell.children[0]) cell.children[0].setAttribute("aria-hidden", String(copied));
        if (cell.children[1]) cell.children[1].setAttribute("aria-hidden", String(!copied));
      });
    }
    function source() {
      const from = el.getAttribute("data-copy-from");
      const node = from ? doc.querySelector(from) : null;
      if (node) return ("value" in node && typeof node.value === "string" ? node.value : node.textContent).trim();
      return el.getAttribute("data-copy") || "";
    }
    const onClick = () => {
      const value = source();
      if (!value) return;
      writeClipboard(value).then(
        () => {
          show(true);
          clearTimeout(timer);
          timer = setTimeout(() => show(false), reset);
          if (typeof opts.toast === "string" && opts.toast) Site.toast(opts.toast);
          else Site.announce(said);
          emit(el, "kit:copy", { text: value, ok: true });
        },
        () => {
          Site.announce("Could not copy");
          emit(el, "kit:copy", { text: value, ok: false });
        },
      );
    };
    el.addEventListener("click", onClick);
    return {
      destroy() {
        el.removeEventListener("click", onClick);
        clearTimeout(timer);
        show(false);
      },
    };
  });

  /* -------------------------------------------------------------------- ripple
   * Animate UI's ripple button (primitives/buttons/ripple): a 20px dot at the click point grows 10 times as it
   * fades from half opacity, over 0.6s on easeOut, clipped by the button. Reduced motion: it only fades.
   */
  const RIPPLE = { duration: 0.6, easing: "cubic-bezier(0, 0, 0.58, 1)", size: 20, scale: 10, opacity: 0.5 };

  Site.register("ripple", function (el, opts) {
    const scale = Number(opts.rippleScale) > 0 ? Number(opts.rippleScale) : RIPPLE.scale;
    const onClick = (e) => {
      if (env.static || !canAnimate(el)) return;
      const rect = el.getBoundingClientRect();
      // a click from the keyboard has no place: it starts from the middle
      const keyboard = e.detail === 0 || (!e.clientX && !e.clientY);
      // in the button's own coordinates, whatever scale it is drawn at (its press)
      const x = keyboard ? el.offsetWidth / 2 : (e.clientX - rect.left) * (el.offsetWidth / (rect.width || 1));
      const y = keyboard ? el.offsetHeight / 2 : (e.clientY - rect.top) * (el.offsetHeight / (rect.height || 1));
      const wave = doc.createElement("span");
      wave.className = "k-ripple__wave";
      wave.setAttribute("aria-hidden", "true");
      wave.style.left = x - el.clientLeft - RIPPLE.size / 2 + "px";
      wave.style.top = y - el.clientTop - RIPPLE.size / 2 + "px";
      el.appendChild(wave);
      const remove = () => wave.remove();
      wave
        .animate(
          [
            { transform: "scale(" + (env.reduce ? scale : 0) + ")", opacity: RIPPLE.opacity },
            { transform: "scale(" + scale + ")", opacity: 0 },
          ],
          { duration: RIPPLE.duration * 1000 * Site.tempo, easing: RIPPLE.easing, fill: "forwards" },
        )
        .finished.then(remove, remove);
    };
    el.addEventListener("click", onClick);
    return {
      destroy() {
        el.removeEventListener("click", onClick);
        Array.prototype.forEach.call(el.querySelectorAll(".k-ripple__wave"), (wave) => wave.remove());
      },
    };
  });

  /* ---------------------------------------------------------------- Site.toast
   * A small message rising from the bottom edge (recipes/toast.md, recipes/css-driven.md, primitives/base-ui/toast):
   * it rises its own height from scale.toast out of blur.surface on spring.toast; the newest is in front, the ones
   * behind peek above it, a little smaller (never below 0.9); under the pointer the stack unfolds, front to back
   * (stagger.stack), and the timers wait; a toast leaves on transition.dismiss. The motion is CSS transitions on
   * variables this script sets (kit-pointer.css), so toasts fired in a burst retarget instead of restarting.
   *
   *   const toast = Site.toast("Copied BibTeX");   toast.dismiss();   Site.toast("Saved", { duration: 8000 })
   */
  const TOAST = { timeout: 5000, limit: 3, cascade: 150 }; // primitives/base-ui/toast: default timeout, toasts shown at once, the window in which the unfolding cascades

  const toasts = (function () {
    let region = null;
    let list = []; // newest first
    let expanded = false;
    let cascade = 0;

    const live = () => list.filter((toast) => !toast.leaving);
    const frozen = () => expanded || doc.hidden || !doc.hasFocus();

    function layout() {
      let offset = 0;
      const shown = live();
      shown.forEach((toast, i) => {
        const st = toast.el.style;
        st.setProperty("--i", String(i));
        st.setProperty("--offset", offset + "px");
        st.zIndex = String(shown.length - i);
        toast.el.classList.toggle("is-behind", i > 0);
        toast.el.classList.toggle("is-limited", i >= TOAST.limit);
        offset += toast.height;
      });
      region.style.setProperty("--front", (shown[0] ? shown[0].height : 0) + "px");
      region.classList.toggle("is-expanded", expanded && shown.length > 1);
    }

    /** The timers wait while the stack is unfolded, the tab hidden or the window in the background. */
    function syncTimers() {
      const hold = frozen();
      list.forEach((toast) => {
        if (toast.leaving || !isFinite(toast.remaining)) return;
        if (hold && toast.timer) {
          clearTimeout(toast.timer);
          toast.timer = 0;
          toast.remaining -= performance.now() - toast.since;
        } else if (!hold && !toast.timer) {
          toast.since = performance.now();
          toast.timer = setTimeout(() => dismiss(toast), Math.max(0, toast.remaining));
        }
      });
    }

    function setExpanded(next) {
      if (next === expanded) return;
      expanded = next;
      // only the change that unfolds or folds the stack cascades; anything later starts at once
      clearTimeout(cascade);
      region.classList.add("is-cascading");
      cascade = setTimeout(() => region.classList.remove("is-cascading"), TOAST.cascade);
      layout();
      syncTimers();
    }

    function mount() {
      if (region || !doc.body) return;
      region = doc.createElement("div");
      region.className = "k-toasts";
      // one live region, in the page before any message, so every toast is said once
      region.setAttribute("role", "status");
      region.setAttribute("aria-live", "polite");
      region.setAttribute("aria-atomic", "false");
      region.setAttribute("aria-relevant", "additions");
      doc.body.appendChild(region);
      region.addEventListener("pointerenter", (e) => e.pointerType !== "touch" && setExpanded(true));
      region.addEventListener("pointerleave", () => setExpanded(false));
      doc.addEventListener("visibilitychange", syncTimers);
      window.addEventListener("focus", syncTimers);
      window.addEventListener("blur", syncTimers);
    }

    function dismiss(toast) {
      if (toast.leaving) return;
      toast.leaving = true;
      clearTimeout(toast.timer);
      toast.timer = 0;
      toast.el.classList.add("is-leaving");
      toast.el.setAttribute("aria-hidden", "true");
      layout();
      setTimeout(
        () => {
          toast.el.remove();
          list = list.filter((other) => other !== toast);
          if (!live().length) setExpanded(false);
        },
        env.static ? 0 : css("transition.dismiss").duration,
      );
    }

    function add(text, options) {
      mount();
      const el = doc.createElement("div");
      el.className = "k-toast is-entering";
      const content = doc.createElement("div");
      content.className = "k-toast__content";
      content.textContent = String(text);
      el.appendChild(content);
      region.appendChild(el);
      const duration = options && options.duration != null ? Number(options.duration) : TOAST.timeout;
      const toast = { el: el, height: el.offsetHeight, remaining: duration > 0 ? duration : Infinity, since: 0, timer: 0, leaving: false };
      el.style.setProperty("--h", toast.height + "px");
      el.addEventListener("click", () => dismiss(toast));
      list.unshift(toast);
      layout();
      // its starting style has been computed: taking the class off is what makes it rise
      void el.offsetWidth;
      el.classList.remove("is-entering");
      syncTimers();
      return toast;
    }

    mount();
    return { add: add, dismiss: dismiss };
  })();

  Site.toast = function (text, options) {
    const toast = toasts.add(text, options);
    return { element: toast.el, dismiss: () => toasts.dismiss(toast) };
  };

  /* ------------------------------------------------------------------ lightbox
   * An image opening into a larger, centred view and closing back to its place (interactions/expanding-card.md,
   * recipes/modal.md). The picture itself travels: a frame laid out at its final size starts on the thumbnail
   * (transform, and a clip for the part a cropped thumbnail shows) and settles on spring.dialog; the page behind
   * is veiled through its background colour on transition.overlay; what only exists in the large view (caption,
   * close button) fades in on transition.reveal and leaves on transition.swap. Closing, the picture lands back on
   * the thumbnail on spring.slide: quicker than it came, and it still slows down into its place.
   * Escape, a click anywhere and any attempt to scroll close it; the page does not move behind it; focus goes to
   * the close button and back to the trigger as it starts closing. Reduced motion: it fades in place.
   */
  const lightbox = (function () {
    let root = null;
    let frame = null;
    let picture = null;
    let caption = null;
    let closer = null;
    let state = "closed"; // closed | open | closing
    let source = null;
    let flight = null;
    let rest = null; // the frame's box when open
    let returnTo = null;
    let scrollAt = null;

    function build() {
      root = doc.createElement("div");
      root.className = "k-lightbox";
      root.setAttribute("role", "dialog");
      root.setAttribute("aria-modal", "true");
      root.hidden = true;
      root.innerHTML =
        '<div class="k-lightbox__scrim"></div>' +
        '<div class="k-lightbox__frame"><img class="k-lightbox__img" alt="" draggable="false"></div>' +
        '<p class="k-lightbox__caption"></p>' +
        '<button type="button" class="k-lightbox__close" aria-label="Close">' +
        '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
        "</button>";
      frame = root.querySelector(".k-lightbox__frame");
      picture = root.querySelector(".k-lightbox__img");
      caption = root.querySelector(".k-lightbox__caption");
      closer = root.querySelector(".k-lightbox__close");
      doc.body.appendChild(root);
      root.addEventListener("click", () => close());
      // the page does not scroll behind it: trying to is a way to close it
      const stop = (e) => {
        if (e.cancelable) e.preventDefault();
        close();
      };
      root.addEventListener("wheel", stop, { passive: false });
      root.addEventListener("touchmove", stop, { passive: false });
    }

    const SCROLL_KEYS = [" ", "PageUp", "PageDown", "ArrowUp", "ArrowDown", "Home", "End"];
    function onKey(e) {
      if (state === "closed") return;
      if (e.key === "Escape") close();
      else if (e.key === "Tab") {
        // the close button is the only stop: focus stays inside
        e.preventDefault();
        if (state === "open") closer.focus({ preventScroll: true });
      } else if (state === "open" && SCROLL_KEYS.indexOf(e.key) > -1 && !(e.key === " " && doc.activeElement === closer)) {
        // (Space on the close button is the button's own business)
        e.preventDefault();
        close();
      }
    }
    function onScroll() {
      if (state === "open") close();
      // the page moved while the picture is on its way back: it keeps heading for its place
      if (state === "closing" && scrollAt) frame.style.translate = scrollAt.x - window.scrollX + "px " + (scrollAt.y - window.scrollY) + "px";
    }
    const onResize = () => close(true);

    /** Where the whole picture is drawn in the page (object-fit), which part of it shows, and its corners. */
    function geometry(src) {
      const img = src.img;
      const r = img.getBoundingClientRect();
      const st = getComputedStyle(img);
      const nw = img.naturalWidth || r.width || 1;
      const nh = img.naturalHeight || r.height || 1;
      let drawn = { left: r.left, top: r.top, width: r.width, height: r.height };
      if (st.objectFit === "cover" || st.objectFit === "contain") {
        const k = st.objectFit === "cover" ? Math.max(r.width / nw, r.height / nh) : Math.min(r.width / nw, r.height / nh);
        const at = st.objectPosition.split(" ").map((part) => (part.endsWith("%") ? parseFloat(part) / 100 : 0.5));
        drawn = {
          left: r.left + (r.width - nw * k) * (at[0] == null ? 0.5 : at[0]),
          top: r.top + (r.height - nh * k) * (at[1] == null ? 0.5 : at[1]),
          width: nw * k,
          height: nh * k,
        };
      }
      // what shows: the image's box, cut by a wrapper that clips it (a round avatar frame)
      const clipper = src.el !== img && getComputedStyle(src.el).overflow !== "visible" ? src.el : img;
      const c = clipper.getBoundingClientRect();
      const visible = {
        left: Math.max(r.left, c.left),
        top: Math.max(r.top, c.top),
        right: Math.min(r.right, c.right),
        bottom: Math.min(r.bottom, c.bottom),
      };
      const corner = getComputedStyle(clipper).borderTopLeftRadius.split(" ")[0];
      const radius = corner.endsWith("%") ? (parseFloat(corner) / 100) * Math.min(c.width, c.height) : px(corner);
      return { drawn: drawn, visible: visible, radius: radius, aspect: drawn.width / (drawn.height || 1) };
    }

    /** The open picture: as large as the screen allows, never blown up past its own pixels unless a larger file is coming. */
    function openBox(geo, src, hasCaption) {
      const vw = doc.documentElement.clientWidth;
      const vh = window.innerHeight;
      const pad = Math.max(16, Math.round(Math.min(vw, vh) * 0.06));
      const below = hasCaption ? 56 : 0;
      const maxW = vw - 2 * pad;
      const maxH = vh - 2 * pad - below;
      let w = Math.min(maxW, maxH * geo.aspect);
      const own = src.full ? Infinity : src.img.naturalWidth || Infinity;
      w = Math.max(Math.min(w, own), Math.min(w, geo.drawn.width));
      const h = w / geo.aspect;
      return { left: (vw - w) / 2, top: pad + (maxH - h) / 2, width: w, height: h };
    }

    /** The frame's pose on the thumbnail, in the open frame's own coordinates. */
    function poseOnThumb(geo) {
      const s = geo.drawn.width / rest.width;
      const cut = [
        geo.visible.top - geo.drawn.top,
        geo.drawn.left + geo.drawn.width - geo.visible.right,
        geo.drawn.top + geo.drawn.height - geo.visible.bottom,
        geo.visible.left - geo.drawn.left,
      ].map((v) => Math.max(0, v / s));
      return {
        transform: "translate(" + (geo.drawn.left - rest.left) + "px, " + (geo.drawn.top - rest.top) + "px) scale(" + s + ")",
        clipPath: "inset(" + cut.join("px ") + "px round " + geo.radius / s + "px)",
      };
    }
    const poseOpen = () => ({
      transform: "translate(0px, 0px) scale(1)",
      clipPath: "inset(0px 0px 0px 0px round " + px(getComputedStyle(frame).borderTopLeftRadius) + "px)",
    });
    const poseNow = () => {
      const st = getComputedStyle(frame);
      return { transform: NONE(st.transform) ? "translate(0px, 0px) scale(1)" : st.transform, clipPath: st.clipPath };
    };
    function fly(from, to, token) {
      const curve = curveOf(token, 0);
      const previous = flight;
      flight = frame.animate([from, to], { duration: curve.duration, easing: curve.easing, fill: "both" });
      flight.curve = curve;
      if (previous) previous.cancel();
      return flight;
    }

    /* The thumbnail while its picture is away: unseen, but still there for the focus to come back to. */
    let hiddenStyle = null;
    function hideThumb(img) {
      hiddenStyle = { img: img, opacity: img.style.opacity, transition: img.style.getPropertyValue("transition"), priority: img.style.getPropertyPriority("transition") };
      img.style.setProperty("transition", "none", "important"); // a fade of its own would show it twice
      img.style.opacity = "0";
    }
    function showThumb() {
      if (!hiddenStyle) return;
      const img = hiddenStyle.img;
      img.style.opacity = hiddenStyle.opacity;
      void img.offsetWidth;
      if (hiddenStyle.transition) img.style.setProperty("transition", hiddenStyle.transition, hiddenStyle.priority);
      else img.style.removeProperty("transition");
      hiddenStyle = null;
    }

    /** Call `landed` once the frame is within half a pixel of where it goes: a spring's tail is long (glide.ts whenLanded). */
    function whenLanded(animation, distance, landed) {
      let done = false;
      const land = () => {
        if (done) return;
        done = true;
        landed();
      };
      const check = () => {
        if (done || flight !== animation) return;
        const left = 1 - animation.curve.at(timeOf(animation));
        if (Math.abs(left) * distance < 0.5) land();
        else requestAnimationFrame(check);
      };
      animation.finished.then(land, () => {});
      requestAnimationFrame(check);
    }

    function finish() {
      if (flight) flight.cancel();
      flight = null;
      showThumb();
      doc.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
      root.hidden = true;
      root.classList.remove("is-open");
      frame.style.translate = "";
      picture.removeAttribute("src");
      state = "closed";
      source = null;
      scrollAt = null;
    }

    function open(src) {
      if (state === "open") return;
      if (state === "closing" && source !== src) finish(); // another picture is asked for: the one on its way back is home at once
      if (!root) build();
      const again = state === "closing";
      const text = src.caption();
      if (!again) {
        source = src;
        returnTo = doc.activeElement;
        picture.src = src.img.currentSrc || src.img.src;
        picture.alt = src.img.getAttribute("alt") || "";
        caption.textContent = text;
        caption.hidden = !text;
        root.setAttribute("aria-label", text || "Image");
        root.hidden = false;
        const geo = geometry(src);
        rest = openBox(geo, src, !!text);
        Object.assign(frame.style, { left: rest.left + "px", top: rest.top + "px", width: rest.width + "px", height: rest.height + "px" });
        caption.style.top = rest.top + rest.height + "px";
        doc.addEventListener("keydown", onKey, true);
        window.addEventListener("scroll", onScroll, { capture: true, passive: true });
        window.addEventListener("resize", onResize);
        if (!env.static && canAnimate(frame)) {
          if (env.reduce) {
            const fade = css("transition.fade");
            flight = frame.animate([{ opacity: 0 }, { opacity: 1 }], { duration: fade.duration, easing: fade.easing, fill: "backwards" });
          } else {
            hideThumb(src.img); // the picture has left its place
            fly(poseOnThumb(geo), poseOpen(), "spring.dialog");
          }
        }
        // a larger file, when the page names one: it replaces the thumbnail's pixels once decoded
        if (src.full) {
          const large = new Image();
          large.src = src.full;
          const swap = () => source === src && state !== "closed" && (picture.src = large.src);
          if (large.decode) large.decode().then(swap, () => {});
          else large.onload = swap;
        }
      } else if (!env.reduce) fly(poseNow(), poseOpen(), "spring.dialog"); // asked for again on its way back: it turns round
      else if (flight) flight.reverse();
      scrollAt = null;
      frame.style.translate = "";
      void root.offsetWidth;
      root.classList.add("is-open");
      state = "open";
      closer.focus({ preventScroll: true });
    }

    function close(instant) {
      if (state !== "open") return;
      state = "closing";
      root.classList.remove("is-open");
      scrollAt = { x: window.scrollX, y: window.scrollY };
      // focus goes back as it starts closing, not when it has gone (rule A17)
      if (returnTo && returnTo.isConnected && returnTo.focus) returnTo.focus({ preventScroll: true });
      if (instant || env.static || !canAnimate(frame)) return finish();
      let leaving;
      if (env.reduce) {
        const fade = css("transition.fade");
        const previous = flight;
        leaving = flight = frame.animate([{ opacity: getComputedStyle(frame).opacity }, { opacity: 0 }], {
          duration: fade.duration,
          easing: fade.easing,
          fill: "both",
        });
        if (previous) previous.cancel();
        leaving.finished.then(
          () => flight === leaving && state === "closing" && finish(),
          () => {},
        );
        return;
      }
      const geo = geometry(source);
      const now = frame.getBoundingClientRect();
      leaving = fly(poseNow(), poseOnThumb(geo), "spring.slide");
      const distance = Math.max(Math.abs(now.left - geo.drawn.left), Math.abs(now.top - geo.drawn.top), Math.abs(now.width - geo.drawn.width), Math.abs(now.height - geo.drawn.height));
      whenLanded(leaving, distance, () => flight === leaving && state === "closing" && finish());
    }

    return { open: open, close: close };
  })();

  Site.register("lightbox", function (el, opts) {
    const img = el.tagName === "IMG" ? el : el.querySelector("img");
    if (!img) return null;
    const native = /^(A|BUTTON)$/.test(el.tagName);
    const added = [];
    const set = (name, value) => {
      if (el.hasAttribute(name)) return;
      el.setAttribute(name, value);
      added.push(name);
    };
    // operable from the keyboard like a button, whatever element carries it
    if (!native) {
      set("tabindex", "0");
      set("role", "button");
    }
    set("aria-haspopup", "dialog");
    const src = {
      el: el,
      img: img,
      get full() {
        return el.getAttribute("data-full") || (el.tagName === "A" ? el.getAttribute("href") : "") || "";
      },
      caption: () => el.getAttribute("data-caption") || img.getAttribute("alt") || "",
    };
    const onClick = (e) => {
      // a modified click on a link still opens the file in a new tab
      if (e.defaultPrevented || e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      lightbox.open(src);
    };
    const onKey = (e) => {
      if (native || e.target !== el || (e.key !== "Enter" && e.key !== " ")) return;
      e.preventDefault();
      lightbox.open(src);
    };
    el.addEventListener("click", onClick);
    el.addEventListener("keydown", onKey);
    return {
      open: () => lightbox.open(src),
      close: () => lightbox.close(),
      destroy() {
        el.removeEventListener("click", onClick);
        el.removeEventListener("keydown", onKey);
        added.forEach((name) => el.removeAttribute(name));
      },
    };
  });
  Site.lightbox = { close: () => lightbox.close() };
})();
