/*
 * kit-expand: a trigger that opens into a near-full-screen detail view (the owner's "shared-element transition").
 *
 *   <a class="card" href="/research/#pqc" data-kit="expand" data-expand="#detail-pqc">
 *     <span data-shared="figure"><svg ...></svg></span> <span data-shared="title">Post-quantum</span>
 *   </a>
 *   <template id="detail-pqc"><article> <div data-shared="figure">...</div> <h2 data-shared="title">...</h2> ... </article></template>
 *
 * A plain click (or Enter) opens a modal view; a modified click and the no-JavaScript case follow the link. The panel
 * grows out of the trigger's box as seen on screen (a clip on the panel, on a spring) while the page dims; elements
 * that carry the same data-shared name in the trigger and in the view fly from one to the other as copies (position
 * and uniform scale only: a pair of different shapes cross-fades on the way), the real one in the view shown once its
 * copy has landed, so text is sharp at rest; the other content comes in after, staggered. Closing plays it back.
 * Content: a <template> (cloned on open; kits inside are attached with Site.init and released on close) or an element
 * with `hidden` (moved into the view and back). Markup, options, hooks and limits: _work/agent_notes/kit-pointer.md.
 */
(function () {
  "use strict";

  const Site = window.Site;
  if (!Site || !Site.register) return;
  const env = Site.env;
  const doc = document;
  const tokens = Site.tokens;

  /* ------------------------------------------------------------------ values */
  const OPEN = "spring.entrance"; // the panel growing and the shared elements flying in: lands with a little overshoot
  const CLOSE = "spring.slide"; // going back: quicker, slows into its place, never past it
  const ITEM_DELAY = 0.12; // s: the view's own content waits this long after the panel starts (site value)
  const ITEM_STEPS = 6; // at most this many stagger steps; later items come with the last (site value)
  const SAME_SHAPE = 0.12; // |ln(aspect a / aspect b)| under which two figures are "the same shape" (about 13%; site value)
  const FROZEN_MAX = 400; // descendants of a flying copy whose look is copied from the original (cost cap; site value)
  const CLOSE_FADE = 0.32; // s: the panel's surface fading as it shrinks back, so it melts into the trigger (site value)
  const SEEN_SHARE = 0.5; // a shared element in the view flies back only if at least this share of it is in sight (site value)

  /* --------------------------------------------------------------- helpers */
  const px = (v) => parseFloat(v) || 0;
  const emit = (el, name, detail) => el.dispatchEvent(new CustomEvent(name, { bubbles: true, detail: detail || {} }));
  const canAnimate = (el) => !!el && typeof el.animate === "function";
  const NONE = (v) => !v || v === "none";
  const tf = (p) => "translate(" + p.x.toFixed(2) + "px, " + p.y.toFixed(2) + "px) scale(" + p.s.toFixed(5) + ")";

  /** The CSS timing of a token: { duration (ms), easing }, cached (a spring's linear() curve is costly to build). */
  const timings = new Map();
  function css(path) {
    const key = path + "|" + Site.tempo;
    let t = timings.get(key);
    if (!t) timings.set(key, (t = Site.css(path)));
    return t;
  }
  /** Share of a spring's way done at `ms` (for "landed within half a pixel"): the generator behind its curve. */
  const progressFns = new Map();
  function progressOf(path) {
    const key = path + "|" + Site.tempo;
    if (progressFns.has(key)) return progressFns.get(key);
    const M = window.Motion;
    let fn = null;
    const t = Site.t(path);
    if (M && M.createGeneratorEasing && t.type === "spring") {
      const g = M.createGeneratorEasing(t, 100, M.spring);
      const d = g.duration * 1000;
      fn = (ms) => (ms >= d ? 1 : g.ease(Math.max(0, ms) / d));
    }
    progressFns.set(key, fn);
    return fn;
  }

  /** An element's unscaled layout size (an <svg> has no offsetWidth). */
  function layoutSize(el) {
    if (el.offsetWidth !== undefined && !(el instanceof SVGElement)) return { w: el.offsetWidth, h: el.offsetHeight };
    const st = getComputedStyle(el);
    const w = px(st.width);
    const h = px(st.height);
    if (w && h) return { w: w, h: h };
    const r = el.getBoundingClientRect();
    return { w: r.width, h: r.height };
  }
  const isFigure = (n) => n.matches("svg, img, picture, video, canvas") || !!n.querySelector("svg, img, picture, video, canvas");
  const shown = (r) => r.width > 0.5 && r.height > 0.5;
  const onScreen = (r) => shown(r) && r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < doc.documentElement.clientWidth;

  /* A flying copy keeps the look of its original wherever it is put: the computed values that context selectors
     and inheritance gave it are written on the copy. */
  const ROOT_PROPS = [
    "color", "font-family", "font-size", "font-weight", "font-style", "font-stretch", "font-variant-numeric", "font-feature-settings",
    "line-height", "letter-spacing", "word-spacing", "text-transform", "text-align", "white-space", "text-wrap", "text-decoration-line",
    "fill", "stroke", "stroke-width", "background-color", "box-sizing",
    "padding-top", "padding-right", "padding-bottom", "padding-left",
    "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
    "border-top-style", "border-right-style", "border-bottom-style", "border-left-style",
    "border-top-color", "border-right-color", "border-bottom-color", "border-left-color",
    "border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius",
    "object-fit", "object-position", "overflow",
  ];
  const CHILD_PROPS = ["color", "fill", "stroke", "stroke-width", "opacity", "font-family", "font-size", "font-weight", "font-style", "letter-spacing", "visibility"];

  function freeze(copy, original) {
    const st = getComputedStyle(original);
    ROOT_PROPS.forEach((p) => copy.style.setProperty(p, st.getPropertyValue(p)));
    const a = original.querySelectorAll("*");
    const b = copy.querySelectorAll("*");
    for (let i = 0; i < a.length && i < b.length && i < FROZEN_MAX; i++) {
      const s = getComputedStyle(a[i]);
      CHILD_PROPS.forEach((p) => b[i].style.setProperty(p, s.getPropertyValue(p)));
    }
  }
  function copyOf(original, size) {
    const copy = original.cloneNode(true);
    // read its look as it shows (an original whose copy flew before is hidden meanwhile)
    const away = original.classList.contains("k-expand-away");
    if (away) original.classList.remove("k-expand-away");
    freeze(copy, original);
    if (away) original.classList.add("k-expand-away");
    [copy].concat(Array.prototype.slice.call(copy.querySelectorAll("[id], [data-kit], [data-shared]"))).forEach((n) => {
      n.removeAttribute("id");
      n.removeAttribute("data-kit");
      n.removeAttribute("data-shared");
    });
    copy.classList.add("k-expand__flyer");
    copy.classList.remove("k-expand-away");
    copy.setAttribute("aria-hidden", "true");
    copy.style.setProperty("display", copy instanceof SVGElement || /^(IMG|CANVAS|VIDEO)$/.test(copy.tagName) ? "block" : getComputedStyle(original).display === "inline" ? "inline-block" : getComputedStyle(original).display);
    copy.style.setProperty("width", size.w + "px");
    copy.style.setProperty("height", size.h + "px");
    copy.style.setProperty("visibility", "visible");
    copy.style.setProperty("translate", "none");
    copy.style.setProperty("scale", "none");
    copy.style.setProperty("rotate", "none");
    return copy;
  }

  /* ------------------------------------------------------------- the view
   * One view for the page, built on first use:
   *   .k-expand (fixed, a grid that centres the frame; --k-expand-* hooks; the trigger's data-expand-class)
   *     .k-expand__scrim
   *     .k-expand__frame (sized by the hooks; its ::before is the shadow, shown once the panel has landed)
   *       .k-expand__panel[role=dialog][aria-modal] > .k-expand__close + .k-expand__body (scrolls) > content
   *     .k-expand__flight (the flying copies)
   */
  let view = null;
  function build() {
    const root = doc.createElement("div");
    root.className = "k-expand";
    root.hidden = true;
    root.innerHTML =
      '<div class="k-expand__scrim"></div>' +
      '<div class="k-expand__frame"><div class="k-expand__panel" role="dialog" aria-modal="true" tabindex="-1">' +
      '<button type="button" class="k-expand__close icon-btn" data-kit="press" aria-label="Close">' +
      '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>' +
      "</button>" +
      '<div class="k-expand__body"></div></div></div>' +
      '<div class="k-expand__flight" aria-hidden="true"></div>';
    doc.body.appendChild(root);
    view = {
      root: root,
      scrim: root.querySelector(".k-expand__scrim"),
      frame: root.querySelector(".k-expand__frame"),
      panel: root.querySelector(".k-expand__panel"),
      close: root.querySelector(".k-expand__close"),
      body: root.querySelector(".k-expand__body"),
      flight: root.querySelector(".k-expand__flight"),
    };
    Site.init(view.close);
    view.close.addEventListener("click", () => current && current.close());
    root.addEventListener("click", (e) => {
      if (current && !view.frame.contains(e.target)) current.close();
    });
    return view;
  }

  let current = null; // the session open, opening or closing

  /* ------------------------------------------------------------ a session
   * Everything one open view needs, from the click to the moment it has gone back. go(true / false) takes every
   * moving part (panel clip, flying copies, the view's content, scrim) from where it is to the open or the closed
   * state, so a close during the opening (Escape) and an open during the closing turn round without a jump.
   */
  function Session(trigger, source, opts) {
    const v = view || build();
    const s = this;
    s.trigger = trigger;
    s.state = "closed"; // opening | open | closing | closed
    s.pairs = [];
    s.items = [];
    s.anims = { panel: null, surface: null, frame: null, items: [] };
    s.classes = String(opts.expandClass || "").split(/\s+/).filter(Boolean);
    let placeholder = null;
    let content = null;
    let inerted = [];
    let watch = null;
    let landTimer = 0;

    /* ---- content in and out ---- */
    function mount() {
      v.body.textContent = "";
      v.body.scrollTop = 0;
      if (source.tagName === "TEMPLATE") {
        v.body.appendChild(source.content.cloneNode(true));
        content = null;
      } else {
        placeholder = doc.createComment("k-expand");
        source.before(placeholder);
        v.body.appendChild(source);
        source.hidden = false;
        content = source;
      }
      s.classes.forEach((c) => v.root.classList.add(c));
      // the dialog's name: the shared title, else the trigger's own words
      const title = v.body.querySelector('[data-shared="title"]');
      if (title) {
        if (!title.id) title.id = Site.util.uid("k-expand-title");
        v.panel.setAttribute("aria-labelledby", title.id);
        v.panel.removeAttribute("aria-label");
      } else {
        v.panel.removeAttribute("aria-labelledby");
        v.panel.setAttribute("aria-label", opts.expandLabel || trigger.getAttribute("aria-label") || trigger.textContent.trim().slice(0, 80) || "Details");
      }
      if (!content) Site.init(v.body);
    }
    function unmount() {
      if (content) {
        content.hidden = true;
        placeholder.replaceWith(content);
        placeholder = null;
        content = null;
      } else {
        Site.destroy(v.body);
      }
      v.body.textContent = "";
      s.classes.forEach((c) => v.root.classList.remove(c));
    }

    /* ---- the rest of the page while the view is open ---- */
    function shutPage(on) {
      if (on) {
        inerted = Array.prototype.filter.call(doc.body.children, (n) => n !== v.root && !n.inert && n.tagName !== "SCRIPT");
        inerted.forEach((n) => (n.inert = true));
      } else {
        inerted.forEach((n) => (n.inert = false));
        inerted = [];
      }
    }

    /* ---- shared elements ---- */
    function findPairs() {
      s.pairs = [];
      Array.prototype.forEach.call(v.body.querySelectorAll("[data-shared]"), (dst) => {
        const name = dst.getAttribute("data-shared");
        const src = Array.prototype.find.call(trigger.querySelectorAll("[data-shared]"), (n) => n.getAttribute("data-shared") === name);
        if (!src) return;
        const figure = isFigure(dst) || isFigure(src);
        const mode = dst.getAttribute("data-shared-mode") || src.getAttribute("data-shared-mode");
        s.pairs.push({ name: name, src: src, dst: dst, figure: figure, mode: mode, copies: null });
      });
    }
    /** How a copy of layout size (w, h) covers a box: uniform scale; figures are fitted and centred, text keeps its font size ratio and its start edge. */
    function pose(copy, box, fontPx) {
      let k;
      if (!copy.figure && fontPx && copy.fs) k = fontPx / copy.fs;
      else k = Math.min(box.width / copy.w, box.height / copy.h);
      if (!(k > 0) || !isFinite(k)) k = 1;
      return {
        x: copy.figure ? box.left + (box.width - copy.w * k) / 2 : box.left,
        y: box.top + (box.height - copy.h * k) / 2,
        s: k,
      };
    }
    /** An element's box on screen and its font size as drawn (its own font size times the scale it is drawn at). */
    function seen(el) {
      const r = el.getBoundingClientRect();
      const size = layoutSize(el);
      const k = size.w ? r.width / size.w : 1;
      return { rect: r, font: px(getComputedStyle(el).fontSize) * k };
    }
    /** The copies of one pair: one (same shape: a copy of what the trigger shows) or two cross-fading (different shapes). */
    function makeCopies(pair) {
      const same =
        pair.mode === "move" ||
        (pair.mode !== "fade" &&
          (pair.figure
            ? (() => {
                const a = layoutSize(pair.src);
                const b = layoutSize(pair.dst);
                return Math.abs(Math.log(a.w / a.h / (b.w / b.h))) < SAME_SHAPE;
              })()
            : pair.src.textContent.trim() === pair.dst.textContent.trim() && getComputedStyle(pair.src).fontFamily === getComputedStyle(pair.dst).fontFamily));
      const list = (same ? [pair.src] : [pair.src, pair.dst]).map((original) => {
        const size = layoutSize(original);
        const node = copyOf(original, size);
        v.flight.appendChild(node);
        return { node: node, of: original === pair.src ? "src" : "dst", w: size.w, h: size.h, fs: px(getComputedStyle(original).fontSize), figure: pair.figure, move: null, fade: null };
      });
      pair.copies = list;
      pair.same = same;
      return list;
    }
    function dropCopies(pair) {
      if (!pair.copies) return;
      pair.copies.forEach((c) => {
        if (c.move) c.move.cancel();
        if (c.fade) c.fade.cancel();
        c.node.remove();
      });
      pair.copies = null;
    }

    /* ---- the panel's clip: the trigger's box in the panel's coordinates ---- */
    function clipFor(rect, radius) {
      const p = v.panel.getBoundingClientRect();
      const r = radius == null ? px(getComputedStyle(v.panel).borderTopLeftRadius) : radius;
      return "inset(" + [rect.top - p.top, p.right - rect.right, p.bottom - rect.bottom, rect.left - p.left].map((n) => n.toFixed(1) + "px").join(" ") + " round " + r.toFixed(1) + "px)";
    }
    function triggerRadius(rect) {
      const st = getComputedStyle(trigger);
      const corner = st.borderTopLeftRadius.split(" ")[0];
      const size = layoutSize(trigger);
      const k = size.w ? rect.width / size.w : 1;
      return (corner.endsWith("%") ? (parseFloat(corner) / 100) * Math.min(size.w, size.h) : px(corner)) * k;
    }

    /* ---- the content of the view that is not shared ---- */
    function findItems() {
      const marked = v.body.querySelectorAll("[data-expand-item]");
      let list;
      if (marked.length) list = Array.prototype.slice.call(marked);
      else {
        // the content's blocks; a block that holds a shared element is opened up into its own blocks
        const open = (nodes) => {
          const out = [];
          nodes.forEach((n) => {
            if (n.matches("[data-shared]")) return;
            if (n.children.length && n.querySelector("[data-shared]")) out.push.apply(out, open(Array.prototype.slice.call(n.children)));
            else out.push(n);
          });
          return out;
        };
        let box = v.body;
        while (box.children.length === 1 && box.firstElementChild.children.length && !box.firstElementChild.matches("[data-shared]")) box = box.firstElementChild;
        list = open(Array.prototype.slice.call(box.children));
      }
      s.items = [v.close].concat(list);
    }

    /* ---- moving everything ---- */
    function stopAll() {
      if (s.anims.panel) s.anims.panel.cancel();
      if (s.anims.surface) s.anims.surface.cancel();
      if (s.anims.frame) s.anims.frame.cancel();
      s.anims.items.forEach((a) => a.cancel());
      s.anims = { panel: null, surface: null, frame: null, items: [] };
    }

    /** The view at rest, open: nothing left on it. */
    function landOpen() {
      if (s.state !== "opening") return;
      clearTimeout(landTimer);
      s.state = "open";
      if (s.anims.panel) s.anims.panel.cancel();
      if (s.anims.surface) s.anims.surface.cancel();
      s.anims.panel = s.anims.surface = null;
      v.root.classList.add("is-landed");
      s.pairs.forEach((pair) => {
        pair.dst.classList.remove("k-expand-away");
        if (!pair.copies) return;
        const copies = pair.copies;
        pair.copies = null;
        // the real one is there now; a copy of the trigger's look fades off it (one of the view's own goes at once)
        copies.forEach((c) => {
          if (c.move) c.move.cancel();
          if (c.of === "src" && pair.same && !env.reduce) {
            c.node.style.transform = tf(c.end);
            const t = css("transition.swap");
            const a = c.node.animate([{ opacity: 1 }, { opacity: 0 }], { duration: t.duration, easing: t.easing, fill: "both" });
            a.finished.then(() => c.node.remove(), () => c.node.remove());
          } else c.node.remove();
        });
      });
      emit(trigger, "kit:expand-opened", { panel: v.panel, body: v.body });
    }

    /** The view gone: the page as it was. */
    function finish() {
      clearTimeout(landTimer);
      doc.removeEventListener("keydown", onKey, true);
      stopAll();
      s.pairs.forEach((pair) => {
        dropCopies(pair);
        pair.src.classList.remove("k-expand-away");
        pair.dst.classList.remove("k-expand-away");
      });
      s.pairs = [];
      v.root.hidden = true;
      v.root.classList.remove("is-open", "is-landed", "is-closing");
      v.panel.style.clipPath = "";
      unmount();
      if (watch) watch();
      watch = null;
      s.state = "closed";
      if (current === s) current = null;
      if (Site.modal) Site.modal.close("expand");
      emit(trigger, "kit:expand-closed", {});
    }

    /** Call done once the moving parts stay within half a pixel of their place (a spring's tail is long, and one
        that overshoots passes its place before it rests). */
    function whenLanded(token, distance, started, done) {
      const at = progressOf(token);
      const t = css(token);
      let settle = t.duration;
      if (at) {
        settle = 0;
        for (let ms = t.duration; ms > 0; ms -= 8)
          if (Math.abs(1 - at(ms)) * distance >= 0.5) {
            settle = ms + 8;
            break;
          }
      }
      const phase = s.state;
      clearTimeout(landTimer);
      landTimer = setTimeout(() => s.state === phase && done(), Math.max(0, settle - (performance.now() - started)));
    }

    function go(open) {
      const reduce = env.reduce;
      const token = open ? OPEN : CLOSE;
      const t = css(token);
      const started = performance.now();
      v.root.classList.toggle("is-open", open);
      v.root.classList.toggle("is-closing", !open);
      if (!open) v.root.classList.remove("is-landed");
      if (env.static || !canAnimate(v.panel)) return open ? landOpen() : finish();

      // where the trigger is seen now; gone or off screen, the view closes in place
      const trig = trigger.isConnected ? trigger.getBoundingClientRect() : null;
      const home = !!trig && onScreen(trig) && !reduce;
      let distance = 0;

      if (reduce || (!open && !home)) {
        // a fade (reduced motion), or a close with nowhere to go back to: the frame fades (and settles a little) in place
        stopAll();
        s.pairs.forEach(dropCopies);
        s.pairs.forEach((pair) => {
          pair.dst.classList.remove("k-expand-away");
          if (!open) pair.src.classList.remove("k-expand-away");
        });
        v.panel.style.clipPath = "";
        const f = css(open ? "transition.fade" : "transition.dismiss");
        const from = getComputedStyle(v.frame).opacity;
        const frames = [{ opacity: open && s.fresh ? 0 : from }, { opacity: open ? 1 : 0 }];
        if (!reduce) {
          frames[0].transform = "scale(1)";
          frames[1].transform = "scale(" + tokens.scale.toast + ")";
        }
        s.anims.frame = v.frame.animate(frames, { duration: f.duration, easing: f.easing, fill: "both" });
        s.fresh = false;
        const mine = s.anims.frame;
        mine.finished.then(
          () => {
            if (s.anims.frame !== mine) return;
            if (open) {
              mine.cancel();
              s.anims.frame = null;
              landOpen();
            } else finish();
          },
          () => {},
        );
        return;
      }

      // the panel grows out of (or back into) the trigger's box
      const pr = v.panel.getBoundingClientRect();
      const closedClip = clipFor(trig, triggerRadius(trig));
      const openClip = "inset(0px 0px 0px 0px round " + px(getComputedStyle(v.panel).borderTopLeftRadius).toFixed(1) + "px)";
      const nowClip = s.fresh ? closedClip : getComputedStyle(v.panel).clipPath;
      const previous = s.anims.panel;
      s.anims.panel = v.panel.animate([{ clipPath: NONE(nowClip) ? openClip : nowClip }, { clipPath: open ? openClip : closedClip }], {
        duration: t.duration,
        easing: t.easing,
        fill: "both",
      });
      if (previous) previous.cancel();
      // its surface comes in at once and, going back, melts into the trigger as it arrives (a trigger drawn tilted
      // is a different shape from the box the panel shrinks to)
      const nowOpacity = s.fresh ? "0" : getComputedStyle(v.panel).opacity;
      const fade = open ? css("transition.fade") : { duration: CLOSE_FADE * 1000 * Site.tempo, easing: "cubic-bezier(" + tokens.ease.in.join(",") + ")" };
      const previousSurface = s.anims.surface;
      s.anims.surface = v.panel.animate([{ opacity: nowOpacity }, { opacity: open ? 1 : 0 }], { duration: fade.duration, easing: fade.easing, fill: "both" });
      if (previousSurface) previousSurface.cancel();
      distance = Math.max(distance, Math.abs(trig.left - pr.left), Math.abs(trig.top - pr.top), Math.abs(trig.right - pr.right), Math.abs(trig.bottom - pr.bottom));

      // the shared elements fly
      const bodyBox = v.body.getBoundingClientRect();
      s.pairs.forEach((pair) => {
        const a = seen(pair.src);
        const b = seen(pair.dst);
        const inSight = Math.max(0, Math.min(b.rect.bottom, bodyBox.bottom) - Math.max(b.rect.top, bodyBox.top)) / (b.rect.height || 1);
        const visible = shown(a.rect) && shown(b.rect) && (s.fresh || pair.copies || inSight >= SEEN_SHARE);
        if (!visible) {
          // nothing to fly between: the real ones simply show
          dropCopies(pair);
          pair.dst.classList.remove("k-expand-away");
          if (!open) pair.src.classList.remove("k-expand-away");
          return;
        }
        const fresh = !pair.copies;
        const copies = pair.copies || makeCopies(pair); // copied while the originals still show
        pair.src.classList.add("k-expand-away");
        pair.dst.classList.add("k-expand-away");
        copies.forEach((c) => {
          c.start = pose(c, a.rect, a.font);
          c.end = pose(c, b.rect, b.font);
          const target = open ? c.end : c.start;
          const from = fresh ? tf(open ? c.start : c.end) : getComputedStyle(c.node).transform;
          const prevMove = c.move;
          c.move = c.node.animate([{ transform: from }, { transform: tf(target) }], { duration: t.duration, easing: t.easing, fill: "both" });
          if (prevMove) prevMove.cancel();
          distance = Math.max(distance, Math.abs(c.start.x - c.end.x), Math.abs(c.start.y - c.end.y), Math.abs(c.start.s - c.end.s) * Math.max(c.w, c.h));
          // two shapes: the trigger's look gives way to the view's over the first part of the way
          if (!pair.same) {
            // the one going gives way quickly (transition.swap), the one coming arrives over the way (transition.reveal)
            const show = (c.of === "dst") === open;
            const f = css(show ? "transition.reveal" : "transition.swap");
            const now = fresh ? (c.of === "src") === open ? 1 : 0 : getComputedStyle(c.node).opacity;
            const prevFade = c.fade;
            c.fade = c.node.animate([{ opacity: now }, { opacity: show ? 1 : 0 }], { duration: f.duration, easing: f.easing, fill: "both" });
            if (prevFade) prevFade.cancel();
          }
        });
      });

      // the view's own content: comes in after the panel, staggered; leaves quickly, all at once
      const old = s.anims.items;
      s.anims.items = [];
      s.items.forEach((item, i) => {
        const st = getComputedStyle(item);
        const opacity = s.fresh ? 0 : st.opacity;
        if (open) {
          // an item holding a shared element comes with the panel (its shared part is the flying copy meanwhile)
          const holds = !!item.querySelector("[data-shared]");
          const delay = holds ? 0 : (ITEM_DELAY + Math.min(i, ITEM_STEPS) * tokens.stagger.words) * 1000 * Site.tempo;
          const rv = css("transition.reveal");
          const sp = css("spring.entrance");
          const fresh = s.fresh;
          s.anims.items.push(
            item.animate(
              [
                { opacity: opacity, filter: fresh ? "blur(" + tokens.blur.surface + "px)" : st.filter === "none" ? "blur(0px)" : st.filter },
                { opacity: 1, filter: "blur(0px)" },
              ],
              { duration: rv.duration, easing: rv.easing, delay: fresh ? delay : 0, fill: "both" },
            ),
          );
          if (fresh)
            s.anims.items.push(item.animate([{ translate: "0 " + tokens.shift.rise + "px" }, { translate: "0 0" }], { duration: sp.duration, easing: sp.easing, delay: delay, fill: "backwards" }));
        } else {
          const sw = css("transition.swap");
          s.anims.items.push(item.animate([{ opacity: opacity }, { opacity: 0 }], { duration: sw.duration, easing: sw.easing, fill: "both" }));
        }
      });
      old.forEach((a) => a.cancel());
      s.fresh = false;

      whenLanded(token, distance, started, () => (open ? landOpen() : finish()));
    }
    /* ---- keys while open ---- */
    function focusables() {
      return Array.prototype.filter.call(
        v.panel.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'),
        (n) => n.getClientRects().length > 0 && !n.closest("[inert]"),
      );
    }
    function onKey(e) {
      if (s.state === "closed" || s.state === "closing") return;
      if (e.key === "Escape") {
        e.preventDefault();
        s.close();
      } else if (e.key === "Tab") {
        const list = focusables();
        if (!list.length) return e.preventDefault();
        const first = list[0];
        const last = list[list.length - 1];
        const inside = v.panel.contains(doc.activeElement);
        if (e.shiftKey && (doc.activeElement === first || !inside)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (doc.activeElement === last || !inside)) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    /* ---- the controller ---- */
    s.open = function () {
      if (s.state === "open" || s.state === "opening") return;
      if (current && current !== s) current.finishNow();
      current = s;
      const again = s.state === "closing";
      s.state = "opening";
      if (!again) {
        s.fresh = true;
        mount();
        v.root.hidden = false;
        if (Site.modal) Site.modal.open("expand", { lock: true });
        findPairs();
        findItems();
        doc.addEventListener("keydown", onKey, true);
        watch = Site.on("resize", () => {
          // a new layout in flight: the moving parts are simply where they go
          if (s.state === "opening") landOpen();
          else if (s.state === "closing") finish();
        });
        if (Site.tooltip && Site.tooltip.hide) Site.tooltip.hide();
      }
      shutPage(true);
      emit(trigger, "kit:expand-open", { panel: v.panel, body: v.body });
      void v.root.offsetWidth; // the scrim's closed state is painted first, so it fades in
      go(true);
      v.close.focus({ preventScroll: true });
    };
    s.close = function () {
      if (s.state !== "open" && s.state !== "opening") return;
      s.state = "closing";
      emit(trigger, "kit:expand-close", {});
      shutPage(false);
      // focus goes back as it starts closing, not once it has gone (rule A17)
      if (trigger.isConnected) trigger.focus({ preventScroll: true });
      go(false);
    };
    s.finishNow = function () {
      if (s.state === "closed") return;
      if (s.state !== "closing") {
        shutPage(false);
        emit(trigger, "kit:expand-close", {});
      }
      finish();
    };
  }

  /* ------------------------------------------------------------- the kit */
  Site.register("expand", function (el, opts) {
    const ref = typeof opts.expand === "string" && opts.expand ? opts.expand : el.getAttribute("aria-controls") ? "#" + el.getAttribute("aria-controls") : "";
    let source = null;
    try {
      source = ref ? doc.querySelector(ref) : null;
    } catch (e) {
      source = null;
    }
    if (!source) return null;
    const native = /^(A|BUTTON)$/.test(el.tagName);
    const added = [];
    const set = (name, value) => {
      if (el.hasAttribute(name)) return;
      el.setAttribute(name, value);
      added.push(name);
    };
    if (!native) {
      set("role", "button");
      set("tabindex", "0");
    }
    set("aria-haspopup", "dialog");
    let session = null;
    const sessionOf = () => session || (session = new Session(el, source, opts));

    const onClick = (e) => {
      // a modified click (new tab, new window) follows the link as usual
      if (e.defaultPrevented || e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      sessionOf().open();
    };
    const onKey = (e) => {
      if (native || e.target !== el || (e.key !== "Enter" && e.key !== " ")) return;
      e.preventDefault();
      sessionOf().open();
    };
    el.addEventListener("click", onClick);
    el.addEventListener("keydown", onKey);

    return {
      open: () => sessionOf().open(),
      close: () => session && session.close(),
      get isOpen() {
        return !!session && (session.state === "open" || session.state === "opening");
      },
      destroy() {
        if (session) session.finishNow();
        el.removeEventListener("click", onClick);
        el.removeEventListener("keydown", onKey);
        added.forEach((name) => el.removeAttribute(name));
      },
    };
  });

  /** Close the view that is open (if any). */
  Site.expand = {
    close: () => current && current.close(),
    get current() {
      return current ? current.trigger : null;
    },
  };
})();
