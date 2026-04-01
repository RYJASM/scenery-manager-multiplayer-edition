/*****************************************************************************
 * Copyright (c) 2020-2026 Sadret
 * Copyright (c) 2026 RYJASM - Multiplayer Edition
 *
 * The OpenRCT2 plugin "Scenery Manager Multiplayer Edition" is licensed
 * under the GNU General Public License version 3.
 *****************************************************************************/


import * as Clipboard from "../../core/Clipboard";
import * as Context from "../../core/Context";
import * as Events from "../../utils/Events";
import * as Strings from "../../utils/Strings";
import * as UI from "../../core/UI";
import * as HistoryWindow from "../HistoryWindow";

import { createProgressRow } from "../../utils/ProgressRow";
import Configuration from "../../config/Configuration";
import GUI from "../../gui/GUI";
import Selector from "../../tools/Selector";

function formatHeightOffset(value: number): string {
    const sample = context.formatString("{HEIGHT}", 1);
    if (sample.indexOf("ft") !== -1)
        return value + " (" + (value * 2.5) + " ft)";
    if (sample.indexOf("m") !== -1)
        return value + " (" + (Math.round(value * 75) / 100) + " m)";
    return String(value);
}

const copyBtn = new GUI.TextButton({ text: "Copy", onClick: Clipboard.copy });
const cutBtn  = new GUI.TextButton({ text: "Cut",  onClick: Clipboard.cut  });
const pasteBtn = new GUI.TextButton({ text: "Paste", onClick: Clipboard.paste });
const saveBtn  = new GUI.TextButton({ text: "Save",  onClick: Clipboard.save  });
const undoBtn  = new GUI.TextButton({ text: "Undo",  onClick: Context.undo });
const redoBtn  = new GUI.TextButton({ text: "Redo",  onClick: Context.redo });

// Selection state → Copy / Cut
Events.tileSelectionChange.register((_sel: Selection) => {
    const has = UI.getTileSelection() !== undefined;
    copyBtn.setIsDisabled(!has);
    cutBtn.setIsDisabled(!has);
});
Events.startup.register(() => {
    const has = UI.getTileSelection() !== undefined;
    copyBtn.setIsDisabled(!has);
    cutBtn.setIsDisabled(!has);
});

// Clipboard state → Paste / Save
Clipboard.bindTemplate(has => {
    pasteBtn.setIsDisabled(!has);
    saveBtn.setIsDisabled(!has);
});

// History state → Undo / Redo
Context.bindHistory(() => {
    undoBtn.setIsDisabled(!Context.canUndo());
    redoBtn.setIsDisabled(!Context.canRedo());
});

const copyPaste = new GUI.GroupBox({
    text: "Copy & Paste",
}).add(
    new GUI.HBox([1, 1]).add(
        new GUI.TextButton({ text: "Select", onClick: () => Selector.activate() }),
        copyBtn,
    ),
    new GUI.HBox([1, 1]).add(
        new GUI.TextButton({ text: "Load", onClick: Clipboard.load }),
        pasteBtn,
    ),
    new GUI.HBox([1, 1]).add(
        saveBtn,
        cutBtn,
    ),
    new GUI.HBox([1, 1, 1]).add(
        undoBtn,
        redoBtn,
        new GUI.TextButton({ text: "History", onClick: HistoryWindow.open }),
    ),
);

const mergeSurfaceBtn = new GUI.TextButton({}).bindValue(Configuration.paste.mergeSurface);
const forceOrderBtn = new GUI.TextButton({}).bindValue(Configuration.paste.appendToEnd);
const cutSurfaceBtn = new GUI.TextButton({}).bindValue(Configuration.cut.cutSurface);

const rawModeProp = {
    getValue: () => Configuration.tools.placeMode.getValue() === "raw",
    setValue: (v: boolean) => Configuration.tools.placeMode.setValue(v ? "raw" : "safe"),
    bind: (fn: (v: boolean) => void) => Configuration.tools.placeMode.bind((v: PlaceMode) => fn(v === "raw")),
};
const placeModeDd = new GUI.TextButton({}).bindValue(rawModeProp);

const transform = 
    new GUI.GroupBox({
        text: "Transform",
    }).add(
        new GUI.HBox([1, 1]).add(
            new GUI.Label({
                text: "Rotation:",
            }),
            new GUI.Spinner({
            }).bindValue(
                Clipboard.settings.rotation,
                value => (value & 3) * 90 + " deg",
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
                formatHeightOffset,
            ),
        ),
        new GUI.HBox([1, 1]).add(
            new GUI.Checkbox({
                text: "X 1/2 Offset",
            }).bindValue(
                Clipboard.settings.xHalfOffset,
            ),
            new GUI.Checkbox({
                text: "Y 1/2 Offset",
            }).bindValue(
                Clipboard.settings.yHalfOffset,
            ),
        ));
const placement =     
    new GUI.GroupBox({
        text: "Placement",
    }).add(
        new GUI.HBox([1, 1]).add(
            new GUI.Label({
                text: "Delay (ms):",
            }),
            new GUI.Spinner({
            }).bindValue(Configuration.tools.placementDelayMs),
        ),
        new GUI.HBox([1, 1]).add(
            new GUI.Label({
                text: "Skip existing:",
            }),
            new GUI.TextButton({
            }).bindValue(
                Clipboard.settings.skipExisting,
            ),
        ),
        new GUI.HBox([1, 1]).add(
            new GUI.Label({
                text: "X/Y Order:",
            }),
            new GUI.Dropdown({
            }).bindValue<PlacementOrder>(
                Configuration.paste.placementOrder,
                ["default", "radial", "random", "spiral"],
                Strings.toDisplayString,
            ),
        ));
const raw =
    new GUI.GroupBox({
        text: "Raw",
    }).add(
        new GUI.HBox([1, 1]).add(
            new GUI.Label({
                text: "Raw mode:",
            }),
            placeModeDd,
        ),
        new GUI.HBox([1, 1]).add(
            new GUI.Label({
                text: "Merge surface:",
            }),
            mergeSurfaceBtn,
        ),
        new GUI.HBox([1, 1]).add(
            new GUI.Label({
                text: "Force order:",
            }),
            forceOrderBtn,
        ),
        new GUI.HBox([1, 1]).add(
            new GUI.Label({
                text: "Cut surface:",
            }),
            cutSurfaceBtn,
        ));

Events.startup.register(() => {
    if (network.mode !== "none") {
        placeModeDd.setIsDisabled(true);
        mergeSurfaceBtn.setIsDisabled(true);
        forceOrderBtn.setIsDisabled(true);
        cutSurfaceBtn.setIsDisabled(true);
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
    new GUI.Checkbox({
        text: "No duplicates",
    }).bindValue(
        Clipboard.settings.noDuplicates,
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
        );
});

const rightColumn = new GUI.VBox().add(
    filter,
    bounds,
);
Events.startup.register(() => {
    if (Configuration.window.showAdvancedCopyPasteSettings.getValue())
        rightColumn.add(
            new GUI.GroupBox({
                text: "Advanced",
            }).add(
                new GUI.Dropdown({
                }).bindValue<CursorMode>(
                    Configuration.tools.cursorMode,
                    ["surface", "scenery"],
                    (value: CursorMode) => value === "surface" ? "Select by Surface" : "Select by Scenery",
                ),
                new GUI.Dropdown({
                }).bindValue(
                    Configuration.tools.showGhost,
                    [true, false],
                    (value: boolean) => value ? "Show Ghost" : "Hide Ghost",
                ),
            ),
        );
});

export default new GUI.Tab({ image: 5465 }).add(
    new GUI.HBox([3, 2]).add(
        new GUI.VBox().add(
            copyPaste,
            transform,
            placement,
            raw
        ),
        rightColumn,
    ),
    createProgressRow(),
);
