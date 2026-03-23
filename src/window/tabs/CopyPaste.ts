/*****************************************************************************
 * Copyright (c) 2026 RYJASM - Multiplayer Edition
 * Copyright (c) 2020-2026 Sadret - Scenery Manager
 *
 * The OpenRCT2 plugin "Scenery Manager Multiplayer Edition" is licensed
 * under the GNU General Public License version 3.
 *****************************************************************************/

import * as Clipboard from "../../core/Clipboard";
import * as Context from "../../core/Context";
import * as Events from "../../utils/Events";
import * as Strings from "../../utils/Strings";
import * as HistoryWindow from "../HistoryWindow";

import Configuration from "../../config/Configuration";
import GUI from "../../gui/GUI";
import Selector from "../../tools/Selector";

const copyPaste = new GUI.GroupBox({
    text: "Copy & Paste",
}).add(
    new GUI.HBox([1, 1]).add(
        new GUI.TextButton({
            text: "Select",
            onClick: () => Selector.activate(),
        }),
        new GUI.TextButton({
            text: "Copy",
            onClick: Clipboard.copy,
        }),
    ),
    new GUI.HBox([1, 1]).add(
        new GUI.TextButton({
            text: "Load",
            onClick: Clipboard.load,
        }),
        new GUI.TextButton({
            text: "Paste",
            onClick: Clipboard.paste,
        }),
    ),
    new GUI.HBox([1, 1]).add(
        new GUI.TextButton({
            text: "Save",
            onClick: Clipboard.save,
        }),
        new GUI.TextButton({
            text: "Cut",
            onClick: Clipboard.cut,
        }),
    ),
    new GUI.HBox([1, 1, 1]).add(
        new GUI.TextButton({
            text: "Undo",
            onClick: Context.undo,
        }),
        new GUI.TextButton({
            text: "Redo",
            onClick: Context.redo,
        }),
        new GUI.TextButton({
            text: "History",
            onClick: HistoryWindow.open,
        }),
    ),
);

const placeModeDd = new GUI.Dropdown({
}).bindValue<PlaceMode>(
    Configuration.tools.placeMode,
    ["safe", "raw"],
    Strings.toDisplayString,
);

const options = new GUI.GroupBox({
    text: "Options",
}).add(
    new GUI.HBox([1, 1]).add(
        new GUI.Label({
            text: "Rotation:",
        }),
        new GUI.Spinner({
        }).bindValue(
            Clipboard.settings.rotation,
            value => (value & 3) === 0 ? "None" : ((value & 3) * 90 + " deg"),
            false,
        ),
    ),
    new GUI.HBox([1, 1]).add(
        new GUI.Label({
            text: "Mirrored:",
        }),
        new GUI.TextButton({
        }).bindValue(
            Clipboard.settings.mirrored,
        ),
    ),
    new GUI.HBox([1, 1]).add(
        new GUI.Label({
            text: "Height offset:",
        }),
        new GUI.Spinner({
        }).bindValue(
            Clipboard.settings.height,
        ),
    ),
    new GUI.HBox([1, 1]).add(
        new GUI.Checkbox({
            text: "X half-tile offset:",
        }).bindValue(
            Clipboard.settings.xHalfOffset,
        ),
        new GUI.Checkbox({
            text: "Y half-tile offset:",
        }).bindValue(
            Clipboard.settings.yHalfOffset,
        ),
    ),
    new GUI.HBox([1, 1]).add(
        new GUI.Label({
            text: "Cursor mode:",
        }),
        new GUI.Dropdown({
        }).bindValue<CursorMode>(
            Configuration.tools.cursorMode,
            ["surface", "scenery"],
            Strings.toDisplayString,
        ),
    ),
    new GUI.HBox([1, 1]).add(
        new GUI.Label({
            text: "Place mode:",
        }),
        placeModeDd,
    ),
    new GUI.HBox([1, 1]).add(
        new GUI.Label({
            text: "Placement delay (ms):",
        }),
        new GUI.Spinner({
        }).bindValue(Configuration.tools.placementDelayMs),
    ),
);
Events.startup.register(() => {
    if (Configuration.window.showAdvancedCopyPasteSettings.getValue())
        options.add(
            new GUI.HBox([1, 1]).add(
                new GUI.Label({
                    text: "Show ghost:",
                }),
                new GUI.TextButton({
                }).bindValue(
                    Configuration.tools.showGhost,
                ),
            ),
            new GUI.HBox([1, 1]).add(
                new GUI.Label({
                    text: "Force order:",
                }),
                new GUI.TextButton({
                }).bindValue(
                    Configuration.paste.appendToEnd,
                ),
            ),
            new GUI.HBox([1, 1]).add(
                new GUI.Label({
                    text: "Merge surface:",
                }),
                new GUI.TextButton({
                }).bindValue(
                    Configuration.paste.mergeSurface,
                ),
            ),
            new GUI.HBox([1, 1]).add(
                new GUI.Label({
                    text: "Cut surface:",
                }),
                new GUI.TextButton({
                }).bindValue(
                    Configuration.cut.cutSurface,
                ),
            ),
        );
});
Events.startup.register(() => {
    if (network.mode !== "none") {
        placeModeDd.setIsDisabled(true);
        Configuration.tools.placeMode.setValue("safe");
    }
});

const filter = new GUI.GroupBox({
    text: "Filter",
}).add(
    ...Object.keys(Clipboard.settings.filter).map(key =>
        new GUI.Checkbox({
            text: Strings.toDisplayString(key),
        }).bindValue(
            Clipboard.settings.filter[key],
        ),
    ),
);
Events.startup.register(() => {
    if (!Configuration.window.showAdvancedCopyPasteSettings.getValue())
        filter.add(
            new GUI.Space(6),
        );
});

const bounds = new GUI.VBox();
Events.startup.register(() => {
    if (Configuration.window.showAdvancedCopyPasteSettings.getValue())
        bounds.add(
            new GUI.GroupBox({
                text: "Vertical Bounds",
            }).add(

                new GUI.HBox([1, 1]).add(
                    new GUI.Checkbox({
                        text: "Upper:",
                    }).bindValue(
                        Clipboard.settings.bounds.upperEnabled,
                    ),
                    new GUI.Spinner({
                    }).bindValue(
                        Clipboard.settings.bounds.upperValue,
                    ).bindIsDisabled(
                        Clipboard.settings.bounds.upperEnabled,
                        enabled => !enabled,
                    ),
                ),
                new GUI.HBox([1, 1]).add(
                    new GUI.Checkbox({
                        text: "Lower:",
                    }).bindValue(
                        Clipboard.settings.bounds.lowerEnabled,
                    ),
                    new GUI.Spinner({
                    }).bindValue(
                        Clipboard.settings.bounds.lowerValue,
                    ).bindIsDisabled(
                        Clipboard.settings.bounds.lowerEnabled,
                        enabled => !enabled,
                    ),
                ),
                new GUI.Dropdown({
                }).bindValue(
                    Clipboard.settings.bounds.elementContained,
                    [false, true,],
                    contained => contained ? "Contained elements" : "Intersected elements",
                ),
            ),
            new GUI.GroupBox({
                text: "Order",
            }).add(
                new GUI.Dropdown({
                }).bindValue<PlacementOrder>(
                    Configuration.paste.placementOrder,
                    ["default", "radial", "random", "spiral"],
                    Strings.toDisplayString,
                ),
            ),
        );
});

export default new GUI.Tab({ image: 5465 }).add(
    new GUI.HBox([3, 2]).add(
        new GUI.VBox().add(
            copyPaste,
            options,
        ),
        new GUI.VBox().add(
            filter,
            bounds,
        ),
    ),
);
