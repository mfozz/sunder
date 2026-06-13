import * as utils from './utils.js';

function getApplicationElement(app, html) {
    if (html instanceof HTMLElement) return html;
    if (html?.[0] instanceof HTMLElement) return html[0];
    if (app?.element instanceof HTMLElement) return app.element;
    if (app?.element?.[0] instanceof HTMLElement) return app.element[0];
    return null;
}

export function appendItemSheetHeaderControls(app, controls) {
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

    const isDamaged = item.getFlag("sunder", "damaged") || utils.hasSunderEffect(item);
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
            action: "sunder-repair",
            label: game.i18n.localize("SUNDER.RepairButton.Label"),
            icon: "fas fa-hammer",
            classes: ["sunder-repair"],
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

export function updateItemSheetHeaderButton(app, html) {
    if (!game.user.isGM) return;
    const item = app.document;
    if (!item || !["equipment", "weapon"].includes(item.type)) return;
    const isDamaged = item.getFlag("sunder", "damaged") || utils.hasSunderEffect(item);
    if (isDamaged) {
        setTimeout(() => {
            const element = getApplicationElement(app, html);
            const button = element?.closest(".application, .window-app")?.querySelector('[data-action="sunder-repair"], .sunder-repair');
            if (button) {
                button.style.color = '#36ba36'; // Green for damaged items
                utils.log(`Styled repair button for ${item.name} with green color`);
            } else {
                utils.log(`No repair button found for ${item.name} in DOM`);
            }
        }, 50);
    }
}
