import * as utils from './utils.js';

function getApplicationElement(app) {
    if (app?.element instanceof HTMLElement) return app.element;
    if (app?.element?.[0] instanceof HTMLElement) return app.element[0];
    return null;
}

async function rerenderItemSheet(item, { close = true } = {}) {
    const itemSheet = item?.sheet;
    if (!itemSheet?.rendered) return;

    if (close) {
        await itemSheet.close();
        await new Promise(resolve => setTimeout(resolve, 500));
        await itemSheet.render(true);
    } else {
        await itemSheet.render(false);
    }

    if (getApplicationElement(itemSheet)) itemSheet.bringToTop();
    console.log(`[Sunder] Re-rendered item sheet for ${item.name}`);
}

function getMagicalBonus(item) {
    let magicalBonus = item.system?.armor?.magicalBonus || item.system?.magicalBonus || 0;
    if (magicalBonus) return magicalBonus;

    const magicalEffect = item.effects.find(e => e.changes?.some(c => c.key === "system.armor.magicalBonus" || c.key === "system.magicalBonus"));
    return Number(magicalEffect?.changes?.find(c => c.key === "system.armor.magicalBonus" || c.key === "system.magicalBonus")?.value) || 0;
}

export function buildBreakageEffectData({ sourceItem, targetItem, targetActor, isWeapon, isArmor, isShield, newDurability, currentPrice, originItem, weaponAttackPenalty }) {
    const itemEffectData = {
        name: `Sunder Enchantment: ${newDurability <= 0 ? "Broken" : "Damaged"}`,
        icon: "icons/svg/downgrade.svg",
        transfer: false,
        disabled: false,
        changes: [],
        origin: originItem || targetItem.uuid || targetActor?.uuid || sourceItem?.uuid,
        duration: {},
        flags: {
            dae: { enableCondition: "", disableCondition: "", stackable: "multi", showIcon: false, durationExpression: "", specialDuration: [] },
            dnd5e: { type: "enchantment", riders: { statuses: [] } },
            core: { overlay: false }
        },
        sourceName: "Sunder Enchantment"
    };

    const acPenaltyData = {
        name: `Sunder AC Penalty: ${targetItem.name} ${newDurability <= 0 ? "(Broken)" : "(Damaged)"}`,
        icon: "icons/svg/downgrade.svg",
        changes: [],
        flags: {
            dae: { stackable: "multi", transfer: true, enableCondition: "", disableCondition: "!item.equipped", showIcon: false },
            core: { overlay: false }
        },
        origin: targetItem.uuid
    };

    const baseArmorValue = isShield ? 2 : isArmor ? (targetItem.system.armor?.base || 16) : 0;
    const magicalBonus = getMagicalBonus(targetItem);
    if (game.settings.get("sunder", "testingMode")) {
        console.log(`[Sunder] Damage calc for ${targetItem.name}: baseArmorValue=${baseArmorValue}, magicalBonus=${magicalBonus}`);
    }

    let acPenalty = 0;
    if (isShield) {
        const shieldBonus = baseArmorValue + magicalBonus;
        acPenalty = newDurability <= 0 ? -shieldBonus : -Math.round(shieldBonus / 2);
        if (game.settings.get("sunder", "testingMode")) {
            console.log(`[Sunder] Shield penalty: baseArmorValue=${baseArmorValue}, magicalBonus=${magicalBonus}, shieldBonus=${shieldBonus}, newDurability=${newDurability}, acPenalty=${acPenalty}`);
        }
    } else if (isArmor) {
        const acContribution = Math.max(0, baseArmorValue - 10 + magicalBonus);
        acPenalty = newDurability <= 0 ? -acContribution : -Math.round(acContribution / 2);
        if (game.settings.get("sunder", "testingMode")) {
            console.log(`[Sunder] Armor penalty: baseArmorValue=${baseArmorValue}, magicalBonus=${magicalBonus}, acContribution=${acContribution}, newDurability=${newDurability}, acPenalty=${acPenalty}`);
        }
    }

    itemEffectData.changes.push({ key: "flags.sunder.durability", mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: newDurability });
    itemEffectData.changes.push({ key: "flags.sunder.damaged", mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: true });

    const pricePenalty = newDurability <= 0 ? -currentPrice : -(currentPrice / 2);
    itemEffectData.changes.push({ key: "system.price.value", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: pricePenalty });
    if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Applying price penalty to ${targetItem.name}: ${pricePenalty} gp`);

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

    return {
        itemEffectData,
        acPenaltyData: (isArmor || isShield) ? acPenaltyData : null
    };
}

export async function applyBreakageFailure({ targetActor, targetItem, sourceItem, isWeapon, isArmor, isShield, newDurability, currentPrice, originItem, weaponAttackPenalty, messageId, breakageFailSound }) {
    const { itemEffectData, acPenaltyData } = buildBreakageEffectData({
        sourceItem,
        targetItem,
        targetActor,
        isWeapon,
        isArmor,
        isShield,
        newDurability,
        currentPrice,
        originItem,
        weaponAttackPenalty
    });

    if (!targetItem.parent.testUserPermission(game.user, "OWNER")) {
        await game.socket.emit("module.sunder", {
            type: "applyEffect",
            itemUuid: targetItem.uuid,
            actorId: targetActor.id,
            itemEffectData,
            acPenaltyData,
            newDurability,
            messageId
        });
        return;
    }

    await applyEffectData({ targetItem, itemEffectData, acPenaltyData, newDurability, breakageFailSound });
}

export async function applyEffectFromSocket(data) {
    const { itemUuid, itemEffectData, acPenaltyData, newDurability } = data;
    const targetItem = await fromUuid(itemUuid);
    if (!targetItem) {
        console.error("[Sunder] Failed to fetch item for effect application:", data);
        return;
    }

    const breakageFailSound = game.settings.get("sunder", "breakageFailSound");
    await applyEffectData({ targetItem, itemEffectData, acPenaltyData, newDurability, breakageFailSound });
}

async function applyEffectData({ targetItem, itemEffectData, acPenaltyData, newDurability, breakageFailSound }) {
    const existingItemEffects = utils.getSunderEffects(targetItem);
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

    if (acPenaltyData) {
        await targetItem.createEmbeddedDocuments("ActiveEffect", [acPenaltyData]);
        if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Created item AC effect: ${acPenaltyData.name} with changes:`, JSON.stringify(acPenaltyData.changes, null, 2));
    }

    if (newDurability <= 0) {
        await ChatMessage.create({ content: `<strong>${targetItem.name}</strong> breaks!`, speaker: { alias: "Sunder" } });
        ui.notifications.error(`[${targetItem.name}] ${game.i18n.localize("sunder.popup.broken")}`);
    } else {
        await ChatMessage.create({ content: `<strong>${targetItem.name}</strong> is damaged!`, speaker: { alias: "Sunder" } });
        ui.notifications.warn(`[${targetItem.name}] is now DAMAGED! (Durability: ${newDurability})`);
    }

    if (breakageFailSound) foundry.audio.AudioHelper.play({ src: breakageFailSound });
    await rerenderItemSheet(targetItem);
}

export async function repairItem(actor, item) {
    if (!item) {
        console.error("[Sunder] Item is undefined in repairItem");
        ui.notifications.error("Invalid item provided for repair.");
        return;
    }

    const sunderEffects = utils.getSunderEffects(item);
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
    await rerenderItemSheet(item, { close: false });
}
