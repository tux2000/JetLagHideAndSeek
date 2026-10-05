import * as turf from "@turf/turf";
import { expect, test } from "vitest";

import {
    combineAreaPolygons,
    geoSpatialVoronoi,
} from "@/maps/geo-utils/operators";
import { adjustPerRadius } from "@/maps/questions/radius";

test("combines included polygons and subtracts excluded polygons", () => {
    const baseArea = turf.polygon([
        [
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 10],
            [0, 0],
        ],
    ]);
    const addedArea = turf.polygon([
        [
            [10, 0],
            [20, 0],
            [20, 10],
            [10, 10],
            [10, 0],
        ],
    ]);
    const excludedArea = turf.polygon([
        [
            [12, 2],
            [14, 2],
            [14, 4],
            [12, 4],
            [12, 2],
        ],
    ]);

    const combined = combineAreaPolygons(
        turf.featureCollection([baseArea, addedArea]),
        turf.featureCollection([excludedArea]),
    );

    expect(combined).not.toBeNull();
    expect(turf.booleanPointInPolygon(turf.point([5, 5]), combined!)).toBe(
        true,
    );
    expect(turf.booleanPointInPolygon(turf.point([15, 5]), combined!)).toBe(
        true,
    );
    expect(turf.booleanPointInPolygon(turf.point([13, 3]), combined!)).toBe(
        false,
    );
});

test("radius questions restrict the map inside or outside their geodesic circle", async () => {
    const mapArea = turf.featureCollection([
        turf.polygon([
            [
                [-2, -2],
                [2, -2],
                [2, 2],
                [-2, 2],
                [-2, -2],
            ],
        ]),
    ]);
    const question = {
        lat: 0,
        lng: 0,
        drag: true,
        color: "gold",
        collapsed: false,
        hidden: false,
        radius: 50,
        unit: "kilometers",
        within: true,
    } as const;

    const insideResult = await adjustPerRadius(question, mapArea);
    const outsideResult = await adjustPerRadius(
        { ...question, within: false },
        mapArea,
    );

    expect(insideResult).not.toBeNull();
    expect(outsideResult).not.toBeNull();
    expect(
        turf.booleanPointInPolygon(turf.point([0, 0]), insideResult as any),
    ).toBe(true);
    expect(
        turf.booleanPointInPolygon(turf.point([0, 1]), insideResult as any),
    ).toBe(false);
    expect(
        turf.booleanPointInPolygon(turf.point([0, 0]), outsideResult as any),
    ).toBe(false);
    expect(
        turf.booleanPointInPolygon(turf.point([0, 1]), outsideResult as any),
    ).toBe(true);
});

test("voronoi diagram", () => {
    const BASE_POINT_COUNT = 25;
    const TEST_POINT_COUNT = 500;

    const basePoints = turf.randomPoint(BASE_POINT_COUNT);
    const voronoi = geoSpatialVoronoi(basePoints);

    expect(voronoi).toBeDefined();
    expect(voronoi.features.length).toBe(BASE_POINT_COUNT);

    const testPoints = turf.randomPoint(TEST_POINT_COUNT);

    testPoints.features.forEach((point) => {
        const voronoiIndex = voronoi.features.findIndex((feature) =>
            turf.booleanPointInPolygon(point, feature),
        );
        const nearestBasePoint = turf.nearestPoint(point, basePoints);
        const basePointIndex = basePoints.features.findIndex(
            (feature) =>
                feature.geometry.coordinates[0] ===
                    nearestBasePoint.geometry.coordinates[0] &&
                feature.geometry.coordinates[1] ===
                    nearestBasePoint.geometry.coordinates[1],
        );

        if (voronoiIndex === -1) {
            return; // A glitch with turf where overlapping polygons can cause this
        }

        expect(voronoiIndex).toBe(basePointIndex);
    });
});
