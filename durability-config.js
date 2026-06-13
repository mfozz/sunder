import * as utils from './utils.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class DurabilityConfig extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "sunder-durability-config",
        tag: "form",
        classes: ["sunder", "sunder-durability-config"],
        window: {
            title: "SUNDER.DurabilityConfig.Title"
        },
        position: {
            width: 400
        },
        form: {
            handler: DurabilityConfig.#onSubmit,
            closeOnSubmit: true
        }
    };

    static PARTS = {
        form: {
            template: "modules/sunder/templates/durability-config.html"
        }
    };

    async _prepareContext(options) {
        return {
            durability: utils.getDurabilityByRarity()
        };
    }

    static async #onSubmit(event, form, formData) {
        const data = formData.object;
        const durability = {
            common: Number(data.common) || 1,
            uncommon: Number(data.uncommon) || 1,
            rare: Number(data.rare) || 1,
            veryRare: Number(data.veryRare) || 1,
            legendary: Number(data.legendary) || 1
        };
        await game.settings.set("sunder", "durabilityByRarity", JSON.stringify(durability));
        ui.notifications.info(game.i18n.localize("SUNDER.Notification.DurabilitySaved"));
    }
}
