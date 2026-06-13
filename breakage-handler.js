// breakage-handler.js - Logic for triggering and handling breakage events

import * as utils from './utils.js';

export async function triggerBreakage(attacker, target, rawD20, isHeavy, messageId, attackWeapon = null, options = {}) {
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
    let item, targetActor, affectedUserId, rollType, attackerUserId;
    const gmUserId = utils.getActiveGMId();
    const rollingUser = game.user;
    utils.log(`Attacker: ${attacker?.name || "None"}, Target: ${target?.actor?.name || "None"}, Attacker ownership: ${JSON.stringify(attacker?.ownership || {})}`, "Rolling user: ", rollingUser.id);
    if (target) utils.log(`Target ownership: ${JSON.stringify(target.actor?.ownership || {})}`);
    utils.log(`Raw d20: ${rawD20}, Fumble Threshold: ${threshold}, Crit Threshold: ${criticalThreshold}`);
    if (alwaysCheckSunder || (rawD20 <= threshold && enableWeaponBreakage)) {
        targetActor = attacker;
        item = attackWeapon;
        if (!item || !(item instanceof CONFIG.Item.documentClass)) {
            item = utils.getEquippedWeapon(targetActor);
        }
        if (!item || !(item instanceof CONFIG.Item.documentClass)) {
            utils.log("No valid equipped weapon found for fumble breakage.");
            return;
        }
        const baseDurability = utils.getBaseDurability(item);
        let durability = foundry.utils.hasProperty(item, "flags.sunder.durability") ? await item.getFlag("sunder", "durability") : undefined;
        utils.log(`Weapon ${item.name}: flag durability=${durability}, baseDurability=${baseDurability}`);
        if (durability === undefined) {
            const sunderEffect = (item.effects || []).find(e => e.name?.includes("Sunder Enchantment"));
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
        affectedUserId = utils.getResponsibleUserId(targetActor);
        rollType = "fumble";
        attackerUserId = utils.getResponsibleUserId(attacker);
    } else if (alwaysCheckSunder || (rawD20 >= criticalThreshold && enableArmorBreakage)) {
        if (options.attackHitsTarget !== true) {
            utils.log("Attack did not hit target, skipping armor breakage check.", {
                rawD20,
                attackHitsTarget: options.attackHitsTarget,
                target: target?.name
            });
            return;
        }
        targetActor = target ? target.actor : null;
        if (!targetActor || !(targetActor instanceof CONFIG.Actor.documentClass)) {
            utils.log("No target actor found for crit breakage check.");
            return;
        }
        item = utils.getEquippedArmorOrShield(targetActor);
        if (!item || !(item instanceof CONFIG.Item.documentClass)) {
            utils.log("No valid armor or shield found for crit breakage.");
            return;
        }
        affectedUserId = utils.getResponsibleUserId(targetActor);
        rollType = "crit";
        attackerUserId = utils.getResponsibleUserId(attacker);
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

    const attackerToken = canvas.tokens.get(attacker.token?.id ?? attacker.token) || canvas.tokens.placeables.find(t => t.actor?.id === attacker.id);
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
        gmUserId
    });
    utils.log("Creating chat message for breakage:", {
        item: item.name,
        attacker: attacker.name,
        target: targetToken?.name,
        isHeavy,
        rollType,
        affectedUserId,
        attackerUserId,
        gmUserId
    });

    if (rollingUser.id === game.user.id) {
        await ChatMessage.create({
            content: game.i18n.localize("SUNDER.Notification.BreakageTriggered"),
            speaker: { alias: attacker.name },
            style: CONST.CHAT_MESSAGE_STYLES.OOC,
            flags: {
                sunder: {
                    attackerTokenUuid: attackerToken?.document.uuid,
                    targetTokenUuid: targetTokenUuid,
                    itemUuid: item.uuid,
                    isHeavy,
                    rollType,
                    affectedUserId,
                    attackerUserId,
                    gmUserId
                }
            }
        });
    }
}
