/*****************************************************************************
 * Copyright (c) 2020-2026 Sadret
 * Copyright (c) 2026 RYJASM - Multiplayer Edition
 *
 * The OpenRCT2 plugin "Scenery Manager Multiplayer Edition" is licensed
 * under the GNU General Public License version 3.
 *****************************************************************************/


import * as Context from "../../core/Context";
import * as Events from "../../utils/Events";
import * as Map from "../../core/Map";
import * as UI from "../../core/UI";
import * as Dialogs from "../../utils/Dialogs";
import * as Strings from "../../utils/Strings";
import * as Footpath from "../../template/Footpath";
import * as Coordinates from "../../utils/Coordinates";

import BooleanProperty from "../../config/BooleanProperty";
import Configuration from "../../config/Configuration";
import GUI from "../../gui/GUI";
import Template from "../../template/Template";
import Selector from "../../tools/Selector";
import Jumper from "../../utils/Jumper";
import MapIterator from "../../utils/MapIterator";
import Overlay from "../widgets/Overlay";
import SceneryFilterGroup from "../widgets/SceneryFilterGroup";

const findGroup = new SceneryFilterGroup();
const replaceGroup = new SceneryFilterGroup(findGroup);
findGroup.type.bind(type => replaceGroup.type.setValue(type));

const selectionOnlyProp = new BooleanProperty(false);
const inParkOnlyProp = new BooleanProperty(false);

const hasSelectionProp = new BooleanProperty(false);
const searchDisabledProp = new BooleanProperty(false);
selectionOnlyProp.bind(sel => searchDisabledProp.setValue(sel && !hasSelectionProp.getValue()));
hasSelectionProp.bind(hasSel => searchDisabledProp.setValue(selectionOnlyProp.getValue() && !hasSel));
const replaceDisabledProp = new BooleanProperty(false);
replaceGroup.error.bind(err => replaceDisabledProp.setValue(err || searchDisabledProp.getValue()));
searchDisabledProp.bind(dis => replaceDisabledProp.setValue(dis || replaceGroup.error.getValue()));

Events.tileSelectionChange.register(sel => hasSelectionProp.setValue(sel !== undefined));

const selectionOnlyCheckbox = new GUI.Checkbox({
    text: "Selected area only",
}).bindValue(selectionOnlyProp);

const inParkOnlyCheckbox = new GUI.Checkbox({
    text: "In park only",
}).bindValue(inParkOnlyProp);

const placeModeDd = new GUI.Dropdown({
}).bindValue<PlaceMode>(
    Configuration.tools.placeMode,
    ["safe", "raw"],
    Strings.toDisplayString,
);

Events.startup.register(() => {
    if (network.mode !== "none") {
        selectionOnlyCheckbox.setIsDisabled(true);
        selectionOnlyProp.setValue(true);
        inParkOnlyCheckbox.setIsDisabled(true);
        inParkOnlyProp.setValue(true);
        placeModeDd.setIsDisabled(true);
        Configuration.tools.placeMode.setValue("safe");
    }
});

function getTileSelection(): Selection {
    return selectionOnlyProp.getValue() ? UI.getTileSelection() : undefined;
}

export function find(object: SceneryObject, inParkOnly: boolean): void {
    switch (object.type) {
        case "footpath_surface":
            findGroup.type.setValue("footpath");
            findGroup.surface.setValue(object);
            break;
        case "footpath_railings":
            findGroup.type.setValue("footpath");
            findGroup.railings.setValue(object);
            break;
        case "footpath_addition":
            findGroup.type.setValue("footpath");
            findGroup.addition.setValue(object);
            break;
        default:
            findGroup.type.setValue(object.type);
            findGroup.qualifier.setValue(object);
    }
    inParkOnlyProp.setValue(inParkOnly);
}

function getPlaceActionsFor(coords: CoordsXY, elementData: ElementData): PlaceActionData[] {
    const actions = Template.getPlaceActionData(coords, elementData, 0);
    if (elementData.type === "footpath") {
        const pathData = elementData as FootpathData;
        if (pathData.additionQualifier !== null)
            Footpath.getPlaceActionData(Coordinates.toWorldCoords(coords), pathData, 0, true).forEach(
                function(a) { actions.push(a); }
            );
    }
    return actions;
}

function findAndDelete(replace: boolean): void {
    if (selectionOnlyProp.getValue() && UI.getTileSelection() === undefined)
        return ui.showError(`Cannot search and ${replace ? "replace" : "delete"}...`, "No area selected.");

    overlay.setIsVisible(true);
    const mode = Configuration.tools.placeMode.getValue();
    const inParkOnly = inParkOnlyProp.getValue();
    let pending = 0;
    let ok = 0;
    let err = 0;
    let shouldReport = false;
    const histRemovedActions: PlaceActionData[] = [];
    const histPlacedActions: PlaceActionData[] = [];
    // does not actually report the number of <replaced> elements
    let report = () => {
        if (shouldReport) {
            if (replace)
                Context.addReplaceHistoryEntry("Search and Replace", histPlacedActions, histRemovedActions);
            else
                Context.addDeleteHistoryEntry("Search and Delete", histRemovedActions);
            Dialogs.showAlert({
                title: "Elements replaced",
                message: [`${replace ? "Replaced" : "Deleted"} ${ok} element${ok === 1 ? "" : "s"} (${err} error${err === 1 ? "" : "s"}).`],
                width: 192,
            });
        }
        shouldReport = false;
    };

    new MapIterator(
        getTileSelection()
    ).forEach(
        coords => {
            const tile = Map.getTile(coords);
            if (mode === "raw" && replace) {
                tile.elements.forEach(
                    element => {
                        if (inParkOnly && !Map.isLocationOwned(tile, element.baseHeight))
                            return;
                        if (findGroup.match(element)) {
                            const oldData = Template.copyFrom(element);
                            replaceGroup.replace(element);
                            const newData = Template.copyFrom(element);
                            getPlaceActionsFor(coords, oldData).forEach(function(a) { histRemovedActions.push(a); });
                            getPlaceActionsFor(coords, newData).forEach(function(a) { histPlacedActions.push(a); });
                            ok++;
                        }
                    },
                );
                report();
            } else {
                const elements = Map.read(tile);
                elements.forEach(
                    element => {
                        if (inParkOnly && !Map.isLocationOwned(tile, element.baseHeight))
                            return;
                        if (findGroup.match(element)) {
                            pending++;
                            const oldData = Template.copyFrom(element);
                            const callback = (result: GameActionResult) => {
                                pending--;
                                if (result.error)
                                    err++;
                                else
                                    ok++;
                                if (!replace || result.error) {
                                    if (!result.error)
                                        getPlaceActionsFor(coords, oldData).forEach(function(a) { histRemovedActions.push(a); });
                                    if (shouldReport && pending === 0)
                                        report();
                                    return;
                                }
                                // safe replace only
                                replaceGroup.replace(element);
                                const newData = Template.copyFrom(element);
                                getPlaceActionsFor(coords, oldData).forEach(function(a) { histRemovedActions.push(a); });
                                getPlaceActionsFor(coords, newData).forEach(function(a) { histPlacedActions.push(a); });
                                Map.place([{
                                    ...coords,
                                    elements: [newData],
                                }], "safe", element.isGhost);
                                if (shouldReport && pending === 0)
                                    report();
                            };
                            Map.remove(tile, element, mode, undefined, callback);
                        }
                    }
                );
            }
        },
        true,
        (done, progress) => {
            overlay.setProgress(progress);
            if (done) {
                overlay.setIsVisible(false);
                overlay.setProgress(undefined);
                shouldReport = true;
                if (shouldReport && pending === 0)
                    report();
            }
        },
    );
}

function swapValues(): void {
    // const type = replaceGroup.type.getValue();
    // replaceGroup.type.setValue(findGroup.type.getValue());
    // findGroup.type.setValue(type);

    const qualifier = replaceGroup.qualifier.getValue();
    replaceGroup.qualifier.setValue(findGroup.qualifier.getValue());
    findGroup.qualifier.setValue(qualifier);

    const primaryColour = replaceGroup.primaryColour.getValue();
    replaceGroup.primaryColour.setValue(findGroup.primaryColour.getValue());
    findGroup.primaryColour.setValue(primaryColour);

    const secondaryColour = replaceGroup.secondaryColour.getValue();
    replaceGroup.secondaryColour.setValue(findGroup.secondaryColour.getValue());
    findGroup.secondaryColour.setValue(secondaryColour);

    const tertiaryColour = replaceGroup.tertiaryColour.getValue();
    replaceGroup.tertiaryColour.setValue(findGroup.tertiaryColour.getValue());
    findGroup.tertiaryColour.setValue(tertiaryColour);

    const surface = replaceGroup.surface.getValue();
    replaceGroup.surface.setValue(findGroup.surface.getValue());
    findGroup.surface.setValue(surface);

    const railings = replaceGroup.railings.getValue();
    replaceGroup.railings.setValue(findGroup.railings.getValue());
    findGroup.railings.setValue(railings);

    const addition = replaceGroup.addition.getValue();
    replaceGroup.addition.setValue(findGroup.addition.getValue());
    findGroup.addition.setValue(addition);
}

const overlay = new Overlay(3 << 4);

export default new GUI.Tab({
    image: {
        frameBase: 5221,
        frameCount: 8,
        frameDuration: 4,
    },
    onOpen: () => {
        findGroup.reload();
        replaceGroup.reload();
        hasSelectionProp.setValue(UI.getTileSelection() !== undefined);
    },
}).add(
    new GUI.OverlayBox(
        overlay,
    ).add(
        findGroup,
        new GUI.HBox(
            [1.8, 0.2, 1],
            undefined,
            {
                ...GUI.Margin.none,
                left: GUI.Margin.default.left + 2,
                right: GUI.Margin.default.right + 2,
            },
        ).add(
            (() => {
                const button = new GUI.TextButton({});

                const jumper = new Jumper(
                    element => findGroup.match(element),
                    inParkOnlyProp,
                    button,
                );

                findGroup.type.bind(() => jumper.reset());
                findGroup.qualifier.bind(() => jumper.reset());
                findGroup.primaryColour.bind(() => jumper.reset());
                findGroup.secondaryColour.bind(() => jumper.reset());
                findGroup.tertiaryColour.bind(() => jumper.reset());
                findGroup.surface.bind(() => jumper.reset());
                findGroup.railings.bind(() => jumper.reset());
                findGroup.addition.bind(() => jumper.reset());

                return button;
            })(),
            new GUI.Space(),
            new GUI.TextButton({
                text: "Search and Delete",
                onClick: () => findAndDelete(false),
            }).bindIsDisabled(searchDisabledProp),
        ),
        new GUI.Space(),
        replaceGroup,
        new GUI.HBox(
            [1.8, 0.2, 1],
            undefined,
            {
                ...GUI.Margin.none,
                left: GUI.Margin.default.left + 2,
                right: GUI.Margin.default.right + 2,
            },
        ).add(
            new GUI.TextButton({
                text: "Swap search values and replace values",
                onClick: () => swapValues(),
            }),
            new GUI.Space(),
            new GUI.TextButton({
                text: "Search and Replace",
                onClick: () => findAndDelete(true),
            }).bindIsDisabled(replaceDisabledProp),
        ),
        new GUI.Space(),
        new GUI.GroupBox({
            text: "Options",
        }).add(
            new GUI.HBox([2.5, 1, 2.5]).add(
                selectionOnlyCheckbox,
                new GUI.Space(),
                inParkOnlyCheckbox,
            ),
            new GUI.HBox([2.5, 1, 1.5, 1]).add(
                new GUI.TextButton({
                    text: "Select area",
                    onClick: () => Selector.activate(),
                }),
                new GUI.Space(),
                new GUI.Label({
                    text: "Place mode:",
                }),
                placeModeDd,
            ),
        ),
    ),
);
