"use client";

import Link from "next/link";

export default function HomePage() {
  const bg = {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    padding: "2.5rem 1rem",
    background:
      "radial-gradient(1200px 700px at 15% 10%, rgba(197,137,45,0.18), transparent 60%), radial-gradient(900px 600px at 85% 20%, rgba(10,85,0,0.14), transparent 55%), radial-gradient(900px 700px at 50% 92%, rgba(0,0,0,0.14), transparent 55%), #0b0b0b",
  } as const;

  const card = {
    width: "100%",
    maxWidth: 980,
    borderRadius: 22,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.96)",
    boxShadow: "0 18px 60px rgba(0,0,0,0.35)",
    padding: "2.25rem",
    backdropFilter: "blur(8px)",
  } as const;

  const pill = {
    display: "inline-block",
    padding: "0.45rem 0.8rem",
    borderRadius: 999,
    border: "1px solid rgba(0,0,0,0.14)",
    background: "rgba(197,137,45,0.12)",
    color: "#111",
    fontWeight: 800,
    fontSize: 12,
    letterSpacing: "0.06em",
    textTransform: "uppercase" as const,
  };

  const btn = {
    display: "inline-block",
    padding: "1rem 1.2rem",
    borderRadius: 14,
    border: "1px solid #111",
    background: "#111",
    color: "#fff",
    textDecoration: "none",
    fontWeight: 800,
    letterSpacing: "0.02em",
  };

  const sectionTitle = {
    color: "#111",
    fontSize: "1.45rem",
    margin: "2rem 0 0.6rem",
    fontWeight: 900,
  } as const;

  const paragraph = {
    color: "#333",
    lineHeight: 1.7,
    fontSize: 16,
    margin: "0 0 0.9rem",
  } as const;

  return (
    <main style={bg}>
      <section style={card}>
        <div style={pill}>Black Within</div>

        <h1
          style={{
            margin: "14px 0 10px",
            fontSize: "2.7rem",
            color: "#111",
            fontWeight: 900,
            lineHeight: 1.05,
          }}
        >
          Where alignment comes before attraction.
        </h1>

        <p style={{ ...paragraph, fontSize: 18, maxWidth: 760 }}>
          Black Within was created for people seeking something deeper than a
          swipe. This is not swipe culture. This is connection culture.
        </p>

        <div style={{ marginTop: 24 }}>
          <Link href="/auth/login" style={btn}>
            ENTER COMMUNITY
          </Link>
        </div>

        <div
          style={{
            marginTop: 18,
            fontSize: 13,
            color: "#555",
            fontWeight: 600,
          }}
        >
          Move slow. Move honest. Move protected.
        </div>

        <h2 style={sectionTitle}>Why Black Within?</h2>

        <p style={paragraph}>
          Most dating apps encourage split-second decisions based on appearance.
          Black Within invites you to slow down and discover genuine
          compatibility through values, culture, spiritual alignment, life
          goals, and intention.
        </p>

        <p style={paragraph}>
          We believe meaningful relationships are built when minds, hearts,
          purpose, and community come together.
        </p>

        <p style={paragraph}>
          Attraction may spark interest, but alignment sustains relationships.
          Each profile offers a glimpse into a person&apos;s values,
          intentions, interests, and worldview before you decide whether to
          explore the connection.
        </p>

        <h2 style={sectionTitle}>How It Works</h2>

        <p style={paragraph}>
          <strong>Create your profile.</strong> Share who you are, what you
          value, your intentions, cultural identity, spiritual framework, and
          what you are seeking in a meaningful connection.
        </p>

        <p style={paragraph}>
          <strong>Explore connection.</strong> Instead of endless swiping, take
          a moment to read profiles and discover alignment through shared
          values, goals, and interests.
        </p>

        <p style={paragraph}>
          <strong>Connect intentionally.</strong> When someone resonates with
          you, choose to Explore Connection and begin a conversation.
        </p>

        <h2 style={sectionTitle}>Membership & Messaging</h2>

        <p style={paragraph}>
          Joining Black Within is completely free.
        </p>

        <p style={paragraph}>
          Create your profile, browse the community, and discover aligned
          connections at no cost. We believe meaningful relationships should
          be accessible while supporting a safe, intentional, and culturally
          aligned space for our community.
        </p>

        <div
          style={{
            marginTop: "1rem",
            marginBottom: "1rem",
            padding: "1.25rem",
            borderRadius: 16,
            background: "rgba(197,137,45,0.12)",
            border: "1px solid rgba(0,0,0,0.12)",
         }}
       >
        <h3
          style={{
            margin: "0 0 0.75rem",
            color: "#111",
            fontWeight: 800,
        }}
      >
        Free Membership Includes:
      </h3>

      <ul
       style={{
         margin: 0,
         paddingLeft: "1.25rem",
         lineHeight: 1.8,
         color: "#333",
        }}
      >
         <li>Free account creation</li>
         <li>Free profile creation</li>
         <li>Browse community profiles</li>
         <li>Receive messages from other members</li>
         <li>5 Explore Connections per day</li>
       </ul>
    </div>

    <div
      style={{
        marginTop: "1rem",
        padding: "1.25rem",
        borderRadius: 16,
        background: "#111",
        color: "#fff",
      }}
    >
      <h3
        style={{
          margin: "0 0 0.75rem",
          fontWeight: 800,
        }}
     >
       Black Within Alignment Membership
     </h3>

     <p
       style={{
         margin: "0 0 1rem",
         lineHeight: 1.7,
         color: "rgba(255,255,255,0.9)",
       }}
     >
       Ready to deepen the conversation? Unlock unlimited connection
       opportunities and messaging.
     </p>

     <ul
       style={{
         margin: 0,
         paddingLeft: "1.25rem",
         lineHeight: 1.8,
         color: "rgba(255,255,255,0.95)",
       }}
     >
       <li>Single message: $1.99</li>
       <li>Unlimited messaging: Included</li>
       <li>Unlimited Explore Connections: Included</li>
       <li>Only $11.22 per month</li>
     </ul>
  </div>

  <p
    style={{
      marginTop: "1rem",
      color: "#555",
      lineHeight: 1.7,
      fontSize: 14,
     }}
   >
    We intentionally limit free connection requests to encourage
    thoughtful engagement rather than endless swiping. Black Within was
    built for quality connections, not quantity.
  </p>

        <h2 style={sectionTitle}>A Different Kind of Dating Experience</h2>

        <p style={paragraph}>
          On Black Within, there is no pressure to make a decision in seconds.
          Instead of asking, “Do I like this person?” we encourage a deeper
          question: “Are we aligned?”
        </p>

        <p style={paragraph}>
          The strongest relationships are not built solely on attraction. They
          are built on understanding, shared values, purpose, respect, culture,
          and vision.
        </p>

        <div
          style={{
            marginTop: 28,
            padding: "1rem",
            borderRadius: 16,
            background: "rgba(197,137,45,0.14)",
            border: "1px solid rgba(0,0,0,0.12)",
            color: "#222",
            lineHeight: 1.6,
            fontSize: 14,
          }}
        >
          <strong>Important:</strong> Gmail addresses are strongly recommended
          when creating an account. Some email providers, including Yahoo and
          AOL, may delay, filter, or block verification and password reset
          emails.
        </div>
      </section>
    </main>
  );
}
