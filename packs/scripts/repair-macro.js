// Player Repair Request Macro with Tile Trigger Support - Players Can Repair
async function requestRepair() {
    let controlled = canvas.tokens.controlled;
    let actor;

    if (controlled.length === 1) {
        actor = controlled[0].actor;
    } else {
        const sceneTokens = canvas.tokens.placeables.filter(t => 
            t.actor && (t.actor.hasPlayerOwner || game.user.isGM)
        );
        
        if (sceneTokens.length === 0) {
            ui.notifications.warn("No controllable tokens found in the scene!");
            return;
        }

        if (sceneTokens.length === 1) {
            actor = sceneTokens[0].actor;
        } else {
            const tokenOptions = sceneTokens.map(t => 
                `<option value="${t.id}">${t.name} (${t.actor.name})</option>`
            ).join("");
            
            const result = await new Promise(resolve => {
                new Dialog({
                    title: "Select Token to Repair",
                    content: `
                        <p>Select a token to repair items for:</p>
                        <select id="token-select">${tokenOptions}</select>
                    `,
                    buttons: {
                        select: {
                            label: "Select",
                            callback: html => resolve(html.find("#token-select").val())
                        },
                        cancel: {
                            label: "Cancel",
                            callback: () => resolve(null)
                        }
                    },
                    default: "select"
                }).render(true);
            });

            if (!result) return;
            actor = canvas.tokens.get(result).actor;
        }
    }

    if (!actor) {
        ui.notifications.error("No actor selected for repair!");
        return;
    }

    const damagedItems = actor.items.filter(i => i.getFlag("sunder", "damaged"));
    if (damagedItems.length === 0) {
        ui.notifications.info(`${actor.name} has no damaged items to repair.`);
        return;
    }

    const repairPercentageRaw = game.settings.get("sunder", "repairCostPercentage");
    const repairPercentage = (typeof repairPercentageRaw === "number" && !isNaN(repairPercentageRaw)) ? repairPercentageRaw / 100 : 0.5;
    console.log("[Sunder] Repair cost debug:", { repairPercentageRaw, type: typeof repairPercentageRaw, repairPercentage });

    let itemList = damagedItems.map((i, index) => {
        const isBroken = (i.getFlag("sunder", "durability") ?? 999) <= 0;
        const basePrice = i.getFlag("sunder", "originalPrice") || i.system.price?.value || 1;
        const costMultiplier = isBroken ? repairPercentage * 2 : repairPercentage;
        const cost = Math.max(1, Math.floor(basePrice * costMultiplier));
        console.log("[Sunder] Item cost debug:", { 
            item: i.name, 
            basePrice, 
            isBroken, 
            costMultiplier, 
            cost 
        });
        const costString = Number(cost).toString(); // Force number to string
        console.log("[Sunder] Post-template cost:", { cost, costString });
        return `
            <div class="repair-item">
                <input type="checkbox" name="item-${index}" value="${i.id}" checked data-cost="${costString}">
                <label>${i.name} (${isBroken ? "Broken" : "Damaged"}, ${costString}gp)</label>
            </div>
        `;
    }).join("");

    const buttons = {
        repair: {
            label: "Repair Selected",
            callback: async (html) => {
                const selectedItems = html.find("input[type='checkbox']:checked").map((_, el) => ({
                    id: el.value,
                    cost: parseInt(el.dataset.cost)
                })).get();
                if (selectedItems.length === 0) {
                    ui.notifications.warn("No items selected for repair!");
                    return;
                }
                await executeRepair(actor, selectedItems);
            }
        },
        cancel: {
            label: "Cancel",
            callback: () => {}
        }
    };

    new Dialog({
        title: `Repair Items for ${actor.name}`,
        content: `
            <style>
                .repair-item { display: flex; align-items: center; gap: 5px; margin-bottom: 5px; }
                #total-cost { font-weight: bold; margin-top: 10px; }
            </style>
            <p><strong>${actor.name}</strong> has the following damaged items:</p>
            <form>
                ${itemList}
                <p id="total-cost">Total Cost: <span id="cost-value">0</span>gp</p>
            </form>
            <p>Select items and click 'Repair Selected' to process.</p>
            <script>
                function updateTotalCost() {
                    const checkboxes = document.querySelectorAll("input[type='checkbox']");
                    let total = 0;
                    checkboxes.forEach(cb => {
                        if (cb.checked) total += parseInt(cb.dataset.cost);
                    });
                    document.getElementById("cost-value").textContent = total;
                }
                document.querySelectorAll("input[type='checkbox']").forEach(cb => {
                    cb.addEventListener("change", updateTotalCost);
                });
                updateTotalCost();
            </script>
        `,
        buttons: buttons,
        default: "cancel",
        render: () => {
            const checkboxes = document.querySelectorAll("input[type='checkbox']");
            checkboxes.forEach(cb => cb.addEventListener("change", updateTotalCost));
            updateTotalCost();
        }
    }).render(true);
}

// Repair Execution with Gold Check and Percentage (Players Can Run)
async function executeRepair(actor, selectedItems) {
    const damagedItems = actor.items.filter(i => selectedItems.some(s => s.id === i.id));
    if (damagedItems.length === 0) {
        ui.notifications.info(`${actor.name} has no selected items to repair.`);
        return;
    }

    const totalCost = selectedItems.reduce((sum, s) => sum + s.cost, 0);

    if (actor.type === "character" && (actor.system.currency?.gp || 0) < totalCost) {
        ui.notifications.warn(`${actor.name} does not have enough gold to repair these items (${totalCost}gp required)!`);
        return;
    }

    const durabilityByRarity = JSON.parse(game.settings.get("sunder", "durabilityByRarity") || '{"common": 1, "uncommon": 2, "rare": 3, "veryRare": 4, "legendary": 5}');
    let repairedList = "";

    for (const item of damagedItems) {
        const isBroken = (item.getFlag("sunder", "durability") ?? 999) <= 0;
        const baseName = item.name.replace(/\s*\(Damaged\)$/, "").replace(/\s*\(Broken\)$/, "");
        const description = item.system.description.value.replace(/<p><i>This item is (damaged|broken) \(-\d penalty\).*<\/i><\/p>/, "");
        const basePrice = item.getFlag("sunder", "originalPrice") || item.system.price?.value || 1;

        await actor.updateEmbeddedDocuments("Item", [{
            _id: item.id,
            name: baseName,
            "system.description.value": description,
            "system.price.value": basePrice
        }]);
        await item.unsetFlag("sunder", "damaged");
        await item.unsetFlag("sunder", "originalPrice");
        await item.setFlag("sunder", "durability", durabilityByRarity[item.system.rarity || "common"] || 3);
        const effect = item.effects.find(e => e.name.includes("Sunder"));
        if (effect) await effect.delete();

        repairedList += `<li>${baseName} (${isBroken ? "Broken" : "Damaged"})</li>`;
    }

    await ChatMessage.create({
        content: `
            <p><strong>Repairs Complete for ${actor.name}!</strong></p>
            <ul>${repairedList}</ul>
            <p>Total Cost: ${totalCost}gp</p>
        `,
        speaker: { alias: "Sunder" },
        style: CONST.CHAT_MESSAGE_STYLES.OOC
    });

    const repairSound = "sounds/combat/epic-start-3hit.ogg";
    AudioHelper.play({ src: repairSound }, true);

    if (actor.type === "character" && actor.system.currency?.gp >= totalCost) {
        await actor.update({ "system.currency.gp": actor.system.currency.gp - totalCost });
        ui.notifications.info(`${actor.name} repaired items for ${totalCost}gp! Gold deducted.`);
    } else {
        ui.notifications.info(`${actor.name} repaired items for ${totalCost}gp! (GM to deduct manually)`);
    }
    await actor.sheet?.render(false);
}

// Run the macro
requestRepair();