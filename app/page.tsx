"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const [tracks, setTracks] = useState<any[]>([]);

  useEffect(() => {
    async function loadTracks() {
      const { data } = await supabase.from("tracks").select("*");
      setTracks(data || []);
    }

    loadTracks();
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h1>Мой Spotify 🎵</h1>

      {tracks.map((track) => (
        <div key={track.id} style={{ marginBottom: 20 }}>
          <p>{track.title}</p>
          <p>{track.artist}</p>

          <audio controls src={track.audio_url}></audio>
        </div>
      ))}
    </div>
  );
}
      
