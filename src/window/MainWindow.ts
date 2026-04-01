/*****************************************************************************
 * Copyright (c) 2020-2026 Sadret
 * Copyright (c) 2026 RYJASM - Multiplayer Edition
 *
 * The OpenRCT2 plugin "Scenery Manager Multiplayer Edition" is licensed
 * under the GNU General Public License version 3.
 *****************************************************************************/

import * as Events from "../utils/Events";

import GUI from "../gui/GUI";
import About from "./tabs/About";
import ActionHistory from "./tabs/ActionHistory";
import Benches from "./tabs/Benches";
import Configuration from "./tabs/Configuration";
import CopyPaste from "./tabs/CopyPaste";
import Objects from "./tabs/Objects";
import Replace from "./tabs/Replace";
import Scatter from "./tabs/Scatter";
import TemplateLibrary from "./tabs/TemplateLibrary";

const tabTitles = [
    "Copy & Paste",
    "Action History",
    "Scatter",
    "Find & Replace",
    "Benches",
    "Objects",
    "Template Library",
    "Configuration",
    "About Scenery Manager Multiplayer Edition",
];

const classification = "scenery-manager-multiplayer-edition.main";

function updateTitle(): void {
    const win = ui.getWindow(classification);
    if (win) win.title = tabTitles[win.tabIndex] || "Scenery Manager";
}

export default new GUI.WindowManager(
    {
        width: 384,
        classification,
        title: tabTitles[0],
        colours: [7, 7, 6,], // shades of blue
        onOpen: reOpen => { Events.mainWindowOpen.trigger(reOpen); updateTitle(); },
        onTabChange: updateTitle,
    }, [
    CopyPaste,
    ActionHistory,
    Scatter,
    Replace,
    Benches,
    Objects,
    TemplateLibrary,
    Configuration,
    About,
],
);
