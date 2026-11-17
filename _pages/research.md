---
layout: default
permalink: /research/
title: Research
description: Cryptographic engineering, GPU computing and efficient hardware, from algorithms down to silicon.
nav: true
nav_order: 1
v2: true
site_css: [research, diagrams]
site_js: [research, diagrams]
---

{%- comment -%}
  The research page. Everything it shows comes from _data/research.yml (areas), _data/highlights.yml (results),
  _data/software.yml (repositories), _data/grants.yml (funded projects) and the bibliography (paper counts);
  the markup is in _includes/site/research_*.liquid, the looks in assets/css/site/research.css, the behaviour in
  assets/js/site/research.js.
{%- endcomment -%}

{% include site/research_head.liquid %}

{% include site/research_areas.liquid %}

{% include site/research_results.liquid %}

{% include site/research_software.liquid %}

{% include site/research_projects.liquid %}
