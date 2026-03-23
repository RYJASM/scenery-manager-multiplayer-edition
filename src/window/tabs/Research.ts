/*****************************************************************************
 * Copyright (c) 2026 RYJASM - Multiplayer Edition
 * Copyright (c) 2020-2026 Sadret - Scenery Manager
 *
 * The OpenRCT2 plugin "Scenery Manager Multiplayer Edition" is licensed
 * under the GNU General Public License version 3.
 *****************************************************************************/

import GUI from "../../gui/GUI";

export default new GUI.Tab({
    image: {
        frameBase: 5327,
        frameCount: 8,
        frameDuration: 4,
    },
    padding: 8,
    margin: GUI.Margin.uniform(8),
}).add(
    new GUI.Label({ text: "Version:  2.0.9-1.5.1", }),
    new GUI.GroupBox({ text: "Multiplayer Edition features" }).add(
        new GUI.Label({ text: "- Multiplayer support" }),
        new GUI.Label({ text: "- Server-safe item placement and removal" }),
        new GUI.Label({ text: "- Custom placement delay when pasting" }),
        new GUI.Label({ text: "- Placement patterns" }),
        new GUI.Label({ text: "- Loading of objects from saved templates" }),
        new GUI.Label({ text: "- Fixed colors on picked items of find and replace tool" }),
        new GUI.Label({ text: "- Undo button" }),
        new GUI.Label({ text: "- Action history with undo/redo actions" }),
        new GUI.Label({ text: "- Offset in the x/y by half a tile when pasting quarter tile objects" }),
        new GUI.Label({ text: "- Import saved templates from Scenery Manager" }),
    ),
);
