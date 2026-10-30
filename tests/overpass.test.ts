import * as turf from "@turf/turf";
import { expect, test } from "vitest";

import {
    osmElementCenterWithinBoundary,
    osmElementIntersectsBoundary,
} from "@/maps/api/overpass";

test("drawn game areas retain river ways whose geometry crosses the boundary", () => {
    const boundary = turf.polygon([
        [
            [0, 0],
            [2, 0],
            [2, 2],
            [0, 2],
            [0, 0],
        ],
    ]);

    expect(
        osmElementIntersectsBoundary(
            {
                geometry: [
                    { lat: 1, lon: -1 },
                    { lat: 1, lon: 3 },
                ],
            },
            boundary,
        ),
    ).toBe(true);
    expect(
        osmElementIntersectsBoundary(
            {
                geometry: [
                    { lat: 3, lon: -1 },
                    { lat: 3, lon: 3 },
                ],
            },
            boundary,
        ),
    ).toBe(false);
});

test("excluded areas use the representative center of geometry-only ways", () => {
    const boundary = turf.polygon([
        [
            [0, 0],
            [2, 0],
            [2, 2],
            [0, 2],
            [0, 0],
        ],
    ]);

    expect(
        osmElementCenterWithinBoundary(
            {
                geometry: [
                    { lat: 1, lon: 0.5 },
                    { lat: 1, lon: 1.5 },
                ],
            },
            boundary,
        ),
    ).toBe(true);
});

test("lake relations use member geometry for drawn and excluded areas", () => {
    const boundary = turf.polygon([
        [
            [0, 0],
            [2, 0],
            [2, 2],
            [0, 2],
            [0, 0],
        ],
    ]);
    const lakeRelation = (offset: number) => ({
        members: [
            {
                geometry: [
                    { lat: offset + 0.5, lon: offset + 0.5 },
                    { lat: offset + 0.5, lon: offset + 1.5 },
                    { lat: offset + 1.5, lon: offset + 1.5 },
                    { lat: offset + 0.5, lon: offset + 0.5 },
                ],
            },
        ],
    });

    expect(osmElementIntersectsBoundary(lakeRelation(0), boundary)).toBe(true);
    expect(osmElementIntersectsBoundary(lakeRelation(5), boundary)).toBe(false);
    expect(osmElementCenterWithinBoundary(lakeRelation(0), boundary)).toBe(
        true,
    );
    expect(osmElementCenterWithinBoundary(lakeRelation(5), boundary)).toBe(
        false,
    );
});
