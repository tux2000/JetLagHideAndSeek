import * as turf from "@turf/turf";
import { expect, test } from "vitest";

import { DEFAULT_QUESTION_VARIANTS } from "@/maps/default-question-variants";
import {
    isSameRiver,
    LAKE_SELECTOR,
    nearestRiverAt,
    RIVER_SELECTOR,
    riverRegionFor,
    waterFeaturesToLines,
} from "@/maps/questions/rivers";
import {
    matchingQuestionSchema,
    measuringQuestionSchema,
} from "@/maps/schema";

const riverSegment = (name: string, coordinates: number[][]) =>
    turf.lineString(coordinates, { name });

test("river matching compares named river identity across separate segments", () => {
    const rivers = turf.featureCollection([
        riverSegment("River North", [[0, 0], [1, 0]]),
        riverSegment("River North", [[10, 1], [11, 1]]),
        riverSegment("River South", [[10, 3], [11, 3]]),
    ]);
    const firstNearest = nearestRiverAt(turf.point([0.5, 0.5]), rivers);
    const sameRiverNearest = nearestRiverAt(turf.point([10.5, 1.1]), rivers);
    const differentRiverNearest = nearestRiverAt(turf.point([10.5, 3.1]), rivers);

    expect(firstNearest).not.toBeNull();
    expect(sameRiverNearest).not.toBeNull();
    expect(differentRiverNearest).not.toBeNull();
    expect(isSameRiver(firstNearest, sameRiverNearest)).toBe(true);
    expect(isSameRiver(firstNearest, differentRiverNearest)).toBe(false);
    expect(firstNearest!.distanceMeters).toBeGreaterThan(0);
    expect(sameRiverNearest!.distanceMeters).toBeLessThan(
        firstNearest!.distanceMeters,
    );
});

test("unnamed OSM ways do not count as a shared named river", () => {
    const river = turf.lineString(
        [[0, 0], [1, 0]],
        {},
        { id: "way/123" },
    );
    const nearest = nearestRiverAt(
        turf.point([0.5, 0.1]),
        turf.featureCollection([river]),
    );

    expect(nearest).not.toBeNull();
    expect(isSameRiver(nearest, nearest)).toBe(false);
    expect(
        riverRegionFor(
            turf.point([0.5, 0.1]),
            turf.featureCollection([river]),
            [-1, -1, 2, 2],
        ).features,
    ).toHaveLength(0);
});

test("default River variants are registered exactly once", () => {
    const riverVariants = DEFAULT_QUESTION_VARIANTS.filter(
        (variant) => variant.value === "river",
    );

    expect(riverVariants.map((variant) => variant.id)).toEqual([
        "matching:river",
        "measuring:river",
    ]);
});

test("Matching and Measuring schemas accept River variants", () => {
    expect(
        matchingQuestionSchema.parse({ lat: 0, lng: 0, type: "river" }).type,
    ).toBe("river");
    expect(
        measuringQuestionSchema.parse({ lat: 0, lng: 0, type: "river" }).type,
    ).toBe("river");
});

test("Same River region contains points nearest to the same river", () => {
    const rivers = turf.featureCollection([
        riverSegment("River North", [[10, 60], [11, 60]]),
        riverSegment("River South", [[10, 61], [11, 61]]),
    ]);
    const region = riverRegionFor(
        turf.point([10.25, 60.1]),
        rivers,
        [9.5, 59.5, 11.5, 61.5],
    );
    const isWithinRegion = (point: number[]) =>
        region.features.some((feature) =>
            turf.booleanPointInPolygon(turf.point(point), feature as any),
        );

    expect(region.features.length).toBeGreaterThan(0);
    expect(isWithinRegion([10.75, 60.2])).toBe(true);
    expect(isWithinRegion([10.75, 60.9])).toBe(false);
});

test("lakes are represented by their shorelines alongside rivers", () => {
    const lake = turf.polygon(
        [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
        { name: "Big Lake", natural: "water", water: "lake" },
        { id: "relation/1" },
    );
    const lakeWithIsland = turf.multiPolygon(
        [
            [
                [[5, 5], [8, 5], [8, 8], [5, 8], [5, 5]],
                [[6, 6], [7, 6], [7, 7], [6, 7], [6, 6]],
            ],
        ],
        { name: "Island Lake" },
    );
    const river = riverSegment("River North", [[2, 2], [3, 3]]);
    const point = turf.point([10, 10], { name: "Not water" });

    const water = waterFeaturesToLines([lake, lakeWithIsland, river, point]);

    expect(
        water.features.every((f) => f.geometry.type === "LineString"),
    ).toBe(true);
    expect(water.features.map((f) => f.properties?.name)).toEqual([
        "Big Lake",
        "Island Lake",
        "Island Lake",
        "River North",
    ]);
    expect(water.features[0].id).toBe("relation/1");

    // Standing on the island: the island shoreline is the nearest water.
    const nearest = nearestRiverAt(turf.point([6.5, 6.5]), water);
    expect(nearest!.identities).toContain("island lake");
    expect(nearest!.distanceMeters).toBeLessThan(60_000);
});

test("same-water matching distinguishes lakes from rivers", () => {
    const water = waterFeaturesToLines([
        turf.polygon([[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]], {
            name: "Big Lake",
        }),
        riverSegment("River North", [[3, 0], [3, 1]]),
    ]);

    const nearLake = nearestRiverAt(turf.point([1.2, 0.5]), water);
    const alsoNearLake = nearestRiverAt(turf.point([-0.2, 0.5]), water);
    const nearRiver = nearestRiverAt(turf.point([2.9, 0.5]), water);

    expect(isSameRiver(nearLake, alsoNearLake)).toBe(true);
    expect(isSameRiver(nearLake, nearRiver)).toBe(false);
});

test("water query selects river ways and lake ways/relations", () => {
    expect(RIVER_SELECTOR).toBe('way["waterway"="river"]');
    expect(LAKE_SELECTOR).toBe('wr["natural"="water"]["water"="lake"]');
});
