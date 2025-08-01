# Sunder 


![Foundry Minimum Version](https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/mfozz/sunder/main/module.json&label=Foundry%20Version&query=$.compatibility.minimum&colorB=orange)
![Latest Release](https://img.shields.io/github/v/release/mfozz/sunder)
![Downloads](https://img.shields.io/github/downloads/mfozz/sunder/total)
[![Forge Installs](https://img.shields.io/badge/dynamic/json?label=Forge%20Installs&query=package.installs&suffix=%25&url=https%3A%2F%2Fforge-vtt.com%2Fapi%2Fbazaar%2Fpackage%2Fsunder&colorB=4aa94a)](https://forge-vtt.com/bazaar#package=sunder)   



**Why do I need this module?**  
-----------
Do you want your fights to feel more dyanamic by weapons and armor suddenly breaking in the middle of a fight? Do you wish that all those random shields and swords you picked up were finally useful? 

Now you can add some literal crunch to your game! This D&D 5e module breaks weapons on fumbles and breaks armor on crits, both with customizable thresholds. Repair items by clicking the hammer icon in the item's header or by using a macro. Whether you're running a gritty campaign or just want gear to feel more dynamic, Sunder has you covered.


<img src="https://github.com/user-attachments/assets/7416cf01-a9c7-4ec3-906c-14ebe6030b1b" alt="" width="30%">
<img src="https://github.com/user-attachments/assets/a039fe07-a350-474b-b3ea-0b93f4ba6fd5" alt="" width="30%">  
<img src="https://github.com/user-attachments/assets/ad008479-0427-4bc7-86bc-a14a9310f4ad" alt="" width="30%">

<br><br>
<img src="https://github.com/user-attachments/assets/4ef126ef-caf9-4a6f-8c36-3e5e913decd6" alt="" width="50%">  
<img src="https://github.com/user-attachments/assets/a7282651-ba92-41ac-b6f4-fecf5ee34e5a" alt="" width="50%">
<br><br>


<br><br>
<img src="https://github.com/user-attachments/assets/0f002dd4-8d20-470c-93c4-5e51265a7ff7" alt="" width="40%">
<img src="https://github.com/user-attachments/assets/427f2394-d62d-4cab-a926-b07ecd8e721e" alt="" width="40%">



## Features
- **Breakage Mechanics:** Trigger weapon breakage on low rolls and armor/shield breakage on high rolls with configurable thresholds.
- **Two-Stage Breakage:** Transition items from Undamaged → Damaged → Broken. Durability is based on rarity and decrements by 1 per hit until reaching 0. At durability 0, the item is broken.
- **Durability Tracking:** Assign durability based on item rarity, reducing it on failed breakage rolls.
- **Heavy Weapon Bonus:** Add a configurable bonus to breakage rolls for heavy weapons.
- **Repair System:** Use the "Repair" button on item sheets (GM-only), with costs based on a percentage of the original price, doubled for broken items, and deducted gold from PCs if available.
- **Penalties:** Apply attack-roll penalties to damaged/broken weapons and AC penalties to damaged/broken armor, doubling for broken states.
- **Audio Feedback:** Play customizable sounds for breakage attempts, successes, and failures.
- **Settings:** Adjust many aspects of the module to fit your needs.
- **Localization:** Support translations through en.json.
- **UI Enhancements:** Breakage popup shows an item preview with an icon and a color-coded status (orange for Damaged).
- **Targeting Logic:** Prioritize shields and skip broken items.
- **MIDI Support:** Use it with both the vanilla D&D 5e and MIDI QOL workflows.
- **Macro Included:** Use the bundled "Repair Macro" for quick repair actions on selected tokens or for PC visits to the blacksmith.
