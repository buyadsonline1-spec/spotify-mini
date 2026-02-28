"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type Track = {
  id: string;
  title: string;
  artist: string;
  audio_url: string;
  cover_url?: string | null;
};

function formatTime(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function Home() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [query, setQuery] = useState("");

  const audioRef = useRef<HTMLAudioElement>(null);

  const tg =
    typeof window !== "undefined" ? (window as any).Telegram?.WebApp : null;
  const user = tg?.initDataUnsafe?.user;

  useEffect(() => {
    tg?.ready?.();
  }, [tg]);

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

    // нормализуем поля (на случай если в таблице другие)
    const normalized: Track[] = (data ?? []).map((t: any) => ({
      id: String(t.id),
      title: t.title ?? "Unknown title",
      artist: t.artist ?? "Unknown artist",
      audio_url: t.audio_url,
      cover_url: t.cover_url ?? null,
    }));

    setTracks(normalized);
  }

  function playTrack(track: Track) {
    setCurrentTrack(track);

    setTimeout(() => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.load();
      audio
        .play()
        .then(() => setIsPlaying(true))
        .catch((e) => console.log("play error", e));
    }, 50);
  }

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      audio
        .play()
        .then(() => setIsPlaying(true))
        .catch((e) => console.log("play error", e));
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }

  function seekTo(percent: number) {
    const audio = audioRef.current;
    if (!audio || !dur) return;
    const next = Math.max(0, Math.min(dur, percent * dur));
    audio.currentTime = next;
    setPos(next);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tracks;
    return tracks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q)
    );
  }, [tracks, query]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(1200px 600px at 20% -10%, rgba(29,185,84,0.25), transparent 60%), #0b0b0b",
        color: "#fff",
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial',
        paddingBottom: currentTrack ? 120 : 24,
      }}
    >
      {/* Header */}
      <div style={{ padding: 20, position: "sticky", top: 0, zIndex: 5 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>Spotify Mini</div>
            <div style={{ opacity: 0.7, fontSize: 13, marginTop: 2 }}>
              {user ? `Привет, ${user.first_name}` : "Музыка в Telegram"}
            </div>
          </div>

          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 999,
              background: "rgba(255,255,255,0.08)",
              display: "grid",
              placeItems: "center",
              fontWeight: 800,
            }}
            title="Profile"
          >
            {user?.first_name?.[0]?.toUpperCase?.() ?? "♪"}
          </div>
        </div>

        {/* Search */}
        <div style={{ marginTop: 14 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск трека или артиста…"
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.06)",
              color: "#fff",
              outline: "none",
            }}
          />
        </div>
      </div>

      {/* List */}
      <div style={{ padding: "0 20px" }}>
        {filtered.length === 0 ? (
          <div style={{ opacity: 0.75, padding: 12 }}>
            Ничего не найдено.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {filtered.map((t) => {
              const isActive = currentTrack?.id === t.id;

              return (
                <button
                  key={t.id}
                  onClick={() => playTrack(t)}
                  style={{
                    all: "unset",
                    cursor: "pointer",
                    padding: 12,
                    borderRadius: 16,
                    border: isActive
                      ? "1px solid rgba(29,185,84,0.55)"
                      : "1px solid rgba(255,255,255,0.08)",
                    background: isActive
                      ? "rgba(29,185,84,0.10)"
                      : "rgba(255,255,255,0.05)",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  {/* cover */}
                  <div
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: 12,
                      background:
                        t.cover_url
                          ? `url(${t.cover_url}) center/cover no-repeat`
                          : "linear-gradient(135deg, rgba(29,185,84,0.35), rgba(255,255,255,0.06))",
                      flex: "0 0 auto",
                      position: "relative",
                      overflow: "hidden",
                    }}
                  />

                  {/* text */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 800,
                        fontSize: 14,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {t.title}
                    </div>
                    <div
                      style={{
                        opacity: 0.7,
                        fontSize: 13,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        marginTop: 2,
                      }}
                    >
                      {t.artist}
                    </div>
                  </div>

                  {/* play icon */}
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 999,
                      background: isActive
                        ? "rgba(29,185,84,0.95)"
                        : "rgba(255,255,255,0.08)",
                      display: "grid",
                      placeItems: "center",
                      color: isActive ? "#000" : "#fff",
                      fontWeight: 900,
                      flex: "0 0 auto",
                    }}
                    aria-label="play"
                  >
                    ▶
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Hidden audio */}
      {currentTrack && (
        <audio
          key={currentTrack.id}
          ref={audioRef}
          src={currentTrack.audio_url}
          style={{ display: "none" }}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onTimeUpdate={() => setPos(audioRef.current?.currentTime ?? 0)}
          onLoadedMetadata={() => setDur(audioRef.current?.duration ?? 0)}
          onEnded={() => setIsPlaying(false)}
          autoPlay
        />
      )}

      {/* Bottom mini-player */}
      {currentTrack && (
        <div
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            padding: 14,
            zIndex: 10,
            background:
              "linear-gradient(to top, rgba(11,11,11,0.98), rgba(11,11,11,0.86))",
            borderTop: "1px solid rgba(255,255,255,0.08)",
            backdropFilter: "blur(10px)",
          }}
        >
          <div
            style={{
              maxWidth: 820,
              margin: "0 auto",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background:
                  currentTrack.cover_url
                    ? `url(${currentTrack.cover_url}) center/cover no-repeat`
                    : "linear-gradient(135deg, rgba(29,185,84,0.35), rgba(255,255,255,0.06))",
                flex: "0 0 auto",
              }}
            />

            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontWeight: 800,
                  fontSize: 13,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {currentTrack.title}
              </div>
              <div
                style={{
                  opacity: 0.7,
                  fontSize: 12,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  marginTop: 2,
                }}
              >
                {currentTrack.artist}
              </div>

              {/* progress */}
              <div style={{ marginTop: 10 }}>
                <div
                  onClick={(e) => {
                    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                    const percent = (e.clientX - rect.left) / rect.width;
                    seekTo(percent);
                  }}
                  style={{
                    height: 8,
                    borderRadius: 999,
                    background: "rgba(255,255,255,0.10)",
                    overflow: "hidden",
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: dur ? `${(pos / dur) * 100}%` : "0%",
                      background: "rgba(29,185,84,0.95)",
                      borderRadius: 999,
                    }}
                  />
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 11,
                    opacity: 0.7,
                    marginTop: 6,
                  }}
                >
                  <span>{formatTime(pos)}</span>
                  <span>{formatTime(dur)}</span>
                </div>
              </div>
            </div>

            <button
              onClick={togglePlay}
              style={{
                width: 54,
                height: 54,
                borderRadius: 999,
                border: "none",
                background: "rgba(29,185,84,0.95)",
                color: "#000",
                fontWeight: 900,
                cursor: "pointer",
                flex: "0 0 auto",
                boxShadow: "0 10px 30px rgba(29,185,84,0.25)",
              }}
              aria-label="toggle play"
            >
              {isPlaying ? "❚❚" : "▶"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}