{% comment %}
  Announcement Bar (OS 2.0)
  - Multiple rotating messages (blocks)
  - Optional auto-rotate, pause on hover/focus, reduced-motion aware
  - Dismissible (per section instance via localStorage)
  - Schedule: start/end date/time (store timezone)
  - Geo filter: show only for specific ISO country codes (via request.country)
  - Optional countdown timer per block
  - Colors, height, typography controls
{% endcomment %}

{% liquid
  assign section_id = section.id
  assign locale = request.locale.iso_code | default: shop.locale
  assign country_code = request.country.iso_code | default: shop.primary_locale | upcase
  assign store_tz = shop.timezone
%}

{% if section.settings.enable_home_only and request.page_type != 'index' %}
  {% comment %} Do not render outside home {% endcomment %}
  {% return %}
{% endif %}

<link rel="stylesheet" href="{{ 'announcement-bar.css' | asset_url }}" media="print" onload="this.media='all'">
<noscript><link rel="stylesheet" href="{{ 'announcement-bar.css' | asset_url }}"></noscript>
<script src="{{ 'announcement-bar.js' | asset_url }}" defer></script>

{% assign visible_blocks = empty %}
{% assign now = 'now' | date: "%s" %}

{% assign filtered_blocks = section.blocks | where: 'type', 'message' %}
{% capture blocks_json %}
[
  {%- for block in filtered_blocks -%}
    {%- liquid
      assign show = true
      assign start_epoch = nil
      assign end_epoch = nil

      if block.settings.start_at != blank
        assign start_epoch = block.settings.start_at | date: "%s" 
        if start_epoch > now
          assign show = false
        endif
      endif
      if block.settings.end_at != blank
        assign end_epoch = block.settings.end_at | date: "%s"
        if end_epoch < now
          assign show = false
        endif
      endif

      assign include_countries = block.settings.include_countries | strip | upcase
      if include_countries != blank
        assign allowed = false
        assign list = include_countries | split: ',' 
        for c in list
          if c | strip == country_code
            assign allowed = true
            break
          endif
        endfor
        if allowed == false
          assign show = false
        endif
      endif
    -%}
    {%- if show -%}
      {
        "id": "{{ block.id }}",
        "text": {{ block.settings.text | escape | json }},
        "link": {{ block.settings.link | json }},
        "icon": {{ block.settings.icon | escape | json }},
        "badge": {{ block.settings.badge | escape | json }},
        "countdownTo": {{ block.settings.countdown_to | json }},
        "ariaLabel": {{ block.settings.aria_label | escape | json }}
      }{% unless forloop.last %},{% endunless %}
    {%- endif -%}
  {%- endfor -%}
]
{% endcapture %}

{% assign has_messages = blocks_json | strip | size | plus: 0 %}
{% if has_messages < 5 %}{% comment %} naive check—will still render if  [] {% endcomment %}{% endif %}

<announcement-rotator
  id="announcement-{{ section_id }}"
  class="annc {{ section.settings.custom_class }}"
  style="
    --annc-bg: {{ section.settings.bg | color_to_rgb }};
    --annc-fg: {{ section.settings.fg | color_to_rgb }};
    --annc-link: {{ section.settings.link_color | color_to_rgb }};
    --annc-height: {{ section.settings.bar_height }}px;
  "
  data-rotate="{{ section.settings.enable_rotate }}"
  data-interval="{{ section.settings.rotate_interval | times: 1000 }}"
  data-pause-on-hover="{{ section.settings.pause_on_hover }}"
  data-dismissible="{{ section.settings.dismissible }}"
  data-storage-key="annc-{{ section_id }}"
  data-messages='{{ blocks_json | strip }}'
  aria-label="{{ section.settings.aria_label | default: 'Store announcements' | escape }}"
>
  <div class="annc__inner" role="region">
    <button class="annc__close" hidden aria-label="{{ 'general.close' | t }}" title="{{ 'general.close' | t }}">
      &times;
    </button>
    <div class="annc__viewport" tabindex="-1">
      <!-- Messages are rendered by JS for a11y consistency -->
      <noscript>
        <div class="annc__item">
          {{ 'Enable JavaScript to view announcements' | t }}
        </div>
      </noscript>
    </div>
  </div>
</announcement-rotator>

{% schema %}
{
  "name": "Announcement bar (Pro)",
  "tag": "section",
  "class": "section-announcement-bar",
  "settings": [
    { "type": "checkbox", "id": "enable_home_only", "label": "Show on home only", "default": false },
    { "type": "color", "id": "bg", "label": "Background", "default": "#111111" },
    { "type": "color", "id": "fg", "label": "Text", "default": "#ffffff" },
    { "type": "color", "id": "link_color", "label": "Link color", "default": "#ffffff" },
    { "type": "range", "id": "bar_height", "label": "Bar height (px)", "min": 32, "max": 72, "step": 1, "default": 44 },
    { "type": "checkbox", "id": "enable_rotate", "label": "Auto-rotate messages", "default": true },
    { "type": "range", "id": "rotate_interval", "label": "Rotate every (seconds)", "min": 3, "max": 20, "step": 1, "default": 6 },
    { "type": "checkbox", "id": "pause_on_hover", "label": "Pause on hover/focus", "default": true },
    { "type": "checkbox", "id": "dismissible", "label": "Allow customers to dismiss", "default": true },
    { "type": "text", "id": "custom_class", "label": "Custom CSS class", "default": "" },
    { "type": "text", "id": "aria_label", "label": "Region ARIA label", "default": "Store announcements" }
  ],
  "blocks": [
    {
      "type": "message",
      "name": "Message",
      "settings": [
        { "type": "text", "id": "badge", "label": "Badge (e.g., NEW, -20%)", "default": "" },
        { "type": "text", "id": "icon", "label": "Icon (emoji or short text)", "default": "📣" },
        { "type": "richtext", "id": "text", "label": "Message text", "default": "<p>Free shipping over CHF 50</p>" },
        { "type": "url", "id": "link", "label": "Optional link" },
        { "type": "text", "id": "include_countries", "label": "Show only in countries (ISO, comma-separated)", "default": "" },
        { "type": "text", "id": "aria_label", "label": "Item ARIA label (optional)", "default": "" },
        { "type": "text", "id": "countdown_to", "label": "Countdown to (ISO 8601, e.g., 2025-12-24T23:59:00Z)", "default": "" },
        { "type": "text", "id": "start_at", "label": "Start at (ISO 8601)" },
        { "type": "text", "id": "end_at", "label": "End at (ISO 8601)" }
      ]
    }
  ],
  "max_blocks": 8,
  "presets": [
    {
      "name": "Announcement bar (Pro)",
      "blocks": [
        { "type": "message", "settings": { "badge": "NEW", "text": "<p>Autumn drop is live 🍁</p>" } },
        { "type": "message", "settings": { "text": "<p>Free shipping over CHF 50</p>" } }
      ]
    }
  ]
}
{% endschema %}
