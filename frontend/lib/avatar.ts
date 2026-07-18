/**
 * Gender-aware specialist avatar selection utilities
 * Ensures avatar images match the specialist's gender (inferred from name or API)
 */

export type SpecialistGender = "male" | "female" | "other";

// â”€â”€ Specialist Avatar Image Pools â”€â”€
// Maps service categories to multiple unique portraits so each specialist card looks distinct
// Separate male/female pools for gender-appropriate images
export const SPECIALIST_AVATARS: Record<string, { male: string[]; female: string[] }> = {
  plumbing: { male: ["/images/specialists/plumber_1.png", "/images/specialists/plumber_2.png"], female: ["/images/specialists/sara_plumber.png", "/images/specialists/plumber_female_1.svg", "/images/specialists/plumber_female_2.svg"] },
  electrical: { male: ["/images/specialists/electrician_1.png", "/images/specialists/electrician_2.png"], female: ["/images/specialists/electrician_female_1.svg", "/images/specialists/electrician_female_2.svg"] },
  ac_repair: { male: ["/images/specialists/hvac_1.png", "/images/specialists/hvac_2.png"], female: ["/images/specialists/hvac_female_1.svg", "/images/specialists/hvac_female_2.svg"] },
  hvac: { male: ["/images/specialists/hvac_1.png", "/images/specialists/hvac_2.png"], female: ["/images/specialists/hvac_female_1.svg", "/images/specialists/hvac_female_2.svg"] },
  painting: { male: ["/images/specialists/painter_1.png"], female: ["/images/specialists/painter_female_1.svg"] },
  carpenter: { male: ["/images/specialists/carpenter_1.png"], female: ["/images/specialists/carpenter_female_1.svg"] },
  carpentry: { male: ["/images/specialists/carpenter_1.png"], female: ["/images/specialists/carpenter_female_1.svg"] },
  tech_support: { male: ["/images/specialists/techsupport_1.png"], female: ["/images/specialists/techsupport_female_1.svg"] },
  cleaning: { male: ["/images/specialists/cleaning_1.png"], female: ["/images/specialists/cleaning_female_1.svg"] },
  general: { male: ["/images/specialists/general_1.png", "/images/specialists/general_2.png"], female: ["/images/specialists/general_female_1.svg", "/images/specialists/general_female_2.svg"] },
};

// All avatars fallback pool (male + female combined)
export const ALL_AVATARS = {
  male: [
    "/images/specialists/plumber_1.png",
    "/images/specialists/electrician_1.png",
    "/images/specialists/hvac_1.png",
    "/images/specialists/painter_1.png",
    "/images/specialists/carpenter_1.png",
    "/images/specialists/techsupport_1.png",
    "/images/specialists/cleaning_1.png",
    "/images/specialists/general_1.png",
    "/images/specialists/plumber_2.png",
    "/images/specialists/electrician_2.png",
    "/images/specialists/hvac_2.png",
    "/images/specialists/general_2.png",
  ],
  female: [
    "/images/specialists/plumber_female_1.svg",
    "/images/specialists/electrician_female_1.svg",
    "/images/specialists/hvac_female_1.svg",
    "/images/specialists/painter_female_1.svg",
    "/images/specialists/carpenter_female_1.svg",
    "/images/specialists/techsupport_female_1.svg",
    "/images/specialists/cleaning_female_1.svg",
    "/images/specialists/general_female_1.svg",
    "/images/specialists/plumber_female_2.svg",
    "/images/specialists/electrician_female_2.svg",
    "/images/specialists/hvac_female_2.svg",
    "/images/specialists/general_female_2.svg",
  ],
};

// Common female first names for gender detection (extendable)
const FEMALE_FIRST_NAMES = new Set([
  "sarah", "jennifer", "lisa", "mary", "patricia", "linda", "barbara", "elizabeth",
  "susan", "jessica", "karen", "nancy", "sandra", "ashley", "kimberly", "donna",
  "emily", "michelle", "amanda", "melissa", "deborah", "laura", "stephanie", "rebecca",
  "sharon", "cynthia", "kathleen", "amy", "angela", "shirley", "anna", "brenda",
  "pamela", "nicole", "emma", "olivia", "ava", "sophia", "isabella", "mia",
  "charlotte", "amelia", "harper", "evelyn", "abigail", "emily", "elizabeth",
  "priya", "anita", "sunita", "pooja", "neha", "deepa", "rekha", "meena",
  "swati", "nisha", "divya", "shreya", "ankita", "kajal", "sonia", "rita",
  "aisha", "fatima", "zara", "layla", "maya", "aria", "zoe", "luna",
  "nora", "lily", "hazel", "violet", "aurora", "savannah", "audrey", "bella",
  "clara", "skylar", "paisley", "riley", "piper", "kennedy", "peyton", "reagan",
]);

/**
 * Detects gender from first name using a name database
 * Falls back to "male" if not found in female names list
 */
export function detectGenderFromName(name: string): SpecialistGender {
  const firstName = name.trim().split(/\s+/)[0].toLowerCase();
  return FEMALE_FIRST_NAMES.has(firstName) ? "female" : "male";
}

/**
 * Deterministically picks a unique avatar for a specialist based on their name + service + gender.
 * Same specialist always gets the same image; different specialists get different images.
 */
export function getSpecialistAvatar(name: string, serviceName?: string, gender?: SpecialistGender): string {
  const normalizedName = name.trim().split(/\s+/)[0].toLowerCase();
  if (normalizedName === "taif") return "/images/specialists/taif_plumber.png";
  if (normalizedName === "sara") return "/images/specialists/sara_plumber.png";

  const resolvedGender: "male" | "female" = gender === "female" ? "female" : "male";
  const detectedGender = resolvedGender || detectGenderFromName(name);
  const seed = (name || "specialist") + (serviceName || "") + detectedGender;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  hash = Math.abs(hash);

  // Try to match a service-specific pool first
  const serviceKey = (serviceName || "").toLowerCase().replace(/\s+/g, "_");
  for (const [key, pool] of Object.entries(SPECIALIST_AVATARS)) {
    if (serviceKey.includes(key) || key.includes(serviceKey)) {
      const genderPool = pool[detectedGender] || pool.male;
      return genderPool[hash % genderPool.length];
    }
  }

  // Fallback: pick from the full gender-specific pool
  const fallbackPool = ALL_AVATARS[detectedGender] || ALL_AVATARS.male;
  return fallbackPool[hash % fallbackPool.length];
}