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

    if (error) {
      console.error(error);
    } else {
      setTracks(data);
    }
  }

  function playTrack(track: any) {
    setCurrentTrack(track);

    setTimeout(() => {
      audioRef.current?.play();
    }, 100);
  }
const tg =
  typeof window !== "undefined"
    ? (window as any).Telegram?.WebApp
    : null;

const user = tg?.initDataUnsafe?.user;
  return (return (
  <div style={{ padding: 20, color: "white", background: "#111", minHeight: "100vh" }}>
    
    <h1>Spotify Mini 🎵</h1>

    {user && (
      <p style={{ opacity: 0.7 }}>
        Привет, {user.first_name}
      </p>
    )}
     <div>
  {tracks.map((track, index) => (
    <div key={index} style={{ marginBottom: 10, padding: 10, background: "#222", borderRadius: 8 }}>
      <p style={{ margin: 0, fontWeight: "bold" }}>{track.title}</p>
      <p style={{ margin: 0, opacity: 0.7 }}>{track.artist}</p>
    </div>
  ))}
</div>
);
    <div style={{ padding: 20, color: "white", background: "#111", minHeight: "100vh" }}>
      <h1>Spotify Mini 🎵</h1>

      <div>
        {tracks.map((track) => (
          <div
            key={track.id}
            onClick={() => playTrack(track)}
            style={{
              padding: 10,
              marginBottom: 10,
              background: "#1e1e1e",
              borderRadius: 8,
              cursor: "pointer"
            }}
          >
            <strong>{track.title}</strong>
            <div style={{ fontSize: 14, opacity: 0.7 }}>{track.artist}</div>
          </div>
        ))}
      </div>

      {currentTrack && (
        <div style={{ marginTop: 30 }}>
          <h3>Now playing:</h3>
          <p>{currentTrack.title} — {currentTrack.artist}</p>
          <audio
            ref={audioRef}
            src={currentTrack.audio_url}
            controls
            autoPlay
            style={{ width: "100%" }}
          />
        </div>
      )}
    </div>
  );
}