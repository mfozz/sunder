import * as utils from './utils.js';

export function _onRenderChatMessage(message, html) {
    utils.log("renderChatMessageHTML fired", { message });
    if (message.flags?.dnd5e?.roll?.type !== "attack") {
        utils.log("Not an attack roll, skipping renderChatMessageHTML");
        return;
    }

    let penalty = message.rolls[0]?.options?.sunderPenalty || 0;
    if (penalty === 0 && message.flags?.sunder?.itemUuid) {
        const item = fromUuidSync(message.flags.sunder.itemUuid);
        if (item && utils.isValidItem(item, "weapon")) {
            penalty = item.getFlag("sunder", "attackPenalty") || 0;
            utils.log(`Fetched penalty from item ${item.name}: ${penalty}`);
        }
    }
    if (penalty === 0) {
        utils.log("No penalty to display");
        return;
    }

    const roll = message.rolls[0];
    if (!roll || !(roll instanceof Roll)) {
        console.warn("[Sunder] No roll found in message");
        return;
    }

    if (!roll.options.sunderPenalty) {
        roll._total = roll.total + penalty;
        roll._formula = `${roll._formula} ${penalty < 0 ? "-" : "+"} ${Math.abs(penalty)}`;
        utils.log(`Adjusted roll total for penalty: ${roll._total}`);
    }

    const formulaElement = html.querySelector(".dice-formula");
    if (formulaElement) {
        formulaElement.textContent = roll._formula;
        utils.log(`Updated chat card formula: ${formulaElement.textContent}`);
    }

    const totalElement = html.querySelector(".dice-total");
    if (totalElement) {
        totalElement.textContent = roll._total || roll.total;
        utils.log(`Updated chat card total: ${roll._total || roll.total}`);
    }
}

export function _onRenderDialog(dialog, html) {
    utils.log("renderDialog fired", { dialog });
    if (!dialog.title.includes(game.i18n.localize("SUNDER.Dialog.AttackRoll"))) return;

    const itemUuid = dialog.rolls?.[0]?.options?.sunderItemUuid;
    if (!itemUuid) {
        utils.log("No sunder item UUID in roll options, skipping dialog render");
        return;
    }

    const item = fromUuidSync(itemUuid);
    if (!item || !utils.isValidItem(item, "weapon")) {
        utils.log("No valid weapon item in renderDialog, skipping");
        return;
    }

    const penalty = dialog.rolls?.[0]?.options?.sunderPenalty || 0;
    if (penalty === 0) {
        utils.log("No penalty for item in renderDialog:", item.name);
        return;
    }

    utils.log("Dialog properties:", Object.keys(dialog));
    utils.log("Dialog rolls:", dialog.rolls);
    utils.log("Dialog formula:", dialog.formula);
    utils.log("Dialog object:", dialog);

    const formulaElements = html.querySelectorAll(".dice-formula");
    if (!formulaElements.length) {
        console.warn("[Sunder] No dice-formula elements found in dialog");
    } else {
        formulaElements.forEach((element, index) => {
            utils.log(`Dice-formula element ${index}: ${element.textContent.trim()}`);
        });
    }

    const mainFormulaElement = html.querySelector(".formula");
    if (mainFormulaElement) {
        const currentFormula = mainFormulaElement.textContent.trim();
        if (!currentFormula.includes(`${penalty}`)) {
            const updatedFormula = `${currentFormula} ${penalty < 0 ? "-" : "+" } ${Math.abs(penalty)}`;
            mainFormulaElement.textContent = updatedFormula;
            utils.log(`Updated main formula element to: ${updatedFormula}`);
        } else {
            utils.log("Main formula element already includes penalty:", currentFormula);
        }
    } else {
        console.warn("[Sunder] Could not find main formula element to update");
    }
}