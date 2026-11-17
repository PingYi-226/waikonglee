---
layout: default
permalink: /kit/parts/
title: Shared parts
description: The pieces every page is built from, shown once so builders can see them work.
v2: true
noindex: true
sitemap: false
site_css: [kit-demo]
---
{%- comment -%} A living reference for page builders: the page head, section headers, captions, figures, rows and controls. {%- endcomment -%}
{% capture head_aside %}
  <figure class="partsdemo__fig">
    <div class="partsdemo__bars" data-inview aria-hidden="true">
      {%- for h in (1..12) -%}<i style="--h: {{ h | times: 37 | modulo: 100 | plus: 12 | divided_by: 112.0 }}; --i: {{ forloop.index0 }}"></i>{%- endfor -%}
    </div>
    <figcaption class="figcap"><span class="figcap__no">Fig. 1</span><span>A figure beside the title</span></figcaption>
  </figure>
{% endcapture %}
{% capture head_meta %}
  <dl class="partsdemo__stats">
    <div class="stat"><dt class="stat__label">papers</dt><dd class="stat__value"><span data-kit="sliding-number" data-value="90" data-delay="700">90</span></dd></div>
    <div class="stat"><dt class="stat__label">citations</dt><dd class="stat__value"><span data-kit="sliding-number" data-value="2801" data-delay="700">2,801</span></dd></div>
  </dl>
  <div class="partsdemo__chips" data-kit="highlight" data-mode="selection" data-items=".chip">
    <button type="button" class="chip" aria-pressed="true">All</button>
    <button type="button" class="chip" aria-pressed="false">Journals</button>
    <button type="button" class="chip" aria-pressed="false">Conferences</button>
  </div>
{% endcapture %}
{% include site/pagehead.liquid aside=head_aside meta=head_meta %}

<section class="section">
  <div class="wrap">
    <header class="sechead" data-inview>
      <h2 class="sechead__title">Section header</h2>
      <a class="link" href="{{ '/' | relative_url }}">A plain link</a>
    </header>
    <ul class="rows" data-kit="highlight reveal-group" data-mode="hover" data-items=".partsdemo__row">
      <li class="partsdemo__row"><span class="t-data">2026</span><span>A row in a hairline list; one surface glides between rows under the pointer.</span></li>
      <li class="partsdemo__row"><span class="t-data">2025</span><span>Dates, counts and identifiers are set in the data face.</span></li>
      <li class="partsdemo__row"><span class="t-data">2024</span><span>Rows arrive in reading order the first time they are seen.</span></li>
    </ul>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <header class="sechead" data-inview><h2 class="sechead__title">Controls</h2></header>
    <div class="partsdemo__controls">
      <a class="btn" href="#" data-kit="press ripple"><span data-kit="sliding-text">Primary button</span>{% include site/icon.liquid name="arrow-right" size=18 %}</a>
      <a class="btn btn--ghost" href="#" data-kit="press"><span data-kit="sliding-text">Ghost button</span></a>
      <a class="btn btn--ghost btn--small" href="#" data-kit="press">Small</a>
      <button type="button" class="icon-btn" data-kit="magnetic press tooltip" data-tip="An icon button" aria-label="Copy">{% include site/icon.liquid name="copy" %}</button>
      <span class="tag">A tag</span>
      <a class="link-arrow" href="#">An external link {% include site/icon.liquid name="arrow-up-right" size=16 %}</a>
      <span class="kbd">/</span>
      <label class="partsdemo__field"><span class="sr-only">Search</span><input class="field" type="search" placeholder="A field"></label>
    </div>
  </div>
</section>
