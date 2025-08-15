// breakage-handler.js - Logic for triggering and handling breakage events

import * as utils from './utils.js';

export async function triggerBreakage(attacker, target, rawD20, isHeavy, messageId, attackWeapon = null) {
    if (!attacker || !(attacker instanceof CONFIG.Actor.documentClass)) {
        console.error("[Sunder] No attacker found for breakage check.");
        ui.notifications.error(game.i18n.localize("SUNDER.Notification.NoAttacker"));
        return;
    }
    const threshold = utils.getBreakageThreshold("fumble");
    const criticalThreshold = utils.getBreakageThreshold("crit");
    const enableWeaponBreakage = game.settings.get("sunder", "enableWeaponBreakage");
    const enableArmorBreakage = game.settings.get("sunder", "enableArmorBreakage");
    const alwaysCheckSunder = game.settings.get("sunder", "alwaysCheckSunder");
    let itemType, item, targetActor, affectedUserId, rollType, attackerUserId;
    const gmUser = game.users.find(u => u.isGM && u.active);
    const rollingUser = game.user;
    utils.log(`Attacker: ${attacker?.name || "None"}, Target: ${target?.actor?.name || "None"}, Attacker ownership: ${JSON.stringify(attacker?.ownership || {})}`, "Rolling user: ", rollingUser.id);
    if (target) utils.log(`Target ownership: ${JSON.stringify(target.actor?.ownership || {})}`);
    utils.log(`Raw d20: ${rawD20}, Fumble Threshold: ${threshold}, Crit Threshold: ${criticalThreshold}`);
    if (alwaysCheckSunder || (rawD20 <= threshold && enableWeaponBreakage)) {
        itemType = "weapon";
        targetActor = attacker;
        item = attackWeapon;
        if (!item || !(item instanceof CONFIG.Item.documentClass)) {
            item = targetActor.items.find(i => i.type === "weapon" && i.system.equipped && i.system?.type?.value !== "natural");
        }
        if (!item || !(item instanceof CONFIG.Item.documentClass)) {
            utils.log("No valid equipped weapon found for fumble breakage.");
            return;
        }
        const durabilityByRarityRaw = game.settings.get("sunder", "durabilityByRarity");
        let durabilityByRarity;
        try {
            durabilityByRarity = JSON.parse(durabilityByRarityRaw);
        } catch (e) {
            durabilityByRarity = { common: 1, uncommon: 2, rare: 3, veryRare: 4, legendary: 5 };
            console.error("[Sunder] Invalid durabilityByRarity JSON, using default:", e);
            ui.notifications.error(game.i18n.localize("SUNDER.Notification.InvalidDurabilityJSON"));
        }
        const rarity = item.system?.rarity || "common";
        const baseDurability = durabilityByRarity[rarity] || 3;
        let durability = foundry.utils.hasProperty(item, "flags.sunder.durability") ? await item.getFlag("sunder", "durability") : undefined;
        utils.log(`Weapon ${item.name}: flag durability=${durability}, baseDurability=${baseDurability}`);
        if (durability === undefined) {
            const sunderEffect = (item.effects || []).find(e => e.label?.includes("Sunder Enchantment"));
            if (sunderEffect) {
                const durabilityChange = sunderEffect.changes.find(c => c.key === "flags.sunder.durability");
                durability = durabilityChange ? Number(durabilityChange.value) : baseDurability;
                utils.log(`Fetched durability from AE for ${item.name}: ${durability}`);
            } else {
                durability = baseDurability;
                utils.log(`No AE found, using baseDurability for ${item.name}: ${durability}`);
            }
        }
        if (durability <= 0) {
            utils.log("Item already broken, skipping breakage check.");
            return;
        }
        affectedUserId = game.users.find(u => !u.isGM && (u.character?.id === targetActor.id || targetActor.ownership[u.id] >= 3))?.id || gmUser?.id;
        rollType = "fumble";
        attackerUserId = game.users.find(u => !u.isGM && (u.character?.id === attacker.id || attacker.ownership[u.id] >= 3))?.id || gmUser?.id;
    } else if (alwaysCheckSunder || (rawD20 >= criticalThreshold && enableArmorBreakage)) {
        itemType = "armor";
        targetActor = target ? target.actor : null;
        if (!targetActor || !(targetActor instanceof CONFIG.Actor.documentClass)) {
            utils.log("No target actor found for crit breakage check.");
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
        if (!item || !(item instanceof CONFIG.Item.documentClass)) {
            utils.log("No valid armor or shield found for crit breakage.");
            return;
        }
        affectedUserId = game.users.find(u => !u.isGM && (u.character?.id === targetActor.id || targetActor.ownership[u.id] >= 3))?.id || gmUser?.id;
        rollType = "crit";
        attackerUserId = game.users.find(u => !u.isGM && (u.character?.id === attacker.id || attacker.ownership[u.id] >= 3))?.id || gmUser?.id;
    } else {
        utils.log("Raw d20 does not meet breakage thresholds or mechanic disabled:", rawD20);
        return;
    }
    if (!item || !targetActor) {
        utils.log("No valid item or target actor found for breakage.");
        return;
    }
    if (!messageId) {
        console.warn("[Sunder] No message ID provided for breakage popup, using null");
    }

    const attackerToken = canvas.tokens.get(attacker.token) || canvas.tokens.placeables.find(t => t.actor?.id === attacker.id);
    const targetToken = target;
    const targetTokenUuid = rollType === "fumble" ? (attackerToken?.document.uuid || `Actor.${targetActor.id}`) : (targetToken?.document.uuid || `Actor.${targetActor.id}`);
    utils.log(`targetTokenUuid set to: ${targetTokenUuid}, attackerToken: ${attackerToken?.id}, targetToken: ${targetToken?.id}`);

    utils.log("Breakage details:", {
        attackerId: attacker?.id,
        attackerName: attacker?.name,
        attackerTokenId: attackerToken?.id,
        targetActorId: targetActor?.id,
        targetTokenId: targetToken?.id,
        targetTokenUuid: targetTokenUuid,
        itemName: item?.name,
        itemUuid: item?.uuid,
        itemOwnerId: item?.parent?.id,
        rollType,
        affectedUserId,
        attackerUserId,
        gmUserId: gmUser?.id
    });
    utils.log("Creating chat message for breakage:", {
        item: item.name,
        attacker: attacker.name,
        target: targetToken?.name,
        isHeavy,
        rollType,
        affectedUserId,
        attackerUserId,
        gmUserId: gmUser?.id
    });

    if (rollingUser.id === game.user.id) {
        await ChatMessage.create({
            content: game.i18n.localize("SUNDER.Notification.BreakageTriggered"),
            speaker: { alias: attacker.name },
            type: CONST.CHAT_MESSAGE_STYLES.OOC,
            flags: {
                sunder: {
                    attackerTokenUuid: attackerToken?.document.uuid,
                    targetTokenUuid: targetTokenUuid,
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