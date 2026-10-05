import * as turf from "@turf/turf";

import { hiderMode } from "@/lib/context";
import { modifyMapData } from "@/maps/geo-utils";
import type { RadiusQuestion } from "@/maps/schema";

const radiusCircle = (question: RadiusQuestion) =>
    turf.circle([question.lng, question.lat], question.radius, {
        units: question.unit,
    });

export const adjustPerRadius = async (
    question: RadiusQuestion,
    mapData: any,
) => {
    if (mapData === null) return;

    return modifyMapData(mapData, radiusCircle(question), question.within);
};

export const hiderifyRadius = async (question: RadiusQuestion) => {
    const $hiderMode = hiderMode.get();
    if ($hiderMode === false) {
        return question;
    }

    const distance = turf.distance(
        turf.point([question.lng, question.lat]),
        turf.point([$hiderMode.longitude, $hiderMode.latitude]),
        { units: question.unit },
    );

    if (distance <= question.radius) {
        question.within = true;
    } else {
        question.within = false;
    }

    return question;
};

export const radiusPlanningPolygon = async (question: RadiusQuestion) => {
    return turf.polygonToLine(radiusCircle(question));
};
