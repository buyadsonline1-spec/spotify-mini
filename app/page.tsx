"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const [tracks, setTracks] = useState<any[]>([]);
  const [currentTrack, setCurrentTrack] = useState<any | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    fetchTracks();
  }, []);

  async function fetchTracks() {
    const { data, error } = await supabase.from("tracks").select("*");

    if (error) {
      console.error("SUPABASE ERROR:", error);
      setTracks([]);
      return;
    }

    setTracks(data ?? []);
  }
  function playTrack(track: any) {
  setCurrentTrack(track);

  // принудительно перезагружаем аудио и запускаем
  setTimeout(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.load(); // важно!
    audio.play().catch((e) => console.log("play error", e));
  }, 50);
}
  const tg =
    typeof window !== "undefined" ? (window as any).Telegram?.WebApp : null;
  const user = tg?.initDataUnsafe?.user;

  return (
    <div
      style={{
        padding: 20,
        color: "#fff",
        background: "#111",
        minHeight: "100vh",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <h1 style={{ marginBottom: 5 }}>Spotify Mini 🎵</h1>
      {user && (
        <p style={{ opacity: 0.7, marginBottom: 20 }}>
          Привет, {user.first_name}
        </p>
      )}

      {tracks.length === 0 ? (
        <p style={{ opacity: 0.7 }}>Треков пока нет (или нет доступа).</p>
      ) : (
        <div>
          {tracks.map((track) => (
            <div
              key={track.id}
              onClick={() => playTrack(track)}
              style={{
                padding: 12,
                marginBottom: 10,
                background: "#222",
                borderRadius: 12,
                cursor: "pointer",
              }}
            >
              <div style={{ fontWeight: 700 }}>{track.title}</div>
              <div style={{ fontSize: 14, opacity: 0.7 }}>{track.artist}</div>
            </div>
          ))}
        </div>
      )}

      {currentTrack && (
        <div
          style={{
            marginTop: 20,
            padding: 15,
            background: "#1c1c1c",
            borderRadius: 14,
          }}
        >
          <div style={{ opacity: 0.7, fontSize: 12 }}>Now playing</div>
          <div style={{ fontWeight: 700, marginTop: 6 }}>
            {currentTrack.title}
          </div>
          <div style={{ opacity: 0.7, fontSize: 14 }}>
            {currentTrack.artist}
          </div>

          {/* Сам audio скрыт */}
          <audio
            key={currentTrack.id}  
            ref={audioRef}
            src={currentTrack.audio_url}
            autoPlay
            style={{ display: "none" }}
          />

          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button
              onClick={() => audioRef.current?.play()}
              style={{
                background: "#1DB954",
                color: "#000",
                border: "none",
                padding: "10px 16px",
                borderRadius: 999,
                cursor: "pointer",
                fontWeight: 700,
                flex: 1,
              }}
            >
              ▶ Play
            </button>
            <button
              onClick={() => audioRef.current?.pause()}
              style={{
                background: "#333",
                color: "#fff",
                border: "none",
                padding: "10px 16px",
                borderRadius: 999,
                cursor: "pointer",
                fontWeight: 700,
                flex: 1,
              }}
            >
              ⏸ Pause
            </button>
          </div>
        </div>
      )}
    </div>
  );
}