---
layout: default
title: Component kit
permalink: /kit/
description: Test page for the site's motion components. Not linked from the navigation.
v2: true
bare: true
noindex: true
sitemap: false
site_css: [kit-demo]
---

<div class="wrap kitpage">
  <header class="kitpage__head">
    <p class="t-label">Internal test page</p>
    <h1 class="t-d1">Component kit</h1>
    <p class="t-muted measure">Every motion component of the site, in isolation. Add <code>?static</code> to the address to see the final states without animation.</p>
    <p><button type="button" class="btn btn--ghost btn--small" onclick="var r=document.documentElement;var d=r.getAttribute('data-theme')==='dark';r.setAttribute('data-theme',d?'light':'dark')">Switch theme</button></p>
  </header>
  {% include site/kit/text.liquid %}
  {% include site/kit/pointer.liquid %}
  {% include site/kit/scroll.liquid %}
  {% include site/kit/icons.liquid %}
</div>
