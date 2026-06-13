import * as effects from './effects.js';

export async function resolveBreakageAction({
    targetActor,
    targetItemUuid,
    resolution,
    sunderFlags,
    messageId,
    isHeavy,
    heavyBonus,
    breakageDC,
    durability,
    sourceItem,
    isWeapon,
    isArmor,
    isShield,
    currentPrice,
    originItem,
    weaponAttackPenalty,
    breakageFailSound,
    breakagePassSound,
    silent = false
}) {
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
                        resolveBreakage: { resolution: "ignore", itemUuid: targetItem.uuid, messageId }
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
    } catch (error) {
        console.error(`[Sunder] Failed to evaluate roll ${rollFormula}:`, error);
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
                resolveBreakage: { resolution: rollResult < breakageDC ? "fail" : "pass", itemUuid: targetItem.uuid, messageId }
            }
        }
    });

    if (rollResult < breakageDC) {
        const newDurability = Math.max(0, durability - 1);
        await effects.applyBreakageFailure({
            targetActor,
            targetItem,
            sourceItem,
            isWeapon,
            isArmor,
            isShield,
            newDurability,
            currentPrice,
            originItem,
            weaponAttackPenalty,
            messageId,
            breakageFailSound
        });
        return;
    }

    await ChatMessage.create({ content: `<strong>${targetItem.name}</strong> resists breakage!`, speaker: { alias: "Sunder" } });
    ui.notifications.info(`[${targetItem.name}] ${game.i18n.localize("sunder.popup.safe")}`);
    if (breakagePassSound) foundry.audio.AudioHelper.play({ src: breakagePassSound });
}
