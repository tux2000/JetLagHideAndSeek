import * as turf from "@turf/turf";
import type {
    Feature,
    FeatureCollection,
    Geometry,
    LineString,
    MultiLineString,
    MultiPolygon,
    Point,
    Polygon,
} from "geojson";
import osmtogeojson from "osmtogeojson";

import { findPlacesInZone } from "@/maps/api";

export type RiverLine = Feature<LineString>;
export type RiverLines = FeatureCollection<LineString>;

// Only named water counts; unnamed ponds and mis-tagged fragments otherwise
// add a lot of geometry and "ghost" water.
export const RIVER_SELECTOR = 'way["waterway"="river"]["name"]';
// Large lakes are usually multipolygon relations, so relations are included.
export const LAKE_SELECTOR = 'wr["natural"="water"]["water"="lake"]["name"]';

/**
 * Normalizes OSM water features to lines: rivers stay as-is and lakes are
 * represented by their shorelines, so distance and identity checks apply to
 * both. All lines are simplified to within 10 m of the original.
 */
export const waterFeaturesToLines = (
    features: Feature<Geometry | null>[],
): RiverLines => ({
    type: "FeatureCollection",
    features: features.flatMap((feature): RiverLine[] => {
        const geometry = feature.geometry;
        let lines: RiverLine[];
        if (geometry?.type === "LineString") {
            lines = [feature as RiverLine];
        } else if (
            geometry?.type === "Polygon" ||
            geometry?.type === "MultiPolygon"
        ) {
            const shoreline = turf.polygonToLine(
                feature as Feature<Polygon | MultiPolygon>,
            );
            lines = turf
                .flatten(
                    shoreline as FeatureCollection<
                        LineString | MultiLineString
                    >,
                )
                .features.filter(
                    (line): line is RiverLine =>
                        line.geometry.type === "LineString",
                );
        } else {
            return [];
        }

        return lines.flatMap((line): RiverLine[] => {
            const simplified = simplifyWaterLine(line);
            return simplified
                ? [
                      {
                          ...simplified,
                          id: feature.id,
                          properties: feature.properties ?? {},
                      },
                  ]
                : [];
        });
    }),
});

// 10 m expressed in degrees of latitude. A degree of longitude is never
// longer than one of latitude, so simplified lines stay within 10 m of the
// original geometry while distance, buffer and rendering work get much cheaper.
export const WATER_SIMPLIFY_TOLERANCE_DEGREES = 10 / 111_320;

const simplifyWaterLine = (line: RiverLine): RiverLine | null => {
    let simplified: RiverLine;
    try {
        simplified = turf.simplify(line, {
            tolerance: WATER_SIMPLIFY_TOLERANCE_DEGREES,
        });
    } catch {
        simplified = line;
    }
    const coordinates = simplified.geometry.coordinates.filter(
        (coordinate) =>
            coordinate.length >= 2 &&
            Number.isFinite(coordinate[0]) &&
            Number.isFinite(coordinate[1]),
    );
    const distinct = new Set(coordinates.map((c) => `${c[0]},${c[1]}`));
    return distinct.size >= 2 ? turf.lineString(coordinates) : null;
};

export const findRiversInZone = async (): Promise<RiverLines> => {
    const data = await findPlacesInZone(
        RIVER_SELECTOR,
        "Finding rivers and lakes...",
        "",
        "geom",
        [LAKE_SELECTOR],
        60,
    );

    return waterFeaturesToLines(osmtogeojson(data).features);
};

const riverIdentity = (river: RiverLine) => {
    const properties = river.properties ?? {};
    const names = [properties["name:en"], properties.name, properties.ref]
        .filter((name): name is string => typeof name === "string")
        .map((name) => name.trim().toLocaleLowerCase())
        .filter(Boolean);

    return names;
};

export const nearestRiverAt = (
    point: Feature<Point>,
    rivers: RiverLines,
): {
    river: RiverLine;
    distanceMeters: number;
    identities: string[];
} | null => {
    let nearest: {
        river: RiverLine;
        distanceMeters: number;
        identities: string[];
    } | null = null;

    for (const feature of turf.flatten(rivers).features) {
        if (feature.geometry.type !== "LineString") continue;
        const river = feature as RiverLine;
        const distanceMeters = turf.pointToLineDistance(point, river, {
            units: "meters",
            method: "geodesic",
        });

        if (!nearest || distanceMeters < nearest.distanceMeters) {
            nearest = {
                river,
                distanceMeters,
                identities: riverIdentity(river),
            };
        }
    }

    return nearest;
};

export const isSameRiver = (
    first: { identities: string[] } | null,
    second: { identities: string[] } | null,
) =>
    first !== null &&
    second !== null &&
    first.identities.some((identity) => second.identities.includes(identity));

export const riverRegionFor = (
    point: Feature<Point>,
    rivers: RiverLines,
    bounds: [number, number, number, number],
): FeatureCollection => {
    const nearest = nearestRiverAt(point, rivers);
    if (!nearest) return turf.featureCollection([]);

    const groups = new Map<string, RiverLine[]>();
    for (const feature of turf.flatten(rivers).features) {
        if (feature.geometry.type !== "LineString") continue;
        const river = feature as RiverLine;
        const identity = riverIdentity(river)[0];
        if (!identity) continue;
        const group = groups.get(identity) ?? [];
        group.push(river);
        groups.set(identity, group);
    }

    const groupLengths = Array.from(groups, ([identity, features]) => ({
        identity,
        features: features.map((feature) => ({
            feature,
            length: turf.length(feature, { units: "kilometers" }),
        })),
    })).map((group) => ({
        ...group,
        totalLength: group.features.reduce((sum, line) => sum + line.length, 0),
    }));
    const totalLength = groupLengths.reduce(
        (sum, group) => sum + group.totalLength,
        0,
    );
    const sampleBudget = 2500;
    const sampleSpacing = Math.max(
        2,
        totalLength / Math.max(1, sampleBudget - groupLengths.length),
    );
    const sites = turf.points([]);

    for (const group of groupLengths) {
        if (group.totalLength <= 0) continue;
        const sampleCount = Math.max(
            1,
            Math.ceil(group.totalLength / sampleSpacing),
        );

        for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex++) {
            let remainingDistance =
                ((sampleIndex + 0.5) / sampleCount) * group.totalLength;
            let samplePoint: Feature<Point> | null = null;

            for (const line of group.features) {
                if (remainingDistance <= line.length) {
                    samplePoint = turf.along(line.feature, remainingDistance, {
                        units: "kilometers",
                    });
                    break;
                }
                remainingDistance -= line.length;
            }

            if (samplePoint) {
                sites.features.push(
                    turf.point(samplePoint.geometry.coordinates, {
                        riverIdentity: group.identity,
                    }),
                );
            }
        }
    }

    if (sites.features.length === 0) return turf.featureCollection([]);
    if (sites.features.length === 1) {
        return turf.featureCollection([turf.bboxPolygon(bounds)]);
    }

    const projectedSites = turf.toMercator(sites);
    const projectedBounds = turf.bbox(
        turf.toMercator(turf.bboxPolygon(bounds)),
        { recompute: true },
    );
    const projectedVoronoi = turf.voronoi(projectedSites, {
        bbox: projectedBounds,
    });
    if (!projectedVoronoi) return turf.featureCollection([]);

    projectedVoronoi.features = projectedVoronoi.features.filter(
        (feature) => feature?.geometry !== null,
    );
    const voronoi = turf.toWgs84(projectedVoronoi);
    const targetIdentities = new Set(nearest.identities);
    const matchingCells = voronoi.features.filter((cell: any) =>
        targetIdentities.has(cell.properties?.riverIdentity),
    );

    return turf.featureCollection(matchingCells);
};
