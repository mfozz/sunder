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
            default: 20,
            range: { min: 1, max: 20, step: 1 }
        });

        game.settings.register("sunder", "breakageDC", {
            name: game.i18n.localize("sunder.settings.breakageDC.name"),
            hint: game.i18n.localize("sunder.settings.breakageDC.hint"),
            scope: "world",
            config: true,
            type: Number,
            default: 10,
            range: { min: 5, max: 20, step: 1 }
        });

        game.settings.register("sunder", "durabilityByRarity", {
            name: game.i18n.localize("sunder.settings.durabilityByRarity.name"),
            hint: "",
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
                await game.settings.set("sunder", "criticalBreakageThreshold", 20);
                await game.settings.set("sunder", "breakageDC", 10);
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
        if (isAttackRoll && message.author.id === game.user.id) {
            const roll = message.rolls?.[0];
            const keptResult = roll.terms[0].results.find(r => r.active)?.result;
            const rawD20 = keptResult !== undefined ? keptResult : roll.terms[0].results[0].result;
            console.log("[Sunder] Roll data:", roll, "Raw d20 (kept):", rawD20, "Final result:", roll.total);
            if (rawD20 === undefined) return;

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

            const targets = game.user.targets.size > 0 ? Array.from(game.user.targets) : [];
            const target = targets.length > 0 ? targets[0] : null;
            console.log("[Sunder] Local targets:", targets.map(t => t.actor?.name));

            await this._triggerBreakage(attacker, target, rawD20, isHeavy, message.id, weaponItem);
        }

        const sunderData = message.getFlag("sunder", "attackerTokenUuid");
        if (sunderData && message.author.id !== game.user.id) {
            const flags = message.flags.sunder;
            const actor = (await fromUuid(flags.targetTokenUuid))?.actor;
            const item = await fromUuid(flags.itemUuid);
            if (!actor || !item) {
                console.error("[Sunder] Failed to resolve actor or item from chat flags:", flags);
                return;
            }

            const currentUserId = game.user.id;
            const isGM = game.user.isGM;
            const isAffectedUser = currentUserId === flags.affectedUserId;

            if (isGM || isAffectedUser) {
                console.log(`[Sunder] Showing breakage popup for ${isGM ? "GM" : "Player"}: ${actor.name}, ${item.name}`);
                await game.sunderUI.showBreakagePopup(actor, item, flags.isHeavy, flags.gmUserId, flags.affectedUserId, flags.rollType, flags.attackerUserId);
            }
        }

        const resolveData = message.getFlag("sunder", "resolveBreakage");
        if (resolveData) {
            const dialog = Object.values(ui.windows).find(w => w.title === game.i18n.localize("sunder.popup.title"));
            if (dialog) {
                dialog.close();
                console.log(`[Sunder] Closed dialog for item ${message.flags.sunder.itemUuid} due to resolution: ${message.flags.sunder.resolution}`);
            }
        }
    }

    async _handleMidiQolWorkflow(workflow) {
        console.log("[Sunder] Handling MIDI QOL workflow:", workflow);
        const roll = workflow.attackRoll;
        if (!roll) {
            console.log("[Sunder] No attack roll found in workflow.");
            return;
        }

        const keptResult = roll.terms[0].results.find(r => r.active)?.result;
        const rawD20 = keptResult !== undefined ? keptResult : roll.terms[0].results[0].result;
        console.log("[Sunder] MIDI Roll data:", roll, "Raw d20 (kept):", rawD20, "Final result:", roll.total);
        if (rawD20 === undefined) return;

        const attacker = workflow.actor;
        console.log("[Sunder] MIDI Attacker:", attacker?.name);

        const isHeavy = workflow.item?.system.properties?.has("hvy") || false;
        const attackWeapon = workflow.item;  // MIDI-QOL provides the exact weapon
        console.log("[Sunder] MIDI Attacker weapon:", attackWeapon?.name || "None", "Is Heavy:", isHeavy);

        const targets = workflow.targets.size > 0 ? Array.from(workflow.targets) : [];
        const target = targets.length > 0 ? targets[0] : null;

        await this._triggerBreakage(attacker, target, rawD20, isHeavy, null, attackWeapon);
    }

    async _triggerBreakage(attacker, target, rawD20, isHeavy, messageId, attackWeapon = null) {
        const threshold = game.settings.get("sunder", "breakageThreshold");
        const criticalThreshold = game.settings.get("sunder", "criticalBreakageThreshold");
        const enableWeaponBreakage = game.settings.get("sunder", "enableWeaponBreakage");
        const enableArmorBreakage = game.settings.get("sunder", "enableArmorBreakage");

        let itemType, item, targetActor, affectedUserId, rollType, attackerUserId;
        const gmUser = game.users.find(u => u.isGM && u.active);
        const rollingUser = game.user;

        console.log(`[Sunder] Attacker: ${attacker?.name || "None"}, Target: ${target?.actor?.name || "None"}, Attacker ownership: ${JSON.stringify(attacker?.ownership || {})}, Rolling user: ${rollingUser.id}`);
        if (target) console.log(`[Sunder] Target ownership: ${JSON.stringify(target.actor?.ownership || {})}`);

        if (!attacker) {
            console.error("[Sunder] No attacker found for breakage check.");
            return;
        }

        console.log(`[Sunder] Raw d20: ${rawD20}, Fumble Threshold: ${threshold}, Crit Threshold: ${criticalThreshold}`);

        if (rawD20 <= threshold && enableWeaponBreakage) {
            itemType = "weapon";
            targetActor = attacker;
            item = attackWeapon || targetActor.items.find(i => i.type === "weapon" && i.system.equipped);
            if (!item) {
                console.log("[Sunder] No equipped weapon found for fumble breakage.");
                return;
            }
            affectedUserId = rollingUser && (rollingUser.character?.id === attacker.id || attacker.ownership[rollingUser.id] >= 1)
                ? rollingUser.id
                : game.users.find(u => !u.isGM && (u.character?.id === attacker.id || attacker.ownership[u.id] >= 1))?.id || gmUser?.id;
            rollType = "fumble";
            attackerUserId = affectedUserId;
        } else if (rawD20 >= criticalThreshold && enableArmorBreakage) {
            itemType = "armor";
            targetActor = target ? target.actor : null;
            if (!targetActor) {
                console.log("[Sunder] No target actor found for crit breakage check.");
                return;
            }
            item = targetActor.items.find(i => 
                i.type === "equipment" && 
                i.system.equipped && 
                i.system.type?.value === "shield" && 
                !i.name.includes("(Broken)")
            );
            if (!item) {
                item = targetActor.items.find(i => 
                    i.type === "equipment" && 
                    i.system.equipped && 
                    i.system.armor?.value > 0 && 
                    i.system.type?.value !== "shield" && 
                    !i.name.includes("(Broken)")
                );
            }
            affectedUserId = game.users.find(u => !u.isGM && (u.character?.id === targetActor.id || targetActor.ownership[u.id] >= 1))?.id || gmUser?.id;
            rollType = "crit";
            attackerUserId = rollingUser && (rollingUser.character?.id === attacker.id || attacker.ownership[rollingUser.id] >= 1)
                ? rollingUser.id
                : game.users.find(u => !u.isGM && (u.character?.id === attacker.id || attacker.ownership[u.id] >= 1))?.id || gmUser?.id;
        } else {
            console.log("[Sunder] Raw d20 does not meet breakage thresholds or mechanic disabled:", rawD20);
            return;
        }

        if (!item || !targetActor) {
            console.log("[Sunder] No valid item or target actor found for breakage.");
            return;
        }

        console.log(`[Sunder] Triggering breakage popup: actor=${targetActor.name}, item=${item.name}, rollType=${rollType}, affectedUser=${affectedUserId}, attackerUser=${attackerUserId}, gmUser=${gmUser?.id}`);
        await game.sunderUI.showBreakagePopup(targetActor, item, isHeavy, gmUser?.id, affectedUserId, rollType, attackerUserId);

        const attackerToken = canvas.tokens.get(attacker.token) || canvas.tokens.placeables.find(t => t.actor?.id === attacker.id);
        const targetToken = target;
        if (rollingUser.id === game.user.id) {
            await ChatMessage.create({
                content: `<strong>[Sunder]</strong> Breakage Check Triggered`,
                speaker: { alias: attacker.name },
                whisper: [gmUser.id, affectedUserId],
                flags: {
                    sunder: {
                        attackerTokenUuid: attackerToken?.document.uuid,
                        targetTokenUuid: targetToken?.document.uuid,
                        itemUuid: item.uuid,
                        isHeavy,
                        rollType,
                        affectedUserId,
                        attackerUserId,
                        gmUserId: gmUser?.id
                    }
                }
            });
        }
    }
}

Hooks.once('init', () => {
    console.log("[Sunder] Init hook fired");
    game.sunder = new Sunder();

    game.socket.on("module.sunder", async (data) => {
        console.log(`[Sunder] Socket event received: ${JSON.stringify(data)}`);
        if (data.type === "resolveBreakage") {
            const dialog = Object.values(ui.windows).find(w => w.title === game.i18n.localize("sunder.popup.title"));
            if (dialog) {
                dialog.close();
                console.log(`[Sunder] Closed dialog for item ${data.itemId} due to resolution: ${data.resolution}`);
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