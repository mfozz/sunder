/*
 * Sunder UI Module for Foundry VTT D&D 5e
 */
import * as utils from './utils.js';

class SunderUI_v2 {
    // --- NEW: Local dialog registry (per client) ----------------------------
    static _openDialogs = new Map(); // messageId -> DialogV2[]

    static _registerDialog(messageId, dialog) {
        if (!messageId || !dialog) return;
        const list = this._openDialogs.get(messageId) ?? [];
        list.push(dialog);
        this._openDialogs.set(messageId, list);
    }

    static _unregisterDialog(messageId, dialog) {
        if (!messageId || !dialog) return;
        const list = this._openDialogs.get(messageId);
        if (!list) return;
        const next = list.filter(d => d !== dialog);
        if (next.length) this._openDialogs.set(messageId, next);
        else this._openDialogs.delete(messageId);
    }

    static closeDialogsForMessage(messageId) {
        const list = this._openDialogs.get(messageId);
        if (!list) return;
        for (const dlg of list) {
            try { if (dlg.rendered) dlg.close(); } catch (e) { console.warn("[Sunder] Close dialog failed", e); }
        }
        this._openDialogs.delete(messageId);
    }
    // -----------------------------------------------------------------------

    static async showBreakagePopup(actor, item, isHeavy = false, gmUserId = null, affectedUserId = null, rollType = null, attackerUserId = null, messageId = null) {
        if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] Is synthetic actor:", actor.isToken, "Token ID:", actor.token?.id);
        if (!item) {
            console.error("[Sunder] Item is undefined in showBreakagePopup");
            ui.notifications.error("Invalid item provided for breakage check.");
            return;
        }

        const gmUser = game.users.find(u => u.id === gmUserId && u.isGM && u.active);
        if (!gmUser) {
            ui.notifications.error("No active GM found to handle the breakage check.");
            return;
        }

        const breakageDC = game.settings.get("sunder", "breakageDC");
        const durabilityByRarityRaw = game.settings.get("sunder", "durabilityByRarity");
        const weaponAttackPenalty = game.settings.get("sunder", "weaponAttackPenalty");
        const breakageSound = game.settings.get("sunder", "breakageSound");
        const breakagePassSound = game.settings.get("sunder", "breakagePassSound");
        const breakageFailSound = game.settings.get("sunder", "breakageFailSound");
        const heavyBonus = Number(game.settings.get("sunder", "heavyWeaponBonus")) || 0;

        let durabilityByRarity;
        try {
            durabilityByRarity = JSON.parse(durabilityByRarityRaw);
        } catch (e) {
            durabilityByRarity = { common: 1, uncommon: 2, rare: 3, veryRare: 4, legendary: 5 };
            console.error("[Sunder] Invalid durabilityByRarity JSON, using default:", e);
        }

        let rarity = item.system?.rarity || "common";
        if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Item base rarity for ${item.name}: ${rarity}`);

        // DAE rarity override
        let rarityOverride = null;
        for (const effect of item.effects.values()) {
            const change = effect.changes?.find(c => c.key === "system.rarity" && c.mode === CONST.ACTIVE_EFFECT_MODES.OVERRIDE);
            if (change) { rarityOverride = change.value; break; }
        }
        if (rarityOverride) {
            rarity = rarityOverride;
            if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] DAE override rarity for ${item.name}: ${rarity}`);
        }

        // Infer rarity from +X if applicable
        if ((item.type === "equipment" && item.system?.type?.value === "shield") ||
            (item.type === "equipment" && item.system?.armor?.value > 0) ||
            (item.type === "weapon")) {
            const magicalBonus =
                item.system?.armor?.magicalBonus ||
                item.system?.magicalBonus ||
                (item.type === "weapon" ? item.system?.magicalBonus || 0 : 0);
            if (magicalBonus > 0) {
                const rarityMap = { 1: "uncommon", 2: "rare", 3: "veryRare", 4: "legendary", 5: "legendary" };
                const inferredRarity = rarityMap[magicalBonus] || "rare";
                const order = ["common", "uncommon", "rare", "veryRare", "legendary"];
                if (order.indexOf(rarity) < order.indexOf(inferredRarity)) {
                    rarity = inferredRarity;
                    if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Inferred rarity for ${item.name} with +${magicalBonus}: ${rarity}`);
                }
            }
        }

        const baseDurability = durabilityByRarity[rarity] || 3;
        if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Base durability for ${item.name}: ${baseDurability} (effective rarity: ${rarity})`);

        let durability = await item.getFlag("sunder", "durability");
        let isDamaged = await item.getFlag("sunder", "damaged") || false;
        const itemUuid = item.uuid;

        if (durability === undefined || durability === null || typeof durability !== "number") {
            if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Invalid durability for ${item.name}: ${durability}, resetting to ${baseDurability}`);
            await item.update({ "flags.sunder.durability": baseDurability, "flags.sunder.damaged": false });
            if (actor.isToken) {
                await actor.updateEmbeddedDocuments("Item", [{
                    _id: item.id,
                    "flags.sunder.durability": baseDurability,
                    "flags.sunder.damaged": false
                }]);
            }
            if (game.settings.get("sunder", "testingMode")) {
                console.log(`[Sunder] Initialized durability for ${item.name} to ${baseDurability} (rarity: ${rarity})`);
                console.log("[Sunder] Post-init flags:", {
                    durability: await item.getFlag("sunder", "durability"),
                    damaged: await item.getFlag("sunder", "damaged")
                });
            }
            durability = baseDurability;
            isDamaged = false;
        }

        const isWeapon = item.type === "weapon";
        const isShield = item.type === "equipment" && item.system?.type?.value === "shield";
        const isArmor = item.type === "equipment" && item.system?.type?.value !== "shield" &&
                        (item.system?.armor?.value > 0 || item.system?.armor?.type === "armor");

        const icon = (isDamaged || durability <= 0) ? "icons/svg/downgrade.svg" : "";
        const tooltip = isDamaged
            ? `This item takes a ${weaponAttackPenalty} penalty to attack rolls or AC.`
            : durability <= 0
            ? `This item takes a ${weaponAttackPenalty * 2} penalty to attack rolls or AC and is unusable until repaired.`
            : "";
        const previewImage = item.getFlag("sunder", "previewImage") || item.img || "icons/svg/mystery-man.svg";
        const color = isDamaged ? "orange" : "inherit";

        // Enchantment origin (safer fallback to avoid EnchantmentRegistry error)
        let compendiumOrigin = "";
        if (isWeapon) compendiumOrigin = "Compendium.dnd5e.equipment24.Item.dmgWeapon12or300";
        else if (isShield) compendiumOrigin = "Compendium.dnd5e.equipment24.Item.dmgShield12or300";
        else if (isArmor) compendiumOrigin = "Compendium.dnd5e.equipment24.Item.dmgArmor12or3000";

        let originItem = null;
        const pack = game.packs.get("dnd5e.equipment24");
        if (pack) {
            const index = await pack.getIndex();
            const entry = index.find(i => i._id === compendiumOrigin.split('.').pop());
            originItem = entry ? `${compendiumOrigin.split('.').slice(0, -1).join('.')}.Item.${entry._id}` : item.uuid;
        } else {
            originItem = item.uuid;
        }

        // Price snapshot (prepared = total current price; baseline = base + enchant AE adds)
        const currentPrice = item.system?.price?.valueInGP ?? item.system?.price?.value ?? 0;
        const baselinePrice = (() => {
            // base from raw source
            let base = Number(item._source?.system?.price?.value) || 0;
            // add any ADD effects to price
            for (const e of item.effects) {
                for (const c of e.changes || []) {
                    if (c.key === "system.price.value" && c.mode === CONST.ACTIVE_EFFECT_MODES.ADD) {
                        const n = Number(String(c.value).replace(/[^0-9.\-]/g, "")) || 0;
                        base += n;
                    } else if (c.key === "system.price.value" && c.mode === CONST.ACTIVE_EFFECT_MODES.OVERRIDE) {
                        // OVERRIDE defines total — treat as baseline
                        base = Number(String(c.value).replace(/[^0-9.\-]/g, "")) || base;
                    }
                }
            }
            return base || currentPrice; // fallback
        })();

        if (game.settings.get("sunder", "testingMode")) {
            console.log(`[Sunder] Price snapshot for "${item.name}" — prepared: ${currentPrice} gp, baseline: ${baselinePrice} gp`);
        }

        const content = `
            <div class="sunder-breakage-popup">
                <img src="${previewImage}" class="sunder-preview-image" alt="${item.name}" />
                <div class="sunder-details">
                    <p><img src="${icon}" style="width: 24px; vertical-align: middle;" title="${tooltip}"> 
                       ${actor.name}'s <strong style="color:${color}">${item.name}</strong> ${game.i18n.localize("sunder.popup.atRisk")}</p>
                    <p>Damaged: ${isDamaged} | Durability: ${durability} | DC: ${breakageDC}${isHeavy ? ` | Heavy Bonus: +${heavyBonus}` : ""}</p>
                </div>
            </div>
        `;

        const handleRoll = async (targetActor, targetItemUuid, resolution, sunderFlags, silent = false) => {
            const targetItem = await fromUuid(targetItemUuid);
            if (!targetItem) {
                console.error("[Sunder] Failed to fetch item by UUID:", targetItemUuid);
                return;
            }

            if (resolution === "ignore") {
                if (!silent) {
                    await ChatMessage.create({
                        content: `<strong>[Sunder]</strong> Breakage Ignored for ${targetItem.name}`,
                        flags: {
                            sunder: {
                                ...sunderFlags,
                                resolveBreakage: { resolution: "ignore", itemUuid: targetItem.uuid, messageId: messageId }
                            }
                        }
                    });
                    if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] Ignore button clicked for item:", targetItem.name, "messageId:", messageId);
                }
                return;
            }

            const rollFormula = isHeavy ? `1d20 + ${heavyBonus}` : "1d20";
            if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Evaluating roll formula: ${rollFormula}`);
            const roll = new Roll(rollFormula);
            try { await roll.evaluate(); }
            catch (e) { console.error(`[Sunder] Failed to evaluate roll ${rollFormula}:`, e); ui.notifications.error("Failed to evaluate breakage roll."); return; }

            const rollResult = roll.total;
            if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Roll result: ${rollResult}, DC: ${breakageDC}, Heavy: ${isHeavy}`);

            await roll.toMessage({
                flavor: `Breakage Roll for ${targetItem.name}${isHeavy ? ` (Heavy Weapon Bonus +${heavyBonus})` : ""}`,
                speaker: ChatMessage.getSpeaker({ actor: targetActor, token: targetActor.token })
            });

            await ChatMessage.create({
                content: `<strong>[Sunder]</strong> Breakage Roll for ${targetItem.name}`,
                flags: {
                    sunder: {
                        ...sunderFlags,
                        resolveBreakage: { resolution: rollResult < breakageDC ? "fail" : "pass", itemUuid: targetItem.uuid, messageId: messageId }
                    }
                }
            });

            if (rollResult < breakageDC) {
                let newDurability = durability - 1;
                if (newDurability < 0) newDurability = 0;

                // Build effects
                let itemEffectData = {
                    name: `Sunder Enchantment: ${newDurability <= 0 ? "Broken" : "Damaged"}`,
                    icon: "icons/svg/downgrade.svg",
                    transfer: false,
                    disabled: false,
                    changes: [],
                    // Safer origin fallback
                    origin: originItem || targetItem.uuid || targetActor?.uuid || item.uuid,
                    duration: {},
                    flags: {
                        dae: { enableCondition: "", disableCondition: "", stackable: "multi", showIcon: false, durationExpression: "", specialDuration: [] },
                        dnd5e: { type: "enchantment", riders: { statuses: [] } },
                        core: { overlay: false }
                    },
                    sourceName: "Sunder Enchantment"
                };

                let acPenaltyData = {
                    name: `Sunder AC Penalty: ${targetItem.name} ${newDurability <= 0 ? "(Broken)" : "(Damaged)"}`,
                    icon: "icons/svg/downgrade.svg",
                    changes: [],
                    flags: {
                        dae: { stackable: "multi", transfer: true, enableCondition: "", disableCondition: "!item.equipped", showIcon: false },
                        core: { overlay: false }
                    },
                    origin: targetItem.uuid // already robust
                };

                const baseArmorValue = isShield ? 2 : isArmor ? (targetItem.system.armor?.base || 16) : 0;
                let magicalBonus = targetItem.system?.armor?.magicalBonus || targetItem.system?.magicalBonus || 0;
                if (!magicalBonus) {
                    const magicalEffect = targetItem.effects.find(e => e.changes?.some(c => c.key === "system.armor.magicalBonus" || c.key === "system.magicalBonus"));
                    magicalBonus = Number(magicalEffect?.changes?.find(c => c.key === "system.armor.magicalBonus" || c.key === "system.magicalBonus")?.value) || 0;
                }
                if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Damage calc for ${targetItem.name}: baseArmorValue=${baseArmorValue}, magicalBonus=${magicalBonus}`);

                let acPenalty = 0;
                if (isShield) {
                    const shieldBonus = baseArmorValue + magicalBonus;
                    acPenalty = newDurability <= 0 ? -shieldBonus : -Math.round(shieldBonus / 2);
                    if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Shield penalty: baseArmorValue=${baseArmorValue}, magicalBonus=${magicalBonus}, shieldBonus=${shieldBonus}, newDurability=${newDurability}, acPenalty=${acPenalty}`);
                } else if (isArmor) {
                    const acContribution = Math.max(0, baseArmorValue - 10 + magicalBonus);
                    acPenalty = newDurability <= 0 ? -acContribution : -Math.round(acContribution / 2);
                    if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Armor penalty: baseArmorValue=${baseArmorValue}, magicalBonus=${magicalBonus}, acContribution=${acContribution}, newDurability=${newDurability}, acPenalty=${acPenalty}`);
                }

                // Flag changes
                itemEffectData.changes.push({ key: "flags.sunder.durability", mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: newDurability });
                itemEffectData.changes.push({ key: "flags.sunder.damaged", mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: true });

                // Price change: use the *prepared* price snapshot (total) at click time
                const pricePenalty = newDurability <= 0 ? -currentPrice : -(currentPrice / 2);
                itemEffectData.changes.push({ key: "system.price.value", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: pricePenalty });
                if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Applying price penalty to ${targetItem.name}: ${pricePenalty} gp`);

                // Cosmetic + status
                itemEffectData.changes.push({ key: "name", mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: `{} (${newDurability <= 0 ? "Broken" : "Damaged"})`, priority: 50 });
                itemEffectData.changes.push({
                    key: "system.description.value",
                    mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
                    value: `{} <i>This item is ${newDurability <= 0 ? "broken" : "damaged"} (${isWeapon ? weaponAttackPenalty * (newDurability <= 0 ? 2 : 1) : acPenalty} penalty).${newDurability <= 0 ? " This item is unusable until repaired." : ""}</i>`
                });

                if (isWeapon) {
                    itemEffectData.changes.push({ key: "activities[attack].attack.bonus", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: weaponAttackPenalty * (newDurability <= 0 ? 2 : 1) });
                    itemEffectData.changes.push({ key: "flags.sunder.statusLabel", mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: `${newDurability <= 0 ? "Broken" : "Damaged"} (${weaponAttackPenalty * (newDurability <= 0 ? 2 : 1)} attack penalty).` });
                } else if (isArmor || isShield) {
                    acPenaltyData.changes.push({ key: "system.attributes.ac.bonus", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: acPenalty });
                }

                if (!targetItem.parent.testUserPermission(game.user, "OWNER")) {
                    await game.socket.emit("module.sunder", {
                        type: "applyEffect",
                        itemUuid: targetItem.uuid,
                        actorId: targetActor.id,
                        itemEffectData,
                        acPenaltyData: (isArmor || isShield) ? acPenaltyData : null,
                        newDurability,
                        messageId
                    });
                    return;
                }

                const existingItemEffects = targetItem.effects.filter(e => e.name?.includes("Sunder Enchantment") || e.name?.includes("Sunder AC Penalty"));
                for (const effect of existingItemEffects) {
                    await effect.delete();
                    console.log(`[Sunder] Deleted existing item effect: ${effect.name} (ID: ${effect.id})`);
                }

                try {
                    const createdEffects = await targetItem.createEmbeddedDocuments("ActiveEffect", [itemEffectData]);
                    if (!createdEffects.length) {
                        console.error(`[Sunder] Failed to create AE for ${targetItem.name}:`, itemEffectData);
                        ui.notifications.error(`Failed to apply breakage to ${targetItem.name}.`);
                    } else if (game.settings.get("sunder", "testingMode")) {
                        console.log(`[Sunder] Created item effect: ${itemEffectData.name} with changes:`, JSON.stringify(itemEffectData.changes, null, 2));
                    }
                } catch (err) {
                    console.warn("Sunder: Failed to create enchantment-style effect. Likely due to missing origin or invalid type:", err);
                }

                if (isArmor || isShield) {
                    const createdAcEffects = await targetItem.createEmbeddedDocuments("ActiveEffect", [acPenaltyData]);
                    if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Created item AC effect: ${acPenaltyData.name} with changes:`, JSON.stringify(acPenaltyData.changes, null, 2));
                }

                if (newDurability <= 0) {
                    await ChatMessage.create({ content: `<strong>${targetItem.name}</strong> breaks!`, speaker: { alias: "Sunder" } });
                    ui.notifications.error(`[${targetItem.name}] ${game.i18n.localize("sunder.popup.broken")}`);
                    if (breakageFailSound) foundry.audio.AudioHelper.play({ src: breakageFailSound });
                } else {
                    await ChatMessage.create({ content: `<strong>${targetItem.name}</strong> is damaged!`, speaker: { alias: "Sunder" } });
                    ui.notifications.warn(`[${targetItem.name}] is now DAMAGED! (Durability: ${newDurability})`);
                    if (breakageFailSound) foundry.audio.AudioHelper.play({ src: breakageFailSound });
                }

                const itemSheet = targetItem.sheet;
                if (itemSheet?.rendered) {
                    await itemSheet.close();
                    await new Promise(resolve => setTimeout(resolve, 500));
                    await itemSheet.render(true);
                    if (itemSheet.element[0]) itemSheet.bringToTop();
                    console.log(`[Sunder] Re-rendered item sheet for ${targetItem.name} after breakage`);
                }
            } else {
                await ChatMessage.create({ content: `<strong>${targetItem.name}</strong> resists breakage!`, speaker: { alias: "Sunder" } });
                ui.notifications.info(`[${targetItem.name}] ${game.i18n.localize("sunder.popup.safe")}`);
                if (breakagePassSound) foundry.audio.AudioHelper.play({ src: breakagePassSound });
            }
        };

        const sunderFlags = {
            targetTokenUuid: actor.isToken ? actor.token.uuid : `Actor.${actor.id}`,
            itemUuid: item.uuid,
            attackerTokenUuid: game.canvas.tokens.get(attackerUserId)?.uuid,
            rollType: rollType,
            isHeavy: isHeavy,
            gmUserId: gmUser.id,
            affectedUserId: affectedUserId,
            attackerUserId: attackerUserId
        };

        // Player dialog (owner)
        if (actor.ownership[game.user.id] >= 3 && !game.user.isGM) {
            if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Rendering player popup for ${actor.name}, ${item.name} (ownership confirmed)`);
            if (breakageSound) foundry.audio.AudioHelper.play({ src: breakageSound });
            let rolled = false;

            const dialog = new foundry.applications.api.DialogV2({
                window: { title: game.i18n.localize("sunder.popup.title") },
                content,
                buttons: [{
                    action: "roll",
                    label: "Roll for Breakage",
                    callback: async () => {
                        rolled = true;
                        if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] Roll button clicked for item:", item.name, "messageId:", messageId);
                        await handleRoll(actor, itemUuid, "roll", sunderFlags);
                    }
                }],
                closeOnEscape: true,
                render: () => {
                    if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Player dialog for ${item.name} (roll only)`);
                },
                close: () => {
                    if (!rolled && game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Player dialog for ${item.name} closed without action`);
                    SunderUI_v2._unregisterDialog(messageId, dialog);
                }
            }, { id: `sunder-breakage-${itemUuid}-${messageId}` });

            SunderUI_v2._registerDialog(messageId, dialog);
            dialog.render(true);
        }

        // Attacker info (non-owner player attacker)
        if (rollType === "crit" && attackerUserId && game.user.id === attackerUserId && game.user.id !== affectedUserId && !game.user.isGM && !actor.ownership[game.user.id] >= 3) {
            if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Rendering attacker info popup for ${item.name}`);
            const dialog = new foundry.applications.api.DialogV2({
                window: { title: game.i18n.localize("sunder.popup.title") },
                content: content + `<p>Awaiting ${actor.name}'s breakage check for their ${item.name}...</p>`,
                buttons: [],
                render: () => {
                    if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Attacker info dialog for ${item.name}`);
                },
                close: () => {
                    SunderUI_v2._unregisterDialog(messageId, dialog);
                }
            }, { id: `sunder-breakage-info-${itemUuid}-${messageId}` });

            SunderUI_v2._registerDialog(messageId, dialog);
            dialog.render(true);
        }

        // GM dialog
        if (game.user.id === gmUserId) {
            if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Rendering GM popup for ${actor.name}, ${item.name}`);
            if (breakageSound) foundry.audio.AudioHelper.play({ src: breakageSound });
            let rolled = false;

            const dialog = new foundry.applications.api.DialogV2({
                window: { title: game.i18n.localize("sunder.popup.title") },
                content,
                buttons: [
                    {
                        action: "roll",
                        label: "Roll for Breakage",
                        callback: async () => {
                            rolled = true;
                            if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] Roll button clicked for item:", item.name, "messageId:", messageId);
                            await handleRoll(actor, itemUuid, "roll", sunderFlags);
                        }
                    },
                    {
                        action: "ignore",
                        label: "Ignore",
                        callback: async () => {
                            rolled = true;
                            if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] Ignore button clicked for item:", item.name, "messageId:", messageId);
                            await handleRoll(actor, itemUuid, "ignore", sunderFlags);
                        }
                    }
                ],
                render: () => {
                    if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] GM dialog for ${item.name}`);
                },
                close: () => {
                    if (!rolled && game.settings.get("sunder", "testingMode")) console.log(`[Sunder] GM dialog for ${item.name} closed without action`);
                    SunderUI_v2._unregisterDialog(messageId, dialog);
                }
            }, { id: `sunder-breakage-${itemUuid}-${messageId}` });

            SunderUI_v2._registerDialog(messageId, dialog);
            dialog.render(true);
        } else if (gmUserId && !actor.ownership[game.user.id] >= 3) {
            if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Emitting socket request to GM ${gmUserId} for ${item.name}`);
            game.socket.emit("module.sunder", {
                type: "showBreakagePopup",
                actorId: actor.id,
                itemId: item.id,
                isHeavy,
                gmUserId: gmUser.id,
                affectedUserId,
                rollType,
                attackerUserId,
                messageId
            }, { once: true });
        }
    }





    static async repairItem(actor, item) {
        if (!item) {
            console.error("[Sunder] Item is undefined in repairItem");
            ui.notifications.error("Invalid item provided for repair.");
            return;
        }

        const sunderEffects = item.effects.filter(e => e.name?.includes("Sunder Enchantment") || e.name?.includes("Sunder AC Penalty"));
        if (sunderEffects.length === 0) {
            ui.notifications.info(`[${item.name}] is not damaged or broken.`);
            console.log(`[Sunder] No sunder effects found for ${item.name}`);
            return;
        }

        for (const effect of sunderEffects) {
            await effect.delete();
            console.log(`[Sunder] Deleted sunder effect: ${effect.name} (ID: ${effect.id})`);
        }

        const updates = {};
        if (await item.getFlag("sunder", "damaged")) {
            updates["flags.sunder.-=damaged"] = null;
            console.log(`[Sunder] Removing sunder.damaged flag from ${item.name}`);
        }
        if (await item.getFlag("sunder", "durability") !== null) {
            updates["flags.sunder.-=durability"] = null;
            console.log(`[Sunder] Removing sunder.durability flag from ${item.name}`);
        }
        if (await item.getFlag("sunder", "attackPenalty")) {
            updates["flags.sunder.-=attackPenalty"] = null;
            console.log(`[Sunder] Removing sunder.attackPenalty flag from ${item.name}`);
        }
        if (Object.keys(updates).length > 0) {
            await item.update(updates);
            console.log(`[Sunder] Updated item ${item.name} with changes:`, updates);
        }

        ui.notifications.info(`[${item.name}] has been repaired to full functionality.`);
        console.log(`[Sunder] Successfully repaired ${item.name}`);
        const itemSheet = item.sheet;
        if (itemSheet?.rendered) {
            await itemSheet.render(false);
            console.log(`[Sunder] Re-rendered item sheet for ${item.name} after repair`);
        }
    }

    static async applyEffect(data) {
        const { itemUuid, actorId, itemEffectData, acPenaltyData, newDurability, messageId } = data;
        const targetItem = await fromUuid(itemUuid);
        const targetActor = game.actors.get(actorId);
        if (!targetItem || !targetActor) {
            console.error("[Sunder] Failed to fetch item or actor for effect application:", data);
            return;
        }

        const existingItemEffects = targetItem.effects.filter(e => e.name?.includes("Sunder Enchantment") || e.name?.includes("Sunder AC Penalty"));
        for (const effect of existingItemEffects) {
            await effect.delete();
            console.log(`[Sunder] Deleted existing item effect: ${effect.name} (ID: ${effect.id})`);
        }

        const createdEffects = await targetItem.createEmbeddedDocuments("ActiveEffect", [itemEffectData]);
        if (!createdEffects.length) {
            console.error(`[Sunder] Failed to create AE for ${targetItem.name}:`, itemEffectData);
            ui.notifications.error(`Failed to apply breakage to ${targetItem.name}.`);
        } else {
            if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Created item effect: ${itemEffectData.name} with changes:`, JSON.stringify(itemEffectData.changes, null, 2));
        }

        if (acPenaltyData) {
            const createdAcEffects = await targetItem.createEmbeddedDocuments("ActiveEffect", [acPenaltyData]);
            if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Created item AC effect: ${acPenaltyData.name} with changes:`, JSON.stringify(acPenaltyData.changes, null, 2));
        }

        if (newDurability <= 0) {
            await ChatMessage.create({ content: `<strong>${targetItem.name}</strong> breaks!`, speaker: { alias: "Sunder" } });
            ui.notifications.error(`[${targetItem.name}] ${game.i18n.localize("sunder.popup.broken")}`);
            const breakageFailSound = game.settings.get("sunder", "breakageFailSound");
            if (breakageFailSound) foundry.audio.AudioHelper.play({ src: breakageFailSound });
        } else {
            await ChatMessage.create({ content: `<strong>${targetItem.name}</strong> is damaged!`, speaker: { alias: "Sunder" } });
            ui.notifications.warn(`[${targetItem.name}] is now DAMAGED! (Durability: ${newDurability})`);
            const breakageFailSound = game.settings.get("sunder", "breakageFailSound");
            if (breakageFailSound) foundry.audio.AudioHelper.play({ src: breakageFailSound });
        }

        const itemSheet = targetItem.sheet;
        if (itemSheet?.rendered) {
            await itemSheet.close();
            await new Promise(resolve => setTimeout(resolve, 500));
            await itemSheet.render(true);
            if (itemSheet.element[0]) itemSheet.bringToTop();
            console.log(`[Sunder] Re-rendered item sheet for ${targetItem.name} after effect application`);
        }
    }
}

Hooks.once('init', () => {
    console.log("SunderUI_v2 Module Initialized");
    game.sunderUI = SunderUI_v2;

    game.socket.on("module.sunder", async (data) => {
        if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Socket event received: ${JSON.stringify(data)}`);
        if (data.type === "showBreakagePopup" && game.user.isGM) {
            const actor = game.actors.get(data.actorId);
            const item = await fromUuid(`Actor.${data.actorId}.Item.${data.itemId}`);
            if (actor && item) {
                await game.sunderUI.showBreakagePopup(
                    actor,
                    item,
                    data.isHeavy,
                    data.gmUserId,
                    data.affectedUserId,
                    data.rollType,
                    data.attackerUserId,
                    data.messageId
                );
            }
        } else if (data.type === "applyEffect" && game.user.isGM) {
            await game.sunderUI.applyEffect(data);
        }
    });
});

Hooks.on("createChatMessage", (message) => {
  const res = message?.flags?.sunder?.resolveBreakage;
  if (!res?.messageId) return;

  // Close all Sunder DialogV2s tied to this messageId on THIS client
  if (game.settings.get("sunder", "testingMode")) {
    console.log("[Sunder] Auto-close: closing dialogs for", res.messageId);
  }
  game.sunderUI?.closeDialogsForMessage?.(res.messageId);
});



export { SunderUI_v2 };
