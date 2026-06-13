// utils.js
export function log(...args) {
    if (game.settings.get("sunder", "testingMode")) {
        console.log("[Sunder]", ...args);
    }
}

export function getValidWeaponItem(activity) {
    let item = activity?.item || activity?.subject?.item;
    let actor = activity?.actor || activity?.subject?.actor;
    if (!item || !actor) {
        log("No item or actor in activity, checking subject");
        actor = actor || activity?.subject?.actor;
        if (actor) {
            item = getEquippedWeapon(actor);
        }
    }
    if (!item || item.type !== "weapon" || item.system?.type?.value === "natural") {
        log("No valid weapon item found");
        return null;
    }
    return item;
}

export function getItemPenalty(item) {
    if (!item) return 0;
    const effect = item.effects.find(e => e.changes?.some(c => String(c.key).includes("activities[") && String(c.key).endsWith("].attack.bonus") && !e.disabled));
    return effect ? Number(effect.changes.find(c => String(c.key).includes("activities[") && String(c.key).endsWith("].attack.bonus"))?.value) || 0 : 0;
}

export function getBreakageThreshold(type) {
    return type === "fumble" ? game.settings.get("sunder", "breakageThreshold") : game.settings.get("sunder", "criticalBreakageThreshold");
}

export function isValidItem(item, type) {
    if (!item) return false;
    if (type === "weapon") return item.type === "weapon" && item.system?.type?.value !== "natural";
    if (type === "armor") return item.type === "equipment" && (item.system.armor?.value > 0 || item.system.type?.value === "shield");
    return false;
}

export function isActorOwner(actor, user = game.user) {
    if (!actor || !user) return false;
    const ownerLevel = CONST.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3;
    return actor.ownership?.[user.id] >= ownerLevel || user.character?.id === actor.id;
}

export function getFirstOwningPlayerId(actor) {
    if (!actor) return null;
    return game.users.find(u => !u.isGM && isActorOwner(actor, u))?.id ?? null;
}

export function getActiveGMId() {
    return game.users.find(u => u.isGM && u.active)?.id ?? null;
}

export function getResponsibleUserId(actor) {
    return getFirstOwningPlayerId(actor) ?? getActiveGMId();
}

export function getEquippedWeapon(actor) {
    return actor?.items?.find(i => i.type === "weapon" && i.system.equipped && i.system?.type?.value !== "natural") ?? null;
}

export function getEquippedArmorOrShield(actor) {
    const items = actor?.items;
    if (!items) return null;

    return items.find(i =>
        i.type === "equipment" &&
        i.system.equipped &&
        i.system.type?.value === "shield" &&
        !i.name.includes("(Broken)")
    ) ?? items.find(i =>
        i.type === "equipment" &&
        i.system.equipped &&
        i.system.armor?.value > 0 &&
        i.system.type?.value !== "shield" &&
        !i.name.includes("(Broken)")
    ) ?? null;
}

export function resolveActorFromUuid(uuid) {
    return fromUuid(uuid).then(doc => doc?.actor || null);
}

export function hasSunderEffect(item) {
    return (item.effects || []).some(e => e.name?.includes("Sunder Enchantment"));
}

export function getSunderEffects(item) {
    return item?.effects?.filter(e => e.name?.includes("Sunder Enchantment") || e.name?.includes("Sunder AC Penalty")) ?? [];
}

export function getDurabilityByRarity() {
    const fallback = { common: 1, uncommon: 2, rare: 3, veryRare: 4, legendary: 5 };
    try {
        return JSON.parse(game.settings.get("sunder", "durabilityByRarity"));
    } catch (error) {
        console.error("[Sunder] Invalid durabilityByRarity JSON, using default:", error);
        ui.notifications.error(game.i18n.localize("SUNDER.Notification.InvalidDurabilityJSON"));
        return fallback;
    }
}

export function getBaseDurability(item) {
    const durabilityByRarity = getDurabilityByRarity();
    const rarity = item?.system?.rarity || "common";
    return durabilityByRarity[rarity] || 3;
}

export function getRollTotal(roll) {
    return Number.isFinite(roll?._total) ? roll._total : roll?.total;
}

export function getTargetAC(target) {
    return target?.actor?.system?.attributes?.ac?.value ?? target?.actor?.system?.attributes?.ac?.flat;
}

export function didAttackHitTarget(roll, target, rawD20, workflow = null) {
    if (!target) return false;
    if (rawD20 >= 20) return true;

    if (workflow?.hitTargets?.has?.(target)) return true;
    if (workflow?.hitTargets instanceof Set) {
        const targetId = target.id ?? target.document?.id;
        const targetUuid = target.document?.uuid ?? target.uuid;
        if (Array.from(workflow.hitTargets).some(t => t === target || t.id === targetId || t.document?.uuid === targetUuid)) return true;
    }

    const total = getRollTotal(roll);
    const ac = getTargetAC(target);
    if (!Number.isFinite(total) || !Number.isFinite(ac)) {
        log("Unable to determine attack hit state for armor breakage", { total, ac, target: target?.name });
        return false;
    }

    return total >= ac;
}

/* -------------------------- Price helpers -------------------------- */

/** Parse a number-ish string safely (handles commas, trailing units, etc.). */
export function parseNumberish(v) {
    if (typeof v === "number") return v;
    if (v == null) return 0;
    if (typeof v !== "string") return Number(v) || 0;
    const cleaned = v.replace(/,/g, "").replace(/[^\d.-]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
}

/** Convert a {value, denomination} price into GP. Defaults to gp if unknown. */
export function toGP(value, denomination = "gp") {
    const val = parseNumberish(value);
    const den = String(denomination || "gp").toLowerCase();
    const mult = den === "pp" ? 10 : den === "gp" ? 1 : den === "sp" ? 0.1 : den === "cp" ? 0.01 : 1;
    return val * mult;
}

/** Prepared price in GP, falling back if valueInGP is absent. */
export function getPreparedPriceInGP(item) {
    const p = item?.system?.price ?? {};
    if (p.valueInGP != null) return parseNumberish(p.valueInGP);
    return toGP(p.value, p.denomination || "gp");
}

/** Sum of Sunder price deltas currently applied (in *item’s* denomination, but we treat it as gp since dnd5e uses gp). */
export function getSunderPriceDelta(item) {
    let sum = 0;
    for (const e of item.effects || []) {
        if (e?.disabled) continue;
        if (!e?.name || !/Sunder Enchantment/i.test(e.name)) continue;
        for (const c of e.changes || []) {
            if (String(c.key) === "system.price.value") {
                sum += parseNumberish(c.value);
            }
        }
    }
    return sum; // This is in the item’s denomination (gp in 5e). Good enough for our use.
}

/**
 * Baseline price (what the item would cost with all NON-Sunder effects).
 * Computed as: prepared price - sum(sunder price deltas).
 * Returns a number in GP.
 */
export function getBaselinePriceInGP(item) {
    const prepared = getPreparedPriceInGP(item);
    // sunder deltas are negative numbers added to system.price.value
    const sunderDelta = getSunderPriceDelta(item);
    return prepared - sunderDelta;
}
