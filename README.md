# sunder
Add some literal crunch to your game! This D&D 5e module breaks weapons on fumbles and breaks armor on crits, both with customizable thresholds. Repair items by clicking the hammer icon in the item's header or by using a macro. Whether you're running a gritty campaign or just want gear to feel more dynamic, Sunder has you covered.

## Features
- **Breakage Mechanics**: Triggers weapon breakage on low rolls and armor/shield breakage on high rolls with configurable thresholds. You can enable or disable either feature
- **Two-Stage Breakage**: Items transition from Undamaged → Damaged → Broken). Durability decrements by 1 per hit until reaching 0. At durability 0, the item is broken
- **Durability Tracking**: Assigns durability based on item rarity, reducing it on failed breakage rolls
- **Heavy Weapon Bonus**: Adds a configurable bonus to breakage rolls for heavy weapons
- **Repair System**: Adds a "Repair" button to item sheets (GM-only), with costs based on a percentage of the original price, doubled for broken items, and deducts gold from PCs if available
- **Penalties**: Applies attack roll penalties to damaged/broken weapons and AC penalties to damaged/broken armor, doubling for broken states
- **Audio Feedback**: Plays customizable sounds for breakage attempts, successes, and failures
- **Localization**: Fully supports translations through en.json
- **UI Enhancements**: Breakage popup with item preview and color-coded status (orange for Damaged)
- **Targeting Logic**: Prioritizes shields, skips broken items, and supports both vanilla D&D 5e and MIDI QOL workflows. Defender rolls breakage checks to resist sundering on high rolls
- **Macro Included**: Bundles a "Repair Macro" for quick breakage or repair actions on selected tokens
