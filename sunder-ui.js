class SunderUI_v2 {
    static async showBreakagePopup(actor, item, isHeavy = false, gmUserId = null, affectedUserId = null, rollType = null, attackerUserId = null) {
        const gmUser = game.users.find(u => u.id === gmUserId && u.isGM && u.active);
        if (!gmUser) {
            ui.notifications.error("No active GM found to handle the breakage check.");
            return;
        }
    
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
    
        const handleRoll = async (targetActor, targetItem) => {
            const rollFormula = isHeavy ? `1d20+${heavyBonus}` : "1d20";
            const roll = await new Roll(rollFormula).evaluate();
            await roll.toMessage({ 
                flavor: `Breakage Roll for ${targetItem.name}${isHeavy ? ` (Heavy Weapon Bonus +${heavyBonus})` : ""}`,
                speaker: ChatMessage.getSpeaker({ actor: targetActor })
            });
            const rollResult = roll.total;
            console.log(`[Sunder] Roll result: ${rollResult}, DC: ${breakageDC}, Heavy: ${isHeavy}`);
    
            if (rollResult < breakageDC) {
                let newDurability = durability;
                let updateData = { _id: targetItem.id };
                let description = targetItem.system.description.value || "";
                let effectData = {
                    name: `Sunder: ${baseName}`,
                    icon: "icons/svg/downgrade.svg",
                    transfer: true,
                    changes: [],
                    disabled: false
                };
    
                const existingEffects = targetItem.effects.filter(e => e.name.includes("Sunder"));
                for (const effect of existingEffects) await effect.delete();
                description = description.replace(/<p><i>This item is (damaged|broken) \(-\d penalty\).*<\/i><\/p>/, "");
    
                const basePrice = targetItem.system.price?.value || 1;
                if (!targetItem.getFlag("sunder", "originalPrice")) await targetItem.setFlag("sunder", "originalPrice", basePrice);
    
                if (twoStageBreakage && (isWeapon || isArmor || isShield)) {
                    if (!isDamaged) {
                        newDurability = durability - 1;
                        if (newDurability < 0) newDurability = 0;
                        await targetItem.setFlag("sunder", "durability", newDurability);
                        await targetItem.setFlag("sunder", "damaged", true);
                        updateData.name = `${baseName} (Damaged)`;
                        updateData["system.description.value"] = description + `<p><i>This item is damaged (${isWeapon ? weaponAttackPenalty : armorACPenalty} penalty)</i></p>`;
                        updateData["system.price.value"] = Math.max(1, Math.floor(basePrice / 2));
                        if (isWeapon) {
                            effectData.changes.push({ key: "system.bonuses.mwak.attack", mode: 2, value: weaponAttackPenalty });
                            effectData.changes.push({ key: "system.bonuses.rwak.attack", mode: 2, value: weaponAttackPenalty });
                        } else if (isArmor || isShield) {
                            effectData.changes.push({ key: "system.attributes.ac.bonus", mode: 2, value: armorACPenalty });
                        }
                        await ChatMessage.create({ content: `<strong>${targetItem.name}</strong> is damaged!`, speaker: { alias: "Sunder" }, style: CONST.CHAT_MESSAGE_STYLES.OOC });
                        ui.notifications.warn(`${targetItem.name} is now DAMAGED! (Durability: ${newDurability})`);
                        if (breakageFailSound) AudioHelper.play({ src: breakageFailSound }, true);
                    } else {
                        newDurability = durability - 1;
                        if (newDurability < 0) newDurability = 0;
                        await targetItem.setFlag("sunder", "durability", newDurability);
                        await targetItem.setFlag("sunder", "damaged", true);
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
                            await ChatMessage.create({ content: `<strong>${targetItem.name}</strong> breaks!`, speaker: { alias: "Sunder" }, style: CONST.CHAT_MESSAGE_STYLES.OOC });
                            ui.notifications.error(`${targetItem.name} ${game.i18n.localize("sunder.popup.broken")}`);
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
                            await ChatMessage.create({ content: `<strong>${targetItem.name}</strong> is damaged!`, speaker: { alias: "Sunder" }, style: CONST.CHAT_MESSAGE_STYLES.OOC });
                            ui.notifications.warn(`${targetItem.name} is now DAMAGED! (Durability: ${newDurability})`);
                            if (breakageFailSound) AudioHelper.play({ src: breakageFailSound }, true);
                        }
                    }
                } else {
                    newDurability = 0;
                    await targetItem.setFlag("sunder", "durability", newDurability);
                    await targetItem.setFlag("sunder", "damaged", true);
                    updateData.name = `${baseName} (Broken)`;
                    updateData["system.description.value"] = description + `<p><i>This item is broken (${isWeapon ? weaponAttackPenalty * 2 : armorACPenalty * 2} penalty) and unusable until repaired</i></p>`;
                    updateData["system.price.value"] = 0;
                    if (isWeapon) {
                        effectData.changes.push({ key: "system.bonuses.mwak.attack", mode: 2, value: weaponAttackPenalty * 2 });
                        effectData.changes.push({ key: "system.bonuses.rwak.attack", mode: 2, value: weaponAttackPenalty * 2 });
                    } else if (isArmor || isShield) {
                        effectData.changes.push({ key: "system.attributes.ac.bonus", mode: 2, value: armorACPenalty * 2 });
                    }
                    await ChatMessage.create({ content: `<strong>${targetItem.name}</strong> breaks!`, speaker: { alias: "Sunder" }, style: CONST.CHAT_MESSAGE_STYLES.OOC });
                    ui.notifications.error(`${targetItem.name} ${game.i18n.localize("sunder.popup.broken")}`);
                    if (breakageFailSound) AudioHelper.play({ src: breakageFailSound }, true);
                }
    
                await targetActor.updateEmbeddedDocuments("Item", [updateData]);
                if (effectData.changes.length > 0) {
                    await targetItem.createEmbeddedDocuments("ActiveEffect", [effectData]);
                    console.log(`[Sunder] Created new effect: ${effectData.name} with changes:`, JSON.stringify(effectData.changes));
                }
                console.log(`[Sunder] Updated item: ${updateData.name}, Durability: ${newDurability}`);
            } else {
                await ChatMessage.create({ content: `<strong>${targetItem.name}</strong> resists breakage!`, speaker: { alias: "Sunder" }, style: CONST.CHAT_MESSAGE_STYLES.OOC });
                ui.notifications.info(`${targetItem.name} ${game.i18n.localize("sunder.popup.safe")}`);
                if (breakagePassSound) AudioHelper.play({ src: breakagePassSound }, true);
            }

            await ChatMessage.create({
                content: `<strong>[Sunder]</strong> Breakage Resolved`,
                whisper: game.users.map(u => u.id),
                flags: {
                    sunder: {
                        resolveBreakage: true,
                        itemUuid: targetItem.uuid,
                        resolution: rollResult < breakageDC ? "fail" : "pass"
                    }
                }
            });
        };
    
        if (affectedUserId && game.user.id === affectedUserId) {
            if (breakageSound) AudioHelper.play({ src: breakageSound }, true);
            let rolled = false;
            const dialog = new Dialog({
                title: game.i18n.localize("sunder.popup.title"),
                content: content,
                buttons: game.user.isGM ? {
                    roll: { 
                        label: "Roll for Breakage", 
                        callback: async () => {
                            rolled = true;
                            await handleRoll(actor, item);
                        }
                    },
                    ignore: { 
                        label: "Ignore", 
                        callback: () => {
                            rolled = true;
                            ui.notifications.info("Breakage ignored.");
                            ChatMessage.create({ 
                                content: `<strong>${item.name}</strong> breakage check ignored by GM.`,
                                speaker: { alias: "Sunder" }, 
                                style: CONST.CHAT_MESSAGE_STYLES.OOC,
                                flags: {
                                    sunder: {
                                        resolveBreakage: true,
                                        itemUuid: item.uuid,
                                        resolution: "ignore"
                                    }
                                }
                            });
                            game.socket.emit("module.sunder", { type: "resolveBreakage", itemId: item.id, resolution: "ignore" });
                        }
                    }
                } : {
                    roll: { 
                        label: "Roll for Breakage", 
                        callback: async () => {
                            rolled = true;
                            await handleRoll(actor, item);
                        }
                    }
                },
                closeOnEscape: !game.user.isGM,
                render: (html) => {
                    dialog.setPosition({ top: window.innerHeight * 0.2, left: window.innerWidth * 0.35 });
                    if (!game.user.isGM) html.closest(".app").find(".window-header .close").remove();
                    console.log(`[Sunder] ${game.user.isGM ? "GM" : "Player"} dialog for ${item.name} (${game.user.isGM ? "full" : "roll only"}) at top: ${dialog.position.top}`);
                },
                close: () => {
                    if (game.user.isGM && !rolled) {
                        ui.notifications.info("Breakage ignored (dialog closed).");
                        ChatMessage.create({ 
                            content: `<strong>${item.name}</strong> breakage check ignored by GM (dialog closed).`, 
                            speaker: { alias: "Sunder" }, 
                            style: CONST.CHAT_MESSAGE_STYLES.OOC,
                            flags: {
                                sunder: {
                                    resolveBreakage: true,
                                    itemUuid: item.uuid,
                                    resolution: "ignore"
                                }
                            }
                        });
                        game.socket.emit("module.sunder", { type: "resolveBreakage", itemId: item.id, resolution: "ignore" });
                    } else if (!game.user.isGM) {
                        console.log(`[Sunder] Player dialog for ${item.name} closed without action`);
                    }
                }
            });
            dialog.render(true);
        }
    
        if (rollType === "crit" && attackerUserId && game.user.id === attackerUserId && game.user.id !== affectedUserId && !game.user.isGM) {
            new Dialog({
                title: game.i18n.localize("sunder.popup.title"),
                content: content + `<p>Awaiting ${actor.name}'s breakage check for their ${item.name}...</p>`,
                buttons: {},
                render: (html) => console.log(`[Sunder] Attacker info dialog for ${item.name}`)
            }).render(true);
        }
    
        if (game.user.id === gmUserId && game.user.id !== affectedUserId) {
            if (breakageSound) AudioHelper.play({ src: breakageSound }, true);
            let rolled = false;
            const dialog = new Dialog({
                title: game.i18n.localize("sunder.popup.title"),
                content: content,
                buttons: {
                    roll: { 
                        label: "Roll for Breakage", 
                        callback: async () => {
                            rolled = true;
                            await handleRoll(actor, item);
                        }
                    },
                    ignore: { 
                        label: "Ignore", 
                        callback: () => {
                            rolled = true;
                            ui.notifications.info("Breakage ignored.");
                            ChatMessage.create({ 
                                content: `<strong>${item.name}</strong> breakage check ignored by GM.`,
                                speaker: { alias: "Sunder" }, 
                                style: CONST.CHAT_MESSAGE_STYLES.OOC,
                                flags: {
                                    sunder: {
                                        resolveBreakage: true,
                                        itemUuid: item.uuid,
                                        resolution: "ignore"
                                    }
                                }
                            });
                            game.socket.emit("module.sunder", { type: "resolveBreakage", itemId: item.id, resolution: "ignore" });
                        }
                    }
                },
                render: (html) => {
                    dialog.setPosition({ top: window.innerHeight * 0.2, left: window.innerWidth * 0.35 });
                    console.log(`[Sunder] GM dialog for ${item.name} at top: ${dialog.position.top}, left: ${dialog.position.left}`);
                },
                close: () => {
                    if (!rolled) {
                        ui.notifications.info("Breakage ignored (dialog closed).");
                        ChatMessage.create({ 
                            content: `<strong>${item.name}</strong> breakage check ignored by GM (dialog closed).`,
                            speaker: { alias: "Sunder" }, 
                            style: CONST.CHAT_MESSAGE_STYLES.OOC,
                            flags: {
                                sunder: {
                                    resolveBreakage: true,
                                    itemUuid: item.uuid,
                                    resolution: "ignore"
                                }
                            }
                        });
                        game.socket.emit("module.sunder", { type: "resolveBreakage", itemId: item.id, resolution: "ignore" });
                    }
                }
            });
            dialog.render(true);
        } else if (gmUserId && game.user.id !== gmUserId) {
            console.log(`[Sunder] Emitting socket request to GM ${gmUserId} for ${item.name}`);
            game.socket.emit("module.sunder", {
                type: "showBreakagePopup",
                actorId: actor.id,
                itemId: item.id,
                isHeavy,
                gmUserId: gmUser.id,
                affectedUserId,
                rollType,
                attackerUserId
            });
        }
    }
}

Hooks.once('init', () => {
    console.log("SunderUI_v2 Module Initialized");
    game.sunderUI = SunderUI_v2;   
});