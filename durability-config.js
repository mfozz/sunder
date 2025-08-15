export class DurabilityConfig extends FormApplication {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            title: game.i18n.localize("SUNDER.DurabilityConfig.Title"),
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
        ui.notifications.info(game.i18n.localize("SUNDER.Notification.DurabilitySaved"));
    }
}