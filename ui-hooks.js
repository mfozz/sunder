import * as utils from './utils.js';

function getHTMLElement(html) {
    if (!html) return null;
    if (html instanceof HTMLElement) return html;
    if (html[0] instanceof HTMLElement) return html[0];
    return html.element instanceof HTMLElement ? html.element : null;
}

function getApplicationElement(app, html) {
    return getHTMLElement(html) ?? getHTMLElement(app?.element);
}

function isAttackRollDialog(dialog, element) {
    const title = dialog?.title ?? dialog?.window?.title?.textContent ?? "";
    const attackRollTitle = game.i18n.localize("SUNDER.Dialog.AttackRoll");
    return title.includes(attackRollTitle) ||
        title.includes("Attack Roll") ||
        element?.classList.contains("roll-configuration") ||
        element?.querySelector(".roll-configuration");
}

export function onRenderAttackRollApplication(app, html, logMessage) {
    const element = getApplicationElement(app, html);
    if (!isAttackRollDialog(app, element)) return;

    utils.log(logMessage);
    _onRenderDialog(app, element);
}

export function _onRenderChatMessage(message, html) {
    const element = getHTMLElement(html);
    if (!element) return;

    if (message.flags?.dnd5e?.roll?.type !== "attack") {
        return;
    }

    const penalty = getChatAttackPenalty(message);
    if (penalty === 0) return;

    utils.log("renderChatMessageHTML applying Sunder penalty", "message:", message.id, "penalty:", penalty);

    const roll = message.rolls[0];
    if (!roll || !(roll instanceof Roll)) {
        console.warn("[Sunder] No roll found in message");
        return;
    }

    applyPenaltyToRollDisplay(roll, penalty);
    updateChatRollElements(element, roll);
}

function getChatAttackPenalty(message) {
    let penalty = message.rolls[0]?.options?.sunderPenalty || 0;
    if (penalty !== 0 || !message.flags?.sunder?.itemUuid) return penalty;

    const item = fromUuidSync(message.flags.sunder.itemUuid);
    if (item && utils.isValidItem(item, "weapon")) {
        penalty = item.getFlag("sunder", "attackPenalty") || 0;
        utils.log(`Fetched penalty from item ${item.name}: ${penalty}`);
    }

    return penalty;
}

function applyPenaltyToRollDisplay(roll, penalty) {
    if (roll.options.sunderPenalty) return;

    roll._total = roll.total + penalty;
    roll._formula = `${roll._formula} ${penalty < 0 ? "-" : "+"} ${Math.abs(penalty)}`;
    utils.log(`Adjusted roll total for penalty: ${roll._total}`);
}

function updateChatRollElements(element, roll) {
    const formulaElement = element.querySelector(".dice-formula");
    if (formulaElement) {
        formulaElement.textContent = roll._formula;
        utils.log(`Updated chat card formula: ${formulaElement.textContent}`);
    }

    const totalElement = element.querySelector(".dice-total");
    if (totalElement) {
        totalElement.textContent = roll._total || roll.total;
        utils.log(`Updated chat card total: ${roll._total || roll.total}`);
    }
}

export function _onRenderDialog(dialog, html) {
    const element = getHTMLElement(html);
    if (!element) return;

    utils.log("renderDialog fired", dialog.title ?? dialog.window?.title?.textContent ?? dialog.constructor?.name);
    if (!isAttackRollDialog(dialog, element)) return;

    const context = getDialogPenaltyContext(dialog);
    if (!context) return;

    updateDialogFormulaElement(element, context.penalty);
}

function getDialogPenaltyContext(dialog) {
    const itemUuid = dialog.rolls?.[0]?.options?.sunderItemUuid;
    if (!itemUuid) {
        utils.log("No sunder item UUID in roll options, skipping dialog render");
        return null;
    }

    const item = fromUuidSync(itemUuid);
    if (!item || !utils.isValidItem(item, "weapon")) {
        utils.log("No valid weapon item in renderDialog, skipping");
        return null;
    }

    const penalty = dialog.rolls?.[0]?.options?.sunderPenalty || 0;
    if (penalty === 0) {
        utils.log("No penalty for item in renderDialog:", item.name);
        return null;
    }

    return { item, penalty };
}

function updateDialogFormulaElement(element, penalty) {
    const mainFormulaElement = element.querySelector(".formula");
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
