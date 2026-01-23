"use client";

import { useEffect, useState } from "react";
import { getNotifications, type Notification } from "../lib/storage";

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);

  useEffect(() => {
    setItems(getNotifications());
  }, []);

  return (
    <main style={{ minHeight: "100vh", padding: "2rem", display: "grid", placeItems: "start center" }}>
      <div style={{ width: "100%", maxWidth: 900 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: "2.2rem", marginBottom: "0.25rem" }}>Notifications</h1>
            <p style={{ color: "#555" }}>Likes notify the recipient. Messaging stays locked for now.</p>
          </div>

          <a
            href="/discover"
            style={{
              padding: "0.65rem 1rem",
              border: "1px solid #ccc",
              borderRadius: 10,
              textDecoration: "none",
              color: "inherit",
              height: "fit-content",
            }}
          >
            Back to Discover
          </a>
        </div>

        {items.length === 0 ? (
          <div style={{ marginTop: "2rem", padding: "1rem", border: "1px solid #eee", borderRadius: 12, color: "#666" }}>
            No notifications yet.
          </div>
        ) : (
          <div style={{ marginTop: "1.5rem", display: "grid", gap: "0.75rem" }}>
            {items.map((n) => (
              <div key={n.id} style={{ border: "1px solid #eee", borderRadius: 12, padding: "1rem" }}>
                <div style={{ fontWeight: 600, marginBottom: "0.25rem" }}>{n.message}</div>
                <div style={{ color: "#777", fontSize: "0.9rem" }}>{new Date(n.createdAt).toLocaleString()}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
