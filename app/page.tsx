"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const [tracks, setTracks] = useState<any[]>([]);
  const [currentTrack, setCurrentTrack] = useState<any | null>(null);
  const [user, setUser] = useState<any | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Получение Telegram пользователя
  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).Telegram?.WebApp) {
      const tg = (window as any).Telegram.WebApp;
      tg.ready();
      setUser(tg.initDataUnsafe?.user || null);
    }
  }, []);

  // Получение треков из Supabase
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

  return (
    <div style={{
      padding: 20,
      color: "white",
      background: "#111",
      minHeight: "100vh",
      fontFamily: "Arial, sans-serif"
    }}>
      <h1 style={{ textAlign: "center" }}>Spotify Mini 🎵</h1>

      {user && (
        <p style={{ textAlign: "center", opacity: 0.7, marginBottom: 30 }}>
          Привет, {user.first_name}!
        </p>
      )}

      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr",
        gap: 15,
        maxWidth: 600,
        margin: "0 auto"
      }}>
        {tracks.map((track) => (
          <div
            key={track.id}
            onClick={() => playTrack(track)}
            style={{
              padding: 15,
              background: "#222",
              borderRadius: 10,
              cursor: "pointer",
              transition: "background 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#333")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#222")}
          >
            <strong style={{ fontSize: 16 }}>{track.title}</strong>
            <div style={{ fontSize: 14, opacity: 0.7 }}>{track.artist}</div>
          </div>
        ))}
      </div>

      {currentTrack && (
        <div style={{
          marginTop: 40,
          padding: 20,
          background: "#222",
          borderRadius: 10,
          maxWidth: 600,
          marginLeft: "auto",
          marginRight: "auto",
          textAlign: "center"
        }}>
          <h3>Сейчас играет:</h3>
          <p style={{ margin: "5px 0" }}>
            {currentTrack.title} — {currentTrack.artist}
          </p>
          <audio
            ref={audioRef}
            src={currentTrack.audio_url}
            controls
            autoPlay
            style={{ width: "100%", marginTop: 10 }}
          />
        </div>
      )}
    </div>
  );
}