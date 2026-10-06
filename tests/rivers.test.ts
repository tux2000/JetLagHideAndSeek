import * as turf from "@turf/turf";
import { expect, test } from "vitest";

import { DEFAULT_QUESTION_VARIANTS } from "@/maps/default-question-variants";
import {
    isSameRiver,
    nearestRiverAt,
    riverRegionFor,
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
