"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type Tab = "home" | "favorites" | "profile";

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
  const [tab, setTab] = useState<Tab>("home");

  const [tracks, setTracks] = useState<Track[]>([]);
  const [query, setQuery] = useState("");

  const [currentTrackId, setCurrentTrackId] = useState<string | null>(null);
  const currentTrack = useMemo(
    () => tracks.find((t) => t.id === currentTrackId) ?? null,
    [tracks, currentTrackId]
  );

  const [isPlaying, setIsPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);

  const [shuffle, setShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<"off" | "all" | "one">("off");

  const audioRef = useRef<HTMLAudioElement>(null);

  // Telegram user
  const tg =
    typeof window !== "undefined" ? (window as any).Telegram?.WebApp : null;
  const user = tg?.initDataUnsafe?.user;

  // userId for favorites: tg:<id> or guest:<random>
  const [userId, setUserId] = useState<string>("");

  // favorites: set of track ids
  const [favIds, setFavIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    tg?.ready?.();
  }, [tg]);

  // Create stable userId (telegram or guest)
  useEffect(() => {
    if (user?.id) {
      setUserId(`tg:${user.id}`);
      return;
    }

    // guest id in localStorage
    if (typeof window !== "undefined") {
      const key = "spotify_mini_guest_id";
      let g = localStorage.getItem(key);
      if (!g) {
        g = `guest:${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
        localStorage.setItem(key, g);
      }
      setUserId(g);
    }
  }, [user?.id]);

  // Load tracks once
  useEffect(() => {
    fetchTracks();
  }, []);

  async function fetchTracks() {
    const { data, error } = await supabase.from("tracks").select("*");
    if (error) {
      console.error("SUPABASE tracks error:", error);
      setTracks([]);
      return;
    }

    const normalized: Track[] = (data ?? []).map((t: any) => ({
      id: String(t.id),
      title: t.title ?? "Unknown title",
      artist: t.artist ?? "Unknown artist",
      audio_url: t.audio_url,
      cover_url: t.cover_url ?? null,
    }));

    setTracks(normalized);

    // если трек ещё не выбран — выберем первый
    if (!currentTrackId && normalized.length > 0) {
      setCurrentTrackId(normalized[0].id);
    }
  }

  // Load favorites when userId appears
  useEffect(() => {
    if (!userId) return;
    fetchFavorites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function fetchFavorites() {
    const { data, error } = await supabase
      .from("favorites")
      .select("track_id")
      .eq("user_id", userId);

    if (error) {
      console.error("SUPABASE favorites error:", error);
      setFavIds(new Set());
      return;
    }

    const next = new Set<string>((data ?? []).map((r: any) => String(r.track_id)));
    setFavIds(next);
  }

  // Derived lists
  const filteredTracks = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tracks;
    return tracks.filter(
      (t) => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q)
    );
  }, [tracks, query]);

  const favoriteTracks = useMemo(() => {
    if (favIds.size === 0) return [];
    return tracks.filter((t) => favIds.has(t.id));
  }, [tracks, favIds]);

  const queue = useMemo(() => {
    // очередность переключения треков:
    // на Home — по поисковой выдаче
    // на Favorites — по избранному
    return tab === "favorites" ? favoriteTracks : filteredTracks;
  }, [tab, favoriteTracks, filteredTracks]);

  const currentIndex = useMemo(() => {
    if (!currentTrackId) return -1;
    return queue.findIndex((t) => t.id === currentTrackId);
  }, [queue, currentTrackId]);

  // Play selected track
  function playTrackById(id: string) {
    setCurrentTrackId(id);
    setTimeout(() => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.load();
      audio.play().then(() => setIsPlaying(true)).catch((e) => console.log("play error", e));
    }, 50);
  }

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().then(() => setIsPlaying(true)).catch((e) => console.log("play error", e));
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }

  function nextTrack() {
    if (queue.length === 0) return;
    const idx = currentIndex >= 0 ? currentIndex : 0;
    const nextIdx = (idx + 1) % queue.length;
    playTrackById(queue[nextIdx].id);
  }

  function prevTrack() {
    if (queue.length === 0) return;
    const idx = currentIndex >= 0 ? currentIndex : 0;
    const prevIdx = (idx - 1 + queue.length) % queue.length;
    playTrackById(queue[prevIdx].id);
  }

  function seekTo(percent: number) {
    const audio = audioRef.current;
    if (!audio || !dur) return;
    const next = Math.max(0, Math.min(dur, percent * dur));
    audio.currentTime = next;
    setPos(next);
  }

  // Favorites toggle
  async function toggleFavorite(trackId: string) {
    if (!userId) return;

    const isFav = favIds.has(trackId);

    // optimistic update
    setFavIds((prev) => {
      const n = new Set(prev);
      if (isFav) n.delete(trackId);
      else n.add(trackId);
      return n;
    });

    if (isFav) {
      const { error } = await supabase
        .from("favorites")
        .delete()
        .eq("user_id", userId)
        .eq("track_id", trackId);

      if (error) {
        console.error("delete favorite error:", error);
        // rollback
        setFavIds((prev) => new Set(prev).add(trackId));
      }
    } else {
      const { error } = await supabase.from("favorites").insert({
        user_id: userId,
        track_id: trackId,
      });

      if (error) {
        console.error("insert favorite error:", error);
        // rollback
        setFavIds((prev) => {
          const n = new Set(prev);
          n.delete(trackId);
          return n;
        });
      }
    }
  }

    const bg =
  "radial-gradient(1200px 600px at 20% -10%, rgba(59,130,246,0.28), transparent 60%), #070A12";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: bg,
        color: "#fff",
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial',
        paddingBottom: currentTrack ? 140 : 90, // место под нижнюю панель
      }}
    >
      {/* Header */}
      <div style={{ padding: 20, position: "sticky", top: 0, zIndex: 5 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>pokoro</div>
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

        {/* Search only on Home */}
        {tab === "home" && (
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
        )}
      </div>

      {/* Content */}
      <div style={{ padding: "0 20px" }}>
        {tab === "home" && (
          <TrackList
            tracks={filteredTracks}
            currentTrackId={currentTrackId}
            favIds={favIds}
            onPlay={(id) => playTrackById(id)}
            onToggleFav={(id) => toggleFavorite(id)}
          />
        )}

        {tab === "favorites" && (
          <>
            <div style={{ fontWeight: 800, marginBottom: 10 }}>Favorites</div>
            <TrackList
              tracks={favoriteTracks}
              currentTrackId={currentTrackId}
              favIds={favIds}
              onPlay={(id) => playTrackById(id)}
              onToggleFav={(id) => toggleFavorite(id)}
            />
          </>
        )}

        {tab === "profile" && (
          <div
            style={{
              padding: 14,
              borderRadius: 16,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.05)",
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 900 }}>Profile</div>
            <div style={{ marginTop: 10, opacity: 0.8 }}>
              <div>
                <b>Имя:</b> {user?.first_name ?? "Гость"}
              </div>
              <div>
                <b>Username:</b> {user?.username ? `@${user.username}` : "нет"}
              </div>
              <div>
                <b>User ID:</b> {userId || "…"}
              </div>
              <div style={{ marginTop: 10 }}>
                <b>Избранное:</b> {favIds.size}
              </div>
            </div>

            <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
              <button
                style={{
                  padding: "12px 14px",
                  borderRadius: 14,
                  border: "none",
                  background: "rgba(29,185,84,0.95)",
                  color: "#000",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
                onClick={() => alert("Сделаем оплату позже (Premium).")}
              >
                Upgrade to Premium
              </button>

              <button
                style={{
                  padding: "12px 14px",
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.06)",
                  color: "#fff",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
                onClick={() => {
                  setFavIds(new Set());
                  alert("Локально очистили список. Если надо — сделаем кнопку 'очистить избранное' в БД.");
                }}
              >
                (debug) Clear favorites in UI
              </button>
            </div>
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
          onEnded={() => {
            setIsPlaying(false);
            nextTrack();
          }}
          autoPlay
        />
      )}

      {/* Bottom Player */}
      {currentTrack && (
        <div
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 64, // чтобы не перекрывал таббар
            padding: 14,
            zIndex: 10,
            background: "linear-gradient(to top, rgba(11,11,11,0.98), rgba(11,11,11,0.86))",
            borderTop: "1px solid rgba(255,255,255,0.08)",
            backdropFilter: "blur(10px)",
          }}
        >
          <div style={{ maxWidth: 820, margin: "0 auto", display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: currentTrack.cover_url
                  ? `url(${currentTrack.cover_url}) center/cover no-repeat`
                  : "linear-gradient(135deg, rgba(29,185,84,0.35), rgba(255,255,255,0.06))",
                flex: "0 0 auto",
              }}
            />

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 900, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {currentTrack.title}
              </div>
              <div style={{ opacity: 0.7, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 2 }}>
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

                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, opacity: 0.7, marginTop: 6 }}>
                  <span>{formatTime(pos)}</span>
                  <span>{formatTime(dur)}</span>
                </div>
              </div>
            </div>

            {/* Controls */}
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button
                onClick={prevTrack}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.06)",
                  color: "#fff",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
                aria-label="prev"
              >
                ⏮
              </button>

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
                  boxShadow: "0 10px 30px rgba(29,185,84,0.25)",
                }}
                aria-label="toggle play"
              >
                {isPlaying ? "❚❚" : "▶"}
              </button>

              <button
                onClick={nextTrack}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.06)",
                  color: "#fff",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
                aria-label="next"
              >
                ⏭
              </button>

              <button
                onClick={() => toggleFavorite(currentTrack.id)}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: favIds.has(currentTrack.id) ? "rgba(29,185,84,0.20)" : "rgba(255,255,255,0.06)",
                  color: "#fff",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
                aria-label="favorite"
                title="Like"
              >
                {favIds.has(currentTrack.id) ? "♥" : "♡"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Tabs */}
      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          height: 64,
          zIndex: 11,
          background: "rgba(11,11,11,0.92)",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          backdropFilter: "blur(10px)",
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
        }}
      >
        <TabButton active={tab === "home"} onClick={() => setTab("home")} label="Home" icon="⌂" />
        <TabButton active={tab === "favorites"} onClick={() => setTab("favorites")} label="Favorites" icon="♥" />
        <TabButton active={tab === "profile"} onClick={() => setTab("profile")} label="Profile" icon="☺" />
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        border: "none",
        background: "transparent",
        color: active ? "rgba(29,185,84,0.95)" : "rgba(255,255,255,0.75)",
        fontWeight: 900,
        cursor: "pointer",
        display: "grid",
        placeItems: "center",
        gap: 2,
        paddingTop: 8,
      }}
    >
      <div style={{ fontSize: 18 }}>{icon}</div>
      <div style={{ fontSize: 11 }}>{label}</div>
    </button>
  );
}

function TrackList({
  tracks,
  currentTrackId,
  favIds,
  onPlay,
  onToggleFav,
}: {
  tracks: Track[];
  currentTrackId: string | null;
  favIds: Set<string>;
  onPlay: (id: string) => void;
  onToggleFav: (id: string) => void;
}) {
  if (tracks.length === 0) {
    return <div style={{ opacity: 0.75, padding: 12 }}>Пусто.</div>;
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {tracks.map((t) => {
        const isActive = currentTrackId === t.id;
        const isFav = favIds.has(t.id);

        return (
          <div
            key={t.id}
            style={{
              padding: 12,
              borderRadius: 16,
              border: isActive ? "1px solid rgba(29,185,84,0.55)" : "1px solid rgba(255,255,255,0.08)",
              background: isActive ? "rgba(29,185,84,0.10)" : "rgba(255,255,255,0.05)",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <button
              onClick={() => onPlay(t.id)}
              style={{
                all: "unset",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 12,
                flex: 1,
                minWidth: 0,
              }}
            >
              <div
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 12,
                  background: t.cover_url
                    ? `url(${t.cover_url}) center/cover no-repeat`
                    : "linear-gradient(135deg, rgba(29,185,84,0.35), rgba(255,255,255,0.06))",
                  flex: "0 0 auto",
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 900, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {t.title}
                </div>
                <div style={{ opacity: 0.7, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 2 }}>
                  {t.artist}
                </div>
              </div>
            </button>

            <button
              onClick={() => onToggleFav(t.id)}
              style={{
                width: 38,
                height: 38,
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.12)",
                background: isFav ? "rgba(29,185,84,0.20)" : "rgba(255,255,255,0.06)",
                color: "#fff",
                fontWeight: 900,
                cursor: "pointer",
                flex: "0 0 auto",
              }}
              aria-label="favorite"
              title="Like"
            >
              {isFav ? "♥" : "♡"}
            </button>
          </div>
        );
      })}
    </div>
  );
}