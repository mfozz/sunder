import * as utils from './utils.js';
import * as breakageHandler from './breakage-handler.js';

export async function onPreUseActivity(activity, config) {
    utils.log("preUseActivity fired");
    try {
        const item = utils.getValidWeaponItem(activity);
        if (!item) {
            utils.log("No valid weapon item for breakage");
            return;
        }
        const penalty = utils.getItemPenalty(item);
        if (penalty !== 0) {
            utils.log(`Checked penalty for ${item.name}: ${penalty}`);
            utils.log(`Applying penalty ${penalty} to attack roll config for ${item.name}`);
        }

        const rollConfig = ensurePrimaryRollConfig(config);
        storeSunderRollOptions(rollConfig, item, penalty);
        hydrateRollTermsFromFormula(config, rollConfig);
        applyPenaltyToRollConfig(config, rollConfig, penalty);
        if (penalty !== 0) logFinalRollConfig(config, rollConfig);
    } catch (error) {
        console.error("[Sunder] Error in preUseActivity:", error);
        ui.notifications.error(game.i18n.localize("SUNDER.Notification.ErrorPreUseActivity"));
    }
}

function ensurePrimaryRollConfig(config) {
    if (!config.rolls) config.rolls = [{ options: {} }];
    if (!config.rolls[0].options) config.rolls[0].options = {};
    return config.rolls[0];
}

function storeSunderRollOptions(rollConfig, item, penalty) {
    rollConfig.options.sunderItemUuid = item.uuid;
    rollConfig.options.sunderPenalty = penalty;
    if (penalty !== 0) utils.log(`Stored in roll options: sunderItemUuid: ${item.uuid}, sunderPenalty: ${penalty}`);
}

function hydrateRollTermsFromFormula(config, rollConfig) {
    if (rollConfig.terms) return;

    const formula = config.formula || "1d20 + 0";
    rollConfig.terms = formula.split(/[\s+]+/)
        .map(createRollTermFromFormulaPart)
        .filter(term => term !== null);
    rollConfig.parts = rollConfig.terms
        .filter(isRollPartTerm)
        .map(term => term.formula || term.number?.toString());
    rollConfig.formula = rollConfig.parts.join(" + ");
    config.formula = rollConfig.formula;
}

function createRollTermFromFormulaPart(term) {
    if (/^\d*d\d+$/.test(term)) {
        const match = foundry.dice.terms.DiceTerm.matchTerm(term);
        return match ? foundry.dice.terms.DiceTerm.fromMatch(match) : null;
    }
    if (/^[+\-*/]$/.test(term)) {
        return new foundry.dice.terms.OperatorTerm({ operator: term });
    }
    if (!isNaN(Number(term))) {
        return new foundry.dice.terms.NumericTerm({ number: Number(term) });
    }
    return null;
}

function isRollPartTerm(term) {
    return term instanceof foundry.dice.terms.DiceTerm || term instanceof foundry.dice.terms.NumericTerm;
}

function applyPenaltyToRollConfig(config, rollConfig, penalty) {
    if (penalty === 0) return;

    const penaltyTerm = new foundry.dice.terms.NumericTerm({ number: Math.abs(penalty) });
    rollConfig.terms.push(new foundry.dice.terms.OperatorTerm({ operator: penalty < 0 ? "-" : "+" }));
    rollConfig.terms.push(penaltyTerm);
    rollConfig.parts = rollConfig.terms
        .map(getRollTermDisplayValue)
        .filter(Boolean);
    rollConfig.formula = rollConfig.terms.map(getRollTermDisplayValue).join(" ");
    config.formula = rollConfig.formula;
}

function getRollTermDisplayValue(term) {
    return term.formula || term.operator || term.number?.toString();
}

function logFinalRollConfig(config, rollConfig) {
    const logTerms = rollConfig.terms
        .filter(isRollPartTerm)
        .map(term => term.formula || term.number);
    utils.log(`Updated roll config: Formula: ${config.formula}, Terms: ${JSON.stringify(logTerms)}`);
}

export async function onPreDisplayCard(item, cardData) {
    utils.log("preDisplayCard called with item:", item?.name);
    if (!item || !cardData) {
        console.warn("[Sunder] Missing item or cardData in preDisplayCard, skipping");
        return;
    }
    if (item.type !== "weapon" || !cardData.rolls || !cardData.rolls.length || item.system?.type?.value === "natural") {
        utils.log("No valid weapon item for breakage:", item?.name);
        return;
    }
    const penalty = await item.getFlag("sunder", "attackPenalty") || 0;
    if (penalty === 0) {
        return;
    }
    utils.log(`Applying penalty ${penalty} to attack card for ${item.name}`);
    const roll = cardData.rolls[0];
    if (roll instanceof Roll) {
        const originalTotal = roll.total;
        roll._total = originalTotal + penalty;
        roll.options.sunderPenalty = penalty;
        roll.options.sunderItemUuid = item.uuid;
        utils.log(`Updated attack card roll: Formula: ${roll._formula}, Original total: ${originalTotal}, New total: ${roll._total}`);
    } else {
        console.warn("[Sunder] Roll in cardData is not a Roll instance:", roll);
    }
}

export async function handleMidiQolWorkflow(workflow) {
    utils.log("Handling MIDI QOL workflow:", workflow.id);
    const roll = workflow.attackRoll;
    if (!roll) {
        utils.log("No attack roll found in workflow.");
        return;
    }
    const item = await resolveMidiWorkflowItem(workflow, roll);
    const rawD20 = getRawD20Result(roll);
    utils.log("MIDI Roll data:", "Raw d20 (kept):", rawD20, "Final result:", roll.total);
    if (rawD20 === undefined) return;
    const attacker = workflow.actor;
    utils.log("MIDI Attacker:", attacker?.name);
    const isHeavy = item?.system.properties?.has("hvy") || false;
    utils.log("MIDI Attacker weapon:", item?.name || "None", "Is Heavy:", isHeavy);
    if (await shouldStopMidiBreakageForInvalidWeapon(workflow, attacker, item, rawD20, isHeavy)) return;

    await applyMidiAttackPenalty(workflow, roll, item);
    const target = getFirstTarget(workflow.targets);
    const attackHitsTarget = utils.didAttackHitTarget(roll, target, rawD20, workflow);
    await breakageHandler.triggerBreakage(attacker, target, rawD20, isHeavy, workflow.id, item, { attackHitsTarget });
}

async function resolveMidiWorkflowItem(workflow, roll) {
    if (workflow.item) return workflow.item;
    if (!roll.options?.sunderItemUuid) return null;

    const item = await fromUuid(roll.options.sunderItemUuid);
    utils.log("Using roll options item lookup: UUID:", roll.options.sunderItemUuid, "Item found:", item?.name || "None", "weaponType:", item?.system?.type?.value);
    return item;
}

async function shouldStopMidiBreakageForInvalidWeapon(workflow, attacker, item, rawD20, isHeavy) {
    if (item && item.type === "weapon" && !(item.system?.type?.value === "natural" && rawD20 <= game.settings.get("sunder", "breakageThreshold"))) {
        return false;
    }

    utils.log("No valid weapon item found for breakage:", item?.name);
    if (item?.system?.type?.value === "natural" && rawD20 >= game.settings.get("sunder", "criticalBreakageThreshold")) {
        await breakageHandler.triggerBreakage(attacker, null, rawD20, isHeavy, workflow.id, item);
    }
    return true;
}

async function applyMidiAttackPenalty(workflow, roll, item) {
    const penalty = await item.getFlag("sunder", "attackPenalty") || 0;
    if (penalty === 0) return;

    utils.log(`Checked penalty for ${item.name}: ${penalty}`);
    utils.log(`Applying penalty ${penalty} to MIDI attack roll for ${item.name}`);
    const originalTotal = roll.total;
    roll._total = originalTotal + penalty;
    roll._formula = `${roll._formula} ${penalty < 0 ? "-" : "+" } ${Math.abs(penalty)}`;
    utils.log(`Updated MIDI roll: Formula: ${roll._formula}, Original total: ${originalTotal}, New total: ${roll._total}`);
    roll.options.sunderPenalty = penalty;
    workflow.attackRoll = roll;
}

export async function onAttackChatMessage(message) {
    const isRoll = isRollMessage(message);
    if (!isRoll) return;

    if (!isOwnDnd5eAttackRollMessage(message)) return;

    const roll = message.rolls?.[0];
    const rawD20 = getRawD20Result(roll);
    if (rawD20 === undefined) return;

    const attacker = resolveAttackerFromMessage(message);
    if (!attacker) {
        console.warn("[Sunder] Could not resolve attacker for chat message:", message.id);
        return;
    }

    const weaponItem = await resolveWeaponForAttackMessage(message, attacker, rawD20);
    if (!weaponItem) return;

    const isHeavy = weaponItem?.system.properties?.has("hvy") || false;
    const target = getFirstUserTarget();
    const attackHitsTarget = utils.didAttackHitTarget(roll, target, rawD20);

    await breakageHandler.triggerBreakage(attacker, target, rawD20, isHeavy, message.id, weaponItem, { attackHitsTarget });
}

function isRollMessage(message) {
    return message.flags?.core?.RollTable || message.rolls;
}

function isOwnDnd5eAttackRollMessage(message) {
    return message.flags?.dnd5e?.roll?.type === "attack" && message.author.id === game.user.id;
}

function getRawD20Result(roll) {
    const results = roll?.terms?.[0]?.results;
    const keptResult = results?.find(r => r.active)?.result;
    return keptResult !== undefined ? keptResult : results?.[0]?.result;
}

function getFirstTarget(targets) {
    if (!targets?.size) return null;
    return Array.from(targets)[0] ?? null;
}

function getFirstUserTarget() {
    return getFirstTarget(game.user.targets);
}

function resolveAttackerFromMessage(message) {
    const speaker = message.speaker ?? ChatMessage.getSpeaker();

    const token = canvas.tokens.get(speaker.token);

    const attacker = token ? token.actor : game.actors.get(message.flags?.dnd5e?.item?.actorId || speaker.actor);

    return attacker;
}

async function resolveWeaponForAttackMessage(message, attacker, rawD20) {
    const itemId = message.flags?.dnd5e?.item?.id || message.flags?.dnd5e?.roll?.itemId;
    if (!itemId) return utils.getEquippedWeapon(attacker);

    const weaponItem = attacker.items.get(itemId);
    if (
        weaponItem?.type !== "weapon" ||
        (weaponItem.system?.type?.value === "natural" &&
         rawD20 <= game.settings.get("sunder", "breakageThreshold"))
    ) {
        if (weaponItem?.system?.type?.value === "natural" &&
            rawD20 >= game.settings.get("sunder", "criticalBreakageThreshold")) {
            await breakageHandler.triggerBreakage(attacker, null, rawD20, false, message.id, weaponItem);
        }
        return null;
    }

    return weaponItem;
}
