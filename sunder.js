class Sunder {
    constructor() {
        console.log("[Sunder] Module Initialized");
        this.registerSettings();
        this.lastAttackMessage = null;
        
        console.log("[Sunder] Registering createChatMessage hook");
        Hooks.on("createChatMessage", (message) => {
            console.log("[Sunder] createChatMessage fired:", message);
            if (message.content.includes('data-action="rollAttack"')) {
                this.lastAttackMessage = message;
            }
            this._onChatMessage(message);
        });

        if (game.modules.get("midi-qol")?.active) {
            console.log("[Sunder] MIDI QOL detected, registering AttackRollComplete hook");
            Hooks.on("midi-qol.AttackRollComplete", (workflow) => {
                console.log("[Sunder] MIDI AttackRollComplete fired:", workflow);
                this._handleMidiQolWorkflow(workflow);
            });
        } else {
            console.log("[Sunder] No MIDI QOL detected");
        }

        // Register the hook for adding the Repair button to item sheets
        Hooks.on("getItemSheetHeaderButtons", (sheet, buttons) => {
            this.onGetItemSheetHeaderButtons(sheet, buttons);
        });
    }

    registerSettings() {
        console.log("[Sunder] Registering settings");
       
        game.settings.register("sunder", "enableWeaponBreakage", {
            name: game.i18n.localize("sunder.settings.enableWeaponBreakage.name"),
            hint: game.i18n.localize("sunder.settings.enableWeaponBreakage.hint"),
            scope: "world",
            config: true,
            type: Boolean,
            default: true
        });

        game.settings.register("sunder", "enableArmorBreakage", {
            name: game.i18n.localize("sunder.settings.enableArmorBreakage.name"),
            hint: game.i18n.localize("sunder.settings.enableArmorBreakage.hint"),
            scope: "world",
            config: true,
            type: Boolean,
            default: true
        });
       
        game.settings.register("sunder", "breakageThreshold", {
            name: game.i18n.localize("sunder.settings.breakageThreshold.name"),
            hint: game.i18n.localize("sunder.settings.breakageThreshold.hint"),
            scope: "world",
            config: true,
            type: Number,
            default: 1,
            range: { min: 1, max: 20, step: 1 }
        });

        game.settings.register("sunder", "criticalBreakageThreshold", {
            name: game.i18n.localize("sunder.settings.criticalBreakageThreshold.name"),
            hint: game.i18n.localize("sunder.settings.criticalBreakageThreshold.hint"),
            scope: "world",
            config: true,
            type: Number,
            default: 2,
            range: { min: 1, max: 20, step: 1 }
        });

        game.settings.register("sunder", "breakageDC", {
            name: game.i18n.localize("sunder.settings.breakageDC.name"),
            hint: game.i18n.localize("sunder.settings.breakageDC.hint"),
            scope: "world",
            config: true,
            type: Number,
            default: 20,
            range: { min: 5, max: 20, step: 1 }
        });

        game.settings.register("sunder", "durabilityByRarity", {
            name: game.i18n.localize("sunder.settings.durabilityByRarity.name"),
            hint: "", // Empty to prevent Foundry's default hint
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
                    ui.notifications.error("Invalid JSON for Durability by Rarity: " + e.message);
                }
            }
        });

        game.settings.register("sunder", "twoStageBreakage", {
            name: game.i18n.localize("sunder.settings.twoStageBreakage.name"),
            hint: game.i18n.localize("sunder.settings.twoStageBreakage.hint"),
            scope: "world",
            config: true,
            type: Boolean,
            default: true
        });

        game.settings.register("sunder", "weaponAttackPenalty", {
            name: game.i18n.localize("sunder.settings.weaponAttackPenalty.name"),
            hint: game.i18n.localize("sunder.settings.weaponAttackPenalty.hint"),
            scope: "world",
            config: true,
            type: Number,
            default: -2,
            range: { min: -5, max: 0, step: 1 }
        });

        game.settings.register("sunder", "armorACPenalty", {
            name: game.i18n.localize("sunder.settings.armorACPenalty.name"),
            hint: game.i18n.localize("sunder.settings.armorACPenalty.hint"),
            scope: "world",
            config: true,
            type: Number,
            default: -2,
            range: { min: -5, max: 0, step: 1 }
        });

        game.settings.register("sunder", "heavyWeaponBonus", {
            name: game.i18n.localize("sunder.settings.heavyWeaponBonus.name"),
            hint: game.i18n.localize("sunder.settings.heavyWeaponBonus.hint"),
            scope: "world",
            config: true,
            type: Number,
            default: 2,
            range: { min: 0, max: 10, step: 1 }
        });

        game.settings.register("sunder", "repairCostPercentage", {
            name: game.i18n.localize("sunder.settings.repairCostPercentage.name"),
            hint: game.i18n.localize("sunder.settings.repairCostPercentage.hint"),
            scope: "world",
            config: true,
            type: Number,
            default: 50,
            range: { min: 0, max: 200, step: 5 }
        });

        game.settings.register("sunder", "breakageSound", {
            name: game.i18n.localize("sunder.settings.breakageSound.name"),
            hint: game.i18n.localize("sunder.settings.breakageSound.hint"),
            scope: "world",
            config: true,
            type: String,
            filePicker: "audio",
            default: "sounds/combat/epic-turn-1hit.ogg"
        });

        game.settings.register("sunder", "breakagePassSound", {
            name: game.i18n.localize("sunder.settings.breakagePassSound.name"),
            hint: game.i18n.localize("sunder.settings.breakagePassSound.hint"),
            scope: "world",
            config: true,
            type: String,
            filePicker: "audio",
            default: "sounds/combat/epic-turn-2hit.ogg"
        });

        game.settings.register("sunder", "breakageFailSound", {
            name: game.i18n.localize("sunder.settings.breakageFailSound.name"),
            hint: game.i18n.localize("sunder.settings.breakageFailSound.hint"),
            scope: "world",
            config: true,
            type: String,
            filePicker: "audio",
            default: "sounds/combat/epic-turn-2hit.ogg"
        });

        Hooks.on("renderSettingsConfig", (app, html) => {
            console.log("[Sunder] Rendering settings config");
            const durabilitySetting = html.find(`[name="sunder.durabilityByRarity"]`).closest('.form-group');
            if (durabilitySetting.length) {
                const currentValue = game.settings.get("sunder", "durabilityByRarity");
                durabilitySetting.replaceWith(`
                    <div class="form-group">
                        <label>${game.i18n.localize("sunder.settings.durabilityByRarity.name")}</label>
                        <button type="button" class="sunder-durability-button">${game.i18n.localize("sunder.settings.durabilityByRarity.name")}</button>
                        <p class="hint">Click the button to configure durability values for each rarity.</p>
                    </div>
                `);
                html.find(".sunder-durability-button").click(() => {
                    new DurabilityConfig().render(true);
                });
            }

            const resetButton = `<button type="button" class="sunder-reset-defaults">Reset to Defaults</button>`;
            html.find(".sheet-footer").prepend(resetButton);
            html.find(".sunder-reset-defaults").click(async () => {
                await game.settings.set("sunder", "breakageThreshold", 1);
                await game.settings.set("sunder", "criticalBreakageThreshold", 2);
                await game.settings.set("sunder", "breakageDC", 20);
                await game.settings.set("sunder", "durabilityByRarity", JSON.stringify({
                    common: 1,
                    uncommon: 2,
                    rare: 3,
                    veryRare: 4,
                    legendary: 5
                }));
                await game.settings.set("sunder", "twoStageBreakage", true);
                await game.settings.set("sunder", "weaponAttackPenalty", -2);
                await game.settings.set("sunder", "armorACPenalty", -2);
                await game.settings.set("sunder", "heavyWeaponBonus", 2);
                await game.settings.set("sunder", "repairCostPercentage", 50);
                await game.settings.set("sunder", "breakageSound", "sounds/combat/epic-turn-1hit.ogg");
                await game.settings.set("sunder", "breakagePassSound", "sounds/combat/epic-turn-2hit.ogg");
                await game.settings.set("sunder", "breakageFailSound", "sounds/combat/epic-turn-2hit.ogg");
                await game.settings.set("sunder", "enableWeaponBreakage", true);
                await game.settings.set("sunder", "enableArmorBreakage", true);
                ui.notifications.info("Sunder settings reset to defaults.");
                app.render(true);
            });

            console.log("[Sunder] Settings registration complete");
        });
    }

    async onGetItemSheetHeaderButtons(sheet, buttons) {
        const item = sheet.item;
        if (game.user.isGM && item.getFlag("sunder", "damaged")) {
            const actor = sheet.actor;
            const isBroken = (item.getFlag("sunder", "durability") ?? 999) <= 0;
            const basePrice = item.getFlag("sunder", "originalPrice") || item.system.price?.value || 1;
            const repairPercentage = game.settings.get("sunder", "repairCostPercentage") / 100;
            const costMultiplier = isBroken ? repairPercentage * 2 : repairPercentage;
            const cost = Math.max(1, Math.floor(basePrice * costMultiplier));
            const durabilityByRarityRaw = game.settings.get("sunder", "durabilityByRarity");
            let durabilityByRarity;
            try {
                durabilityByRarity = JSON.parse(durabilityByRarityRaw);
            } catch (e) {
                durabilityByRarity = { common: 1, uncommon: 2, rare: 3, veryRare: 4, legendary: 5 };
            }

            buttons.unshift({
                label: "Repair",
                class: "sunder-repair",
                icon: "fas fa-hammer",
                onclick: async () => {
                    const confirmed = await Dialog.confirm({
                        title: `Repair ${item.name}`,
                        content: `<p>Repair ${item.name} for ${cost}gp?</p>`,
                        yes: () => true,
                        no: () => false,
                        defaultYes: false
                    });
                    if (confirmed) {
                        if (actor.type === "character" && (actor.system.currency?.gp || 0) < cost) {
                            ui.notifications.warn(game.i18n.format("sunder.notify.noGold", { actor: actor.name, item: item.name, cost: cost }));
                            return;
                        }

                        const baseName = item.name.replace(/\s*\(Damaged\)$/, "").replace(/\s*\(Broken\)$/, "");
                        const description = item.system.description.value.replace(/<p><i>This item is (damaged|broken) \(-\d penalty\).*<\/i><\/p>/, "");
                        await actor.updateEmbeddedDocuments("Item", [{
                            _id: item.id,
                            name: baseName,
                            "system.description.value": description,
                            "system.price.value": basePrice
                        }]);
                        await item.unsetFlag("sunder", "damaged");
                        await item.unsetFlag("sunder", "originalPrice");
                        await item.setFlag("sunder", "durability", durabilityByRarity[item.system.rarity || "common"] || 3);
                        const effect = item.effects.find(e => e.name.includes("Sunder"));
                        if (effect) await effect.delete();

                        if (actor.type === "character" && actor.system.currency?.gp >= cost) {
                            await actor.update({
                                "system.currency.gp": actor.system.currency.gp - cost
                            });
                            ui.notifications.info(game.i18n.format("sunder.notify.repairedDeducted", { item: item.name, cost: cost, actor: actor.name }));
                        } else {
                            ui.notifications.info(game.i18n.format("sunder.notify.repairedManual", { item: item.name, cost: cost }));
                        }
                        await actor.sheet?.render(false);
                    }
                }
            });
        }
    }

    async _onChatMessage(message) {
        console.log("[Sunder] Message Data:", message);
        
        const isRoll = message.flags?.core?.RollTable || message.rolls;
        console.log("[Sunder] Is this a roll?", !!isRoll);
        if (!isRoll) return;
    
        const isAttackRoll = message.flags?.dnd5e?.roll?.type === "attack";
        console.log("[Sunder] Is attack roll?", isAttackRoll, "Flags:", message.flags?.dnd5e);
        if (!isAttackRoll) return;
    
        const roll = message.rolls?.[0];
        const rollTotal = roll?.total; // Use the final roll total, not the first die
        console.log("[Sunder] Roll data:", roll, "Final result:", rollTotal);
        if (rollTotal === undefined) return;
    
        // Check for a target before proceeding
        if (game.user.targets.size === 0) {
            console.log("[Sunder] No target selected, skipping breakage check.");
            return;
        }
    
        const threshold = game.settings.get("sunder", "breakageThreshold");
        const criticalThreshold = game.settings.get("sunder", "criticalBreakageThreshold");
        console.log("[Sunder] Thresholds:", threshold, criticalThreshold, "Result:", rollTotal);
    
        const speaker = ChatMessage.getSpeaker();
        console.log("[Sunder] Speaker:", speaker);
        const token = canvas.tokens.get(speaker.token);
        const attacker = token ? token.actor : game.actors.get(speaker.actor);
        console.log("[Sunder] Attacker:", attacker?.name || "None", "Using token:", !!token);
    
        let weaponItem;
        const itemId = message.flags?.dnd5e?.item?.id || message.flags?.dnd5e?.roll?.itemId;
        console.log("[Sunder] Weapon ID from roll flags:", itemId);
        if (itemId) {
            weaponItem = attacker.items.get(itemId);
        }
        if (!weaponItem && this.lastAttackMessage) {
            const weaponMatch = this.lastAttackMessage.content.match(/<span class="title">([^<]+)<\/span>/);
            const weaponName = weaponMatch ? weaponMatch[1] : null;
            console.log("[Sunder] Weapon from last attack message:", weaponName);
            weaponItem = weaponName
                ? attacker.items.find(i => i.type === "weapon" && i.name.includes(weaponName) && i.system.equipped)
                : attacker.items.find(i => i.type === "weapon" && i.system.equipped);
        }
        const isHeavy = weaponItem?.system.properties?.has("hvy") || false;
        console.log("[Sunder] Attacker weapon:", weaponItem?.name || "None", "Is Heavy:", isHeavy);
    
        await this._triggerBreakage(attacker, rollTotal, isHeavy);
    }

    async _handleMidiQolWorkflow(workflow) {
        console.log("[Sunder] Handling MIDI QOL workflow:", workflow);
        const roll = workflow.attackRoll;
        if (!roll) {
            console.log("[Sunder] No attack roll found in workflow.");
            return;
        }
    
        const rollTotal = workflow.attackTotal || roll.total; // Use MIDI-QOL's final total if available, else roll.total
        console.log("[Sunder] MIDI Roll data:", roll, "Final result:", rollTotal);
        if (rollTotal === undefined) return;
    
        // Check for a target before proceeding
        if (!workflow.targets || workflow.targets.size === 0) {
            console.log("[Sunder] No target selected in MIDI QOL workflow, skipping breakage check.");
            return;
        }
    
        const attacker = workflow.actor;
        console.log("[Sunder] MIDI Attacker:", attacker?.name);
    
        const isHeavy = workflow.item?.system.properties?.has("hvy") || false;
        console.log("[Sunder] MIDI Attacker weapon:", workflow.item?.name || "None", "Is Heavy:", isHeavy);
    
        await this._triggerBreakage(attacker, rollTotal, isHeavy);
    }

    async _triggerBreakage(attacker, rawDieResult, isHeavy) {
        const threshold = game.settings.get("sunder", "breakageThreshold");
        const criticalThreshold = game.settings.get("sunder", "criticalBreakageThreshold");
        const enableWeaponBreakage = game.settings.get("sunder", "enableWeaponBreakage");
        const enableArmorBreakage = game.settings.get("sunder", "enableArmorBreakage");
        console.log("[Sunder] TriggerBreakage - Thresholds:", threshold, criticalThreshold, "Result:", rawDieResult);

        let itemType, item, targetActor;
        const durabilityByRarityRaw = game.settings.get("sunder", "durabilityByRarity");
        let durabilityByRarity;
        try {
            durabilityByRarity = JSON.parse(durabilityByRarityRaw);
        } catch (e) {
            durabilityByRarity = { common: 1, uncommon: 2, rare: 3, veryRare: 4, legendary: 5 };
            console.error("[Sunder] Failed to parse durabilityByRarity, using default:", e);
        }

        if (rawDieResult <= threshold && enableWeaponBreakage) {
            itemType = "weapon";
            targetActor = attacker;
            console.log("[Sunder] Low roll detected, targeting weapon for:", targetActor?.name);
            if (!targetActor) {
                console.log("[Sunder] No attacker found.");
                return;
            }
            item = targetActor.items.find(i => i.type === "weapon" && i.system.equipped);
            console.log("[Sunder] Selected weapon:", item?.name || "None");
            if (!item) {
                console.log("[Sunder] No matching equipped weapon found.");
                return;
            }
            console.log("[Sunder] Triggering Breakage Popup for weapon:", item.name);
        } else if (rawDieResult >= criticalThreshold && enableArmorBreakage) {
            itemType = "armor";
            const targets = game.user.targets.size > 0 ? Array.from(game.user.targets) : [];
            console.log("[Sunder] Targets:", targets.map(t => t.actor?.name));
            targetActor = targets.length > 0 ? targets[0].actor : null;
            if (!targetActor) {
                console.log("[Sunder] No target found for critical hit. Active targets:", game.user.targets.size);
                return;
            }

            console.log("[Sunder] Equipped Items:", targetActor.items.map(i => ({
                name: i.name,
                type: i.type,
                equipped: i.system.equipped,
                armorValue: i.system.armor?.value,
                shield: i.system.type?.value === "shield",
                armorType: i.system.armor?.type,
                durability: i.getFlag("sunder", "durability"),
                damaged: i.getFlag("sunder", "damaged")
            })));

            item = targetActor.items.find(i => 
                i.type === "equipment" && 
                i.system.equipped && 
                (i.system.type?.value === "shield" || i.system.armor?.type === "shield") &&
                !i.name.includes("(Broken)")
            );
            if (!item) {
                item = targetActor.items.find(i => 
                    i.type === "equipment" && 
                    i.system.equipped && 
                    i.system.type?.value !== "shield" && 
                    i.system.armor?.value > 0 &&
                    !i.name.includes("(Broken)")
                );
            }

            console.log("[Sunder] Found equipped", itemType, ":", item?.name || "None");
            if (!item) {
                console.log("[Sunder] No valid armor or shield found for breakage.");
                return;
            }
            console.log("[Sunder] Triggering Breakage Popup for", itemType, ":", item.name);
        } else {
            console.log("[Sunder] Roll does not meet breakage thresholds or mechanic disabled.");
            return;
        }

        if (!game.sunderUI?.showBreakagePopup) {
            console.error("[Sunder] Error: game.sunderUI.showBreakagePopup is not available.");
            return;
        }
        console.log("[Sunder] Calling showBreakagePopup with:", { actor: targetActor.name, item: item.name, isHeavy });
        await game.sunderUI.showBreakagePopup(targetActor, item, isHeavy);
        console.log("[Sunder] Breakage Popup completed.");
    }
}

Hooks.once('init', () => {
    console.log("[Sunder] Init hook fired");
    game.sunder = new Sunder();
});

// Register socket handler for breakage popup requests at the top level
Hooks.on("init", () => {
    game.socket.on("module.sunder", async (data) => {
        if (data.type === "showBreakagePopup" && game.user.id === data.userId) {
            const actor = game.actors.get(data.actorId);
            const item = actor?.items.get(data.itemId);
            if (actor && item) {
                await game.sunderUI.showBreakagePopup(actor, item, data.isHeavy, data.userId);
            } else {
                console.error("[Sunder] Failed to find actor or item for breakage popup:", data);
            }
        }
    });
});

class DurabilityConfig extends FormApplication {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            title: "Configure Durability by Rarity",
            id: "sunder-durability-config",
            template: "modules/sunder/templates/durability-config.html",
            width: 400,
            height: "auto",
            closeOnSubmit: true
        });
    }

    getData() {
        const durabilityByRarityRaw = game.settings.get("sunder", "durabilityByRarity");
        return {
            durability: JSON.parse(durabilityByRarityRaw)
        };
    }

    activateListeners(html) {
        super.activateListeners(html);
    }

    async _updateObject(event, formData) {
        const durability = {
            common: formData.common,
            uncommon: formData.uncommon,
            rare: formData.rare,
            veryRare: formData.veryRare,
            legendary: formData.legendary
        };
        await game.settings.set("sunder", "durabilityByRarity", JSON.stringify(durability));
    }
}