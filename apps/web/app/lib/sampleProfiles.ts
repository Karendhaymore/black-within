export type Profile = {
  id: string;
  displayName: string;
  age: number;
  city: string;
  stateUS: string;
  photo: string; // MVP: image URL
  intention: string;
  tags: string[];
  identityPreview: string; // short visible snippet
  isAvailable: boolean; // simulate removal/unavailable
};

export const SAMPLE_PROFILES: Profile[] = [
  {
    id: "1",
    displayName: "SankofaSeeker",
    age: 34,
    city: "Oakland",
    stateUS: "CA",
    photo: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=80",
    intention: "Intentional partnership",
    tags: ["Sankofa", "Ubuntu", "Ancestral Veneration Systems"],
    identityPreview: "I define Blackness as lived memory, culture, and responsibility—carried forward with love.",
    isAvailable: true,
  },
  {
    id: "2",
    displayName: "RootedRising",
    age: 38,
    city: "Atlanta",
    stateUS: "GA",
    photo: "https://images.unsplash.com/photo-1524502397800-2eeaad7c3fe5?auto=format&fit=crop&w=900&q=80",
    intention: "Marriage-minded",
    tags: ["African-Centered Holistic Healing", "Kemetic Philosophy"],
    identityPreview: "Lineage guides my choices. I’m building partnership as a sacred practice, not a performance.",
    isAvailable: true,
  },
  {
    id: "3",
    displayName: "KemeticCalm",
    age: 29,
    city: "Houston",
    stateUS: "TX",
    photo: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=900&q=80",
    intention: "Conscious companionship",
    tags: ["Kemetic Philosophy", "Metaphysical Science (African-centered variants)"],
    identityPreview: "Conscious partnership to me means emotional maturity, truth-telling, and shared growth.",
    isAvailable: true,
  },
  {
    id: "4",
    displayName: "UbuntuHeart",
    age: 41,
    city: "Chicago",
    stateUS: "IL",
    photo: "https://images.unsplash.com/photo-1524503033411-f7a2fe8c7b3b?auto=format&fit=crop&w=900&q=80",
    intention: "Community-first connection",
    tags: ["Ubuntu", "Liberated Christianity"],
    identityPreview: "I move with Ubuntu: I am because we are. I’m looking for alignment, not entertainment.",
    isAvailable: true,
  },
  {
    id: "5",
    displayName: "AncestralAligned",
    age: 33,
    city: "Baltimore",
    stateUS: "MD",
    photo: "https://images.unsplash.com/photo-1525134479668-1bee5c7c6845?auto=format&fit=crop&w=900&q=80",
    intention: "Open to evolving alignment",
    tags: ["Hoodoo / Rootwork", "Ancestral Veneration Systems"],
    identityPreview: "I’m intentional about energy. If we connect, it’s with respect, pacing, and reciprocity.",
    isAvailable: true,
  },
];
