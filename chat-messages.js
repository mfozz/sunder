import * as utils from './utils.js';
import * as attackRolls from './attack-rolls.js';

export async function onCreateChatMessage(message) {
    if (message.flags?.sunder && !message.flags.sunder.resolveBreakage) {
        await showBreakagePopupFromMessage(message);
    }

    const resolveData = message.getFlag("sunder", "resolveBreakage");
    if (resolveData) {
        utils.log("Processing resolveBreakage:", resolveData);
        game.sunderUI?.closeDialogsForMessage?.(resolveData.messageId);
    }

    await attackRolls.onAttackChatMessage(message);
}

async function showBreakagePopupFromMessage(message) {
    const context = await resolveBreakageMessageContext(message);
    if (!context) return;

    const { flags, actor, item } = context;

    const currentUserId = game.user.id;
    const isGM = game.user.isGM;
    const isOwner = utils.isActorOwner(actor);

    utils.log("Checking popup gate: isGM=", isGM, "isOwner=", isOwner, "currentUserId=", currentUserId, "affectedUserId=", flags.affectedUserId, "actorId=", actor.id);

    if (isGM || (isOwner && currentUserId === flags.affectedUserId)) {
        utils.log("Showing breakage popup for ", isGM ? "GM" : "Player", ": ", actor.name, ", ", item.name);
        await game.sunderUI.showBreakagePopup(
            actor,
            item,
            flags.isHeavy,
            flags.gmUserId,
            flags.affectedUserId,
            flags.rollType,
            flags.attackerUserId,
            message.id
        );
    }
}

async function resolveBreakageMessageContext(message) {
    const flags = message.flags.sunder;
    utils.log("Chat message flags:", {
        targetTokenUuid: flags.targetTokenUuid,
        itemUuid: flags.itemUuid,
        attackerTokenUuid: flags.attackerTokenUuid,
        rollType: flags.rollType
    });

    const actor = await resolveBreakageActor(flags);
    const item = await fromUuid(flags.itemUuid);
    if (!actor || !item) {
        console.error("[Sunder] Failed to resolve actor or item from chat flags:", flags);
        ui.notifications.error(game.i18n.localize("SUNDER.Notification.FailedResolveActorItem"));
        return null;
    }

    return { flags, actor, item };
}

async function resolveBreakageActor(flags) {
    if (!flags.targetTokenUuid) {
        console.error("[Sunder] targetTokenUuid is undefined in chat flags:", flags);
        ui.notifications.error(game.i18n.localize("SUNDER.Notification.MissingTargetUuid"));
        return null;
    }

    const tokenActor = (await fromUuid(flags.targetTokenUuid))?.actor;
    if (tokenActor) return tokenActor;

    const actorId = flags.targetTokenUuid.includes("Actor.") ? flags.targetTokenUuid.split("Actor.").pop() : null;
    if (!actorId) {
        console.error("[Sunder] Invalid targetTokenUuid format:", flags.targetTokenUuid);
        ui.notifications.error(game.i18n.localize("SUNDER.Notification.InvalidTargetUuid"));
        return null;
    }

    const actor = game.actors.get(actorId);
    utils.log("Fallback actor fetch:", actor?.name, "ID:", actor?.id);
    return actor;
}
