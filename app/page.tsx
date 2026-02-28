"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const [tracks, setTracks] = useState<any[]>([]);
  const [currentTrack, setCurrentTrack] = useState<any | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    fetchTracks();
  }, []);

  async function fetchTracks() {
  const { data, error } = await supabase
    .from("tracks")
    .select("*")
    .order("created_at", { ascending: false });

  console.log("SUPABASE ERROR:", error);
  console.log("TRACKS DATA:", data);
  console.log("DATA LENGTH:", data?.length);

  if (error) {
    console.error(error);
  } else {
    setTracks(data ?? []);
  }
}

  function playTrack(track: any) {
    setCurrentTrack(track);
    setTimeout(() => audioRef.current?.play(), 100);
  }

  const tg =
    typeof window !== "undefined" ? (window as any).Telegram?.WebApp : null;
  const user = tg?.initDataUnsafe?.user;

  return (
    <div style={{ padding: 20, color: "#fff", background: "#111", minHeight: "100vh", fontFamily: "Arial, sans-serif" }}>
      <h1 style={{ marginBottom: 5 }}>Spotify Mini 🎵</h1>
      {user && <p style={{ opacity: 0.7, marginBottom: 20 }}>Привет, {user.first_name}</p>}

      <div>
        {tracks.map((track) => (
          <div
            key={track.id}
            onClick={() => playTrack(track)}
            style={{
              padding: 12,
              marginBottom: 10,
              background: "#222",
              borderRadius: 8,
              cursor: "pointer",
              transition: "background 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#333")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#222")}
          >
            <strong>{track.title}</strong>
            <div style={{ fontSize: 14, opacity: 0.7 }}>{track.artist}</div>
          </div>
        ))}
      </div>

     {currentTrack && (
  <div style={{ marginTop: 30, padding: 15, background: "#222", borderRadius: 10 }}>
    <h3 style={{ margin: 0 }}>Now playing:</h3>
    <p style={{ margin: "5px 0" }}>
      {currentTrack.title} — {currentTrack.artist}
    </p>

    <audio
      ref={audioRef}
      src={currentTrack.audio_url}
      autoPlay
      style={{ display: "none" }}
    />

    <button
      onClick={() => audioRef.current?.play()}
      style={{
        background: "#1DB954",
        color: "#000",
        border: "none",
        padding: "10px 20px",
        borderRadius: 20,
        cursor: "pointer",
        fontWeight: "bold"
      }}
    >
      ▶ Play
    </button>
  </div>
)}
    </div>
  );
}