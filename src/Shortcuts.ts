/*****************************************************************************
 * Copyright (c) 2020-2026 Sadret
 * Copyright (c) 2026 RYJASM - Multiplayer Edition
 *
 * The OpenRCT2 plugin "Scenery Manager Multiplayer Edition" is licensed
 * under the GNU General Public License version 3.
 *****************************************************************************/


import * as Clipboard from "./core/Clipboard";
import * as Context from "./core/Context";
import * as Arrays from "./utils/Arrays";
import * as Objects from "./utils/Objects";

import Configuration from "./config/Configuration";
import Selector from "./tools/Selector";
import MainWindow from "./window/MainWindow";
import Replace from "./window/tabs/Replace";

export function register() {

    ui.registerShortcut({
        id: "scenery-manager-multiplayer-edition.clipboard.select",
        text: "[SM:MP] Select area",
        bindings: ["CTRL+A", "GUI+A"],
        callback: () => Selector.activate(),
    });
    ui.registerShortcut({
        id: "scenery-manager-multiplayer-edition.clipboard.selectMulti",
        text: "[SM:MP] Multi-select area",
        bindings: ["CTRL+SHIFT+A", "GUI+SHIFT+A"],
        callback: () => Selector.activate(undefined, true),
    });
    ui.registerShortcut({
        id: "scenery-manager-multiplayer-edition.clipboard.copy",
        text: "[SM:MP] Copy area",
        bindings: ["CTRL+C", "GUI+C"],
        callback: Clipboard.copy,
    });
    ui.registerShortcut({
        id: "scenery-manager-multiplayer-edition.clipboard.paste",
        text: "[SM:MP] Paste template",
        bindings: ["CTRL+V", "GUI+V"],
        callback: Clipboard.paste,
    });
    ui.registerShortcut({
        id: "scenery-manager-multiplayer-edition.clipboard.cut",
        text: "[SM:MP] Cut area",
        bindings: ["CTRL+X", "GUI+X"],
        callback: Clipboard.cut,
    });
    ui.registerShortcut({
        id: "scenery-manager-multiplayer-edition.clipboard.save",
        text: "[SM:MP] Save template to library",
        bindings: ["SHIFT+S"],
        callback: Clipboard.save,
    });
    ui.registerShortcut({
        id: "scenery-manager-multiplayer-edition.clipboard.load",
        text: "[SM:MP] Load template from library",
        bindings: ["SHIFT+L"],
        callback: Clipboard.load,
    });
    ui.registerShortcut({
        id: "scenery-manager-multiplayer-edition.clipboard.prevTemplate",
        text: "[SM:MP] Previous template",
        bindings: ["Q"],
        callback: Clipboard.prev,
    });
    ui.registerShortcut({
        id: "scenery-manager-multiplayer-edition.clipboard.nextTemplate",
        text: "[SM:MP] Next template",
        bindings: ["E"],
        callback: Clipboard.next,
    });
    ui.registerShortcut({
        id: "scenery-manager-multiplayer-edition.clipboard.deleteTemplate",
        text: "[SM:MP] Delete template from clipboard",
        bindings: ["CTRL+D", "GUI+D"],
        callback: Clipboard.deleteTemplate,
    });
    ui.registerShortcut({
        id: "scenery-manager-multiplayer-edition.clipboard.undo",
        text: "[SM:MP] Undo last placement",
        bindings: ["CTRL+Z", "GUI+Z"],
        callback: Context.undo,
    });
    ui.registerShortcut({
        id: "scenery-manager-multiplayer-edition.clipboard.redo",
        text: "[SM:MP] Redo last placement",
        bindings: ["CTRL+Y", "GUI+Y"],
        callback: Context.redo,
    });

    ui.registerShortcut({
        id: "scenery-manager-multiplayer-edition.settings.rotate",
        text: "[SM:MP] Rotate template",
        bindings: ["Z"],
        callback: Clipboard.rotate,
    });
    ui.registerShortcut({
        id: "scenery-manager-multiplayer-edition.settings.mirrored",
        text: "[SM:MP] Mirror template",
        bindings: ["CTRL+M", "GUI+M"],
        callback: Clipboard.mirror,
    });
    ui.registerShortcut({
        id: "scenery-manager-multiplayer-edition.settings.decreaseHeight",
        text: "[SM:MP] Decrease template height",
        bindings: ["J"],
        callback: Clipboard.decreaseHeight,
    });
    ui.registerShortcut({
        id: "scenery-manager-multiplayer-edition.settings.resetHeight",
        text: "[SM:MP] Reset template height",
        bindings: ["K"],
        callback: Clipboard.resetHeight,
    });
    ui.registerShortcut({
        id: "scenery-manager-multiplayer-edition.settings.increaseHeight",
        text: "[SM:MP] Increase template height",
        bindings: ["L"],
        callback: Clipboard.increaseHeight,
    });
    ui.registerShortcut({
        id: "scenery-manager-multiplayer-edition.settings.decreaseUpperBound",
        text: "[SM:MP] Decrease vertical upper bound",
        bindings: [],
        callback: () => Clipboard.settings.bounds.upperValue.decrement(),
    });
    ui.registerShortcut({
        id: "scenery-manager-multiplayer-edition.settings.increaseUpperBound",
        text: "[SM:MP] Increase vertical upper bound",
        bindings: [],
        callback: () => Clipboard.settings.bounds.upperValue.increment(),
    });
    ui.registerShortcut({
        id: "scenery-manager-multiplayer-edition.settings.decreaseLowerBound",
        text: "[SM:MP] Decrease vertical lower bound",
        bindings: [],
        callback: () => Clipboard.settings.bounds.lowerValue.decrement(),
    });
    ui.registerShortcut({
        id: "scenery-manager-multiplayer-edition.settings.increaseLowerBound",
        text: "[SM:MP] Increase vertical lower bound",
        bindings: [],
        callback: () => Clipboard.settings.bounds.lowerValue.increment(),
    });

    ui.registerShortcut({
        id: "scenery-manager-multiplayer-edition.configuration.cursorMode",
        text: "[SM:MP] Toggle cursor mode",
        bindings: ["CTRL+T", "GUI+T"],
        callback: () => {
            const prop = Configuration.tools.cursorMode;
            prop.setValue(prop.getValue() === "surface" ? "scenery" : "surface");
        },
    });
    ui.registerShortcut({
        id: "scenery-manager-multiplayer-edition.configuration.placeMode",
        text: "[SM:MP] Toggle place mode",
        bindings: ["CTRL+P", "GUI+P"],
        callback: () => {
            const prop = Configuration.tools.placeMode;
            prop.setValue(prop.getValue() === "safe" ? "raw" : "safe");
        },
    });

    ui.registerShortcut({
        id: "scenery-manager-multiplayer-edition.filter.banner",
        text: "[SM:MP] Toggle banner",
        bindings: ["CTRL+1", "GUI+1"],
        callback: () => Clipboard.settings.filter.banner.flip(),
    });
    ui.registerShortcut({
        id: "scenery-manager-multiplayer-edition.filter.entrance",
        text: "[SM:MP] Toggle entrance",
        bindings: ["CTRL+2", "GUI+2"],
        callback: () => Clipboard.settings.filter.entrance.flip(),
    });
    ui.registerShortcut({
        id: "scenery-manager-multiplayer-edition.filter.footpath",
        text: "[SM:MP] Toggle footpath",
        bindings: ["CTRL+3", "GUI+3"],
        callback: () => Clipboard.settings.filter.footpath.flip(),
    });
    ui.registerShortcut({
        id: "scenery-manager-multiplayer-edition.filter.footpath_addition",
        text: "[SM:MP] Toggle footpath addition",
        bindings: ["CTRL+4", "GUI+4"],
        callback: () => Clipboard.settings.filter.footpath_addition.flip(),
    });
    ui.registerShortcut({
        id: "scenery-manager-multiplayer-edition.filter.large_scenery",
        text: "[SM:MP] Toggle large scenery",
        bindings: ["CTRL+5", "GUI+5"],
        callback: () => Clipboard.settings.filter.large_scenery.flip(),
    });
    ui.registerShortcut({
        id: "scenery-manager-multiplayer-edition.filter.small_scenery",
        text: "[SM:MP] Toggle small scenery",
        bindings: ["CTRL+6", "GUI+6"],
        callback: () => Clipboard.settings.filter.small_scenery.flip(),
    });
    ui.registerShortcut({
        id: "scenery-manager-multiplayer-edition.filter.surface",
        text: "[SM:MP] Toggle surface",
        bindings: ["CTRL+7", "GUI+7"],
        callback: () => Clipboard.settings.filter.surface.flip(),
    });
    ui.registerShortcut({
        id: "scenery-manager-multiplayer-edition.filter.track",
        text: "[SM:MP] Toggle track",
        bindings: ["CTRL+8", "GUI+8"],
        callback: () => Clipboard.settings.filter.track.flip(),
    });
    ui.registerShortcut({
        id: "scenery-manager-multiplayer-edition.filter.wall",
        text: "[SM:MP] Toggle wall",
        bindings: ["CTRL+9", "GUI+9"],
        callback: () => Clipboard.settings.filter.wall.flip(),
    });
    ui.registerShortcut({
        id: "scenery-manager-multiplayer-edition.filter.all",
        text: "[SM:MP] Toogle all",
        bindings: ["CTRL+0", "GUI+0"],
        callback: () => {
            const filters = Objects.values(Clipboard.settings.filter);
            const enabled = Arrays.find(filters, filter => !filter.getValue()) !== null;
            filters.forEach(filter => filter.setValue(enabled));
        },
    });

    ui.registerShortcut({
        id: "scenery-manager-multiplayer-edition.window.openWindow",
        text: "[SM:MP] Open Scenery Manager window",
        bindings: ["W"],
        callback: () => MainWindow.open(),
    });
    ui.registerShortcut({
        id: "scenery-manager-multiplayer-edition.window.openReplaceTab",
        text: "[SM:MP] Open 'Object Replace' tab",
        bindings: ["CTRL+R", "GUI+R"],
        callback: () => {
            MainWindow.open();
            MainWindow.setActiveTab(Replace);
        },
    });
}
