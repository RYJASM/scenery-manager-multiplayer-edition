/*****************************************************************************
 * Copyright (c) 2020-2026 Sadret
 * Copyright (c) 2026 RYJASM - Multiplayer Edition
 * 
 *
 * The OpenRCT2 plugin "Scenery Manager Multiplayer Edition" is licensed
 * under the GNU General Public License version 3.
 *****************************************************************************/

/// <reference path="./../../../distribution/openrct2.d.ts" />

import * as Configuration from "./config/Configuration";
import * as Context from "./core/Context";
import * as Shortcuts from "./Shortcuts";
import * as Updater from "./Updater";
import * as Events from "./utils/Events";

import MainWindow from "./window/MainWindow";

registerPlugin({
    name: "scenery-manager-multiplayer-edition",
    version: "2.0.9-1.5.2",
    authors: ["Sadret", "RYJASM"],
    type: "local",
    licence: "GPL-3.0",
    minApiVersion: 56,
    targetApiVersion: 56,
    main: () => {
        if (typeof ui === "undefined")
            return console.log("[scenery-manager-multiplayer-edition] Loading cancelled: game runs in headless mode.");

        Updater.update(() => {
            Configuration.load();
            Context.init();
            ui.registerMenuItem("Scenery Manager Multiplayer Edition", () => MainWindow.open());
            Shortcuts.register();
            Events.startup.trigger();
        });
    },
});
