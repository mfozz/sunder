# Sunder

![Foundry Minimum Version](https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/mfozz/sunder/main/module.json&label=Foundry%20Version&query=$.compatibility.minimum&colorB=orange)
![Latest Release](https://img.shields.io/github/v/release/mfozz/sunder)
![Downloads](https://img.shields.io/github/downloads/mfozz/sunder/total)
[![Forge Installs](https://img.shields.io/badge/dynamic/json?label=Forge%20Installs&query=package.installs&suffix=%25&url=https%3A%2F%2Fforge-vtt.com%2Fapi%2Fbazaar%2Fpackage%2Fsunder&colorB=4aa94a)](https://forge-vtt.com/bazaar#package=sunder)

---

## Why do I need this module?

Do you want your fights to feel more **dynamic**, with weapons and armor suddenly breaking mid-battle?  
Do you wish those random shields and swords you’ve been hauling around were finally useful?

Now you can add some literal *crunch* to your game!  
This D&D 5e module breaks weapons on fumbles and armor on crits, both with customizable thresholds.  
Repair items by clicking the hammer icon in the item header or using a macro. Whether you’re running a gritty campaign or just want gear to feel more alive, **Sunder** has you covered.

---

## Screenshots

![Popup Example](https://raw.githubusercontent.com/mfozz/sunder/main/media/popup-1.png)
![Popup Example 2](https://raw.githubusercontent.com/mfozz/sunder/main/media/popup-2.png)
![Popup Example 3](https://raw.githubusercontent.com/mfozz/sunder/main/media/popup-3.png)

![Item Sheet Example](https://raw.githubusercontent.com/mfozz/sunder/main/media/itemsheet-1.png)
![Item Sheet Example 2](https://raw.githubusercontent.com/mfozz/sunder/main/media/itemsheet-2.png)

![Durability Example](https://raw.githubusercontent.com/mfozz/sunder/main/media/durability-1.png)
![Durability Example 2](https://raw.githubusercontent.com/mfozz/sunder/main/media/durability-2.png)

---

## Features

- **Breakage Mechanics:** Trigger weapon breakage on low rolls and armor/shield breakage on high rolls with configurable thresholds.
- **Two-Stage Breakage:** Undamaged → Damaged → Broken. Durability decreases on failed breakage rolls until it reaches 0, at which point the item is broken.
- **Durability Tracking:** Base durability on item rarity; decrement on failed rolls.
- **Heavy Weapon Bonus:** Configurable bonus to breakage rolls for heavy weapons.
- **Repair System:** GM-only “Repair” button on item sheets; repair cost based on % of item price, doubled for broken items, with automatic gold deduction from PCs.
- **Penalties:** Apply attack roll penalties to damaged/broken weapons and AC penalties to damaged/broken armor, doubled for broken items.
- **Audio Feedback:** Customizable sounds for breakage attempts, successes, and failures.
- **Settings:** Fine-tune all aspects of the module to fit your table.
- **Localization:** Translation support via `en.json`.
- **UI Enhancements:** Breakage popup shows item preview with icon and color-coded status (orange for Damaged).
- **Targeting Logic:** Prioritize shields, skip broken items.
- **MIDI QOL Support:** Works with both vanilla D&D 5e and MIDI QOL workflows.
- **Macros Included:** Quickly repair items for all tokens (GM only), damage or break items, or repair for a cost (GM & players).

---
