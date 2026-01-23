export type Profile = {
  id: string;
  displayName: string;
  age: number;
  city: string;
  stateUS: string;
  photo: string; // local path like /demo/d01.png
  intention: string;
  tags: string[];
  identityPreview: string;
  isAvailable: boolean;

  // IMPORTANT: these are preview/demo profiles
  isDemo: boolean;
};

export const DEMO_PROFILES: Profile[] = [
  {
    id: "d01",
    displayName: "AyoSankofa",
    age: 34,
    city: "Oakland",
    stateUS: "CA",
    photo: "/demo/d01.png",
    intention: "Intentional partnership",
    tags: ["Sankofa", "Ubuntu", "Ancestral Veneration Systems"],
    identityPreview:
      "I define Blackness as sacred memory—carried in language, style, and how we treat each other when nobody’s watching.",
    isAvailable: true,
    isDemo: true,
  },
  {
    id: "d02",
    displayName: "NubianGrace",
    age: 31,
    city: "Atlanta",
    stateUS: "GA",
    photo: "/demo/d02.png",
    intention: "Marriage-minded",
    tags: ["Kemetic Philosophy", "Ubuntu", "Liberated Christianity"],
    identityPreview:
      "Ancestry keeps me honest. I move with tenderness and standards—both can exist in the same woman.",
    isAvailable: true,
    isDemo: true,
  },
  {
    id: "d03",
    displayName: "KofiAligned",
    age: 38,
    city: "Chicago",
    stateUS: "IL",
    photo: "/demo/d03.png",
    intention: "Intentional partnership",
    tags: ["Pan African Spiritual Movements", "Ubuntu", "Sankofa"],
    identityPreview:
      "I’m not here for performance. I’m here for alignment—shared values, calm communication, and mutual respect.",
    isAvailable: true,
    isDemo: true,
  },
  {
    id: "d04",
    displayName: "ZuriCrown",
    age: 29,
    city: "Houston",
    stateUS: "TX",
    photo: "/demo/d04.png",
    intention: "Conscious companionship",
    tags: ["African-Centered Holistic Healing", "Ancestral Veneration Systems"],
    identityPreview:
      "My love language is care: presence, protection, and patience. I’m building a partnership that feels safe to grow in.",
    isAvailable: true,
    isDemo: true,
  },
  {
    id: "d05",
    displayName: "MaatInMotion",
    age: 41,
    city: "Washington",
    stateUS: "DC",
    photo: "/demo/d05.png",
    intention: "Marriage-minded",
    tags: ["Kemetic Philosophy", "Metaphysical Science (African-centered variants)"],
    identityPreview:
      "I value truth, balance, and emotional maturity. If we build, we build with clarity—not confusion.",
    isAvailable: true,
    isDemo: true,
  },
  {
    id: "d06",
    displayName: "EkonSoul",
    age: 36,
    city: "New York",
    stateUS: "NY",
    photo: "/demo/d06.png",
    intention: "Intentional partnership",
    tags: ["Ubuntu", "Sankofa", "Islam"],
    identityPreview:
      "I’m grounded in family and faith. I’m looking for a woman who values devotion, discernment, and partnership as purpose.",
    isAvailable: true,
    isDemo: true,
  },
  {
    id: "d07",
    displayName: "AshantiMuse",
    age: 33,
    city: "Los Angeles",
    stateUS: "CA",
    photo: "/demo/d07.png",
    intention: "Conscious companionship",
    tags: ["Afrocentric Spirituality", "Ancestral Veneration Systems", "Sankofa"],
    identityPreview:
      "I’m soft but not vague. I’m romantic but not reckless. I want a connection that honors pace and intention.",
    isAvailable: true,
    isDemo: true,
  },
  {
    id: "d08",
    displayName: "UbuntuHeart",
    age: 40,
    city: "Charlotte",
    stateUS: "NC",
    photo: "/demo/d08.png",
    intention: "Community-first connection",
    tags: ["Ubuntu", "Liberated Christianity", "African-Centered Holistic Healing"],
    identityPreview:
      "I love community. I love peace. I’m looking for someone who wants to build something that blesses more than just us.",
    isAvailable: true,
    isDemo: true,
  },
  {
    id: "d09",
    displayName: "NiaGoldThread",
    age: 27,
    city: "Dallas",
    stateUS: "TX",
    photo: "/demo/d09.png",
    intention: "Open to evolving alignment",
    tags: ["Afrocentric Spirituality", "New Age Spirituality", "Sankofa"],
    identityPreview:
      "I’m curious and grounded. I’m here for meaningful connection—not rushing, not hiding, not playing games.",
    isAvailable: true,
    isDemo: true,
  },
  {
    id: "d10",
    displayName: "ObsidianGentleman",
    age: 35,
    city: "Philadelphia",
    stateUS: "PA",
    photo: "/demo/d10.png",
    intention: "Intentional partnership",
    tags: ["Hoodoo / Rootwork", "Ancestral Veneration Systems", "Ubuntu"],
    identityPreview:
      "I’m intentional in how I love. I believe romance should come with responsibility and emotional safety.",
    isAvailable: true,
    isDemo: true,
  },
  {
    id: "d11",
    displayName: "SadeSerenity",
    age: 39,
    city: "Baltimore",
    stateUS: "MD",
    photo: "/demo/d11.png",
    intention: "Marriage-minded",
    tags: ["Liberated Christianity", "Sankofa", "Ubuntu"],
    identityPreview:
      "I want a partner who communicates with care. I’m ready for a love that feels calm, consistent, and honorable.",
    isAvailable: true,
    isDemo: true,
  },
  {
    id: "d12",
    displayName: "KemetElegance",
    age: 32,
    city: "Miami",
    stateUS: "FL",
    photo: "/demo/d12.png",
    intention: "Intentional partnership",
    tags: ["Kemetic Philosophy", "Afrocentric Spirituality", "Sankofa"],
    identityPreview:
      "My life is intentional. My love will be too. I’m here for a partner who respects values, vision, and timing.",
    isAvailable: true,
    isDemo: true,
  },
  {
    id: "d13",
    displayName: "MakedaBloom",
    age: 28,
    city: "New Orleans",
    stateUS: "LA",
    photo: "/demo/d13.png",
    intention: "Conscious companionship",
    tags: ["Vodun / Vodou", "Ancestral Veneration Systems", "Sankofa"],
    identityPreview:
      "I honor tradition with grace. I’m looking for someone who can hold depth without trying to control it.",
    isAvailable: true,
    isDemo: true,
  },
  {
    id: "d14",
    displayName: "PanAfricanPoise",
    age: 42,
    city: "Seattle",
    stateUS: "WA",
    photo: "/demo/d14.png",
    intention: "Community-first connection",
    tags: ["Pan African Spiritual Movements", "Ubuntu", "Sankofa"],
    identityPreview:
      "I’m here for aligned companionship—shared values, shared joy, and a relationship that doesn’t require shrinking.",
    isAvailable: true,
    isDemo: true,
  },
  {
    id: "d15",
    displayName: "IfaAndInk",
    age: 37,
    city: "Phoenix",
    stateUS: "AZ",
    photo: "/demo/d15.png",
    intention: "Intentional partnership",
    tags: ["Ifa / Orisha Traditions (Yoruba)", "Ubuntu", "Sankofa"],
    identityPreview:
      "I’m grounded in tradition and self-work. I’m seeking a woman who values honesty, devotion, and mutual elevation.",
    isAvailable: true,
    isDemo: true,
  },
  {
    id: "d16",
    displayName: "JaliWisdom",
    age: 30,
    city: "Denver",
    stateUS: "CO",
    photo: "/demo/d16.png",
    intention: "Open to evolving alignment",
    tags: ["Sankofa", "African-Centered Holistic Healing", "Ubuntu"],
    identityPreview:
      "I’m a builder at heart. I’m not here to chase—I'm here to choose wisely and love well.",
    isAvailable: true,
    isDemo: true,
  },
  {
    id: "d17",
    displayName: "DiasporaDignity",
    age: 44,
    city: "Boston",
    stateUS: "MA",
    photo: "/demo/d17.png",
    intention: "Marriage-minded",
    tags: ["Liberated Christianity", "Islam", "Ubuntu"],
    identityPreview:
      "I value discernment and devotion. I’m looking for a partner who leads with character—not charisma alone.",
    isAvailable: true,
    isDemo: true,
  },
  {
    id: "d18",
    displayName: "CrownAndCalm",
    age: 26,
    city: "Minneapolis",
    stateUS: "MN",
    photo: "/demo/d18.png",
    intention: "Conscious companionship",
    tags: ["Afrocentric Spirituality", "Ancestral Veneration Systems", "Ubuntu"],
    identityPreview:
      "I want something real and respectful. I’m drawn to people who are gentle with power and serious about growth.",
    isAvailable: true,
    isDemo: true,
  },
];
