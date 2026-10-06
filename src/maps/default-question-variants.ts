export const DEFAULT_QUESTION_VARIANTS = [
    { id: "radius:default", family: "radius", value: "default", label: "Radius" },
    {
        id: "thermometer:default",
        family: "thermometer",
        value: "default",
        label: "Thermometer",
    },
    { id: "tentacles:theme_park", family: "tentacles", value: "theme_park", label: "Theme Park" },
    { id: "tentacles:zoo", family: "tentacles", value: "zoo", label: "Zoo" },
    { id: "tentacles:aquarium", family: "tentacles", value: "aquarium", label: "Aquarium" },
    { id: "tentacles:museum", family: "tentacles", value: "museum", label: "Museum" },
    { id: "tentacles:hospital", family: "tentacles", value: "hospital", label: "Hospital" },
    { id: "tentacles:cinema", family: "tentacles", value: "cinema", label: "Cinema" },
    { id: "tentacles:library", family: "tentacles", value: "library", label: "Library" },
    { id: "matching:airport", family: "matching", value: "airport", label: "Airport" },
    { id: "matching:major-city", family: "matching", value: "major-city", label: "Major City" },
    { id: "matching:zone", family: "matching", value: "zone", label: "Zone" },
    {
        id: "matching:letter-zone",
        family: "matching",
        value: "letter-zone",
        label: "Zone (Same First Letter)",
    },
    { id: "matching:aquarium", family: "matching", value: "aquarium", label: "Aquarium" },
    { id: "matching:zoo", family: "matching", value: "zoo", label: "Zoo" },
    { id: "matching:theme_park", family: "matching", value: "theme_park", label: "Theme Park" },
    { id: "matching:peak", family: "matching", value: "peak", label: "Mountain" },
    { id: "matching:museum", family: "matching", value: "museum", label: "Museum" },
    { id: "matching:hospital", family: "matching", value: "hospital", label: "Hospital" },
    { id: "matching:cinema", family: "matching", value: "cinema", label: "Cinema" },
    { id: "matching:library", family: "matching", value: "library", label: "Library" },
    { id: "matching:golf_course", family: "matching", value: "golf_course", label: "Golf Course" },
    { id: "matching:consulate", family: "matching", value: "consulate", label: "Consulate" },
    { id: "matching:park", family: "matching", value: "park", label: "Park" },
    {
        id: "matching:same-first-letter-station",
        family: "matching",
        value: "same-first-letter-station",
        label: "Station (Same First Letter)",
    },
    {
        id: "matching:same-length-station",
        family: "matching",
        value: "same-length-station",
        label: "Station (Same Length)",
    },
    {
        id: "matching:same-train-line",
        family: "matching",
        value: "same-train-line",
        label: "Station (Same Train Line)",
    },
    { id: "measuring:coastline", family: "measuring", value: "coastline", label: "Coastline" },
    { id: "measuring:airport", family: "measuring", value: "airport", label: "Airport" },
    { id: "measuring:city", family: "measuring", value: "city", label: "Major City" },
    {
        id: "measuring:highspeed-measure-shinkansen",
        family: "measuring",
        value: "highspeed-measure-shinkansen",
        label: "High-Speed Rail",
    },
    {
        id: "measuring:admin-measure",
        family: "measuring",
        value: "admin-measure",
        label: "Administrative Border",
    },
    { id: "measuring:aquarium", family: "measuring", value: "aquarium", label: "Aquarium" },
    { id: "measuring:zoo", family: "measuring", value: "zoo", label: "Zoo" },
    { id: "measuring:theme_park", family: "measuring", value: "theme_park", label: "Theme Park" },
    { id: "measuring:peak", family: "measuring", value: "peak", label: "Mountain" },
    { id: "measuring:museum", family: "measuring", value: "museum", label: "Museum" },
    { id: "measuring:hospital", family: "measuring", value: "hospital", label: "Hospital" },
    { id: "measuring:cinema", family: "measuring", value: "cinema", label: "Cinema" },
    { id: "measuring:library", family: "measuring", value: "library", label: "Library" },
    { id: "measuring:golf_course", family: "measuring", value: "golf_course", label: "Golf Course" },
    { id: "measuring:consulate", family: "measuring", value: "consulate", label: "Consulate" },
    { id: "measuring:park", family: "measuring", value: "park", label: "Park" },
    { id: "measuring:mcdonalds", family: "measuring", value: "mcdonalds", label: "McDonald's" },
    { id: "measuring:seven11", family: "measuring", value: "seven11", label: "7-Eleven" },
    { id: "measuring:rail-measure", family: "measuring", value: "rail-measure", label: "Train Station" },
] as const;

export type DefaultQuestionVariantId =
    (typeof DEFAULT_QUESTION_VARIANTS)[number]["id"];
export type DefaultQuestionVariantFamily =
    (typeof DEFAULT_QUESTION_VARIANTS)[number]["family"];

export const defaultQuestionVariantId = (
    family: DefaultQuestionVariantFamily,
    value = "default",
) => {
    const normalizedValue = value.endsWith("-full")
        ? value.slice(0, -5)
        : value;
    return `${family}:${normalizedValue}` as DefaultQuestionVariantId;
};

export const getFirstEnabledDefaultQuestionVariant = (
    family: DefaultQuestionVariantFamily,
    disabledVariants: DefaultQuestionVariantId[],
) =>
    DEFAULT_QUESTION_VARIANTS.find(
        (variant) =>
            variant.family === family && !disabledVariants.includes(variant.id),
    );
