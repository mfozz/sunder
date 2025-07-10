/*
 * Sunder Module v2 for Foundry VTT D&D 5e 4.4.3
 */
class SunderModule {
    constructor() {
        this.registerSettings();
        if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] Loading Sunder v2.0.0");
        if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] Module Initialized");
        this.lastAttackItemUuid = null;
        this.lastAttackPenalty = null;

        if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] Registering createChatMessage hook");
        Hooks.on("createChatMessage", (message) => {
            if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] createChatMessage fired:", message);
            this._onChatMessage(message);
        });

        if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] Registering renderChatMessage hook");
        Hooks.on("renderChatMessage", (message, html) => {
            this._onRenderChatMessage(message, html);
        });

        if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] Registering dnd5e.preRollAttackV2 hook");
        Hooks.on("dnd5e.preRollAttackV2", (activity, config) => {
            this._onPreRollAttackV2(activity, config);
        });

        if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] Registering dnd5e.preDisplayCard hook");
        Hooks.on("dnd5e.preDisplayCard", (item, cardData) => {
            this._onPreDisplayCard(item, cardData);
        });

        if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] Registering renderDialog hook");
        Hooks.on("renderDialog", (dialog, html) => {
            if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] renderDialog hook triggered for dialog:", dialog.title, "Dialog class:", dialog.constructor.name, "Dialog ID:", dialog.options.id);
            this._onRenderDialog(dialog, html);
        });

        if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] Registering renderApplication hook as fallback");
        Hooks.on("renderApplication", (app, html) => {
            if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] renderApplication hook triggered for app:", app.title, "App class:", app.constructor.name, "Element classes:", app.element[0]?.classList.toString());
            if (app.title?.includes("Attack Roll") || app.element[0]?.classList.contains("roll-configuration")) {
                if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] renderApplication hook processing Attack Roll dialog");
                this._onRenderDialog(app, html);
            }
        });

        if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] Registering render hook as broader fallback");
        Hooks.on("render", (app, html, data) => {
            if (app.title?.includes("Attack Roll") || app.element[0]?.classList.contains("roll-configuration")) {
                if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] render hook triggered for Attack Roll dialog, App class:", app.constructor.name);
                this._onRenderDialog(app, html);
            }
        });

        if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] Registering dnd5e.renderAttackRollDialog hook");
        Hooks.on("dnd5e.renderAttackRollDialog", (app, html, data) => {
            if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] dnd5e.renderAttackRollDialog hook triggered, App class:", app.constructor.name);
            this._onRenderDialog(app, html);
        });

        if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] Registering renderRollConfigurationDialog hook");
        Hooks.on("renderRollConfigurationDialog", (app, html, data) => {
            if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] renderRollConfigurationDialog hook triggered, App class:", app.constructor.name);
            if (app.title?.includes("Attack Roll")) {
                this._onRenderDialog(app, html);
            }
        });

        if (game.modules.get("midi-qol")?.active) {
            if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] MIDI QOL detected, registering AttackRollComplete hook");
            Hooks.on("midi-qol.AttackRollComplete", (workflow) => {
                if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] MIDI AttackRollComplete fired", workflow);
                this._handleMidiQolWorkflow(workflow);
            });
        } else {
            if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] No MIDI QOL detected");
        }

        Hooks.on("getItemSheetHeaderButtons", (sheet, buttons) => {
            this.onGetItemSheetHeaderButtons(sheet, buttons);
        });
    }

    registerSettings() {
        console.log("[Sunder] Registering settings");

        game.settings.register("sunder", "testingMode", {
            name: game.i18n.localize("sunder.settings.testingMode.name"),
            hint: game.i18n.localize("sunder.settings.testingMode.hint"),
            scope: "world",
            config: true,
            type: Boolean,
            default: false
        });

        game.settings.register("sunder", "enableWeaponBreakage", {
            name: game.i18n.localize("sunder.settings.enableWeaponBreakage.name"),
            hint: game.i18n.localize("sunder.settings.enableWeaponBreakage.hint"),
            scope: "world",
            config: true,
            type: Boolean,
            default: true
        });

        game.settings.register("sunder", "enableArmorBreakage", {
            name: game.i18n.localize("sunder.settings.enableArmorBreakage.name"),
            hint: game.i18n.localize("sunder.settings.enableArmorBreakage.hint"),
            scope: "world",
            config: true,
            type: Boolean,
            default: true
        });

        game.settings.register("sunder", "breakageThreshold", {
            name: game.i18n.localize("sunder.settings.breakageThreshold.name"),
            hint: game.i18n.localize("sunder.settings.breakageThreshold.hint"),
            scope: "world",
            config: true,
            type: Number,
            default: 1,
            range: { min: 1, max: 20, step: 1 }
        });

        game.settings.register("sunder", "criticalBreakageThreshold", {
            name: game.i18n.localize("sunder.settings.criticalBreakageThreshold.name"),
            hint: game.i18n.localize("sunder.settings.criticalBreakageThreshold.hint"),
            scope: "world",
            config: true,
            type: Number,
            default: 20,
            range: { min: 1, max: 20, step: 1 }
        });

        game.settings.register("sunder", "breakageDC", {
            name: game.i18n.localize("sunder.settings.breakageDC.name"),
            hint: game.i18n.localize("sunder.settings.breakageDC.hint"),
            scope: "world",
            config: true,
            type: Number,
            default: 10,
            range: { min: 5, max: 20, step: 1 }
        });

        game.settings.register("sunder", "durabilityByRarity", {
            name: game.i18n.localize("sunder.settings.durabilityByRarity.name"),
            hint: "",
            scope: "world",
            config: true,
            type: String,
            default: JSON.stringify({
                common: 1,
                uncommon: 2,
                rare: 3,
                veryRare: 4,
                legendary: 5
            }),
            onChange: (value) => {
                try {
                    JSON.parse(value);
                } catch (e) {
                    ui.notifications.error("Invalid JSON for Durability by Rarity: " + e.message);
                }
            }
        });

        game.settings.register("sunder", "weaponAttackPenalty", {
            name: game.i18n.localize("sunder.settings.weaponAttackPenalty.name"),
            hint: game.i18n.localize("sunder.settings.weaponAttackPenalty.hint"),
            scope: "world",
            config: true,
            type: Number,
            default: -2,
            range: { min: -5, max: 0, step: 1 }
        });

        game.settings.register("sunder", "armorACPenalty", {
            name: game.i18n.localize("sunder.settings.armorACPenalty.name"),
            hint: game.i18n.localize("sunder.settings.armorACPenalty.hint"),
            scope: "world",
            config: true,
            type: Number,
            default: -2,
            range: { min: -5, max: 0, step: 1 }
        });

        game.settings.register("sunder", "enableDynamicACPenalties", {
            name: game.i18n.localize("sunder.settings.enableDynamicACPenalties.name"),
            hint: game.i18n.localize("sunder.settings.enableDynamicACPenalties.hint"),
            scope: "world",
            config: true,
            type: Boolean,
            default: true
        });

        game.settings.register("sunder", "heavyWeaponBonus", {
            name: game.i18n.localize("sunder.settings.heavyWeaponBonus.name"),
            hint: game.i18n.localize("sunder.settings.heavyWeaponBonus.hint"),
            scope: "world",
            config: true,
            type: Number,
            default: 2,
            range: { min: 0, max: 10, step: 1 }
        });

        game.settings.register("sunder", "repairPercentage", {
            name: game.i18n.localize("sunder.settings.repairCostPercentage.name"),
            hint: game.i18n.localize("sunder.settings.repairCostPercentage.hint"),
            scope: "world",
            config: true,
            type: Number,
            default: 50,
            range: { min: 0, max: 200, step: 1 }
        });

        game.settings.register("sunder", "breakageSound", {
            name: game.i18n.localize("sunder.settings.breakageSound.name"),
            hint: game.i18n.localize("sunder.settings.breakageSound.hint"),
            scope: "world",
            config: true,
            type: String,
            filePicker: "audio",
            default: "sounds/combat/epic-turn-1hit.ogg"
        });

        game.settings.register("sunder", "breakagePassSound", {
            name: game.i18n.localize("sunder.settings.breakagePassSound.name"),
            hint: game.i18n.localize("sunder.settings.breakagePassSound.hint"),
            scope: "world",
            config: true,
            type: String,
            filePicker: "audio",
            default: "sounds/combat/epic-turn-2hit.ogg"
        });

        game.settings.register("sunder", "breakageFailSound", {
            name: game.i18n.localize("sunder.settings.breakageFailSound.name"),
            hint: game.i18n.localize("sunder.settings.breakageFailSound.hint"),
            scope: "world",
            config: true,
            type: String,
            filePicker: "audio",
            default: "sounds/combat/epic-turn-2hit.ogg"
        });

        game.settings.register("sunder", "repairSound", {
            name: game.i18n.localize("sunder.settings.repairSound.name"),
            hint: game.i18n.localize("sunder.settings.repairSound.hint"),
            scope: "world",
            config: true,
            type: String,
            filePicker: "audio",
            default: ""
        });

        Hooks.on("renderSettingsConfig", (app, html) => {
            if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] Rendering settings config");

            const dynamicACEnabled = game.settings.get("sunder", "enableDynamicACPenalties");
            const armorPenaltySetting = html.find(`[name="sunder.armorACPenalty"]`).closest('.form-group');
            if (armorPenaltySetting.length && dynamicACEnabled) {
                armorPenaltySetting.find('input').prop('disabled', true);
            }

            html.find(`[name="sunder.enableDynamicACPenalties"]`).on('change', (event) => {
                const enabled = event.target.checked;
                armorPenaltySetting.find('input').prop('disabled', enabled);
                ui.notifications.warn(
                    game.i18n.localize("sunder.notify.dynamicACSwitch"),
                    { permanent: true }
                );
            });

            const durabilitySetting = html.find(`[name="sunder.durabilityByRarity"]`).closest('.form-group');
            if (durabilitySetting.length) {
                const currentValue = game.settings.get("sunder", "durabilityByRarity");
                durabilitySetting.replaceWith(`
                    <div class="form-group">
                        <label>${game.i18n.localize("sunder.settings.durabilityByRarity.name")}</label>
                        <button type="button" class="sunder-durability-button">${game.i18n.localize("sunder.settings.durabilityByRarity.name")}</button>
                        <p class="hint">Click the button to configure durability values for each rarity.</p>
                    </div>
                `);
                html.find(".sunder-durability-button").click(() => {
                    new DurabilityConfig().render(true);
                });
            }

            const resetButton = `<button type="button" class="sunder-reset-defaults">Reset to Defaults</button>`;
            html.find(".sheet-footer").prepend(resetButton);
            html.find(".sunder-reset-defaults").click(async () => {
                await game.settings.set("sunder", "breakageThreshold", 1);
                await game.settings.set("sunder", "criticalBreakageThreshold", 20);
                await game.settings.set("sunder", "breakageDC", 10);
                await game.settings.set("sunder", "durabilityByRarity", JSON.stringify({
                    common: 1,
                    uncommon: 2,
                    rare: 3,
                    veryRare: 4,
                    legendary: 5
                }));
                await game.settings.set("sunder", "weaponAttackPenalty", -2);
                await game.settings.set("sunder", "armorACPenalty", -2);
                await game.settings.set("sunder", "heavyWeaponBonus", 2);
                await game.settings.set("sunder", "repairPercentage", 50);
                await game.settings.set("sunder", "breakageSound", "sounds/combat/epic-turn-1hit.ogg");
                await game.settings.set("sunder", "breakagePassSound", "sounds/combat/epic-turn-2hit.ogg");
                await game.settings.set("sunder", "breakageFailSound", "sounds/combat/epic-turn-2hit.ogg");
                await game.settings.set("sunder", "repairSound", "");
                ui.notifications.info("Sunder settings reset to defaults.");
                app.render(true);
            });

            if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] Settings registration complete");
        });
    }

    async onGetItemSheetHeaderButtons(sheet, buttons) {
        const item = sheet.item;
        if (game.user.isGM && (item.getFlag("sunder", "damaged") || item.effects.some(e => e.name.includes("Sunder Enchantment")))) {
            const actor = sheet.actor;
            const isBroken = (await item.getFlag("sunder", "durability") ?? 999) <= 0;
            const basePrice = item.getFlag("sunder", "originalPrice") || item.system.price?.value || 1;
            const repairPercentage = game.settings.get("sunder", "repairPercentage") / 100;
            const costMultiplier = isBroken ? repairPercentage * 2 : repairPercentage;
            const cost = Math.max(1, Math.floor(basePrice * costMultiplier));
            buttons.unshift({
                label: "Repair",
                class: "sunder-repair",
                icon: "fas fa-hammer",
                onclick: async () => {
                    const confirmed = await Dialog.confirm({
                        title: `Repair ${item.name}`,
                        content: `<p>Repair ${item.name} for ${cost}gp?</p>`,
                        yes: () => true,
                        no: () => false,
                        defaultYes: false
                    });
                    if (confirmed) {
                        if (actor.type === "character" && (actor.system.currency?.gp || 0) < cost) {
                            ui.notifications.warn(game.i18n.format("sunder.notify.noGold", { actor: actor.name, item: item.name, cost: cost }));
                            return;
                        }

                        await game.sunderUI.repairItem(actor, item);

                        if (actor.type === "character" && actor.system.currency?.gp >= cost) {
                            await actor.update({
                                "system.currency.gp": actor.system.currency.gp - cost
                            });
                            ui.notifications.info(game.i18n.format("sunder.notify.repairedDeducted", { item: item.name, cost: cost, actor: actor.name }));
                        } else {
                            ui.notifications.info(game.i18n.format("sunder.notify.repairedManual", { item: item.name, cost: cost }));
                        }
                        await actor.sheet?.render(false);
                    }
                }
            });
        }
    }

    async _onPreRollAttackV2(activity, config) {
        if (game.settings.get("sunder", "testingMode")) {
            console.log("[Sunder] preRollAttackV2 fired", { activity, config });
            console.dir(activity);
            console.dir(config);
            console.log("[Sunder] preRollAttackV2 triggered via:", activity?.source || "unknown");
        }
        try {
            let item = activity?.item || activity?.subject?.item;
            let actor = activity?.actor || activity?.subject?.actor;
            if (!item || !actor) {
                if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] No item or actor in activity, checking subject");
                actor = actor || activity?.subject?.actor;
                if (actor) {
                    item = actor.items.find(i => i.type === "weapon" && i.system.equipped && i.system?.type?.value !== "natural");
                }
            }
            if (!item || item.type !== "weapon" || item.system?.type?.value === "natural") {
                if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] No valid weapon item for breakage:", item?.name);
                this.lastAttackItemUuid = null; // Clear UUID for invalid or natural weapons
                this.lastAttackPenalty = null;
                return;
            }
            const penalty = await item.getFlag("sunder", "attackPenalty") || 0;
            if (penalty === 0) {
                if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] No penalty for item:", item.name);
            } else {
                if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Applying penalty ${penalty} to attack roll config for ${item.name}`);
            }
            this.lastAttackItemUuid = item.uuid;
            this.lastAttackPenalty = penalty;
            if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Stored lastAttackItemUuid: ${this.lastAttackItemUuid}, lastAttackPenalty: ${this.lastAttackPenalty}`);
            if (!config.rolls) config.rolls = [{}];
            if (!config.rolls[0].terms) {
                const formula = config.formula || "1d20 + @mod";
                const rollData = actor?.getRollData() || {};
                const baseRoll = new Roll(formula, rollData);
                config.rolls[0].terms = baseRoll.terms;
                config.rolls[0].parts = baseRoll.terms
                    .filter(term => term instanceof NumericTerm || term instanceof DiceTerm)
                    .map(term => term.formula || term.number?.toString());
                config.rolls[0].formula = config.rolls[0].parts.join(" + ");
                config.formula = config.rolls[0].formula;
            }
            if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] Initial config.rolls[0].terms:", config.rolls[0].terms.map(term => term.formula || term.number));
            if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] Initial config.rolls[0].parts:", config.rolls[0].parts);
            if (penalty !== 0) {
                const penaltyTerm = new NumericTerm({ number: penalty });
                config.rolls[0].terms = config.rolls[0].terms.filter(term => !(term instanceof OperatorTerm));
                config.rolls[0].terms.push(new OperatorTerm({ operator: penalty < 0 ? "-" : "+" }));
                config.rolls[0].terms.push(penaltyTerm);
                config.rolls[0].parts = config.rolls[0].terms
                    .filter(term => term instanceof NumericTerm || term instanceof DiceTerm)
                    .map(term => term.formula || term.number?.toString());
                config.rolls[0].formula = config.rolls[0].parts.join(" + ");
                config.formula = config.rolls[0].formula;
            }
            if (game.settings.get("sunder", "testingMode")) {
                const logTerms = config.rolls[0].terms
                    .filter(term => term instanceof NumericTerm || term instanceof DiceTerm)
                    .map(term => term.formula || term.number);
                console.log(`[Sunder] Updated roll config: Formula: ${config.formula}, Terms: ${JSON.stringify(logTerms)}`);
                console.log(`[Sunder] Final config.formula: ${config.formula}`);
                console.log(`[Sunder] Final config.rolls[0].formula: ${config.rolls[0].formula}`);
                console.log("[Sunder] Final config.rolls[0].terms:", config.rolls[0].terms.map(term => term.formula || term.number));
                console.log("[Sunder] Final config.rolls[0].parts:", config.rolls[0].parts);
            }
        } catch (error) {
            console.error("[Sunder] Error in preRollAttackV2:", error);
        }
    }

    async _onPreDisplayCard(item, cardData) {
        if (game.settings.get("sunder", "testingMode")) {
            console.log("[Sunder] preDisplayCard called with item:", item?.name, "cardData:", cardData);
            console.dir(item);
            console.dir(cardData);
        }
        if (!item || !cardData) {
            console.warn("[Sunder] Missing item or cardData in preDisplayCard, skipping");
            return;
        }
        if (item.type !== "weapon" || !cardData.rolls || !cardData.rolls.length || item.system?.type?.value === "natural") {
            if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] No valid weapon item for breakage:", item?.name);
            return;
        }
        const penalty = await item.getFlag("sunder", "attackPenalty") || 0;
        if (penalty === 0) {
            if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] No penalty for item in preDisplayCard:", item.name);
            return;
        }
        if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Applying penalty ${penalty} to attack card for ${item.name}`);
        const roll = cardData.rolls[0];
        if (roll instanceof Roll) {
            const originalTotal = roll.total;
            roll._total = originalTotal + penalty;
            roll.options.sunderPenalty = penalty;
            if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Updated attack card roll: Formula: ${roll._formula}, Original total: ${originalTotal}, New total: ${roll._total}`);
        } else {
            console.warn("[Sunder] Roll in cardData is not a Roll instance:", roll);
        }
    }

    async _onRenderDialog(dialog, html) {
        if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] renderDialog fired", { dialog });
        if (!dialog.title.includes("Attack Roll")) return;

        const itemUuid = this.lastAttackItemUuid;
        if (!itemUuid) {
            if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] No last attack item UUID, skipping dialog render");
            return;
        }

        const item = await fromUuid(itemUuid);
        if (!item || item.type !== "weapon") {
            if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] No valid weapon item in renderDialog, skipping");
            return;
        }

        const penalty = this.lastAttackPenalty || 0;
        if (penalty === 0) {
            if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] No penalty for item in renderDialog:", item.name);
            return;
        }

        if (game.settings.get("sunder", "testingMode")) {
            console.log("[Sunder] Dialog properties:", Object.keys(dialog));
            console.log("[Sunder] Dialog rolls:", dialog.rolls);
            console.log("[Sunder] Dialog formula:", dialog.formula);
            console.log("[Sunder] Dialog object:", dialog);
        }

        const $html = $(html);

        const formulaElements = $html.find(".dice-formula");
        if (!formulaElements.length) {
            console.warn("[Sunder] No dice-formula elements found in dialog");
        } else {
            if (game.settings.get("sunder", "testingMode")) {
                formulaElements.each((index, element) => {
                    console.log(`[Sunder] Dice-formula element ${index}: ${$(element).text().trim()}`);
                });
            }
        }

        const mainFormulaElement = $html.find(".formula");
        if (mainFormulaElement.length) {
            const currentFormula = mainFormulaElement.text().trim();
            if (!currentFormula.includes(`${penalty}`)) {
                const updatedFormula = `${currentFormula} ${penalty < 0 ? "-" : "+"} ${Math.abs(penalty)}`;
                mainFormulaElement.text(updatedFormula);
                if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Updated main formula element to: ${updatedFormula}`);
            } else {
                if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] Main formula element already includes penalty:", currentFormula);
            }
        } else {
            console.warn("[Sunder] Could not find main formula element to update");
        }
    }

    async _onRenderChatMessage(message, html) {
        if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] renderChatMessage fired", { message });
        if (message.flags?.dnd5e?.roll?.type !== "attack") {
            if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] Not an attack roll, skipping renderChatMessage");
            return;
        }

        let penalty = message.rolls[0]?.options?.sunderPenalty || 0;
        if (penalty === 0 && this.lastAttackItemUuid) {
            const item = await fromUuid(this.lastAttackItemUuid);
            if (item && item.type === "weapon") {
                penalty = await item.getFlag("sunder", "attackPenalty") || 0;
                if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Fetched penalty from item ${item.name}: ${penalty}`);
            }
        }
        if (penalty === 0) {
            if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] No penalty to display");
            return;
        }

        const roll = message.rolls[0];
        if (!roll) {
            console.warn("[Sunder] No roll found in message");
            return;
        }

        if (!roll.options.sunderPenalty) {
            roll._total = roll.total + penalty;
            roll._formula = `${roll._formula} ${penalty < 0 ? "-" : "+"} ${Math.abs(penalty)}`;
            if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Adjusted roll total for penalty:`, roll._total);
        }

        const formulaElement = html.find(".dice-formula");
        if (formulaElement.length) {
            formulaElement.text(roll._formula);
            if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Updated chat card formula: ${formulaElement.text()}`);
        }

        const totalElement = html.find(".dice-total");
        if (totalElement.length) {
            totalElement.text(roll._total || roll.total);
            if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Updated chat card total: ${roll._total || roll.total}`);
        }
    }

    async _onChatMessage(message) {
        if (game.settings.get("sunder", "testingMode"))
            console.log("[Sunder] Message Data:", message);

        // STEP 1: Respond to breakage popup trigger from flags
        if (message.flags.sunder && !message.flags.sunder.resolveBreakage) {
            const flags = message.flags.sunder;
            if (game.settings.get("sunder", "testingMode")) {
                console.log(`[Sunder] Chat message flags:`, {
                    targetTokenUuid: flags.targetTokenUuid,
                    itemUuid: flags.itemUuid,
                    attackerTokenUuid: flags.attackerTokenUuid,
                    rollType: flags.rollType
                });
            }
            let actor = null;
            if (flags.targetTokenUuid) {
                actor = (await fromUuid(flags.targetTokenUuid))?.actor;
                if (!actor) {
                    const actorId = flags.targetTokenUuid.includes("Actor.") ? flags.targetTokenUuid.split("Actor.").pop() : null;
                    if (actorId) {
                        actor = game.actors.get(actorId);
                        if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] Fallback actor fetch:", actor?.name, "ID:", actor?.id);
                    } else {
                        console.error("[Sunder] Invalid targetTokenUuid format:", flags.targetTokenUuid);
                    }
                }
            } else {
                console.error("[Sunder] targetTokenUuid is undefined in chat flags:", flags);
            }
            const item = await fromUuid(flags.itemUuid);
            if (!actor || !item) {
                console.error("[Sunder] Failed to resolve actor or item from chat flags:", flags);
                return;
            }

            const currentUserId = game.user.id;
            const isGM = game.user.isGM;
            const isOwner = actor.ownership[currentUserId] >= 3 || game.users.find(u => u.id === currentUserId)?.character?.id === actor.id;

            if (game.settings.get("sunder", "testingMode")) {
                console.log(`[Sunder] Checking popup gate: isGM=${isGM}, isOwner=${isOwner}, currentUserId=${currentUserId}, affectedUserId=${flags.affectedUserId}, actorOwnership=${JSON.stringify(actor.ownership)}, actorId=${actor.id}`);
            }

            if (isGM || (isOwner && currentUserId === flags.affectedUserId)) {
                if (game.settings.get("sunder", "testingMode")) {
                    console.log(`[Sunder] Showing breakage popup for ${isGM ? "GM" : "Player"}: ${actor.name}, ${item.name}`);
                }
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

        // STEP 2: Handle resolveBreakage messages
        const resolveData = message.getFlag("sunder", "resolveBreakage");
        if (resolveData) {
            if (game.settings.get("sunder", "testingMode"))
                console.log(`[Sunder] Processing resolveBreakage:`, resolveData);
            Object.values(ui.windows).filter(w => w.title === game.i18n.localize("sunder.popup.title")).forEach(w => {
                w.close();
                if (game.settings.get("sunder", "testingMode"))
                    console.log(`[Sunder] Closed dialog - Title: ${w.title}, Item: ${w.element.find('.sunder-details strong').text()}, App ID: ${w.id}`);
            });
        }

        // STEP 3: Process new rolls
        const isRoll = message.flags?.core?.RollTable || message.rolls;
        if (game.settings.get("sunder", "testingMode"))
            console.log("[Sunder] Is this a roll?", !!isRoll);
        if (!isRoll) return;

        const isAttackRoll = message.flags?.dnd5e?.roll?.type === "attack";
        if (isAttackRoll && message.author.id === game.user.id) {
            const roll = message.rolls?.[0];
            const keptResult = roll.terms[0].results.find(r => r.active)?.result;
            const rawD20 = keptResult !== undefined ? keptResult : roll.terms[0].results[0].result;
            if (rawD20 === undefined) return;

            const speaker = ChatMessage.getSpeaker();
            if (game.settings.get("sunder", "testingMode")) {
                console.log(`[Sunder] Speaker data:`, {
                    speakerAlias: speaker.alias,
                    speakerActor: speaker.actor,
                    speakerToken: speaker.token,
                    speakerScene: speaker.scene
                });
            }
            const token = canvas.tokens.get(speaker.token);
            if (game.settings.get("sunder", "testingMode")) {
                console.log(`[Sunder] Resolved token:`, {
                    tokenId: token?.id,
                    tokenActorId: token?.actor?.id,
                    tokenName: token?.name
                });
            }
            const attacker = token ? token.actor : game.actors.get(message.flags?.dnd5e?.item?.actorId || speaker.actor);
            if (game.settings.get("sunder", "testingMode")) {
                console.log(`[Sunder] Attacker resolved:`, {
                    attackerId: attacker?.id,
                    attackerName: attacker?.name,
                    attackerOwnership: JSON.stringify(attacker?.ownership || {})
                });
            }

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
                        await this._triggerBreakage(attacker, null, rawD20, false, message.id, weaponItem);
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

            await this._triggerBreakage(attacker, target, rawD20, isHeavy, message.id, weaponItem);
        }
    }

    async _handleMidiQolWorkflow(workflow) {
        if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] Handling MIDI QOL workflow:", workflow);
        const roll = workflow.attackRoll;
        if (!roll) {
            if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] No attack roll found in workflow.");
            return;
        }
        let item = workflow.item;
        if (!item && this.lastAttackItemUuid) {
            item = await fromUuid(this.lastAttackItemUuid);
            if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] Using cached item lookup: UUID:", this.lastAttackItemUuid, "Item found:", item?.name || "None", "weaponType:", item?.system?.type?.value);
        }
        const keptResult = roll.terms[0].results.find(r => r.active)?.result;
        const rawD20 = keptResult !== undefined ? keptResult : roll.terms[0].results[0].result;
        if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] MIDI Roll data:", roll, "Raw d20 (kept):", rawD20, "Final result:", roll.total);
        if (rawD20 === undefined) return;
        const attacker = workflow.actor;
        if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] MIDI Attacker:", attacker?.name);
        const isHeavy = item?.system.properties?.has("hvy") || false;
        if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] MIDI Attacker weapon:", item?.name || "None", "Is Heavy:", isHeavy);
        if (!item || item.type !== "weapon" || (item.system?.type?.value === "natural" && rawD20 <= game.settings.get("sunder", "breakageThreshold"))) {
            if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] No valid weapon item found for breakage:", item?.name);
            if (item?.system?.type?.value === "natural" && rawD20 >= game.settings.get("sunder", "criticalBreakageThreshold")) {
                await this._triggerBreakage(attacker, null, rawD20, isHeavy, workflow.id, item);
            }
            return;
        }
        const penalty = await item.getFlag("sunder", "attackPenalty") || 0;
        if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Checked penalty for ${item.name}: ${penalty}`);
        if (penalty !== 0) {
            if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Applying penalty ${penalty} to MIDI attack roll for ${item.name}`);
            const originalTotal = roll.total;
            roll._total = originalTotal + penalty;
            roll._formula = `${roll._formula} ${penalty < 0 ? "-" : "+"} ${Math.abs(penalty)}`;
            if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Updated MIDI roll: Formula: ${roll._formula}, Original total: ${originalTotal}, New total: ${roll._total}`);
            roll.options.sunderPenalty = penalty;
            workflow.attackRoll = roll;
        }
        const targets = workflow.targets.size > 0 ? Array.from(workflow.targets) : [];
        const target = targets.length > 0 ? targets[0] : null;
        await this._triggerBreakage(attacker, target, rawD20, isHeavy, workflow.id, item);
    }

    async _triggerBreakage(attacker, target, rawD20, isHeavy, messageId, attackWeapon = null) {
        const threshold = game.settings.get("sunder", "breakageThreshold");
        const criticalThreshold = game.settings.get("sunder", "criticalBreakageThreshold");
        const enableWeaponBreakage = game.settings.get("sunder", "enableWeaponBreakage");
        const enableArmorBreakage = game.settings.get("sunder", "enableArmorBreakage");
        let itemType, item, targetActor, affectedUserId, rollType, attackerUserId;
        const gmUser = game.users.find(u => u.isGM && u.active);
        const rollingUser = game.user;
        if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Attacker: ${attacker?.name || "None"}, Target: ${target?.actor?.name || "None"}, Attacker ownership: ${JSON.stringify(attacker?.ownership || {})}, Rolling user: ${rollingUser.id}`);
        if (target && game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Target ownership: ${JSON.stringify(target.actor?.ownership || {})}`);
        if (!attacker) {
            console.error("[Sunder] No attacker found for breakage check.");
            return;
        }
        if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Raw d20: ${rawD20}, Fumble Threshold: ${threshold}, Crit Threshold: ${criticalThreshold}`);
        if (rawD20 <= threshold && enableWeaponBreakage) {
            itemType = "weapon";
            targetActor = attacker;
            item = attackWeapon;
            if (!item || item.type !== "weapon" || item.system?.type?.value === "natural") {
                item = targetActor.items.find(i => i.type === "weapon" && i.system.equipped && i.system?.type?.value !== "natural");
            }
            if (!item) {
                if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] No valid equipped weapon found for fumble breakage.");
                return;
            }
            const durabilityByRarityRaw = game.settings.get("sunder", "durabilityByRarity");
            let durabilityByRarity;
            try {
                durabilityByRarity = JSON.parse(durabilityByRarityRaw);
            } catch (e) {
                durabilityByRarity = { common: 1, uncommon: 2, rare: 3, veryRare: 4, legendary: 5 };
                console.error("[Sunder] Invalid durabilityByRarity JSON, using default:", e);
            }
            const rarity = item.system?.rarity || "common";
            const baseDurability = durabilityByRarity[rarity] || 3;
            let durability = await item.getFlag("sunder", "durability");
            if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Weapon ${item.name}: flag durability=${durability}, baseDurability=${baseDurability}`);
            if (durability === undefined) {
                const sunderEffect = item.effects.find(e => e.name.includes("Sunder Enchantment"));
                if (sunderEffect) {
                    const durabilityChange = sunderEffect.changes.find(c => c.key === "flags.sunder.durability");
                    durability = durabilityChange ? Number(durabilityChange.value) : baseDurability;
                    if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Fetched durability from AE for ${item.name}: ${durability}`);
                } else {
                    durability = baseDurability;
                    if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] No AE found, using baseDurability for ${item.name}: ${durability}`);
                }
            }
            if (durability <= 0) {
                if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] Skipping breakage check for broken item: ${item.name} (durability: ${durability})`);
                return;
            }
            affectedUserId = game.users.find(u => !u.isGM && (u.character?.id === targetActor.id || targetActor.ownership[u.id] >= 3))?.id || gmUser?.id;
            rollType = "fumble";
            attackerUserId = game.users.find(u => !u.isGM && (u.character?.id === attacker.id || attacker.ownership[u.id] >= 3))?.id || gmUser?.id;
        } else if (rawD20 >= criticalThreshold && enableArmorBreakage) {
            itemType = "armor";
            targetActor = target ? target.actor : null;
            if (!targetActor) {
                if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] No target actor found for crit breakage check.");
                return;
            }
            item = targetActor.items.find(i => 
                i.type === "equipment" && 
                i.system.equipped && 
                i.system.type?.value === "shield" && 
                !i.name.includes("(Broken)")
            );
            if (!item) {
                item = targetActor.items.find(i => 
                    i.type === "equipment" && 
                    i.system.equipped && 
                    i.system.armor?.value > 0 && 
                    i.system.type?.value !== "shield" && 
                    !i.name.includes("(Broken)")
                );
            }
            if (!item) {
                if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] No valid armor or shield found for crit breakage.");
                return;
            }
            affectedUserId = game.users.find(u => !u.isGM && (u.character?.id === targetActor.id || targetActor.ownership[u.id] >= 3))?.id || gmUser?.id;
            rollType = "crit";
            attackerUserId = game.users.find(u => !u.isGM && (u.character?.id === attacker.id || attacker.ownership[u.id] >= 3))?.id || gmUser?.id;
        } else {
            if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] Raw d20 does not meet breakage thresholds or mechanic disabled:", rawD20);
            return;
        }
        if (!item || !targetActor) {
            if (game.settings.get("sunder", "testingMode")) console.log("[Sunder] No valid item or target actor found for breakage.");
            return;
        }
        if (!messageId) {
            console.warn("[Sunder] No message ID provided for breakage popup, using null");
        }

        const attackerToken = canvas.tokens.get(attacker.token) || canvas.tokens.placeables.find(t => t.actor?.id === attacker.id);
        const targetToken = target;
        const targetTokenUuid = rollType === "fumble" ? (attackerToken?.document.uuid || `Actor.${targetActor.id}`) : (targetToken?.document.uuid || `Actor.${targetActor.id}`);
        if (game.settings.get("sunder", "testingMode")) console.log(`[Sunder] targetTokenUuid set to: ${targetTokenUuid}, attackerToken: ${attackerToken?.id}, targetToken: ${targetToken?.id}`);

        if (game.settings.get("sunder", "testingMode")) {
            console.log("[Sunder] Breakage details:", {
                attackerId: attacker?.id,
                attackerName: attacker?.name,
                attackerTokenId: attackerToken?.id,
                targetActorId: targetActor?.id,
                targetTokenId: targetToken?.id,
                targetTokenUuid: targetTokenUuid,
                itemName: item?.name,
                itemUuid: item?.uuid,
                itemOwnerId: item?.parent?.id,
                rollType,
                affectedUserId,
                attackerUserId,
                gmUserId: gmUser?.id
            });
            console.log("[Sunder] Creating chat message for breakage:", {
                item: item.name,
                attacker: attacker.name,
                target: targetToken?.name,
                isHeavy,
                rollType,
                affectedUserId,
                attackerUserId,
                gmUserId: gmUser?.id
            });
        }

        if (rollingUser.id === game.user.id) {
            await ChatMessage.create({
                content: `<strong>[Sunder]</strong> Breakage Check Triggered`,
                speaker: { alias: attacker.name },
                type: CONST.CHAT_MESSAGE_STYLES.OOC,
                flags: {
                    sunder: {
                        attackerTokenUuid: attackerToken?.document.uuid,
                        targetTokenUuid: targetTokenUuid,
                        itemUuid: item.uuid,
                        isHeavy,
                        rollType,
                        affectedUserId,
                        attackerUserId,
                        gmUserId: gmUser?.id
                    }
                }
            });
        }
    }
}

Hooks.once('init', () => {
    game.sunder = new SunderModule();
});

class DurabilityConfig extends FormApplication {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            title: "Configure Durability by Rarity",
            id: "sunder-durability-config",
            template: "modules/sunder/templates/durability-config.html",
            width: 400,
            height: "auto",
            closeOnSubmit: true
        });
    }

    getData() {
        const durabilityByRarityRaw = game.settings.get("sunder", "durabilityByRarity");
        return {
            durability: JSON.parse(durabilityByRarityRaw)
        };
    }

    activateListeners(html) {
        super.activateListeners(html);
    }

    async _updateObject(event, formData) {
        const durability = {
            common: formData.common,
            uncommon: formData.uncommon,
            rare: formData.rare,
            veryRare: formData.veryRare,
            legendary: formData.legendary
        };
        await game.settings.set("sunder", "durabilityByRarity", JSON.stringify(durability));
    }
}