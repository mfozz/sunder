import * as utils from './utils.js';
import * as breakageHandler from './breakage-handler.js';
import * as uiHooks from './ui-hooks.js';

export function registerHooks() {
    utils.log("Registering createChatMessage hook");
    Hooks.on("createChatMessage", (message) => {
        utils.log("createChatMessage fired:", message);
        onChatMessage(message);
    });

    utils.log("Registering renderChatMessageHTML hook");
    Hooks.on("renderChatMessageHTML", (message, html) => {
        uiHooks._onRenderChatMessage(message, html);
    });

    utils.log("Registering dnd5e.preUseActivity hook");
    Hooks.on("dnd5e.preUseActivity", (activity, config) => {
        onPreUseActivity(activity, config);
    });

    utils.log("Registering dnd5e.preDisplayCard hook");
    Hooks.on("dnd5e.preDisplayCard", (item, cardData) => {
        onPreDisplayCard(item, cardData);
    });

    utils.log("Registering renderDialog hook");
    Hooks.on("renderDialog", (dialog, html) => {
        utils.log("renderDialog hook triggered for dialog:", dialog.title, "Dialog class:", dialog.constructor.name, "Dialog ID:", dialog.options?.id || dialog.id);
        uiHooks._onRenderDialog(dialog, html);
    });

    utils.log("Registering renderApplication hook as fallback");
    Hooks.on("renderApplication", (app, html) => {
        if (app.title?.includes(game.i18n.localize("SUNDER.Dialog.AttackRoll")) || app.element[0]?.classList.contains("roll-configuration")) {
            utils.log("renderApplication hook processing Attack Roll dialog");
            uiHooks._onRenderDialog(app, html);
        }
    });

    utils.log("Registering render hook as fallback");
    Hooks.on("render", (app, html, data) => {
        if (app.title?.includes(game.i18n.localize("SUNDER.Dialog.AttackRoll")) || app.element[0]?.classList.contains("roll-configuration")) {
            utils.log("render hook triggered for Attack Roll dialog, App class:", app.constructor.name);
            uiHooks._onRenderDialog(app, html);
        }
    });

    utils.log("Registering dnd5e.renderAttackRollDialog hook");
    Hooks.on("dnd5e.renderAttackRollDialog", (app, html, data) => {
        utils.log("dnd5e.renderAttackRollDialog hook triggered, App class:", app.constructor.name);
        uiHooks._onRenderDialog(app, html);
    });

    if (game.modules.get("midi-qol")?.active) {
        utils.log("MIDI QOL detected, registering AttackRollComplete hook");
        Hooks.on("midi-qol.AttackRollComplete", (workflow) => {
            utils.log("MIDI AttackRollComplete fired", workflow);
            handleMidiQolWorkflow(workflow);
        });
    } else {
        utils.log("No MIDI QOL detected");
    }

    utils.log("Registering getHeaderControlsItemSheet5e hook for repair button");
    Hooks.on("getHeaderControlsItemSheet5e", (app, controls) => {
        utils.log("getHeaderControlsItemSheet5e fired for sheet:", app.document?.name, "Sheet class:", app.constructor.name, "Sheet ID:", app.id);
        appendItemSheetHeaderControls(app, controls);
    });

    utils.log("Registering renderItemSheet hook for button styling");
    Hooks.on("renderItemSheet", (app, html, data) => {
        utils.log("renderItemSheet fired for item:", data.item?.name, "Sheet class:", app.constructor.name);
        updateItemSheetHeaderButton(app, html);
    });
}

function appendItemSheetHeaderControls(app, controls) {
    utils.log("appendItemSheetHeaderControls called for item:", app.document?.name, "Sheet class:", app.constructor.name, "Sheet ID:", app.id);
    const item = app.document;
    if (!item || !(item instanceof CONFIG.Item.documentClass)) {
        utils.log("Invalid item in sheet:", item?.name);
        return;
    }
    if (!["equipment", "weapon"].includes(item.type)) {
        utils.log(`Skipping repair button for ${item.name}: invalid type ${item.type}`);
        return;
    }
    const isDamaged = item.getFlag("sunder", "damaged") || item.effects.some(e => e.name?.includes("Sunder Enchantment"));
    const durability = item.getFlag("sunder", "durability") ?? 999;
    const isWeaponOrArmor = utils.isValidItem(item, "weapon") || utils.isValidItem(item, "armor");
    utils.log(`Checking repair button for ${item.name}: isGM=${game.user.isGM}, isDamaged=${isDamaged}, durability=${durability}, isWeaponOrArmor=${isWeaponOrArmor}, effects=`, item.effects.map(e => ({ id: e.id, name: e.name })));
    if (game.user.isGM && isDamaged && isWeaponOrArmor) {
        const actor = app.actor;
        if (!actor || !(actor instanceof CONFIG.Actor.documentClass)) {
            utils.log("Invalid actor for item:", item.name);
            return;
        }
        const isBroken = durability <= 0;
        const basePrice = item.getFlag("sunder", "originalPrice") ?? item.system.price?.value ?? 1;
        const repairPercentage = game.settings.get("sunder", "repairPercentage") / 100;
        const costMultiplier = isBroken ? repairPercentage * 2 : repairPercentage;
        const cost = Math.max(1, Math.floor(basePrice * costMultiplier));
        utils.log(`Adding repair button for ${item.name}: cost=${cost}, isBroken=${isBroken}`);
        controls.push({
            id: "sunder-repair",
            label: game.i18n.localize("SUNDER.RepairButton.Label"),
            icon: "fas fa-hammer",
            onClick: async () => {
                utils.log(`Repair button clicked for ${item.name}`);
                const confirmed = await foundry.applications.api.DialogV2.confirm({
                    window: { title: game.i18n.format("SUNDER.RepairDialog.Title", { item: item.name }) },
                    content: game.i18n.format("SUNDER.RepairDialog.Content", { item: item.name, cost }),
                    rejectClose: false
                });
                if (confirmed) {
                    if (actor.type === "character" && (actor.system.currency?.gp || 0) < cost) {
                        ui.notifications.warn(game.i18n.format("SUNDER.Notification.NoGold", { actor: actor.name, item: item.name, cost }));
                        utils.log(`Insufficient gold for repair: ${actor.name}, ${item.name}, cost=${cost}`);
                        return;
                    }

                    await game.sunderUI.repairItem(actor, item);

                    if (actor.type === "character" && actor.system.currency?.gp >= cost) {
                        await actor.update({
                            "system.currency.gp": actor.system.currency.gp - cost
                        });
                        ui.notifications.info(game.i18n.format("SUNDER.Notification.RepairedDeducted", { item: item.name, cost, actor: actor.name }));
                        utils.log(`Repaired ${item.name} for ${actor.name}, deducted ${cost} gp`);
                    } else {
                        ui.notifications.info(game.i18n.format("SUNDER.Notification.RepairedManual", { item: item.name, cost }));
                        utils.log(`Repaired ${item.name} manually, cost=${cost}`);
                    }
                    await app.render(false);
                } else {
                    utils.log(`Repair canceled for ${item.name}`);
                }
            }
        });
        utils.log(`Added repair button to controls for ${item.name}:`, controls);
    } else {
        utils.log(`No repair button added for ${item.name}: isGM=${game.user.isGM}, isDamaged=${isDamaged}, isWeaponOrArmor=${isWeaponOrArmor}`);
    }
}

function updateItemSheetHeaderButton(app, html) {
    if (!game.user.isGM) return;
    const item = app.document;
    if (!item || !["equipment", "weapon"].includes(item.type)) return;
    const isDamaged = item.getFlag("sunder", "damaged") || item.effects.some(e => e.name?.includes("Sunder Enchantment"));
    if (isDamaged) {
        setTimeout(() => {
            const button = html.closest('.window-app').querySelector('.sunder-repair');
            if (button) {
                button.style.color = '#36ba36'; // Green for damaged items
                utils.log(`Styled repair button for ${item.name} with green color`);
            } else {
                utils.log(`No repair button found for ${item.name} in DOM`);
            }
        }, 50);
    }
}

async function onPreUseActivity(activity, config) {
    utils.log("preUseActivity fired", { activity, config });
    try {
        const item = utils.getValidWeaponItem(activity);
        if (!item) {
            utils.log("No valid weapon item for breakage");
            return;
        }
        const penalty = utils.getItemPenalty(item);
        utils.log(`Checked penalty for ${item.name}: ${penalty}`);
        if (penalty !== 0) {
            utils.log(`Applying penalty ${penalty} to attack roll config for ${item.name}`);
        }
        if (!config.rolls) config.rolls = [{ options: {} }];
        config.rolls[0].options.sunderItemUuid = item.uuid;
        config.rolls[0].options.sunderPenalty = penalty;
        utils.log(`Stored in roll options: sunderItemUuid: ${item.uuid}, sunderPenalty: ${penalty}`);

        if (!config.rolls[0].terms) {
            const formula = config.formula || "1d20 + 0";
            const parts = formula.split(/[\s+]+/);
            config.rolls[0].terms = parts.map(term => {
                if (/^\d*d\d+$/.test(term)) {
                    const match = foundry.dice.terms.DiceTerm.matchTerm(term);
                    if (match) {
                        return foundry.dice.terms.DiceTerm.fromMatch(match);
                    }
                } else if (/^[+\-*/]$/.test(term)) {
                    return new foundry.dice.terms.OperatorTerm({ operator: term });
                } else if (!isNaN(Number(term))) {
                    return new foundry.dice.terms.NumericTerm({ number: Number(term) });
                }
                return null;
            }).filter(term => term !== null);
            config.rolls[0].parts = config.rolls[0].terms
                .filter(term => term instanceof foundry.dice.terms.DiceTerm || term instanceof foundry.dice.terms.NumericTerm)
                .map(term => term.formula || term.number?.toString());
            config.rolls[0].formula = config.rolls[0].parts.join(" + ");
            config.formula = config.rolls[0].formula;
        }
        utils.log("Initial config.rolls[0].terms:", config.rolls[0].terms.map(term => term.formula || term.number));
        utils.log("Initial config.rolls[0].parts:", config.rolls[0].parts);
        if (penalty !== 0) {
            const penaltyTerm = new foundry.dice.terms.NumericTerm({ number: Math.abs(penalty) });
            config.rolls[0].terms = config.rolls[0].terms.filter(term => !(term instanceof foundry.dice.terms.OperatorTerm));
            config.rolls[0].terms.push(new foundry.dice.terms.OperatorTerm({ operator: penalty < 0 ? "-" : "+" }));
            config.rolls[0].terms.push(penaltyTerm);
            config.rolls[0].parts = config.rolls[0].terms
                .filter(term => term instanceof foundry.dice.terms.DiceTerm || term instanceof foundry.dice.terms.NumericTerm)
                .map(term => term.formula || term.number?.toString());
            config.rolls[0].formula = config.rolls[0].parts.join(" + ");
            config.formula = config.rolls[0].formula;
        }
        const logTerms = config.rolls[0].terms
            .filter(term => term instanceof foundry.dice.terms.DiceTerm || term instanceof foundry.dice.terms.NumericTerm)
            .map(term => term.formula || term.number);
        utils.log(`Updated roll config: Formula: ${config.formula}, Terms: ${JSON.stringify(logTerms)}`);
        utils.log(`Final config.formula: ${config.formula}`);
        utils.log(`Final config.rolls[0].formula: ${config.rolls[0].formula}`);
        utils.log("Final config.rolls[0].terms:", config.rolls[0].terms.map(term => term.formula || term.number));
        utils.log("Final config.rolls[0].parts:", config.rolls[0].parts);
    } catch (error) {
        console.error("[Sunder] Error in preUseActivity:", error);
        ui.notifications.error(game.i18n.localize("SUNDER.Notification.ErrorPreUseActivity"));
    }
}

async function onPreDisplayCard(item, cardData) {
    utils.log("preDisplayCard called with item:", item?.name, "cardData:", cardData);
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
        utils.log("No penalty for item in preDisplayCard:", item.name);
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

async function onChatMessage(message) {
    utils.log("Message Data:", message);

    if (message.flags.sunder && !message.flags.sunder.resolveBreakage) {
        const flags = message.flags.sunder;
        utils.log("Chat message flags:", {
            targetTokenUuid: flags.targetTokenUuid,
            itemUuid: flags.itemUuid,
            attackerTokenUuid: flags.attackerTokenUuid,
            rollType: flags.rollType
        });
        let actor = null;
        if (flags.targetTokenUuid) {
            actor = (await fromUuid(flags.targetTokenUuid))?.actor;
            if (!actor) {
                const actorId = flags.targetTokenUuid.includes("Actor.") ? flags.targetTokenUuid.split("Actor.").pop() : null;
                if (actorId) {
                    actor = game.actors.get(actorId);
                    utils.log("Fallback actor fetch:", actor?.name, "ID:", actor?.id);
                } else {
                    console.error("[Sunder] Invalid targetTokenUuid format:", flags.targetTokenUuid);
                    ui.notifications.error(game.i18n.localize("SUNDER.Notification.InvalidTargetUuid"));
                    return;
                }
            }
        } else {
            console.error("[Sunder] targetTokenUuid is undefined in chat flags:", flags);
            ui.notifications.error(game.i18n.localize("SUNDER.Notification.MissingTargetUuid"));
            return;
        }
        const item = await fromUuid(flags.itemUuid);
        if (!actor || !item) {
            console.error("[Sunder] Failed to resolve actor or item from chat flags:", flags);
            ui.notifications.error(game.i18n.localize("SUNDER.Notification.FailedResolveActorItem"));
            return;
        }

        const currentUserId = game.user.id;
        const isGM = game.user.isGM;
        const isOwner = actor.ownership[currentUserId] >= 3 || game.users.find(u => u.id === currentUserId)?.character?.id === actor.id;

        utils.log("Checking popup gate: isGM=", isGM, "isOwner=", isOwner, "currentUserId=", currentUserId, "affectedUserId=", flags.affectedUserId, "actorOwnership=", JSON.stringify(actor.ownership), "actorId=", actor.id);

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

const resolveData = message.getFlag("sunder", "resolveBreakage");
if (resolveData) {
    utils.log("Processing resolveBreakage:", resolveData);
    Object.values(ui.windows)
        .filter(w => w.title === game.i18n.localize("SUNDER.Popup.Title"))
        .forEach(w => {
            w.close();
            const itemName = w.element.find('.sunder-details strong').text();
            utils.log("Closed dialog - Title:", w.title, ", Item:", itemName, ", App ID:", w.id);
        });
}


    const isRoll = message.flags?.core?.RollTable || message.rolls;
    utils.log("Is this a roll?", !!isRoll);
    if (!isRoll) return;

    const isAttackRoll = message.flags?.dnd5e?.roll?.type === "attack";
    if (isAttackRoll && message.author.id === game.user.id) {
        const roll = message.rolls?.[0];
        const keptResult = roll.terms[0].results.find(r => r.active)?.result;
        const rawD20 = keptResult !== undefined ? keptResult : roll.terms[0].results[0].result;
        if (rawD20 === undefined) return;

        const speaker = ChatMessage.getSpeaker();
        utils.log("Speaker data:", {
            speakerAlias: speaker.alias,
            speakerActor: speaker.actor,
            speakerToken: speaker.token,
            speakerScene: speaker.scene
        });
        const token = canvas.tokens.get(speaker.token);
        utils.log("Resolved token:", {
            tokenId: token?.id,
            tokenActorId: token?.actor?.id,
            tokenName: token?.name
        });
        const attacker = token ? token.actor : game.actors.get(message.flags?.dnd5e?.item?.actorId || speaker.actor);
        utils.log("Attacker resolved:", {
            attackerId: attacker?.id,
            attackerName: attacker?.name,
            attackerOwnership: JSON.stringify(attacker?.ownership || {})
        });

        let weaponItem;
        const itemId = message.flags?.dnd5e?.item?.id || message.flags?.dnd5e?.roll?.itemId;
        if (itemId) {
            weaponItem = attacker.items.get(itemId);
            if (
                weaponItem?.type !== "weapon" ||
                (weaponItem.system?.type?.value === "natural" &&
                 rawD20 <= game.settings.get("sunder", "breakageThreshold"))
            ) {
                if (weaponItem?.system?.type?.value === "natural" &&
                    rawD20 >= game.settings.get("sunder", "criticalBreakageThreshold")) {
                    await breakageHandler.triggerBreakage(attacker, null, rawD20, false, message.id, weaponItem);
                }
                return;
            }
        } else {
            weaponItem = attacker.items.find(i =>
                i.type === "weapon" && i.system.equipped && i.system?.type?.value !== "natural"
            );
        }

        const isHeavy = weaponItem?.system.properties?.has("hvy") || false;
        const targets = game.user.targets.size > 0 ? Array.from(game.user.targets) : [];
        const target = targets.length > 0 ? targets[0] : null;

        await breakageHandler.triggerBreakage(attacker, target, rawD20, isHeavy, message.id, weaponItem);
    }
}

async function handleMidiQolWorkflow(workflow) {
    utils.log("Handling MIDI QOL workflow:", workflow);
    const roll = workflow.attackRoll;
    if (!roll) {
        utils.log("No attack roll found in workflow.");
        return;
    }
    let item = workflow.item;
    if (!item && roll.options?.sunderItemUuid) {
        item = await fromUuid(roll.options.sunderItemUuid);
        utils.log("Using roll options item lookup: UUID:", roll.options.sunderItemUuid, "Item found:", item?.name || "None", "weaponType:", item?.system?.type?.value);
    }
    const keptResult = roll.terms[0].results.find(r => r.active)?.result;
    const rawD20 = keptResult !== undefined ? keptResult : roll.terms[0].results[0].result;
    utils.log("MIDI Roll data:", roll, "Raw d20 (kept):", rawD20, "Final result:", roll.total);
    if (rawD20 === undefined) return;
    const attacker = workflow.actor;
    utils.log("MIDI Attacker:", attacker?.name);
    const isHeavy = item?.system.properties?.has("hvy") || false;
    utils.log("MIDI Attacker weapon:", item?.name || "None", "Is Heavy:", isHeavy);
    if (!item || item.type !== "weapon" || (item.system?.type?.value === "natural" && rawD20 <= game.settings.get("sunder", "breakageThreshold"))) {
        utils.log("No valid weapon item found for breakage:", item?.name);
        if (item?.system?.type?.value === "natural" && rawD20 >= game.settings.get("sunder", "criticalBreakageThreshold")) {
            await breakageHandler.triggerBreakage(attacker, null, rawD20, isHeavy, workflow.id, item);
        }
        return;
    }
    const penalty = await item.getFlag("sunder", "attackPenalty") || 0;
    utils.log(`Checked penalty for ${item.name}: ${penalty}`);
    if (penalty !== 0) {
        utils.log(`Applying penalty ${penalty} to MIDI attack roll for ${item.name}`);
        const originalTotal = roll.total;
        roll._total = originalTotal + penalty;
        roll._formula = `${roll._formula} ${penalty < 0 ? "-" : "+" } ${Math.abs(penalty)}`;
        utils.log(`Updated MIDI roll: Formula: ${roll._formula}, Original total: ${originalTotal}, New total: ${roll._total}`);
        roll.options.sunderPenalty = penalty;
        workflow.attackRoll = roll;
    }
    const targets = workflow.targets.size > 0 ? Array.from(workflow.targets) : [];
    const target = targets.length > 0 ? targets[0] : null;
    await breakageHandler.triggerBreakage(attacker, target, rawD20, isHeavy, workflow.id, item);
}