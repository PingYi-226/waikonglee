---
layout: default
permalink: /cv/
title: CV
nav: true
nav_order: 5
description: Education, appointments and funded projects.
v2: true
site_css: [cv]
site_js: [cv]
---
{%- comment -%}
  The CV page, from _data/cv.yml (the same file the template's RenderCV layout read): the page head (title, summary, print button,
  profile links), the time axis (education and work in two lanes: _includes/site/cv_axis.liquid) and the ledgers with a sticky index
  (_includes/site/cv_sections.liquid). Looks: assets/css/site/cv.css (with the print stylesheet); behaviour: assets/js/site/cv.js.
{%- endcomment -%}
{%- assign cv = site.data.cv.cv -%}
{% capture head_aside %}
  <div class="cvcard">
    <p class="cvcard__name">{{ cv.name }}</p>
    <p class="cvcard__label">{{ cv.label }}</p>
    <p class="cvcard__line">{{ cv.location }}</p>
    <p class="cvcard__line"><a class="link" href="mailto:{{ cv.email }}">{{ cv.email }}</a></p>
  </div>
{% endcapture %}
{% capture head_meta %}
  <button type="button" class="btn btn--ghost cvprint js-only" data-kit="magnetic press ripple" data-inner=".cvprint__in" data-cv-print>
    <span class="cvprint__in">
      {%- include site/icon.liquid name="download" size="18" -%}
      <span data-kit="sliding-text">Print or save as PDF</span>
    </span>
  </button>
  {% include site/socials.liquid class="cvsocials" %}
{% endcapture %}
{% include site/pagehead.liquid title="Curriculum vitae" lede=cv.summary aside=head_aside meta=head_meta %}

{% include site/cv_axis.liquid %}

{% include site/cv_sections.liquid %}
