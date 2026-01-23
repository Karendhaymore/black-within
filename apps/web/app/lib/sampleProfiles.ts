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

export type Profile = {
  id: string;
  displayName: string;
  age: number;
  city: string;
  stateUS: string;
  photo: string;
  intention: string;
  tags: string[];
  identityPreview: string;
  isAvailable: boolean;

  // NEW
  isDemo: boolean; // true = preview/sample profile
};

export const DEMO_PROFILES: Profile[] = [
  {
    id: "d1",
    displayName: "SankofaSeeker",
    age: 34,
    city: "Oakland",
    stateUS: "CA",
    photo: "/demo/d1.png",
    intention: "Intentional partnership",
    tags: ["Sankofa", "Ubuntu", "Ancestral Veneration Systems"],
    identityPreview: "I define Blackness as lived memory, culture, and responsibility—carried forward with love.",
    isAvailable: true,
    isDemo: true,
  },
  // add d2..d12, etc.
];
