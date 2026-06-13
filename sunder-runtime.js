import * as utils from './utils.js';
import { SunderUI_v2 } from './sunder-ui.js';

export function registerRuntime() {
    game.sunderUI = SunderUI_v2;
    utils.log("SunderUI_v2 Module Initialized");

    game.socket.on("module.sunder", async (data) => {
        if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Socket event received: ${JSON.stringify(data)}`);
        await handleSocketMessage(data);
    });
}

async function handleSocketMessage(data) {
    if (!game.user.isGM) return;

    if (data.type === "showBreakagePopup") {
        await handleShowBreakagePopupSocket(data);
    } else if (data.type === "applyEffect") {
        await handleApplyEffectSocket(data);
    }
}

async function handleShowBreakagePopupSocket(data) {
    const actor = game.actors.get(data.actorId);
    const item = await fromUuid(`Actor.${data.actorId}.Item.${data.itemId}`);
    if (!actor || !item) return;

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

async function handleApplyEffectSocket(data) {
    await game.sunderUI.applyEffect(data);
}
