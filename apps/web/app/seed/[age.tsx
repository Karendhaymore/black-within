"use client";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
  "https://black-within-api.onrender.com";

function randomId() {
  return "seed_" + Math.random().toString(36).substring(2, 12);
}

const NAMES = [
  "NiaSoul", "MalikSun", "ImaniTruth", "ZuriLight", "KofiAligned",
  "AyoSacred", "NubiaFlow", "OmariDepth", "SanaaRooted", "JabariWise"
];

const CITIES = ["Atlanta", "Houston", "Chicago", "DC", "Oakland"];
const STATES = ["GA", "TX", "IL", "DC", "CA"];

async function createProfile(profile: any) {
  await fetch(`${API_BASE}/profiles/upsert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile),
  });
}

export default function SeedPage() {
  async function seedProfiles() {
    for (let i = 0; i < 10; i++) {
      await createProfile({
        owner_user_id: randomId(),
        displayName: NAMES[i],
        age: 26 + i,
        city: CITIES[i % CITIES.length],
        stateUS: STATES[i % STATES.length],
        photo: null,
        intention: "Intentional partnership",
        identityPreview: "African-centered • Spiritually aligned • Ready for real connection",
        tags: ["African-Centered", "Spiritual", "Conscious"],
        isAvailable: true,
      });
    }

    alert("10 profiles created. Go to Discover.");
  }

  return (
    <main style={{ padding: "2rem" }}>
      <h1>Admin Seeder</h1>
      <p>This will create 10 demo profiles.</p>
      <button
        onClick={seedProfiles}
        style={{
          padding: "1rem",
          borderRadius: 12,
          border: "1px solid #000",
          background: "#000",
          color: "white",
        }}
      >
        Generate Profiles
      </button>
    </main>
  );
}
