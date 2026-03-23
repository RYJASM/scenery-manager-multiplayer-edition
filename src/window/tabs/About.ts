/*****************************************************************************
 * Copyright (c) 2020-2026 Sadret
 *
 * The OpenRCT2 plugin "Scenery Manager Multiplayer Edition" is licensed
 * under the GNU General Public License version 3.
 *****************************************************************************/

import GUI from "../../gui/GUI";

const separator = "+++++++++++++++++++++++++++++++++++++++++++++++++++";

export default new GUI.Tab({
    image: {
        frameBase: 5367,
        frameCount: 8,
        frameDuration: 4,
    },
    padding: 0,
    margin: GUI.Margin.uniform(8),
}).add(
    new GUI.Label({
        text: separator,
        textAlign: "centred",
    }),
    new GUI.VBox(8, GUI.Margin.uniform(16)).add(
        new GUI.Label({
            text: "Scenery Manager Multiplayer Edition",
            textAlign: "centred",
        }),
        new GUI.Label({
            text: "A fork of Scenery Manager with multiplayer support.",
            textAlign: "centred",
        }),
        new GUI.Label({
            text: "Copy, paste, and manage scenery templates in",
            textAlign: "centred",
        }),
        new GUI.Label({
            text: "both singleplayer and multiplayer sessions.",
            textAlign: "centred",
        }),
        new GUI.Label({
            text: "All placement and removal actions are routed",
            textAlign: "centred",
        }),
        new GUI.Label({
            text: "through the game action system, keeping",
            textAlign: "centred",
        }),
        new GUI.Label({
            text: "servers in sync with connected clients.",
            textAlign: "centred",
        }),
        new GUI.Label({
            text: "Copyright (c) 2026 RYJASM - Multiplayer Edition",
            textAlign: "centred",
        }),
        new GUI.Label({
            text: "Copyright (c) 2020-2026 Sadret - Scenery Manager",
            textAlign: "centred",
        }),
    ),
    new GUI.Label({
        text: separator,
        textAlign: "centred",
    }),
    new GUI.VBox(8, GUI.Margin.uniform(16)).add(
        new GUI.Label({
            text: "GitHub:",
            textAlign: "centred",
        }),
        new GUI.Label({
            text: "https://github.com/RYJASM/scenery-manager-multiplayer-edition",
            textAlign: "centred",
        }),
    ),
    new GUI.Label({
        text: separator,
        textAlign: "centred",
    }),
);
