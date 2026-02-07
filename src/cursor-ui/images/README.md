# Иконки экипировки

Используется спрайт `icons_full_16.png` с CDN. Для офлайн-режима скачайте в эту папку:

```
https://cdn.jsdelivr.net/gh/kaansoral/adventureland@main/images/misc/icons_full_16.png
```

И переключите в `BotCard.vue` константу `ICONS_SHEET` на `import iconsSheet from '../../images/icons_full_16.png'` и подставьте `iconsSheet` в `spriteStyle`.

Маппинг предмет → [col, row] в `ITEM_POSITIONS` (по умолчанию [0,0]). При наличии `G.positions` из data.js можно заполнить точные координаты.
