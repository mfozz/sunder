import * as utils from './utils.js';

function escapeHTML(value) {
    const text = String(value ?? "");
    return foundry.utils.escapeHTML ? foundry.utils.escapeHTML(text) : text.replace(/[&<>"']/g, c => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#39;"
    }[c]));
}

function getEffectiveRarity(item) {
    let rarity = item.system?.rarity || "common";
    if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Item base rarity for ${item.name}: ${rarity}`);

    for (const effect of item.effects.values()) {
        const change = effect.changes?.find(c => c.key === "system.rarity" && c.mode === CONST.ACTIVE_EFFECT_MODES.OVERRIDE);
        if (change) {
            rarity = change.value;
            if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] DAE override rarity for ${item.name}: ${rarity}`);
            break;
        }
    }

    if ((item.type === "equipment" && item.system?.type?.value === "shield") ||
        (item.type === "equipment" && item.system?.armor?.value > 0) ||
        item.type === "weapon") {
        const magicalBonus =
            item.system?.armor?.magicalBonus ||
            item.system?.magicalBonus ||
            (item.type === "weapon" ? item.system?.magicalBonus || 0 : 0);
        if (magicalBonus > 0) {
            const rarityMap = { 1: "uncommon", 2: "rare", 3: "veryRare", 4: "legendary", 5: "legendary" };
            const inferredRarity = rarityMap[magicalBonus] || "rare";
            const order = ["common", "uncommon", "rare", "veryRare", "legendary"];
            if (order.indexOf(rarity) < order.indexOf(inferredRarity)) {
                rarity = inferredRarity;
                if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Inferred rarity for ${item.name} with +${magicalBonus}: ${rarity}`);
            }
        }
    }

    return rarity;
}

async function initializeDurability(actor, item, baseDurability, rarity) {
    let durability = await item.getFlag("sunder", "durability");
    let isDamaged = await item.getFlag("sunder", "damaged") || false;

    if (durability === undefined || durability === null || typeof durability !== "number") {
        if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Invalid durability for ${item.name}: ${durability}, resetting to ${baseDurability}`);
        await item.update({ "flags.sunder.durability": baseDurability, "flags.sunder.damaged": false });
        if (actor.isToken) {
            await actor.updateEmbeddedDocuments("Item", [{
                _id: item.id,
                "flags.sunder.durability": baseDurability,
                "flags.sunder.damaged": false
            }]);
        }
        if (game.settings.get("sunder", "testingMode")) {
            console.log(`[Sunder] Initialized durability for ${item.name} to ${baseDurability} (rarity: ${rarity})`);
            console.log("[Sunder] Post-init flags:", {
                durability: await item.getFlag("sunder", "durability"),
                damaged: await item.getFlag("sunder", "damaged")
            });
        }
        durability = baseDurability;
        isDamaged = false;
    }

    return { durability, isDamaged };
}

async function getOriginItem(item, { isWeapon, isArmor, isShield }) {
    let compendiumOrigin = "";
    if (isWeapon) compendiumOrigin = "Compendium.dnd5e.equipment24.Item.dmgWeapon12or300";
    else if (isShield) compendiumOrigin = "Compendium.dnd5e.equipment24.Item.dmgShield12or300";
    else if (isArmor) compendiumOrigin = "Compendium.dnd5e.equipment24.Item.dmgArmor12or3000";

    const pack = game.packs.get("dnd5e.equipment24");
    if (!pack) return item.uuid;

    const index = await pack.getIndex();
    const entry = index.find(i => i._id === compendiumOrigin.split('.').pop());
    return entry ? `${compendiumOrigin.split('.').slice(0, -1).join('.')}.Item.${entry._id}` : item.uuid;
}

function getPriceSnapshot(item) {
    const currentPrice = item.system?.price?.valueInGP ?? item.system?.price?.value ?? 0;
    const baselinePrice = (() => {
        let base = Number(item._source?.system?.price?.value) || 0;
        for (const effect of item.effects) {
            for (const change of effect.changes || []) {
                if (change.key === "system.price.value" && change.mode === CONST.ACTIVE_EFFECT_MODES.ADD) {
                    base += Number(String(change.value).replace(/[^0-9.\-]/g, "")) || 0;
                } else if (change.key === "system.price.value" && change.mode === CONST.ACTIVE_EFFECT_MODES.OVERRIDE) {
                    base = Number(String(change.value).replace(/[^0-9.\-]/g, "")) || base;
                }
            }
        }
        return base || currentPrice;
    })();

    return { currentPrice, baselinePrice };
}

function renderContent({ actor, item, isHeavy, heavyBonus, breakageDC, weaponAttackPenalty, durability, isDamaged }) {
    const icon = (isDamaged || durability <= 0) ? "icons/svg/downgrade.svg" : "";
    const tooltip = isDamaged
        ? `This item takes a ${weaponAttackPenalty} penalty to attack rolls or AC.`
        : durability <= 0
            ? `This item takes a ${weaponAttackPenalty * 2} penalty to attack rolls or AC and is unusable until repaired.`
            : "";
    const previewImage = item.getFlag("sunder", "previewImage") || item.img || "icons/svg/mystery-man.svg";
    const color = isDamaged ? "orange" : "inherit";
    const actorName = escapeHTML(actor.name);
    const itemName = escapeHTML(item.name);

    return {
        actorName,
        itemName,
        content: `
            <div class="sunder-breakage-popup">
                <img src="${escapeHTML(previewImage)}" class="sunder-preview-image" alt="${itemName}" />
                <div class="sunder-details">
                    <p><img src="${icon}" style="width: 24px; vertical-align: middle;" title="${escapeHTML(tooltip)}"> 
                       ${actorName}'s <strong style="color:${color}">${itemName}</strong> ${game.i18n.localize("sunder.popup.atRisk")}</p>
                    <p>Damaged: ${isDamaged} | Durability: ${durability} | DC: ${breakageDC}${isHeavy ? ` | Heavy Bonus: +${heavyBonus}` : ""}</p>
                </div>
            </div>
        `
    };
}

export async function prepareBreakageDialogContext({ actor, item, isHeavy }) {
    const breakageDC = game.settings.get("sunder", "breakageDC");
    const weaponAttackPenalty = game.settings.get("sunder", "weaponAttackPenalty");
    const breakageSound = game.settings.get("sunder", "breakageSound");
    const breakagePassSound = game.settings.get("sunder", "breakagePassSound");
    const breakageFailSound = game.settings.get("sunder", "breakageFailSound");
    const heavyBonus = Number(game.settings.get("sunder", "heavyWeaponBonus")) || 0;
    const durabilityByRarity = utils.getDurabilityByRarity();
    const rarity = getEffectiveRarity(item);
    const baseDurability = durabilityByRarity[rarity] || 3;
    if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Base durability for ${item.name}: ${baseDurability} (effective rarity: ${rarity})`);

    const { durability, isDamaged } = await initializeDurability(actor, item, baseDurability, rarity);
    const isWeapon = item.type === "weapon";
    const isShield = item.type === "equipment" && item.system?.type?.value === "shield";
    const isArmor = item.type === "equipment" && item.system?.type?.value !== "shield" &&
        (item.system?.armor?.value > 0 || item.system?.armor?.type === "armor");
    const originItem = await getOriginItem(item, { isWeapon, isArmor, isShield });
    const { currentPrice, baselinePrice } = getPriceSnapshot(item);
    if (game.settings.get("sunder", "testingMode")) {
        console.log(`[Sunder] Price snapshot for "${item.name}" — prepared: ${currentPrice} gp, baseline: ${baselinePrice} gp`);
    }

    return {
        breakageDC,
        weaponAttackPenalty,
        breakageSound,
        breakagePassSound,
        breakageFailSound,
        heavyBonus,
        durability,
        isWeapon,
        isShield,
        isArmor,
        originItem,
        currentPrice,
        baselinePrice,
        ...renderContent({ actor, item, isHeavy, heavyBonus, breakageDC, weaponAttackPenalty, durability, isDamaged })
    };
}
