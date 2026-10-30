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
// @ts-expect-error No type declaration
import { geoVoronoi } from "d3-geo-voronoi";
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

    const sites = riverVoronoiSites(rivers, bounds);
    if (sites.length === 0) return turf.featureCollection([]);

    const targetIdentities = new Set(nearest.identities);
    const cells = (
        geoVoronoi()(
            turf.featureCollection(sites),
        ).polygons() as FeatureCollection<
            Polygon,
            { site: Feature<Point, { riverIdentity: string }> }
        >
    ).features.filter(
        (cell) =>
            cell.geometry &&
            targetIdentities.has(cell.properties.site.properties.riverIdentity),
    );
    if (cells.length === 0) return turf.featureCollection([]);

    // Neighbouring cells of the same water share edges, so merging them here
    // keeps later map operations cheap.
    const merged =
        cells.length === 1
            ? cells[0]
            : turf.union(turf.featureCollection(cells));
    return turf.featureCollection(merged ? [merged] : []);
};

// Upper bound on Voronoi sites; denser sites tell close waters apart better.
const MAX_VORONOI_SITES = 50_000;
const MIN_SITE_SPACING_KM = 0.1;

/**
 * Points sampled along all named water, at most ~100 m apart, plus an unnamed
 * frame around the game area so that every water cell stays local. The
 * region is then accurate to about half the spacing next to the water.
 */
const riverVoronoiSites = (
    rivers: RiverLines,
    bounds: [number, number, number, number],
): Feature<Point, { riverIdentity: string }>[] => {
    const named = turf
        .flatten(rivers)
        .features.filter(
            (feature): feature is RiverLine =>
                feature.geometry.type === "LineString",
        )
        .map((line) => ({ line, identity: riverIdentity(line)[0] }))
        .filter(({ identity }) => identity);

    const totalLength = named.reduce(
        (sum, { line }) => sum + turf.length(line, { units: "kilometers" }),
        0,
    );
    const spacing = Math.max(
        MIN_SITE_SPACING_KM,
        totalLength / MAX_VORONOI_SITES,
    );

    const sites: Feature<Point, { riverIdentity: string }>[] = [];
    for (const { line, identity } of named) {
        const coordinates = line.geometry.coordinates;
        const properties = { riverIdentity: identity };
        sites.push(turf.point(coordinates[0], properties));
        let sinceLastSite = 0;
        for (let i = 1; i < coordinates.length; i++) {
            const from = coordinates[i - 1];
            const to = coordinates[i];
            const segment = turf.distance(from, to, { units: "kilometers" });
            let along = spacing - sinceLastSite;
            while (along < segment) {
                const t = along / segment;
                sites.push(
                    turf.point(
                        [
                            from[0] + (to[0] - from[0]) * t,
                            from[1] + (to[1] - from[1]) * t,
                        ],
                        properties,
                    ),
                );
                along += spacing;
            }
            sinceLastSite = segment - (along - spacing);
        }
        sites.push(turf.point(coordinates[coordinates.length - 1], properties));
    }
    if (sites.length === 0) return sites;

    const [minX, minY, maxX, maxY] = bounds;
    const padX = Math.max((maxX - minX) / 2, 0.1);
    const padY = Math.max((maxY - minY) / 2, 0.1);
    const frame = { riverIdentity: "" };
    for (let i = 0; i <= 8; i++) {
        const x = minX - padX + ((maxX - minX + 2 * padX) * i) / 8;
        const y = minY - padY + ((maxY - minY + 2 * padY) * i) / 8;
        sites.push(
            turf.point([x, minY - padY], frame),
            turf.point([x, maxY + padY], frame),
        );
        if (i > 0 && i < 8) {
            sites.push(
                turf.point([minX - padX, y], frame),
                turf.point([maxX + padX, y], frame),
            );
        }
    }

    // Adjacent ways share end points; duplicate sites yield empty cells.
    const seen = new Set<string>();
    return sites.filter((site) => {
        const key = site.geometry.coordinates.join(",");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};
