import * as utils from './utils.js';
import { DurabilityConfig } from './durability-config.js';

export function registerSettings() {
    const settings = [
        {
            key: "testingMode",
            name: "SUNDER.Settings.TestingMode.Name",
            hint: "SUNDER.Settings.TestingMode.Hint",
            scope: "world",
            config: true,
            type: Boolean,
            default: false
        },
        {
            key: "enableWeaponBreakage",
            name: "SUNDER.Settings.EnableWeaponBreakage.Name",
            hint: "SUNDER.Settings.EnableWeaponBreakage.Hint",
            scope: "world",
            config: true,
            type: Boolean,
            default: true
        },
        {
            key: "enableArmorBreakage",
            name: "SUNDER.Settings.EnableArmorBreakage.Name",
            hint: "SUNDER.Settings.EnableArmorBreakage.Hint",
            scope: "world",
            config: true,
            type: Boolean,
            default: true
        },
        {
            key: "breakageThreshold",
            name: "SUNDER.Settings.BreakageThreshold.Name",
            hint: "SUNDER.Settings.BreakageThreshold.Hint",
            scope: "world",
            config: true,
            type: Number,
            default: 1,
            range: { min: 1, max: 20, step: 1 }
        },
        {
            key: "criticalBreakageThreshold",
            name: "SUNDER.Settings.CriticalBreakageThreshold.Name",
            hint: "SUNDER.Settings.CriticalBreakageThreshold.Hint",
            scope: "world",
            config: true,
            type: Number,
            default: 20,
            range: { min: 1, max: 20, step: 1 }
        },
        {
            key: "breakageDC",
            name: "SUNDER.Settings.BreakageDC.Name",
            hint: "SUNDER.Settings.BreakageDC.Hint",
            scope: "world",
            config: true,
            type: Number,
            default: 10,
            range: { min: 5, max: 20, step: 1 }
        },
        {
            key: "durabilityByRarity",
            name: "SUNDER.Settings.DurabilityByRarity.Name",
            hint: "SUNDER.Settings.DurabilityByRarity.Hint",
            scope: "world",
            config: true,
            type: String,
            default: JSON.stringify({
                common: 1,
                uncommon: 2,
                rare: 3,
                veryRare: 4,
                legendary: 5
            }),
            onChange: (value) => {
                try {
                    JSON.parse(value);
                } catch (e) {
                    ui.notifications.error(game.i18n.localize("SUNDER.Notification.InvalidDurabilityJSON"));
                }
            }
        },
        {
            key: "weaponAttackPenalty",
            name: "SUNDER.Settings.WeaponAttackPenalty.Name",
            hint: "SUNDER.Settings.WeaponAttackPenalty.Hint",
            scope: "world",
            config: true,
            type: Number,
            default: -2,
            range: { min: -5, max: 0, step: 1 }
        },
        {
            key: "armorACPenalty",
            name: "SUNDER.Settings.ArmorACPenalty.Name",
            hint: "SUNDER.Settings.ArmorACPenalty.Hint",
            scope: "world",
            config: true,
            type: Number,
            default: -2,
            range: { min: -5, max: 0, step: 1 }
        },
        {
            key: "enableDynamicACPenalties",
            name: "SUNDER.Settings.EnableDynamicACPenalties.Name",
            hint: "SUNDER.Settings.EnableDynamicACPenalties.Hint",
            scope: "world",
            config: true,
            type: Boolean,
            default: true
        },
        {
            key: "heavyWeaponBonus",
            name: "SUNDER.Settings.HeavyWeaponBonus.Name",
            hint: "SUNDER.Settings.HeavyWeaponBonus.Hint",
            scope: "world",
            config: true,
            type: Number,
            default: 2,
            range: { min: 0, max: 10, step: 1 }
        },
        {
            key: "repairPercentage",
            name: "SUNDER.Settings.RepairCostPercentage.Name",
            hint: "SUNDER.Settings.RepairCostPercentage.Hint",
            scope: "world",
            config: true,
            type: Number,
            default: 50,
            range: { min: 0, max: 200, step: 1 }
        },
        {
            key: "breakageSound",
            name: "SUNDER.Settings.BreakageSound.Name",
            hint: "SUNDER.Settings.BreakageSound.Hint",
            scope: "world",
            config: true,
            type: String,
            filePicker: "audio",
            default: "sounds/combat/epic-turn-1hit.ogg"
        },
        {
            key: "breakagePassSound",
            name: "SUNDER.Settings.BreakagePassSound.Name",
            hint: "SUNDER.Settings.BreakagePassSound.Hint",
            scope: "world",
            config: true,
            type: String,
            filePicker: "audio",
            default: "sounds/combat/epic-turn-2hit.ogg"
        },
        {
            key: "breakageFailSound",
            name: "SUNDER.Settings.BreakageFailSound.Name",
            hint: "SUNDER.Settings.BreakageFailSound.Hint",
            scope: "world",
            config: true,
            type: String,
            filePicker: "audio",
            default: "sounds/combat/epic-turn-2hit.ogg"
        },
        {
            key: "repairSound",
            name: "SUNDER.Settings.RepairSound.Name",
            hint: "SUNDER.Settings.RepairSound.Hint",
            scope: "world",
            config: true,
            type: String,
            filePicker: "audio",
            default: ""
        },
        {
            key: "alwaysCheckSunder",
            name: "SUNDER.Settings.AlwaysCheckSunder.Name",
            hint: "SUNDER.Settings.AlwaysCheckSunder.Hint",
            scope: "world",
            config: true,
            type: Boolean,
            default: false
        }
    ];

    for (const setting of settings) {
        game.settings.register("sunder", setting.key, {
            name: game.i18n.localize(setting.name),
            hint: game.i18n.localize(setting.hint),
            scope: setting.scope,
            config: setting.config,
            type: setting.type,
            default: setting.default,
            range: setting.range,
            filePicker: setting.filePicker,
            onChange: setting.onChange
        });
    }

    utils.log("Settings registered");

    Hooks.on("renderSettingsConfig", (app, html) => {
        utils.log("Rendering settings config");

        const dynamicACEnabled = game.settings.get("sunder", "enableDynamicACPenalties");
        const armorPenaltySetting = html.querySelector(`[name="sunder.armorACPenalty"]`)?.closest('.form-group');
        if (armorPenaltySetting && dynamicACEnabled) {
            const input = armorPenaltySetting.querySelector('input');
            if (input) input.disabled = true;
        }

        const dynamicACCheckbox = html.querySelector(`[name="sunder.enableDynamicACPenalties"]`);
        if (dynamicACCheckbox) {
            dynamicACCheckbox.addEventListener('change', (event) => {
                const enabled = event.target.checked;
                if (armorPenaltySetting) {
                    const input = armorPenaltySetting.querySelector('input');
                    if (input) input.disabled = enabled;
                }
                ui.notifications.warn(
                    game.i18n.localize("SUNDER.Notification.DynamicACSwitch"),
                    { permanent: true }
                );
            });
        }

        const durabilitySetting = html.querySelector(`[name="sunder.durabilityByRarity"]`)?.closest('.form-group');
        if (durabilitySetting) {
            const newDiv = document.createElement('div');
            newDiv.className = 'form-group';
            const label = document.createElement('label');
            label.textContent = game.i18n.localize("SUNDER.Settings.DurabilityByRarity.Name");
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'sunder-durability-button';
            button.textContent = game.i18n.localize("SUNDER.Settings.DurabilityByRarity.Button");
            const hint = document.createElement('p');
            hint.className = 'hint';
            hint.textContent = game.i18n.localize("SUNDER.Settings.DurabilityByRarity.Hint");
            newDiv.appendChild(label);
            newDiv.appendChild(button);
            newDiv.appendChild(hint);
            durabilitySetting.replaceWith(newDiv);
            const durabilityButton = html.querySelector(".sunder-durability-button");
            if (durabilityButton) {
                durabilityButton.addEventListener("click", () => {
                    new DurabilityConfig().render(true);
                });
            }
        }

        const resetButton = document.createElement('button');
        resetButton.type = 'button';
        resetButton.className = 'sunder-reset-defaults';
        resetButton.textContent = game.i18n.localize("SUNDER.Settings.ResetButton");
        const sheetFooter = html.querySelector(".sheet-footer");
        if (sheetFooter) {
            sheetFooter.insertAdjacentElement('afterbegin', resetButton);
        }
        const resetButtonElement = html.querySelector(".sunder-reset-defaults");
        if (resetButtonElement) {
            resetButtonElement.addEventListener("click", async () => {
                await game.settings.set("sunder", "breakageThreshold", 1);
                await game.settings.set("sunder", "criticalBreakageThreshold", 20);
                await game.settings.set("sunder", "breakageDC", 10);
                await game.settings.set("sunder", "durabilityByRarity", JSON.stringify({
                    common: 1,
                    uncommon: 2,
                    rare: 3,
                    veryRare: 4,
                    legendary: 5
                }));
                await game.settings.set("sunder", "weaponAttackPenalty", -2);
                await game.settings.set("sunder", "armorACPenalty", -2);
                await game.settings.set("sunder", "enableDynamicACPenalties", true);
                await game.settings.set("sunder", "heavyWeaponBonus", 2);
                await game.settings.set("sunder", "repairPercentage", 50);
                await game.settings.set("sunder", "breakageSound", "sounds/combat/epic-turn-1hit.ogg");
                await game.settings.set("sunder", "breakagePassSound", "sounds/combat/epic-turn-2hit.ogg");
                await game.settings.set("sunder", "breakageFailSound", "sounds/combat/epic-turn-2hit.ogg");
                await game.settings.set("sunder", "repairSound", "");
                await game.settings.set("sunder", "alwaysCheckSunder", false);
                ui.notifications.info(game.i18n.localize("SUNDER.Notification.SettingsReset"));
                app.render(true);
            });
        }

        utils.log("Settings registration complete");
    });
}