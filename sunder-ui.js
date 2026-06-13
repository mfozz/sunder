/*
 * Sunder UI Module for Foundry VTT D&D 5e
 */
import * as utils from './utils.js';
import * as effects from './effects.js';
import * as breakageRoll from './breakage-roll.js';
import * as breakageContext from './breakage-context.js';

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

        const autoRollBreakageChecks = game.settings.get("sunder", "autoRollBreakageChecks");
        if (autoRollBreakageChecks && game.user.id !== gmUserId) return;

        const context = await breakageContext.prepareBreakageDialogContext({ actor, item, isHeavy });
        const {
            breakageDC,
            weaponAttackPenalty,
            breakageSound,
            breakagePassSound,
            breakageFailSound,
            heavyBonus,
            durability,
            isWeapon,
            isArmor,
            isShield,
            currentPrice,
            originItem,
            actorName,
            itemName,
            content
        } = context;
        const itemUuid = item.uuid;

        const sunderFlags = {
            targetTokenUuid: actor.isToken ? actor.token.uuid : `Actor.${actor.id}`,
            itemUuid: item.uuid,
            attackerTokenUuid: null,
            rollType: rollType,
            isHeavy: isHeavy,
            gmUserId: gmUser.id,
            affectedUserId: affectedUserId,
            attackerUserId: attackerUserId
        };

        const resolveBreakageAction = (resolution, silent = false) => breakageRoll.resolveBreakageAction({
            targetActor: actor,
            targetItemUuid: itemUuid,
            resolution,
            sunderFlags,
            messageId,
            isHeavy,
            heavyBonus,
            breakageDC,
            durability,
            sourceItem: item,
            isWeapon,
            isArmor,
            isShield,
            currentPrice,
            originItem,
            weaponAttackPenalty,
            breakageFailSound,
            breakagePassSound,
            silent
        });

        if (autoRollBreakageChecks) {
            if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Auto-rolling breakage check for ${actor.name}, ${item.name}`);
            if (breakageSound) foundry.audio.AudioHelper.play({ src: breakageSound });
            await resolveBreakageAction("roll");
            return;
        }

        // Player dialog (owner)
        if (utils.isActorOwner(actor) && !game.user.isGM) {
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
                        await resolveBreakageAction("roll");
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
        if (rollType === "crit" && attackerUserId && game.user.id === attackerUserId && game.user.id !== affectedUserId && !game.user.isGM && !utils.isActorOwner(actor)) {
            if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Rendering attacker info popup for ${item.name}`);
            const dialog = new foundry.applications.api.DialogV2({
                window: { title: game.i18n.localize("sunder.popup.title") },
                content: content + `<p>Awaiting ${actorName}'s breakage check for their ${itemName}...</p>`,
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
                            await resolveBreakageAction("roll");
                        }
                    },
                    {
                        action: "ignore",
                        label: "Ignore",
                        callback: async () => {
                            rolled = true;
                            if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] Ignore button clicked for item:", item.name, "messageId:", messageId);
                            await resolveBreakageAction("ignore");
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
        } else if (gmUserId && !utils.isActorOwner(actor)) {
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
            });
        }
    }





    static async repairItem(actor, item) {
        return effects.repairItem(actor, item);
    }

    static async applyEffect(data) {
        return effects.applyEffectFromSocket(data);
    }
}

export { SunderUI_v2 };
