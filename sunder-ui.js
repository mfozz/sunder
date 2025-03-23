class SunderUI_v2 {
    static async showBreakagePopup(actor, item, isHeavy = false) {
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

        // Validate durability
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

        console.log(`[Sunder] Initial state - Item: ${item.name}, Damaged: ${isDamaged}, Durability: ${durability}, Two-Stage: ${twoStageBreakage}, IsArmor: ${isArmor}`);

        const baseName = item.name.replace(/\s*\(Damaged\)$/, "").replace(/\s*\(Broken\)$/, "");
        const icon = isDamaged ? "icons/svg/downgrade.svg" : durability <= 0 ? "icons/svg/shield.svg" : "";
        const tooltip = isDamaged 
            ? `This item takes a ${weaponAttackPenalty} penalty to attack rolls or AC.` 
            : durability <= 0 
            ? `This item takes a ${weaponAttackPenalty * 2} penalty to attack rolls or AC and is unusable until repaired.` 
            : "";

        const previewImage = item.getFlag("sunder", "previewImage") || item.img || "icons/svg/mystery-man.svg";

        if (breakageSound) AudioHelper.play({ src: breakageSound }, true);

        const color = isDamaged ? "orange" : "inherit";

        const buttons = {
            roll: {
                label: "Roll for Breakage",
                callback: async () => {
                    if (!actor || !actor.uuid) {
                        console.error("[Sunder] Invalid actor:", actor);
                        ui.notifications.error("Cannot roll—invalid actor!");
                        return;
                    }

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
                        for (const effect of existingEffects) {
                            await effect.delete();
                        }
                        description = description.replace(/<p><i>This item is (damaged|broken) \(-\d penalty\).*<\/i><\/p>/, "");

                        const basePrice = item.system.price?.value || 1;
                        if (!item.getFlag("sunder", "originalPrice")) {
                            await item.setFlag("sunder", "originalPrice", basePrice);
                        }

                        if (twoStageBreakage && (isWeapon || isArmor || isShield)) {
                            console.log(`[Sunder] Two-stage - Damaged: ${isDamaged}, Durability: ${durability}`);
                            if (!isDamaged) {
                                newDurability = durability - 1;
                                if (newDurability < 0) newDurability = 0;
                                console.log(`[Sunder] First hit - New Durability: ${newDurability}`);
                                await item.setFlag("sunder", "durability", newDurability);
                                await item.setFlag("sunder", "damaged", true);
                                console.log(`[Sunder] Updating ${item.name} to Damaged`);
                                updateData.name = `${baseName} (Damaged)`;
                                updateData["system.description.value"] = description + `<p><i>This item is damaged (${isWeapon ? weaponAttackPenalty : armorACPenalty} penalty)</i></p>`;
                                updateData["system.price.value"] = Math.max(1, Math.floor(basePrice / 2));
                                if (isWeapon) {
                                    effectData.changes.push({ key: "system.bonuses.mwak.attack", mode: 2, value: weaponAttackPenalty });
                                    effectData.changes.push({ key: "system.bonuses.rwak.attack", mode: 2, value: weaponAttackPenalty });
                                } else if (isArmor || isShield) {
                                    effectData.changes.push({ key: "system.attributes.ac.bonus", mode: 2, value: armorACPenalty });
                                }
                                await ChatMessage.create({
                                    content: `<strong>${item.name}</strong> is damaged!`,
                                    speaker: { alias: "Sunder" },
                                    style: CONST.CHAT_MESSAGE_STYLES.OOC
                                });
                                ui.notifications.warn(`${item.name} is now DAMAGED! (Durability: ${newDurability})`);
                                if (breakageFailSound) AudioHelper.play({ src: breakageFailSound }, true);
                            } else {
                                newDurability = durability - 1;
                                if (newDurability < 0) newDurability = 0;
                                console.log(`[Sunder] Subsequent hit - New Durability: ${newDurability}`);
                                await item.setFlag("sunder", "durability", newDurability);
                                await item.setFlag("sunder", "damaged", true);
                                if (newDurability <= 0) {
                                    console.log(`[Sunder] Updating ${item.name} to Broken`);
                                    updateData.name = `${baseName} (Broken)`;
                                    updateData["system.description.value"] = description + `<p><i>This item is broken (${isWeapon ? weaponAttackPenalty * 2 : armorACPenalty * 2} penalty) and unusable until repaired</i></p>`;
                                    updateData["system.price.value"] = 0;
                                    if (isWeapon) {
                                        effectData.changes.push({ key: "system.bonuses.mwak.attack", mode: 2, value: weaponAttackPenalty * 2 });
                                        effectData.changes.push({ key: "system.bonuses.rwak.attack", mode: 2, value: weaponAttackPenalty * 2 });
                                    } else if (isArmor || isShield) {
                                        effectData.changes.push({ key: "system.attributes.ac.bonus", mode: 2, value: armorACPenalty * 2 });
                                    }
                                    await ChatMessage.create({
                                        content: `<strong>${item.name}</strong> breaks!`,
                                        speaker: { alias: "Sunder" },
                                        style: CONST.CHAT_MESSAGE_STYLES.OOC
                                    });
                                    ui.notifications.error(`${item.name} ${game.i18n.localize("sunder.popup.broken")}`);
                                    if (breakageFailSound) AudioHelper.play({ src: breakageFailSound }, true);
                                } else {
                                    console.log(`[Sunder] Updating ${item.name} to Damaged (still damaged)`);
                                    updateData.name = `${baseName} (Damaged)`;
                                    updateData["system.description.value"] = description + `<p><i>This item is damaged (${isWeapon ? weaponAttackPenalty : armorACPenalty} penalty)</i></p>`;
                                    updateData["system.price.value"] = Math.max(1, Math.floor(basePrice / 2));
                                    if (isWeapon) {
                                        effectData.changes.push({ key: "system.bonuses.mwak.attack", mode: 2, value: weaponAttackPenalty });
                                        effectData.changes.push({ key: "system.bonuses.rwak.attack", mode: 2, value: weaponAttackPenalty });
                                    } else if (isArmor || isShield) {
                                        effectData.changes.push({ key: "system.attributes.ac.bonus", mode: 2, value: armorACPenalty });
                                    }
                                    await ChatMessage.create({
                                        content: `<strong>${item.name}</strong> is damaged!`,
                                        speaker: { alias: "Sunder" },
                                        style: CONST.CHAT_MESSAGE_STYLES.OOC
                                    });
                                    ui.notifications.warn(`${item.name} is now DAMAGED! (Durability: ${newDurability})`);
                                    if (breakageFailSound) AudioHelper.play({ src: breakageFailSound }, true);
                                }
                            }
                        } else {
                            newDurability = 0;
                            await item.setFlag("sunder", "durability", newDurability);
                            await item.setFlag("sunder", "damaged", true);
                            console.log(`[Sunder] Updating ${item.name} to Broken (No two-stage)`);
                            updateData.name = `${baseName} (Broken)`;
                            updateData["system.description.value"] = description + `<p><i>This item is broken (${isWeapon ? weaponAttackPenalty * 2 : armorACPenalty * 2} penalty) and unusable until repaired</i></p>`;
                            updateData["system.price.value"] = 0;
                            if (isWeapon) {
                                effectData.changes.push({ key: "system.bonuses.mwak.attack", mode: 2, value: weaponAttackPenalty * 2 });
                                effectData.changes.push({ key: "system.bonuses.rwak.attack", mode: 2, value: weaponAttackPenalty * 2 });
                            } else if (isArmor || isShield) {
                                effectData.changes.push({ key: "system.attributes.ac.bonus", mode: 2, value: armorACPenalty * 2 });
                            }
                            await ChatMessage.create({
                                content: `<strong>${item.name}</strong> breaks!`,
                                speaker: { alias: "Sunder" },
                                style: CONST.CHAT_MESSAGE_STYLES.OOC
                            });
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
                        await ChatMessage.create({
                            content: `<strong>${item.name}</strong> resists breakage!`,
                            speaker: { alias: "Sunder" },
                            style: CONST.CHAT_MESSAGE_STYLES.OOC
                        });
                        ui.notifications.info(`${item.name} ${game.i18n.localize("sunder.popup.safe")}`);
                        if (breakagePassSound) AudioHelper.play({ src: breakagePassSound }, true);
                    }
                }
            }
        };
        if (game.user.isGM) {
            buttons.cancel = { label: "Ignore", callback: () => ui.notifications.info("Breakage ignored.") };
        }

        const dialog = new Dialog({
            title: game.i18n.localize("sunder.popup.title"),
            content: `
                <div class="sunder-breakage-popup">
                    <img src="${previewImage}" class="sunder-preview-image" alt="${baseName}" />
                    <div class="sunder-details">
                        <p><img src="${icon}" style="width: 24px; vertical-align: middle;" title="${tooltip}"> 
                           ${actor.name}'s <strong style="color: ${color}">${item.name}</strong> ${game.i18n.localize("sunder.popup.atRisk")}</p>
                        <p>Damaged: ${isDamaged} | Durability: ${durability} | DC: ${breakageDC}${isHeavy ? ` | Heavy Weapon Bonus: +${heavyBonus}` : ""}</p>
                    </div>
                </div>
            `,
            buttons: buttons,
            render: (html) => {
                // Force position after rendering
                dialog.setPosition({
                    top: window.innerHeight * 0.2, 
                    left: window.innerWidth * 0.35
                });
                console.log(`[Sunder] Dialog positioned at top: ${dialog.position.top}, left: ${dialog.position.left}`);
            }
        });

        dialog.render(true);
    }
}

Hooks.once('init', () => {
    console.log("SunderUI_v2 Module Initialized");
    game.sunderUI = SunderUI_v2;
});