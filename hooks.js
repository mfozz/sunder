import * as utils from './utils.js';
import * as uiHooks from './ui-hooks.js';
import * as itemSheet from './item-sheet.js';
import * as attackRolls from './attack-rolls.js';
import * as chatMessages from './chat-messages.js';

export function registerHooks() {
    utils.log("Registering createChatMessage hook");
    Hooks.on("createChatMessage", (message) => {
        chatMessages.onCreateChatMessage(message);
    });

    utils.log("Registering renderChatMessageHTML hook");
    Hooks.on("renderChatMessageHTML", (message, html) => {
        uiHooks._onRenderChatMessage(message, html);
    });

    utils.log("Registering dnd5e.preUseActivity hook");
    Hooks.on("dnd5e.preUseActivity", (activity, config) => {
        attackRolls.onPreUseActivity(activity, config);
    });

    utils.log("Registering dnd5e.preDisplayCard hook");
    Hooks.on("dnd5e.preDisplayCard", (item, cardData) => {
        attackRolls.onPreDisplayCard(item, cardData);
    });

    utils.log("Registering renderDialog hook");
    Hooks.on("renderDialog", (dialog, html) => {
        utils.log("renderDialog hook triggered for dialog:", dialog.title, "Dialog class:", dialog.constructor.name, "Dialog ID:", dialog.options?.id || dialog.id);
        uiHooks._onRenderDialog(dialog, html);
    });

    utils.log("Registering renderApplicationV2 hook as v14 fallback");
    Hooks.on("renderApplicationV2", (app, element) => {
        uiHooks.onRenderAttackRollApplication(app, element, "renderApplicationV2 hook processing Attack Roll dialog");
    });

    utils.log("Registering renderApplication hook as fallback");
    Hooks.on("renderApplication", (app, html) => {
        uiHooks.onRenderAttackRollApplication(app, html, "renderApplication hook processing Attack Roll dialog");
    });

    utils.log("Registering render hook as fallback");
    Hooks.on("render", (app, html, data) => {
        uiHooks.onRenderAttackRollApplication(app, html, `render hook triggered for Attack Roll dialog, App class: ${app.constructor.name}`);
    });

    utils.log("Registering dnd5e.renderAttackRollDialog hook");
    Hooks.on("dnd5e.renderAttackRollDialog", (app, html, data) => {
        utils.log("dnd5e.renderAttackRollDialog hook triggered, App class:", app.constructor.name);
        uiHooks._onRenderDialog(app, html);
    });

    if (game.modules.get("midi-qol")?.active) {
        utils.log("MIDI QOL detected, registering AttackRollComplete hook");
        Hooks.on("midi-qol.AttackRollComplete", (workflow) => {
            utils.log("MIDI AttackRollComplete fired", workflow.id);
            attackRolls.handleMidiQolWorkflow(workflow);
        });
    } else {
        utils.log("No MIDI QOL detected");
    }

    utils.log("Registering getHeaderControlsItemSheet5e hook for repair button");
    Hooks.on("getHeaderControlsItemSheet5e", (app, controls) => {
        utils.log("getHeaderControlsItemSheet5e fired for sheet:", app.document?.name, "Sheet class:", app.constructor.name, "Sheet ID:", app.id);
        itemSheet.appendItemSheetHeaderControls(app, controls);
    });

    utils.log("Registering renderItemSheet hook for button styling");
    Hooks.on("renderItemSheet", (app, html, data) => {
        utils.log("renderItemSheet fired for item:", data.item?.name, "Sheet class:", app.constructor.name);
        itemSheet.updateItemSheetHeaderButton(app, html);
    });
}
