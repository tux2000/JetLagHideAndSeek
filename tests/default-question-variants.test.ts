import { expect, test } from "vitest";

import {
    defaultQuestionVariantId,
    getFirstEnabledDefaultQuestionVariant,
} from "@/maps/default-question-variants";

test("game-size aliases share one logical question variant", () => {
    expect(defaultQuestionVariantId("matching", "theme_park-full")).toBe(
        "matching:theme_park",
    );
    expect(defaultQuestionVariantId("matching", "hospital")).toBe(
        "matching:hospital",
    );
});

test("disabling Matching / Theme Park leaves Matching / Hospital enabled", () => {
    const disabled = ["matching:theme_park"] as const;
    const available = getFirstEnabledDefaultQuestionVariant("matching", [
        ...disabled,
    ]);

    expect(disabled.includes(defaultQuestionVariantId("matching", "theme_park-full"))).toBe(
        true,
    );
    expect(disabled.includes(defaultQuestionVariantId("matching", "hospital"))).toBe(
        false,
    );
    expect(available?.id).toBe("matching:airport");
});
