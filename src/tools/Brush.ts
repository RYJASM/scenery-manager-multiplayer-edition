/*****************************************************************************
 * Copyright (c) 2020-2026 Sadret
 * Copyright (c) 2026 RYJASM - Multiplayer Edition
 *
 * The OpenRCT2 plugin "Scenery Manager Multiplayer Edition" is licensed
 * under the GNU General Public License version 3.
 *****************************************************************************/

import * as Events from "../utils/Events";
import * as Selections from "../utils/Selections";
import * as Strings from "../utils/Strings";

import Configuration from "../config/Configuration";
import Property from "../config/Property";
import GUI from "../gui/GUI";
import Builder from "../tools/Builder";
import MainWindow from "../window/MainWindow";

type BrushProvider = (coords: CoordsXY) => TileData;

const brush = new class extends Builder {
    public provider: BrushProvider | undefined = undefined;

    constructor() {
        super("sm-brush");
        Configuration.brush.dragToPlace.bind(
            enabled => this.mode = enabled ? "move" : "down"
        );
    }

    protected getRecordingDescription(): string {
        return label.getValue() || "Brush";
    }

    public onFinish() {
        super.onFinish();
        this.provider = undefined;
        window.close();
    }

    protected getTileData(
        coords: CoordsXY,
        offset: CoordsXY,
    ): TileData[] {
        if (this.provider === undefined) {
            this.cancel();
            return [];
        } else
            return Selections.toCoordsList(
                this.getTileSelection(
                    coords,
                    offset,
                ),
            ).map(this.provider);
    }

    protected getTileSelection(
        coords: CoordsXY,
        _offset: CoordsXY,
    ): Selection {
        const size: number = Configuration.brush.size.getValue();
        const shape: BrushShape = Configuration.brush.shape.getValue();
        return shape === "square"
            ? Selections.square(coords, size)
            : Selections.circle(coords, size);
    }
}();

const WIDTH = 192;
const label = new Property<string>("");
const placeModeDd = new GUI.Dropdown({
}).bindValue<PlaceMode>(
    Configuration.tools.placeMode,
    ["safe", "raw"],
    Strings.toDisplayString,
);
Events.startup.register(() => {
    if (network.mode !== "none") {
        placeModeDd.setIsDisabled(true);
        Configuration.tools.placeMode.setValue("safe");
    }
});
const window = new GUI.WindowManager(
    {
        width: WIDTH,
        classification: "scenery-manager-multiplayer-edition.brush",
        title: "Brush",
        colours: [7, 7, 6,],
        onClose: () => Configuration.brush.showWindow.getValue() && brush.cancel(),
    }, new GUI.Window().add(
        new GUI.HBox([1, 1]).add(
            new GUI.Label({
                text: "Current tool:",
            }),
            new GUI.Label({
            }).bindText(
                label,
            ),
        ),
        new GUI.Separator(),
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
                text: "Show ghost:",
            }),
            new GUI.TextButton({
            }).bindValue(
                Configuration.tools.showGhost,
            ),
        ),
        new GUI.Separator(),
        new GUI.HBox([1, 1]).add(
            new GUI.Label({
                text: "Size:",
            }),
            new GUI.Spinner({
            }).bindValue(
                Configuration.brush.size,
            ),
        ),
        new GUI.HBox([1, 1]).add(
            new GUI.Label({
                text: "Shape:",
            }),
            new GUI.Dropdown({
            }).bindValue<BrushShape>(
                Configuration.brush.shape,
                ["square", "circle"],
                Strings.toDisplayString,
            ),
        ),
        new GUI.HBox([1, 1]).add(
            new GUI.Label({
                text: "Drag to place:",
            }),
            new GUI.TextButton({
            }).bindValue(
                Configuration.brush.dragToPlace,
            ),
        ),
        new GUI.Separator(),
        new GUI.HBox([1, 1]).add(
            new GUI.Label({
                text: "Placement delay (ms):",
            }),
            new GUI.Spinner({
            }).bindValue(
                Configuration.tools.placementDelayMs,
            ),
        ),
    ),
);

function open(): void {
    const main = MainWindow.getWindow();
    if (main === undefined)
        window.open();
    else
        window.open(main, WIDTH);
}

export function activate(type: string, provider: BrushProvider): void {
    label.setValue(type);
    brush.provider = provider;
    brush.activate();
    if (Configuration.brush.showWindow.getValue())
        open();
}

export function cancel(): void {
    brush.cancel();
}

Configuration.brush.showWindow.bind(showWindow => {
    if (brush.isActive())
        if (showWindow)
            open();
        else
            window.close();
});
