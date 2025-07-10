/*
 * Sunder UI Module for Foundry VTT D&D 5e
 */
class SunderUI_v2 {
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
        let rarityOverride = null;
        if (item.effects && Array.isArray(item.effects)) {
            for (const effect of item.effects) {
                const change = effect.changes?.find(c => c.key === "system.rarity" && c.mode === CONST.ACTIVE_EFFECT_MODES.OVERRIDE);
                if (change) {
                    rarityOverride = change.value;
                    break;
                }
            }
        }
        if (rarityOverride) {
            rarity = rarityOverride;
            if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] DAE override rarity for ${item.name}: ${rarity}`);
        }
        if ((item.type === "equipment" && item.system?.type?.value === "shield") || 
            (item.type === "equipment" && item.system?.armor?.value > 0) ||
            (item.type === "weapon")) {
            const magicalBonus = item.system?.armor?.magicalBonus || 
                                item.system?.magicalBonus || 
                                (item.type === "weapon" ? item.system?.magicalBonus || 0 : 0);
            if (magicalBonus > 0) {
                const rarityMap = {
                    1: "uncommon",
                    2: "rare",
                    3: "veryRare",
                    4: "legendary",
                    5: "legendary"
                };
                const inferredRarity = rarityMap[magicalBonus] || "rare";
                const rarityOrder = ["common", "uncommon", "rare", "veryRare", "legendary"];
                if (rarityOrder.indexOf(rarity) < rarityOrder.indexOf(inferredRarity)) {
                    rarity = inferredRarity;
                    if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Inferred rarity for ${item.name} with +${magicalBonus} bonus: ${rarity}`);
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
    await item.update({
        "flags.sunder.durability": baseDurability,
        "flags.sunder.damaged": false
    });
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
        const isArmor = item.type === "equipment" && item.system?.type?.value !== "shield" && (item.system?.armor?.value > 0 || item.system?.armor?.type === "armor");
        const icon = isDamaged ? "icons/svg/downgrade.svg" : durability <= 0 ? "icons/svg/downgrade.svg" : "";
        const tooltip = isDamaged 
            ? `This item takes a ${weaponAttackPenalty} penalty to attack rolls or AC.` 
            : durability <= 0 
            ? `This item takes a ${weaponAttackPenalty * 2} penalty to attack rolls or AC and is unusable until repaired.` 
            : "";
        const previewImage = item.getFlag("sunder", "previewImage") || item.img || "icons/svg/mystery-man.svg";
        const color = isDamaged ? "orange" : "inherit";

        let compendiumOrigin = "";
        if (isWeapon) {
            compendiumOrigin = "Compendium.dnd5e.equipment24.Item.dmgWeapon12or300";
        } else if (isShield) {
            compendiumOrigin = "Compendium.dnd5e.equipment24.Item.dmgShield12or300";
        } else if (isArmor) {
            compendiumOrigin = "Compendium.dnd5e.equipment24.Item.dmgArmor12or3000";
        } else {
            console.warn(`[Sunder] Unsupported item type for ${item.name}, defaulting to item UUID`);
            compendiumOrigin = itemUuid;
        }

        let originalPrice = await item.getFlag("sunder", "originalPrice");
        if (!originalPrice) {
            originalPrice = item.system.price?.value || (isShield ? 10 : isArmor ? 1500 : isWeapon ? 15 : 1);
            await item.setFlag("sunder", "originalPrice", originalPrice);
            if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Set originalPrice to ${originalPrice} for ${item.name}`);
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
            try {
                await roll.evaluate();
            } catch (e) {
                console.error(`[Sunder] Failed to evaluate roll ${rollFormula}:`, e);
                ui.notifications.error("Failed to evaluate breakage roll.");
                return;
            }
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
                let itemEffectData = {
                    label: `Sunder Enchantment: ${newDurability <= 0 ? "Broken" : "Damaged"}`,
                    icon: "icons/svg/downgrade.svg",
                    transfer: false,
                    disabled: false,
                    changes: [],
                    origin: compendiumOrigin,
                    duration: {},
                    flags: {
                        dae: {
                            enableCondition: "",
                            disableCondition: "",
                            stackable: "multi",
                            showIcon: false,
                            durationExpression: "",
                            specialDuration: [],
                            transfer: false
                        },
                        dnd5e: {
                            type: "enchantment",
                            riders: { statuses: [] }
                        },
                        core: { overlay: false }
                    },
                    sourceName: "Sunder Enchantment"
                };
                let acPenaltyData = {
                    label: `Sunder AC Penalty: ${targetItem.name} ${newDurability <= 0 ? "(Broken)" : "(Damaged)"}`,
                    icon: "icons/svg/downgrade.svg",
                    changes: [],
                    flags: {
                        dae: {
                            stackable: "multi",
                            transfer: true,
                            enableCondition: "",
                            disableCondition: "!item.equipped",
                            showIcon: false
                        },
                        core: { overlay: false }
                    },
                    origin: targetItem.uuid
                };

                const baseArmorValue = isShield ? 2 : isArmor ? (targetItem.system.armor?.base || 16) : 0;
                let magicalBonus = targetItem.system?.armor?.magicalBonus || targetItem.system?.magicalBonus || 0;
                if (!magicalBonus) {
                    const magicalEffect = targetItem.effects.find(e => e.changes.some(c => c.key === "system.armor.magicalBonus" || c.key === "system.magicalBonus"));
                    magicalBonus = Number(magicalEffect?.changes.find(c => c.key === "system.armor.magicalBonus" || c.key === "system.magicalBonus")?.value) || 0;
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

                itemEffectData.changes.push({
                    key: "flags.sunder.durability",
                    mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
                    value: newDurability
                });
                itemEffectData.changes.push({
                    key: "flags.sunder.damaged",
                    mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
                    value: true
                });
                itemEffectData.changes.push({
                    key: "system.price.value",
                    mode: CONST.ACTIVE_EFFECT_MODES.ADD,
                    value: newDurability <= 0 ? -originalPrice : -(originalPrice / 2)
                });
                itemEffectData.changes.push({
                    key: "name",
                    mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
                    value: `{} (${newDurability <= 0 ? "Broken" : "Damaged"})`,
                    priority: 50
                });
itemEffectData.changes.push({
    key: "system.description.value",
    mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
    value: `{} <i>This item is ${newDurability <= 0 ? "broken" : "damaged"} (${isWeapon ? weaponAttackPenalty * (newDurability <= 0 ? 2 : 1) : acPenalty} penalty).${newDurability <= 0 ? " This item is unusable until repaired." : ""}</i>`
});

                if (isWeapon) {
                    itemEffectData.changes.push({
                        key: "flags.sunder.attackPenalty",
                        mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
                        value: weaponAttackPenalty * (newDurability <= 0 ? 2 : 1)
                    });
                    itemEffectData.changes.push({
                        key: "flags.sunder.statusLabel",
                        mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
                        value: `${newDurability <= 0 ? "Broken" : "Damaged"} (${weaponAttackPenalty * (newDurability <= 0 ? 2 : 1)} attack penalty).`
                    });
                } else if (isArmor || isShield) {
                    acPenaltyData.changes.push({
                        key: "system.attributes.ac.bonus",
                        mode: CONST.ACTIVE_EFFECT_MODES.ADD,
                        value: acPenalty
                    });
                }

                // Check if user has permission to modify the item
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

                const existingItemEffects = targetItem.effects.filter(e => e.name.includes("Sunder Enchantment") || e.name.includes("Sunder AC Penalty"));
                for (const effect of existingItemEffects) {
                    await effect.delete();
                    console.log(`[Sunder] Deleted existing item effect: ${effect.name} (ID: ${effect.id})`);
                }

                const createdEffects = await targetItem.createEmbeddedDocuments("ActiveEffect", [itemEffectData]);
                if (!createdEffects.length) {
                    console.error(`[Sunder] Failed to create AE for ${targetItem.name}:`, itemEffectData);
                    ui.notifications.error(`Failed to apply breakage to ${targetItem.name}.`);
                } else {
                    if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Created item effect: ${itemEffectData.label} with changes:`, JSON.stringify(itemEffectData.changes, null, 2));
                }

                if (isArmor || isShield) {
                    const createdAcEffects = await targetItem.createEmbeddedDocuments("ActiveEffect", [acPenaltyData]);
                    if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Created item AC effect: ${acPenaltyData.label} with changes:`, JSON.stringify(acPenaltyData.changes, null, 2));
                }

                if (newDurability <= 0) {
                    await ChatMessage.create({ content: `<strong>${targetItem.name}</strong> breaks!`, speaker: { alias: "Sunder" } });
                    ui.notifications.error(`[${targetItem.name}] ${game.i18n.localize("sunder.popup.broken")}`);
                    if (breakageFailSound) AudioHelper.play({ src: breakageFailSound });
                } else {
                    await ChatMessage.create({ content: `<strong>${targetItem.name}</strong> is damaged!`, speaker: { alias: "Sunder" } });
                    ui.notifications.warn(`[${targetItem.name}] is now DAMAGED! (Durability: ${newDurability})`);
                    if (breakageFailSound) AudioHelper.play({ src: breakageFailSound });
                }

                // Close and reopen item sheet to ensure full render
                const itemSheet = targetItem.sheet;
                if (itemSheet?.rendered) {
                    await itemSheet.close();
                    await new Promise(resolve => setTimeout(resolve, 200));
                    await itemSheet.render(true);
                    if (itemSheet.element[0]) itemSheet.bringToTop();
                    console.log(`[Sunder] Re-rendered item sheet for ${targetItem.name} after repair`);
                }
            } else {
                await ChatMessage.create({ content: `<strong>${targetItem.name}</strong> resists breakage!`, speaker: { alias: "Sunder" } });
                ui.notifications.info(`[${targetItem.name}] ${game.i18n.localize("sunder.popup.safe")}`);
                if (breakagePassSound) AudioHelper.play({ src: breakagePassSound });
            }
        };

        // Store sunder flags for reuse in handleRoll
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

        // Render popup for players if they own the actor
        if (actor.ownership[game.user.id] >= 3 && !game.user.isGM) {
            if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Rendering player popup for ${actor.name}, ${item.name} (ownership confirmed)`);
            if (breakageSound) AudioHelper.play({ src: breakageSound });
            let rolled = false;
            const dialog = new Dialog({
                title: game.i18n.localize("sunder.popup.title"),
                content: content,
                buttons: {
                    roll: { 
                        label: "Roll for Breakage", 
                        callback: async (html) => {
                            // Disable buttons to prevent duplicate clicks
                            dialog.element.find('button').prop('disabled', true);
                            rolled = true;
                            if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] Roll button clicked for item:", item.name, "messageId:", messageId);
                            await handleRoll(actor, itemUuid, "roll", sunderFlags);
                        }
                    }
                },
                closeOnEscape: true,
                render: (html) => {
                    dialog.setPosition({ top: window.innerHeight * 0.2, left: window.innerWidth * 0.35 });
                    html.closest(".app").find(".window-header .close").remove();
                    if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Player dialog for ${item.name} (roll only) at top: ${dialog.position.top}`);
                },
                close: () => {
                    if (!rolled) {
                        if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Player dialog for ${item.name} closed without action`);
                    }
                }
            });
            dialog.render(true);
        }

        // Attacker info popup for crits (non-owner, non-GM)
        if (rollType === "crit" && attackerUserId && game.user.id === attackerUserId && game.user.id !== affectedUserId && !game.user.isGM && !actor.ownership[game.user.id] >= 3) {
            if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Rendering attacker info popup for ${item.name}`);
            new Dialog({
                title: game.i18n.localize("sunder.popup.title"),
                content: content + `<p>Awaiting ${actor.name}'s breakage check for their ${item.name}...</p>`,
                buttons: {},
                render: (html) => {
                    if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Attacker info dialog for ${item.name}`);
                }
            }).render(true);
        }

        // GM popup for oversight
/*
 * Update to sunder-ui.js (showBreakagePopup function, GM dialog block)
 */
if (game.user.id === gmUserId) {
    if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Rendering GM popup for ${actor.name}, ${item.name}`);
    if (breakageSound) AudioHelper.play({ src: breakageSound });
    let rolled = false;
    const dialogId = `sunder-breakage-${itemUuid}-${messageId}`; // Unique dialog ID
    if (ui.windows[dialogId]) {
        if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Dialog for ${item.name} already exists, skipping render`);
        return;
    }
    const dialog = new Dialog({
        title: game.i18n.localize("sunder.popup.title"),
        content: content,
        buttons: {
            roll: { 
                label: "Roll for Breakage", 
                callback: async (html) => {
                    dialog.element.find('button').prop('disabled', true);
                    rolled = true;
                    if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] Roll button clicked for item:", item.name, "messageId:", messageId);
                    await handleRoll(actor, itemUuid, "roll", sunderFlags);
                }
            },
            ignore: { 
                label: "Ignore", 
                callback: async (html) => {
                    dialog.element.find('button').prop('disabled', true);
                    rolled = true;
                    if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] Ignore button clicked for item:", item.name, "messageId:", messageId);
                    await handleRoll(actor, itemUuid, "ignore", sunderFlags);
                }
            }
        },
        render: (html) => {
            dialog.setPosition({ top: window.innerHeight * 0.2, left: window.innerWidth * 0.35 });
            if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] GM dialog for ${item.name} at top: ${dialog.position.top}, left: ${dialog.position.left}`);
        },
        close: () => {
            if (!rolled) {
                if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] GM dialog for ${item.name} closed without action`);
                handleRoll(actor, itemUuid, "ignore", sunderFlags, true); // Pass silent flag
            }
        }
    }, { id: dialogId });
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
    }, { once: true }); // Ensure socket emits only once
}
        
    }



static async repairItem(actor, item) {
    if (!item) {
        console.error("[Sunder] Item is undefined in repairItem");
        ui.notifications.error("Invalid item provided for repair.");
        return;
    }

    const sunderEffects = item.effects.filter(e => e.name.includes("Sunder"));
    const actorEffects = actor.effects.filter(e => e.name.includes("Sunder AC Penalty") && e.origin === item.uuid);
    if (sunderEffects.length === 0 && actorEffects.length === 0) {
        ui.notifications.info(`[${item.name}] is not damaged or broken.`);
        return;
    }

    for (const effect of sunderEffects) {
        await effect.delete();
        console.log(`[Sunder] Deleted sunder item effect: ${effect.name} (ID: ${effect.id})`);
    }
    for (const effect of actorEffects) {
        await effect.delete();
        console.log(`[Sunder] Deleted sunder actor effect: ${effect.name} (ID: ${effect.id})`);
    }

    ui.notifications.info(`[${item.name}] has been repaired to full functionality.`);

    // Close and reopen item sheet to ensure full render
    const itemSheet = item.sheet;
    if (itemSheet?.rendered) {
        await itemSheet.close();
        await new Promise(resolve => setTimeout(resolve, 200));
        await itemSheet.render(true);
        if (itemSheet.element[0]) itemSheet.bringToTop();
        console.log(`[Sunder] Re-rendered item sheet for ${item.name} after repair`);
    }
}

    static async applyEffect(data) {
        const { itemUuid, actorId, itemEffectData, acPenaltyData, newDurability, messageId } = data;
        const targetItem = await fromUuid(itemUuid);
        const targetActor = game.actors.get(actorId);
        if (!targetItem || !targetActor) {
            console.error("[Sunder] Failed to fetch item or actor for effect application:", { itemUuid, actorId });
            return;
        }

        const existingItemEffects = targetItem.effects.filter(e => e.name.includes("Sunder Enchantment") || e.name.includes("Sunder AC Penalty"));
        for (const effect of existingItemEffects) {
            await effect.delete();
            console.log(`[Sunder] Deleted existing item effect: ${effect.name} (ID: ${effect.id})`);
        }

        const createdEffects = await targetItem.createEmbeddedDocuments("ActiveEffect", [itemEffectData]);
        if (!createdEffects.length) {
            console.error(`[Sunder] Failed to create AE for ${targetItem.name}:`, itemEffectData);
            ui.notifications.error(`Failed to apply breakage to ${targetItem.name}.`);
        } else {
            if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Created item effect: ${itemEffectData.label} with changes:`, JSON.stringify(itemEffectData.changes, null, 2));
        }

        if (acPenaltyData) {
            const createdAcEffects = await targetItem.createEmbeddedDocuments("ActiveEffect", [acPenaltyData]);
            if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Created item AC effect: ${acPenaltyData.label} with changes:`, JSON.stringify(acPenaltyData.changes, null, 2));
        }

        if (newDurability <= 0) {
            await ChatMessage.create({ content: `<strong>${targetItem.name}</strong> breaks!`, speaker: { alias: "Sunder" } });
            ui.notifications.error(`[${targetItem.name}] ${game.i18n.localize("sunder.popup.broken")}`);
            if (game.settings.get("sunder", "breakageFailSound")) AudioHelper.play({ src: game.settings.get("sunder", "breakageFailSound") });
        } else {
            await ChatMessage.create({ content: `<strong>${targetItem.name}</strong> is damaged!`, speaker: { alias: "Sunder" } });
            ui.notifications.warn(`[${targetItem.name}] is now DAMAGED! (Durability: ${newDurability})`);
            if (game.settings.get("sunder", "breakageFailSound")) AudioHelper.play({ src: game.settings.get("sunder", "breakageFailSound") });
        }

        // Close and reopen item sheet to ensure full render
        const itemSheet = targetItem.sheet;
        if (itemSheet?.rendered) {
            await itemSheet.close();
            await new Promise(resolve => setTimeout(resolve, 200));
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