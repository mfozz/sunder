Sunder Module for Foundry VTT
Overview
Sunder is a module for the D&D 5e system in Foundry VTT that automates weapon and armor breakage with durability tracking, customizable penalties, and integration with attack rolls. It triggers breakage checks on fumbles (low rolls) or crits (high rolls), with options for dynamic penalties and repair costs.
Features

Automatic breakage checks on attack rolls (fumble or crit).
Durability tracking by item rarity.
Customizable penalties for damaged/broken items (attack rolls, AC).
Repair button on item sheets with cost calculation.
Sound effects for breakage and repair.
Custom hook for module integrations (sunder.breakageTriggered).
Optional "Always Check Sunder" for GM troubleshooting.

Installation

In Foundry VTT, go to the Add-on Modules tab.
Click "Install Module" and paste the manifest URL: https://github.com/mfozz/sunder/releases/latest/download/module.json.
Activate the module in your world.

Usage

Settings: Configure in Game Settings > Module Settings > Sunder.
Breakage: On a fumble (roll ≤ breakageThreshold) or crit (roll ≥ criticalBreakageThreshold), a popup prompts a breakage roll.
Repair: GM sees a repair button on damaged item sheets; costs based on original price and repair percentage.
Testing: Enable testingMode for console logs.

Settings Reference



Setting
Description
Type
Default



testingMode
Enables debug logging.
Boolean
false


enableWeaponBreakage
Enables breakage for weapons.
Boolean
true


enableArmorBreakage
Enables breakage for armor/shields.
Boolean
true


breakageThreshold
Fumble threshold for breakage.
Number (1-20)
1


criticalBreakageThreshold
Crit threshold for breakage.
Number (1-20)
20


breakageDC
DC for breakage roll.
Number (5-20)
10


durabilityByRarity
Durability by rarity (JSON).
String
{"common":1,"uncommon":2,"rare":3,"veryRare":4,"legendary":5}


weaponAttackPenalty
Penalty for damaged weapons.
Number (-5 to 0)
-2


armorACPenalty
Penalty for damaged armor.
Number (-5 to 0)
-2


enableDynamicACPenalties
Dynamic AC penalties based on item.
Boolean
true


heavyWeaponBonus
Bonus for heavy weapons on breakage roll.
Number (0-10)
2


repairPercentage
Repair cost percentage of original price.
Number (0-200)
50


breakageSound
Sound for breakage trigger.
String (audio path)
"sounds/combat/epic-turn-1hit.ogg"


breakagePassSound
Sound for breakage resistance.
String (audio path)
"sounds/combat/epic-turn-2hit.ogg"


breakageFailSound
Sound for breakage failure.
String (audio path)
"sounds/combat/epic-turn-2hit.ogg"


repairSound
Sound for repair.
String (audio path)
""


alwaysCheckSunder
Check Sunder on all rolls (GM override).
Boolean
false


Hooks

sunder.breakageTriggered: Called on breakage trigger. Data: { actor, item, type, penalty }.
Example: Hooks.on("sunder.breakageTriggered", (data) => { console.log(data); });.

Troubleshooting

No Breakage Popup: Ensure enableWeaponBreakage or enableArmorBreakage is on, and roll a fumble/crit.
Penalty Not Applying: Check item flag flags.sunder.attackPenalty via console: game.actors.get("actorId").items.get("itemId").getFlag("sunder", "attackPenalty").
Errors: Enable testingMode and share console logs.
Compatibility: Tested on Foundry VTT v13 with D&D 5e v5.0.4. MIDI-QOL optional for advanced workflows.

Development
The module is modular with ESM structure:

module.js: Entry point.
settings.js: Settings.
utils.js: Helpers.
breakage-handler.js: Breakage logic.
ui-hooks.js: UI rendering.
hooks.js: Hook registrations.
durability-config.js: Durability config app.
sunder-ui.js: UI popups and effects.

To contribute, fork the repo on GitHub.
License
MIT License.