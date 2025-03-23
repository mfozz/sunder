class SunderUI_v2 {
    static async showBreakagePopup(actor, item, isHeavy = false, gmUserId = null, affectedUserId = null, rollType = null) {
        const gmUser = game.users.find(u => u.id === gmUserId && u.isGM && u.active);
        if (!gmUser) {
            ui.notifications.error("No active GM found to handle the breakage check.");
            return;
        }

        // Shared settings and item data
        const breakageDC = game.settings.get("sunder", "breakageDC");
        const durabilityByRarityRaw = game.settings.get("sunder", "durabilityByRarity");
        const twoStageBreakage = game.settings.get("sunder", "twoStageBreakage");
        const weaponAttackPenalty = game.settings.get("sunder", "weaponAttackPenalty");
        const armorACPenalty = game.settings.get("sunder", "armorACPenalty");
        const breakageSound = game.settings.get("sunder", "breakageSound");
        const breakagePassSound = game.settings.get("sunder", "breakagePassSound");
        const breakageFailSound = game.settings.get("sunder", "breakageFailSound");
        const heavyBonus = game.settings.get("sunder", "heavyWeaponBonus");
        let durabilityByRarity;
        try {
            durabilityByRarity = JSON.parse(durabilityByRarityRaw);
        } catch (e) {
            durabilityByRarity = { common: 1, uncommon: 2, rare: 3, veryRare: 4, legendary: 5 };
            console.error("[Sunder] Invalid durabilityByRarity JSON, using default:", e);
        }
        const rarity = item.system.rarity || "common";
        const baseDurability = durabilityByRarity[rarity] || 3;
        let durability = item.getFlag("sunder", "durability");
        const isDamaged = item.getFlag("sunder", "damaged") || false;

        if (durability === undefined || durability === null || typeof durability !== "number") {
            console.log(`[Sunder] Invalid durability for ${item.name}: ${durability}, resetting to ${baseDurability}`);
            durability = baseDurability;
            await item.setFlag("sunder", "durability", durability);
            await item.setFlag("sunder", "damaged", false);
            console.log(`[Sunder] Initialized durability for ${item.name} to ${durability} (rarity: ${rarity})`);
        }

        const isWeapon = item.type === "weapon";
        const isShield = item.type === "equipment" && item.system.type?.value === "shield";
        const isArmor = item.type === "equipment" && item.system.type?.value !== "shield" && (item.system.armor?.value > 0 || item.system.armor?.type === "armor");
        const baseName = item.name.replace(/\s*\(Damaged\)$/, "").replace(/\s*\(Broken\)$/, "");
        const icon = isDamaged ? "icons/svg/downgrade.svg" : durability <= 0 ? "icons/svg/shield.svg" : "";
        const tooltip = isDamaged 
            ? `This item takes a ${weaponAttackPenalty} penalty to attack rolls or AC.` 
            : durability <= 0 
            ? `This item takes a ${weaponAttackPenalty * 2} penalty to attack rolls or AC and is unusable until repaired.` 
            : "";
        const previewImage = item.getFlag("sunder", "previewImage") || item.img || "icons/svg/mystery-man.svg";
        const color = isDamaged ? "orange" : "inherit";

        const content = `
            <div class="sunder-breakage-popup">
                <img src="${previewImage}" class="sunder-preview-image" alt="${baseName}" />
                <div class="sunder-details">
                    <p><img src="${icon}" style="width: 24px; vertical-align: middle;" title="${tooltip}"> 
                       ${actor.name}'s <strong style="color: ${color}">${item.name}</strong> ${game.i18n.localize("sunder.popup.atRisk")}</p>
                    <p>Damaged: ${isDamaged} | Durability: ${durability} | DC: ${breakageDC}${isHeavy ? ` | Heavy Bonus: +${heavyBonus}` : ""}</p>
                </div>
            </div>
        `;

        // Roll logic shared between GM and player
        const handleRoll = async () => {
            const rollFormula = isHeavy ? `1d20+${heavyBonus}` : "1d20";
            const roll = await new Roll(rollFormula).evaluate();
            await roll.toMessage({ 
                flavor: `Breakage Roll for ${item.name}${isHeavy ? ` (Heavy Weapon Bonus +${heavyBonus})` : ""}`,
                speaker: ChatMessage.getSpeaker({ actor })
            });
            const rollResult = roll.total;
            console.log(`[Sunder] Roll result: ${rollResult}, DC: ${breakageDC}, Heavy: ${isHeavy}`);

            if (rollResult < breakageDC) {
                let newDurability = durability;
                let updateData = { _id: item.id };
                let description = item.system.description.value || "";
                let effectData = {
                    name: `Sunder: ${baseName}`,
                    icon: "icons/svg/downgrade.svg",
                    transfer: true,
                    changes: [],
                    disabled: false
                };

                const existingEffects = item.effects.filter(e => e.name.includes("Sunder"));
                for (const effect of existingEffects) await effect.delete();
                description = description.replace(/<p><i>This item is (damaged|broken) \(-\d penalty\).*<\/i><\/p>/, "");

                const basePrice = item.system.price?.value || 1;
                if (!item.getFlag("sunder", "originalPrice")) await item.setFlag("sunder", "originalPrice", basePrice);

                if (twoStageBreakage && (isWeapon || isArmor || isShield)) {
                    if (!isDamaged) {
                        newDurability = durability - 1;
                        if (newDurability < 0) newDurability = 0;
                        await item.setFlag("sunder", "durability", newDurability);
                        await item.setFlag("sunder", "damaged", true);
                        updateData.name = `${baseName} (Damaged)`;
                        updateData["system.description.value"] = description + `<p><i>This item is damaged (${isWeapon ? weaponAttackPenalty : armorACPenalty} penalty)</i></p>`;
                        updateData["system.price.value"] = Math.max(1, Math.floor(basePrice / 2));
                        if (isWeapon) {
                            effectData.changes.push({ key: "system.bonuses.mwak.attack", mode: 2, value: weaponAttackPenalty });
                            effectData.changes.push({ key: "system.bonuses.rwak.attack", mode: 2, value: weaponAttackPenalty });
                        } else if (isArmor || isShield) {
                            effectData.changes.push({ key: "system.attributes.ac.bonus", mode: 2, value: armorACPenalty });
                        }
                        await ChatMessage.create({ content: `<strong>${item.name}</strong> is damaged!`, speaker: { alias: "Sunder" }, style: CONST.CHAT_MESSAGE_STYLES.OOC });
                        ui.notifications.warn(`${item.name} is now DAMAGED! (Durability: ${newDurability})`);
                        if (breakageFailSound) AudioHelper.play({ src: breakageFailSound }, true);
                    } else {
                        newDurability = durability - 1;
                        if (newDurability < 0) newDurability = 0;
                        await item.setFlag("sunder", "durability", newDurability);
                        await item.setFlag("sunder", "damaged", true);
                        if (newDurability <= 0) {
                            updateData.name = `${baseName} (Broken)`;
                            updateData["system.description.value"] = description + `<p><i>This item is broken (${isWeapon ? weaponAttackPenalty * 2 : armorACPenalty * 2} penalty) and unusable until repaired</i></p>`;
                            updateData["system.price.value"] = 0;
                            if (isWeapon) {
                                effectData.changes.push({ key: "system.bonuses.mwak.attack", mode: 2, value: weaponAttackPenalty * 2 });
                                effectData.changes.push({ key: "system.bonuses.rwak.attack", mode: 2, value: weaponAttackPenalty * 2 });
                            } else if (isArmor || isShield) {
                                effectData.changes.push({ key: "system.attributes.ac.bonus", mode: 2, value: armorACPenalty * 2 });
                            }
                            await ChatMessage.create({ content: `<strong>${item.name}</strong> breaks!`, speaker: { alias: "Sunder" }, style: CONST.CHAT_MESSAGE_STYLES.OOC });
                            ui.notifications.error(`${item.name} ${game.i18n.localize("sunder.popup.broken")}`);
                            if (breakageFailSound) AudioHelper.play({ src: breakageFailSound }, true);
                        } else {
                            updateData.name = `${baseName} (Damaged)`;
                            updateData["system.description.value"] = description + `<p><i>This item is damaged (${isWeapon ? weaponAttackPenalty : armorACPenalty} penalty)</i></p>`;
                            updateData["system.price.value"] = Math.max(1, Math.floor(basePrice / 2));
                            if (isWeapon) {
                                effectData.changes.push({ key: "system.bonuses.mwak.attack", mode: 2, value: weaponAttackPenalty });
                                effectData.changes.push({ key: "system.bonuses.rwak.attack", mode: 2, value: weaponAttackPenalty });
                            } else if (isArmor || isShield) {
                                effectData.changes.push({ key: "system.attributes.ac.bonus", mode: 2, value: armorACPenalty });
                            }
                            await ChatMessage.create({ content: `<strong>${item.name}</strong> is damaged!`, speaker: { alias: "Sunder" }, style: CONST.CHAT_MESSAGE_STYLES.OOC });
                            ui.notifications.warn(`${item.name} is now DAMAGED! (Durability: ${newDurability})`);
                            if (breakageFailSound) AudioHelper.play({ src: breakageFailSound }, true);
                        }
                    }
                } else {
                    newDurability = 0;
                    await item.setFlag("sunder", "durability", newDurability);
                    await item.setFlag("sunder", "damaged", true);
                    updateData.name = `${baseName} (Broken)`;
                    updateData["system.description.value"] = description + `<p><i>This item is broken (${isWeapon ? weaponAttackPenalty * 2 : armorACPenalty * 2} penalty) and unusable until repaired</i></p>`;
                    updateData["system.price.value"] = 0;
                    if (isWeapon) {
                        effectData.changes.push({ key: "system.bonuses.mwak.attack", mode: 2, value: weaponAttackPenalty * 2 });
                        effectData.changes.push({ key: "system.bonuses.rwak.attack", mode: 2, value: weaponAttackPenalty * 2 });
                    } else if (isArmor || isShield) {
                        effectData.changes.push({ key: "system.attributes.ac.bonus", mode: 2, value: armorACPenalty * 2 });
                    }
                    await ChatMessage.create({ content: `<strong>${item.name}</strong> breaks!`, speaker: { alias: "Sunder" }, style: CONST.CHAT_MESSAGE_STYLES.OOC });
                    ui.notifications.error(`${item.name} ${game.i18n.localize("sunder.popup.broken")}`);
                    if (breakageFailSound) AudioHelper.play({ src: breakageFailSound }, true);
                }

                await actor.updateEmbeddedDocuments("Item", [updateData]);
                if (effectData.changes.length > 0) {
                    await item.createEmbeddedDocuments("ActiveEffect", [effectData]);
                    console.log(`[Sunder] Created new effect: ${effectData.name} with changes:`, JSON.stringify(effectData.changes));
                }
                console.log(`[Sunder] Updated item: ${updateData.name}, Durability: ${newDurability}`);
            } else {
                await ChatMessage.create({ content: `<strong>${item.name}</strong> resists breakage!`, speaker: { alias: "Sunder" }, style: CONST.CHAT_MESSAGE_STYLES.OOC });
                ui.notifications.info(`${item.name} ${game.i18n.localize("sunder.popup.safe")}`);
                if (breakagePassSound) AudioHelper.play({ src: breakagePassSound }, true);
            }
            game.socket.emit("module.sunder", { type: "resolveBreakage", itemId: item.id, resolution: "roll" });
        };

        // Handle player-specific popups
        if (affectedUserId && game.user.id === affectedUserId && !game.user.isGM) {
            if (rollType === "crit" && actor.id !== game.user.character?.id) {
                // Attacker waiting on defender
                new Dialog({
                    title: game.i18n.localize("sunder.popup.title"),
                    content: content + `<p>Awaiting ${actor.name}'s breakage check for their ${item.name}...</p>`,
                    buttons: {},
                    render: (html) => console.log(`[Sunder] Attacker info dialog for ${item.name}`)
                }).render(true);
            } else {
                // Affected player (attacker on fumble, defender on crit)
                if (breakageSound) AudioHelper.play({ src: breakageSound }, true);
                new Dialog({
                    title: game.i18n.localize("sunder.popup.title"),
                    content: content,
                    buttons: {
                        roll: { label: "Roll for Breakage", callback: handleRoll }
                    },
                    closeOnEscape: false,
                    render: (html) => {
                        html.closest(".app").find(".window-header .close").remove();
                        console.log(`[Sunder] Player dialog for ${item.name} (roll only)`);
                    },
                    close: () => console.log(`[Sunder] Player dialog for ${item.name} closed without action`)
                }).render(true);
            }
        }

        // Handle GM popup (always rendered, even if not via socket)
        if (game.user.id === gmUserId) {
            if (breakageSound) AudioHelper.play({ src: breakageSound }, true);
            let resolution = null;
            const dialog = new Dialog({
                title: game.i18n.localize("sunder.popup.title"),
                content: content,
                buttons: {
                    roll: { label: "Roll for Breakage", callback: () => { resolution = "roll"; handleRoll(); } },
                    ignore: { 
                        label: "Ignore", 
                        callback: () => {
                            resolution = "ignore";
                            ui.notifications.info("Breakage ignored.");
                            ChatMessage.create({ content: `<strong>${item.name}</strong> breakage check ignored by GM.`, speaker: { alias: "Sunder" }, style: CONST.CHAT_MESSAGE_STYLES.OOC });
                            game.socket.emit("module.sunder", { type: "resolveBreakage", itemId: item.id, resolution: "ignore" });
                        }
                    }
                },
                render: (html) => {
                    dialog.setPosition({ top: window.innerHeight * 0.2, left: window.innerWidth * 0.35 });
                    console.log(`[Sunder] GM dialog for ${item.name} at top: ${dialog.position.top}, left: ${dialog.position.left}`);
                },
                close: () => {
                    if (!resolution) {
                        ui.notifications.info("Breakage ignored (dialog closed).");
                        ChatMessage.create({ content: `<strong>${item.name}</strong> breakage check ignored by GM (dialog closed).`, speaker: { alias: "Sunder" }, style: CONST.CHAT_MESSAGE_STYLES.OOC });
                        game.socket.emit("module.sunder", { type: "resolveBreakage", itemId: item.id, resolution: "ignore" });
                    }
                }
            });
            dialog.render(true);
        } else if (gmUserId) {
            console.log(`[Sunder] Emitting socket request to GM ${gmUserId} for ${item.name}`);
            game.socket.emit("module.sunder", {
                type: "showBreakagePopup",
                actorId: actor.id,
                itemId: item.id,
                isHeavy,
                gmUserId: gmUser.id,
                affectedUserId,
                rollType
            });
        }
    }
}

Hooks.once('init', () => {
    console.log("SunderUI_v2 Module Initialized");
    game.sunderUI = SunderUI_v2;

    game.socket.on("module.sunder", async (data) => {
        if (data.type === "showBreakagePopup" && game.user.id === data.gmUserId) {
            console.log(`[Sunder] GM received socket request for actor ${data.actorId}, item ${data.itemId}`);
            const actor = game.actors.get(data.actorId);
            const item = actor?.items.get(data.itemId);
            if (actor && item) {
                await game.sunderUI.showBreakagePopup(actor, item, data.isHeavy, data.gmUserId, data.affectedUserId, data.rollType);
            } else {
                console.error("[Sunder] Failed to find actor or item for breakage popup:", data);
            }
        } else if (data.type === "resolveBreakage" && !game.user.isGM) {
            const dialog = Object.values(ui.windows).find(w => w.title === game.i18n.localize("sunder.popup.title"));
            if (dialog) {
                dialog.close();
                console.log(`[Sunder] Player dialog for item ${data.itemId} closed due to GM resolution: ${data.resolution}`);
            }
        }
    });
});