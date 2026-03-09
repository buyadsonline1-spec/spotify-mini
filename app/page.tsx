"use client";


import { createClient } from "@supabase/supabase-js";
import { useEffect, useMemo, useRef, useState } from "react";

type Tab =
  | "home"
  | "tops"
  | "genres"
  | "favorites"
  | "profile"
  | "playlists"
  | "playlist"
  | "upload";

type Track = {
  id: string;
  title: string;
  artist: string;
  audio_url: string;
  cover_url?: string | null;
  genre?: string | null;
};

type Playlist = {
  id: string;
  name: string;
  cover_url?: string | null;
};

type PopularTrack = Track & {
  plays?: number;
};

type Profile = {
  id: string;
  plan: "free" | "unlimited";
  plays_used: number;
  invite_code: string | null;
  invited_by: string | null;
  referrals_count: number;
};

function formatTime(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function coverBg(cover?: string | null) {
  if (!cover) return "transparent";
  return `url(${cover})`;
}

function bgStyle(cover?: string | null) {
  // фон: картинка + затемняющие градиенты
  return {
    backgroundImage: `
      radial-gradient(1200px 700px at 20% -10%, rgba(59,130,246,0.35), transparent 60%),
      radial-gradient(900px 600px at 90% 10%, rgba(0,0,0,0.65), transparent 55%),
      linear-gradient(to bottom, rgba(7,10,18,0.35), rgba(7,10,18,0.92)),
      ${cover ? coverBg(cover) : "none"}
    `,
    backgroundSize: cover ? "cover" : "auto",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
  } as const;
}

export default function Home() {
  const [tab, setTab] = useState<Tab>("home");

  const [hasStartedPlayback, setHasStartedPlayback] = useState(false);
  const supabase = useMemo(() => {
  if (typeof window === "undefined") return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.error("Supabase env missing");
    return null;
  }

  return createClient(url, key);
}, []);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [showInvitePaywall, setShowInvitePaywall] = useState(false);
  const [popularDay, setPopularDay] = useState<PopularTrack[]>([]);
  const [popularWeek, setPopularWeek] = useState<PopularTrack[]>([]);
  const [popularMonth, setPopularMonth] = useState<PopularTrack[]>([]);
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [topsTab, setTopsTab] = useState<"day" | "week" | "month">("day");
  const [popularLoading, setPopularLoading] = useState(true);
  const [trackMenuOpen, setTrackMenuOpen] = useState(false);
  const [trackMenuTrack, setTrackMenuTrack] = useState<Track | null>(null);
  const [playlistNameDraft, setPlaylistNameDraft] = useState("");
  const [playlistCoverFile, setPlaylistCoverFile] = useState<File | null>(null);
  const [isSavingPlaylist, setIsSavingPlaylist] = useState(false);
  const [openedPlaylist, setOpenedPlaylist] = useState<Playlist | null>(null);
  const [isSeeking, setIsSeeking] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadArtist, setUploadArtist] = useState("");
  const [uploadGenre, setUploadGenre] = useState("");
  const [uploadAudioFile, setUploadAudioFile] = useState<File | null>(null);
  const [uploadCoverFile, setUploadCoverFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);  
  const [tracks, setTracks] = useState<Track[]>([]);
  const [query, setQuery] = useState("");
  const [favQuery, setFavQuery] = useState("");
  const [playsCount, setPlaysCount] = useState(0);
  const [plan, setPlan] = useState<"free" | "unlimited">("free");
  const currentTopTracks = useMemo<Track[]>(() => {
  if (topsTab === "day") return popularDay;
  if (topsTab === "week") return popularWeek;
  return popularMonth;
}, [topsTab, popularDay, popularWeek, popularMonth]);

  // --- persist playsCount + plan ---
  useEffect(() => {
  if (!openedPlaylist) {
    setPlaylistNameDraft("");
    return;
  }
  setPlaylistNameDraft(openedPlaylist.name);
}, [openedPlaylist]);

useEffect(() => {
  if (typeof window === "undefined") return;

  const savedPlays = localStorage.getItem("pokoro_plays_count");
  const savedPlan = localStorage.getItem("pokoro_plan");

  if (savedPlays) setPlaysCount(Number(savedPlays) || 0);
  if (savedPlan === "free" || savedPlan === "unlimited") setPlan(savedPlan);
}, []);


function generateInviteCode(userId: string) {
  const clean = userId.replace(/[^a-zA-Z0-9]/g, "").slice(-6);
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `PKR${clean}${rand}`.slice(0, 12);
}

async function ensureProfile(currentUserId: string) {
  if (!supabase || !currentUserId) return null;

  const { data: existing, error: loadError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", currentUserId)
    .maybeSingle();

  if (loadError) {
    console.error("load profile error:", loadError);
    return null;
  }

  if (existing) {
    setProfile(existing as Profile);
    return existing as Profile;
  }

  const inviteCode = generateInviteCode(currentUserId);

  const { data: created, error: createError } = await supabase
    .from("profiles")
    .insert({
      id: currentUserId,
      plan: "free",
      plays_used: 0,
      invite_code: inviteCode,
      invited_by: null,
      referrals_count: 0,
    })
    .select("*")
    .single();

  if (createError) {
    console.error("create profile error:", createError);
    return null;
  }

  setProfile(created as Profile);
  return created as Profile;
}

async function applyReferral(currentUserId: string) {
  if (!supabase || !currentUserId) return;

  const tg = typeof window !== "undefined" ? (window as any).Telegram?.WebApp : null;
  const startParam = tg?.initDataUnsafe?.start_param as string | undefined;

  if (!startParam || !startParam.startsWith("ref_")) return;

  const inviteCode = startParam.replace("ref_", "").trim();
  if (!inviteCode) return;

  const { data: me, error: meError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", currentUserId)
    .single();

  if (meError || !me) {
    console.error("applyReferral load me error:", meError);
    return;
  }

  if (me.invited_by) return;

  const { data: inviter, error: inviterError } = await supabase
    .from("profiles")
    .select("*")
    .eq("invite_code", inviteCode)
    .maybeSingle();

  if (inviterError || !inviter) {
    console.error("applyReferral inviter error:", inviterError);
    return;
  }

  if (inviter.id === currentUserId) return;

  const nextCount = (inviter.referrals_count ?? 0) + 1;
  const nextPlan = nextCount >= 1 ? "unlimited" : inviter.plan;

  const { error: updateMeError } = await supabase
    .from("profiles")
    .update({ invited_by: inviter.id })
    .eq("id", currentUserId);

  if (updateMeError) {
    console.error("applyReferral update me error:", updateMeError);
    return;
  }

  const { error: updateInviterError } = await supabase
    .from("profiles")
    .update({
      referrals_count: nextCount,
      plan: nextPlan,
    })
    .eq("id", inviter.id);

  if (updateInviterError) {
    console.error("applyReferral update inviter error:", updateInviterError);
    return;
  }

  if (profile?.id === inviter.id) {
    setProfile({
      ...(profile as Profile),
      referrals_count: nextCount,
      plan: nextPlan as "free" | "unlimited",
    });
  }
}



async function canPlayTrack() {
  if (!profile) return true;
  if (profile.plan === "unlimited") return true;
  if (profile.plays_used < 5) return true;

  setShowInvitePaywall(true);
  return false;
}

async function incrementPlayUsage() {
  if (!supabase || !profile) return;
  if (profile.plan === "unlimited") return;

  const next = profile.plays_used + 1;

  const { error } = await supabase
    .from("profiles")
    .update({ plays_used: next })
    .eq("id", profile.id);

  if (error) {
    console.error("incrementPlayUsage error:", error);
    return;
  }

  setProfile({
    ...profile,
    plays_used: next,
  });
}

   async function savePlaylistName() {
  if (!supabase || !openedPlaylist) return;

  const name = playlistNameDraft.trim();
  if (!name) return;
  if (name === openedPlaylist.name) return;

  setIsSavingPlaylist(true);

  const { error } = await supabase
    .from("playlists")
    .update({ name })
    .eq("id", openedPlaylist.id);

  setIsSavingPlaylist(false);

  if (error) {
    console.error("savePlaylistName error:", error);
    
    return;
  }

  const updated = { ...openedPlaylist, name };
  setOpenedPlaylist(updated);

  setPlaylists((prev) =>
    prev.map((p) => (p.id === openedPlaylist.id ? { ...p, name } : p))
  );
}

async function shareInviteLink() {
  if (!profile?.invite_code) return;

  const botUsername = "muzzoffnet_bot";
  const inviteUrl = `https://t.me/${botUsername}?startapp=ref_${profile.invite_code}`;
  const text = `🎵 Заходи в Pokoro по моей ссылке и слушай музыку: ${inviteUrl}`;

  if (
    typeof window !== "undefined" &&
    (window as any).Telegram?.WebApp?.openTelegramLink
  ) {
    (window as any).Telegram.WebApp.openTelegramLink(
      `https://t.me/share/url?url=${encodeURIComponent(inviteUrl)}&text=${encodeURIComponent(text)}`
    );
    return;
  }

  try {
    await navigator.clipboard.writeText(inviteUrl);
    alert("Ссылка-приглашение скопирована");
  } catch {
    alert(inviteUrl);
  }
}


async function loadPopularTracks() {
  setPopularLoading(true);

  if (!supabase) {
  setPopularDay([]);
  setPopularWeek([]);
  setPopularMonth([]);
  setPopularLoading(false);
  return;
}

  const [dayRes, weekRes, monthRes] = await Promise.all([
    supabase.rpc("get_popular_tracks", {
      period: "1 day",
      result_limit: 10,
    }),
    supabase.rpc("get_popular_tracks", {
      period: "7 days",
      result_limit: 10,
    }),
    supabase.rpc("get_popular_tracks", {
      period: "30 days",
      result_limit: 10,
    }),
  ]);

  if (dayRes.error) console.error("popular day error", dayRes.error);
  if (weekRes.error) console.error("popular week error", weekRes.error);
  if (monthRes.error) console.error("popular month error", monthRes.error);

  setPopularDay((dayRes.data as any[]) || []);
  setPopularWeek((weekRes.data as any[]) || []);
  setPopularMonth((monthRes.data as any[]) || []);

  setPopularLoading(false);
}

useEffect(() => {
  loadPopularTracks();
}, []);



function renderPopularSection(title: string, items: PopularTrack[]) {
  return (
    <div style={{ marginTop: 24 }}>
      <div
        style={{
          fontSize: 20,
          fontWeight: 900,
          marginBottom: 12,
          padding: "0 16px",
        }}
      >
        {title}
      </div>

      <div style={{ display: "grid", gap: 10, padding: "0 16px" }}>
        {items.length === 0 ? (
          <div
            style={{
              opacity: 0.6,
              fontSize: 14,
              padding: "10px 0",
            }}
          >
            Пока нет данных
          </div>
        ) : (
          items.map((track) => (
            <div
              key={track.id}
              onClick={() => playTrackById(track.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: 10,
                borderRadius: 16,
                background: "rgba(255,255,255,0.04)",
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 14,
                  background: track.cover_url
                    ? `url(${track.cover_url}) center/cover no-repeat`
                    : "linear-gradient(135deg, rgba(59,130,246,0.35), rgba(255,255,255,0.06))",
                  flex: "0 0 auto",
                }}
              />

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
                  {track.title}
                </div>

                <div
                  style={{
                    opacity: 0.7,
                    fontSize: 12,
                    marginTop: 2,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {track.artist}
                </div>
              </div>

              {typeof track.plays === "number" ? (
                <div
                  style={{
                    fontSize: 12,
                    opacity: 0.6,
                    fontWeight: 700,
                  }}
                >
                  {track.plays}
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}


async function uploadPlaylistCover(file?: File) {
  if (!supabase || !openedPlaylist) return;

  const coverFile = file ?? playlistCoverFile;
  if (!coverFile) return;

  try {
    setIsSavingPlaylist(true);

    const ext = coverFile.name.split(".").pop() || "jpg";
    const path = `playlist-cover/${openedPlaylist.id}-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("playlist-covers")
      .upload(path, coverFile, {
        cacheControl: "3600",
        upsert: true,
      });

    if (uploadError) throw uploadError;

    const {
      data: { publicUrl },
    } = supabase.storage.from("playlist-covers").getPublicUrl(path);

    const { error: updateError } = await supabase
      .from("playlists")
      .update({ cover_url: publicUrl })
      .eq("id", openedPlaylist.id);

    if (updateError) throw updateError;

    const updated = { ...openedPlaylist, cover_url: publicUrl };
    setOpenedPlaylist(updated);

    setPlaylists((prev) =>
      prev.map((p) =>
        p.id === openedPlaylist.id ? { ...p, cover_url: publicUrl } : p
      )
    );

    setPlaylistCoverFile(null);
  } catch (e) {
    console.error("uploadPlaylistCover error:", e);
    alert("Не удалось загрузить обложку");
  } finally {
    setIsSavingPlaylist(false);
  }
}
    

useEffect(() => {
  if (typeof window === "undefined") return;
  localStorage.setItem("pokoro_plays_count", String(playsCount));
}, [playsCount]);

useEffect(() => {
  if (typeof window === "undefined") return;
  localStorage.setItem("pokoro_plan", plan);
}, [plan]);

const [currentTrackId, setCurrentTrackId] = useState<string | null>(null);

const currentTrack = useMemo(
  () => tracks.find((t) => t.id === currentTrackId) ?? null,
  [tracks, currentTrackId]
);

  const [isPlaying, setIsPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);

  // shuffle + repeat (для логики next/prev оставляем; в мини-плеере не показываем)
  const [shuffle, setShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<"off" | "all" | "one">("off");

  // fullscreen player animation
  const [playerMounted, setPlayerMounted] = useState(false);
  const [playerClosing, setPlayerClosing] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);

  // Telegram
  const tg =
    typeof window !== "undefined" ? (window as any).Telegram?.WebApp : null;
  const user = tg?.initDataUnsafe?.user;

  // userId for favorites/playlists: tg:<id> or guest:<random>
  const [userId, setUserId] = useState<string>("");

  useEffect(() => {
  if (!userId) return;

  (async () => {
    const p = await ensureProfile(userId);
    if (!p) return;

    await applyReferral(userId);

    const { data: refreshed, error } = await supabase!
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (!error && refreshed) {
      setProfile(refreshed as Profile);
    }
  })();
}, [userId]);

  // favorites set
  const [favIds, setFavIds] = useState<Set<string>>(new Set());

  // playlists (only in profile)
  const [playlistMenuOpen, setPlaylistMenuOpen] = useState(false);
  const [playlistMenuTrack, setPlaylistMenuTrack] = useState<Track | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);
  const [playlistTrackIds, setPlaylistTrackIds] = useState<Set<string>>(
    new Set()
  );
  const [newPlaylistName, setNewPlaylistName] = useState("");

  // --- INIT TG ---
  useEffect(() => {
    tg?.ready?.();
  }, [tg]);

  // --- stable userId ---
  useEffect(() => {
    if (user?.id) {
      setUserId(`tg:${user.id}`);
      return;
    }
    if (typeof window !== "undefined") {
      const key = "pokoro_guest_id";
      let g = localStorage.getItem(key);
      if (!g) {
        g = `guest:${Math.random().toString(16).slice(2)}${Date.now().toString(
          16
        )}`;
        localStorage.setItem(key, g);
      }
      setUserId(g);
    }
  }, [user?.id]);

  // --- load tracks ---
  useEffect(() => {
    fetchTracks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
  if (!tracks.length) return;
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);
  const trackFromUrl = url.searchParams.get("track");

  if (!trackFromUrl) return;

  const exists = tracks.find((t) => t.id === trackFromUrl);
  if (exists) {
    setCurrentTrackId(trackFromUrl);
  }
}, [tracks]);

 async function fetchTracks() {
  if (!supabase) return;

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
  genre: t.genre ?? null,
}));

  setTracks(normalized);
}



  // --- favorites + playlists ---
  useEffect(() => {
    if (!userId) return;
    fetchFavorites();
    fetchPlaylists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function fetchFavorites() {
    if (!supabase) return;
    const { data, error } = await supabase
      .from("favorites")
      .select("track_id")
      .eq("user_id", userId);

    if (error) {
      console.error("SUPABASE favorites error:", error);
      setFavIds(new Set());
      return;
    }

    setFavIds(new Set((data ?? []).map((r: any) => String(r.track_id))));
  }

  async function toggleFavorite(trackId: string) {
    if (!userId) return;

    const isFav = favIds.has(trackId);

    // optimistic
    setFavIds((prev) => {
      const n = new Set(prev);
      if (isFav) n.delete(trackId);
      else n.add(trackId);
      return n;
    });

    if (isFav) {
      if (!supabase) return;
      const { error } = await supabase
        .from("favorites")
        .delete()
        .eq("user_id", userId)
        .eq("track_id", trackId);

      if (error) {
        console.error("delete favorite error:", error);
        setFavIds((prev) => new Set(prev).add(trackId)); // rollback
      }
    } else {

      if (!supabase) return;
      const { error } = await supabase.from("favorites").insert({
        user_id: userId,
        track_id: trackId,
      });

      if (error) {
        console.error("insert favorite error:", error);
        setFavIds((prev) => {
          const n = new Set(prev);
          n.delete(trackId);
          return n;
        }); // rollback
      }
    }
  }

  async function fetchPlaylists() {
    if (!userId) return;

    // если у тебя НЕТ created_at, просто убери order (ниже уже безопасно без него)
    if (!supabase) return;
    const { data, error } = await supabase
      .from("playlists")
      .select("id,name,cover_url")
      .eq("user_id", userId);

    if (error) {
      console.error("SUPABASE playlists error:", error);
      setPlaylists([]);
      return;
    }

    setPlaylists(
  (data ?? []).map((p: any) => ({
    id: String(p.id),
    name: p.name,
    cover_url: p.cover_url ?? null,
  }))
);
}

  async function handleUploadTrack() {
  if (!supabase) return;

  if (!uploadTitle.trim() || !uploadArtist.trim() || !uploadAudioFile) {
    alert("Заполни title, artist и выбери mp3");
    return;
  }

  try {
    setIsUploading(true);

    const audioExt = uploadAudioFile.name.split(".").pop() || "mp3";
    const audioPath = `audio/${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}.${audioExt}`;

    const { error: audioErr } = await supabase.storage
      .from("tracks")
      .upload(audioPath, uploadAudioFile, {
        cacheControl: "3600",
        upsert: false,
      });

    if (audioErr) throw audioErr;

    const {
      data: { publicUrl: audioUrl },
    } = supabase.storage.from("tracks").getPublicUrl(audioPath);

    let coverUrl: string | null = null;

    if (uploadCoverFile) {
      const coverExt = uploadCoverFile.name.split(".").pop() || "jpg";
      const coverPath = `covers/${Date.now()}-${Math.random()
        .toString(16)
        .slice(2)}.${coverExt}`;

      const { error: coverErr } = await supabase.storage
        .from("covers")
        .upload(coverPath, uploadCoverFile, {
          cacheControl: "3600",
          upsert: false,
        });

      if (coverErr) throw coverErr;

      const {
        data: { publicUrl },
      } = supabase.storage.from("covers").getPublicUrl(coverPath);

      coverUrl = publicUrl;
    }

   const { error: insertErr } = await supabase.from("tracks").insert({
  title: uploadTitle.trim(),
  artist: uploadArtist.trim(),
  genre: uploadGenre.trim() || null,
  audio_url: audioUrl,
  cover_url: coverUrl,
});

    if (insertErr) throw insertErr;

   setUploadTitle("");
    setUploadArtist("");
    setUploadGenre("");
    setUploadAudioFile(null);
    setUploadCoverFile(null);

    await fetchTracks();
    alert("Трек загружен");
  } catch (e: any) {
  console.error("upload track error:", e);
  alert("Ошибка загрузки трека: " + (e?.message || JSON.stringify(e)));

  } finally {
    setIsUploading(false);
  }
}

  async function createPlaylist() {
    const name = newPlaylistName.trim();
    if (!userId || !name) return;

    if (!supabase) return;
    const { data, error } = await supabase
      .from("playlists")
      .insert({ user_id: userId, name })
      .select("id,name,cover_url")
      .single();

    if (error) {
      console.error("create playlist error:", error);
      return;
    }

    setNewPlaylistName("");
    await fetchPlaylists();
    setActivePlaylistId(String(data.id));
  }

  useEffect(() => {
    if (!activePlaylistId) {
      setPlaylistTrackIds(new Set());
      return;
    }
    fetchPlaylistTracks(activePlaylistId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePlaylistId]);

  async function fetchPlaylistTracks(playlistId: string) {

    if (!supabase) return;
    const { data, error } = await supabase
      .from("playlist_tracks")
      .select("track_id")
      .eq("playlist_id", playlistId);

    if (error) {
      console.error("playlist_tracks error:", error);
      setPlaylistTrackIds(new Set());
      return;
    }

    setPlaylistTrackIds(
      new Set((data ?? []).map((r: any) => String(r.track_id)))
    );
  }

async function addToPlaylist(playlistId: string, trackId: string) {
  if (!playlistId) return;

if (!supabase) return;
  const { error } = await supabase.from("playlist_tracks").insert({
    playlist_id: playlistId,
    track_id: trackId,
  });


  if (error) {
     const msg = (error as any)?.message ?? "";
    if (!msg.toLowerCase().includes("duplicate")) {
      console.error("addToPlaylist error:", error);
      return;
    }
  }

  await fetchPlaylistTracks(playlistId);
}

async function removeFromPlaylist(playlistId: string, trackId: string) {
if (!supabase) return;
  const { error } = await supabase
    .from("playlist_tracks")
    .delete()
    .eq("playlist_id", playlistId)
    .eq("track_id", trackId);

  if (error) {
    console.error("removeFromPlaylist error:", error);
    return;
  }

  await fetchPlaylistTracks(playlistId);
}

  // --- lists ---

  const randomTracks = useMemo(() => {
  const arr = [...tracks];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}, [tracks]);

  const filteredTracks = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tracks;
    return tracks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q)
    );
  }, [tracks, query]);

  const favoriteTracks = useMemo(() => {
  const list = tracks.filter((t) => favIds.has(t.id));

  const genres = useMemo(() => {
  const unique = Array.from(
    new Set(
      tracks
        .map((t) => (t.genre || "").trim())
        .filter(Boolean)
    )
  );

  return unique.sort((a, b) => a.localeCompare(b));
}, [tracks]);

const genreTracks = useMemo(() => {
  if (!selectedGenre) return [];
  return tracks.filter((t) => (t.genre || "").trim() === selectedGenre);
}, [tracks, selectedGenre]);

  const q = favQuery.trim().toLowerCase();
  if (!q) return list;

  return list.filter(
    (t) =>
      t.title.toLowerCase().includes(q) ||
      t.artist.toLowerCase().includes(q)
  );
}, [tracks, favIds, favQuery]);

  // --- queue depends on tab (home uses filtered, favorites uses fav list) ---
  const queue = useMemo(() => {
    return tab === "favorites" ? favoriteTracks : filteredTracks;
  }, [tab, favoriteTracks, filteredTracks]);

  const currentIndex = useMemo(() => {
    if (!currentTrackId) return -1;
    return queue.findIndex((t) => t.id === currentTrackId);
  }, [queue, currentTrackId]);

  // --- playback ---
  function setTrack(id: string) {
    setCurrentTrackId(id);
    // ВАЖНО: НЕ запускаем autoplay здесь.
    // Музыка начнет играть только если пользователь нажмет Play/кнопку.
    setIsPlaying(false);
    setPos(0);
    setDur(0);
    setTimeout(() => {
      const a = audioRef.current;
      if (!a) return;
      a.load();
      a.pause();
    }, 0);
  }

  async function registerPlay(trackId: string) {
  if (!supabase) return;

  const { error } = await supabase.from("track_plays").insert({
    track_id: trackId,
  });

  if (error) {
    console.error("registerPlay error", error);
  }
}

async function playTrackById(id: string) {
  const allowed = await canPlayTrack();
  if (!allowed) return;

  
  setHasStartedPlayback(true);
  setPlaysCount((c) => c + 1);
  setCurrentTrackId(id);


  await incrementPlayUsage();
  await registerPlay(id);

  setTimeout(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.load();
    audio
      .play()
      .then(() => setIsPlaying(true))
      .catch((e) => {
        console.log("play blocked:", e);
        setIsPlaying(false);
      });
  }, 50);
}

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      audio
        .play()
        .then(() => setIsPlaying(true))
        .catch((e) => {
          console.log("play blocked:", e);
          setIsPlaying(false);
        });
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }

function seekFromClientX(clientX: number, element: HTMLDivElement) {
  const rect = element.getBoundingClientRect();
  const percent = (clientX - rect.left) / rect.width;
  seekTo(percent);
}

function handleSeekStart(e: any) {
  const el = e.currentTarget as HTMLDivElement;
  if (el.setPointerCapture) {
    el.setPointerCapture(e.pointerId);
  }
  setIsSeeking(true);
  seekFromClientX(e.clientX, el);
}

function handleSeekMove(e: any) {
  if (!isSeeking) return;
  const el = e.currentTarget as HTMLDivElement;
  seekFromClientX(e.clientX, el);
}

function handleSeekEnd() {
  setIsSeeking(false);
}

  function seekTo(percent: number) {
    const audio = audioRef.current;
    if (!audio || !dur) return;
    const next = Math.max(0, Math.min(dur, percent * dur));
    audio.currentTime = next;
    setPos(next);
  }

  function nextTrack() {
    if (queue.length === 0) return;

    if (repeatMode === "one" && currentTrackId) {
      playTrackById(currentTrackId);
      return;
    }

    if (shuffle) {
      const randomIndex = Math.floor(Math.random() * queue.length);
      playTrackById(queue[randomIndex].id);
      return;
    }

    const idx = currentIndex >= 0 ? currentIndex : 0;
    const nextIdx = idx + 1;

    if (nextIdx >= queue.length) {
      if (repeatMode === "all") playTrackById(queue[0].id);
      else setIsPlaying(false);
    } else {
      playTrackById(queue[nextIdx].id);
    }
  }

  function prevTrack() {
    if (queue.length === 0) return;

    if (repeatMode === "one" && currentTrackId) {
      playTrackById(currentTrackId);
      return;
    }

    if (shuffle) {
      const randomIndex = Math.floor(Math.random() * queue.length);
      playTrackById(queue[randomIndex].id);
      return;
    }

    const idx = currentIndex >= 0 ? currentIndex : 0;
    const prevIdx = (idx - 1 + queue.length) % queue.length;
    playTrackById(queue[prevIdx].id);
  }

  async function shareTrack(track: Track) {
  if (typeof window === "undefined") return;

  const shareUrl = `${window.location.origin}${window.location.pathname}?track=${encodeURIComponent(track.id)}`;

  try {
    if (navigator.share) {
      await navigator.share({
        title: `${track.title} — ${track.artist}`,
        text: `Слушай трек ${track.title} — ${track.artist} в pokoro`,
        url: shareUrl,
      });
      return;
    }

    await navigator.clipboard.writeText(shareUrl);
    alert("Ссылка на трек скопирована");
  } catch (e) {
    console.error("share error:", e);

    try {
      await navigator.clipboard.writeText(shareUrl);
      alert("Ссылка на трек скопирована");
    } catch {
      alert(shareUrl);
    }
  }
}

  // --- player open/close animation ---
  function openPlayer() {
    setPlayerMounted(true);
    setPlayerClosing(true);
    requestAnimationFrame(() => setPlayerClosing(false));
  }

  function closePlayer() {
    setPlayerClosing(true);
    setTimeout(() => setPlayerMounted(false), 180);
  }

  function openPlaylistMenu(track: Track) {
  setPlaylistMenuTrack(track);
  setPlaylistMenuOpen(true);
  }

  function closePlaylistMenu() {
  setPlaylistMenuOpen(false);
  setPlaylistMenuTrack(null);
  }

  function openTrackMenu(track: Track) {
  setTrackMenuTrack(track);
  setTrackMenuOpen(true);
}

function closeTrackMenu() {
  setTrackMenuOpen(false);
  setTrackMenuTrack(null);
}

function openCurrentTrackMenu() {
  if (!currentTrack) return;
  openTrackMenu(currentTrack);
}

  function openPlaylist(p: Playlist) {
  setOpenedPlaylist(p);
  setActivePlaylistId(p.id);
  setTab("playlist");
}

    // --- UI helpers (beautiful buttons) ---
  const UI = {
    blue: "rgba(59,130,246,0.95)",
    blueSoft: "rgba(59,130,246,0.18)",
    whiteSoft: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.12)",
    text: "#fff",
    black: "#070A12",
    shadow: "0 12px 40px rgba(59,130,246,0.25)",
  };

  const btnBase: React.CSSProperties = {
    border: UI.border,
    background: UI.whiteSoft,
    color: UI.text,
    fontWeight: 900,
    cursor: "pointer",
    borderRadius: 16,
    padding: "12px 14px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    transition: "transform 120ms ease, background 160ms ease, border-color 160ms ease",
    userSelect: "none",
    WebkitTapHighlightColor: "transparent",
  };

  const btnPrimary: React.CSSProperties = {
    ...btnBase,
    border: "none",
    background: UI.blue,
    color: "#001018",
    boxShadow: UI.shadow,
  };

  const iconBtnBase: React.CSSProperties = {
    width: 46,
    height: 46,
    borderRadius: 999,
    border: UI.border,
    background: UI.whiteSoft,
    color: UI.text,
    fontWeight: 900,
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
    transition: "transform 120ms ease, background 160ms ease, border-color 160ms ease",
    userSelect: "none",
    WebkitTapHighlightColor: "transparent",
  };

  const iconBtnPrimary: React.CSSProperties = {
    ...iconBtnBase,
    width: 56,
    height: 56,
    border: "none",
    background: UI.blue,
    color: "#001018",
    boxShadow: UI.shadow,
  };

  const activeCover = playerMounted ? currentTrack?.cover_url : null;

  // --- UI constants ---


  return (
  <div
    style={{
      minHeight: "100vh",
      color: "#fff",
      fontFamily:
        'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial',
      paddingBottom: currentTrack ? 160 : 90,

      // базовый фон на всякий случай
      background: "#070A12",
      position: "relative",
      overflow: "hidden",

      // твой динамический фон (если используешь bgStyle)
     ...(typeof bgStyle === "function" ? bgStyle(activeCover) : {}),
    }}
  >
    {/* blurred cover layer (всегда СНИЗУ) */}
    {activeCover && (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        backgroundImage:
          typeof coverBg === "function"
            ? coverBg(activeCover)
            : `url(${activeCover})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        filter: "blur(40px) saturate(1.2)",
        transform: "scale(1.15)",
        opacity: 0.35,
        transition: "opacity 350ms ease",
      }}
    />
  )}

    {/* градиент-слой (тоже СНИЗУ) */}
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        background:
          "radial-gradient(1200px 700px at 20% -10%, rgba(59,130,246,0.35), transparent 60%)," +
          "linear-gradient(to bottom, rgba(7,10,18,0.35), rgba(7,10,18,0.92))",
      }}
    />

    {/* ✅ ВСЁ ПРИЛОЖЕНИЕ ТУТ, ПОВЕРХ ФОНА */}
    <div style={{ position: "relative", zIndex: 1 }}>


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
            <div style={{ fontSize: 26, fontWeight: 900 }}>Music Base</div>
            <div style={{ opacity: 0.75, fontSize: 13, marginTop: 2 }}>
              {user ? `Привет, ${user.first_name}` : "Музыка в Telegram"}
            </div>
          </div>

          <button
            onClick={() => setTab("profile")}
            style={{
              width: 42,
              height: 42,
              borderRadius: 999,
              background: "rgba(255,255,255,0.08)",
              display: "grid",
              placeItems: "center",
              fontWeight: 900,
              border: "none",
              color: "#fff",
              cursor: "pointer",
            }}
            title="Profile"
            aria-label="Open profile"
          >
            {user?.first_name?.[0]?.toUpperCase?.() ?? "♪"}
          </button>
        </div>

        {/* Search only on Home */}
        {tab === "home" && (
  <div style={{ marginTop: 14, position: "relative" }}>
    <input
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      placeholder="Поиск трека или артиста…"
      style={{
        width: "100%",
        padding: "12px 44px 12px 14px",
        borderRadius: 16,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.06)",
        color: "#fff",
        outline: "none",
      }}
    />

    {query && (
      <button
        onClick={() => setQuery("")}
        style={{
          position: "absolute",
          right: 10,
          top: "50%",
          transform: "translateY(-50%)",
          width: 28,
          height: 28,
          borderRadius: 999,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(255,255,255,0.08)",
          color: "#fff",
          cursor: "pointer",
          fontWeight: 900,
          display: "grid",
          placeItems: "center",
          padding: 0,
        }}
        aria-label="Очистить поиск"
        title="Очистить поиск"
      >
        ✕
      </button>
    )}
  </div>
)}
      </div>

       {/* Content */}
<div style={{ padding: "0 16px", width: "100%", boxSizing: "border-box" }}>
  {tab === "home" && (
  <div style={{ paddingBottom: currentTrack && hasStartedPlayback ? 110 : 24 }}>
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 12,
        marginBottom: 18,
      }}
    >
      <button
        onClick={() => setTab("tops")}
        style={{
          padding: "16px 14px",
          borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(255,255,255,0.06)",
          color: "#fff",
          fontWeight: 900,
          cursor: "pointer",
          fontSize: 16,
        }}
      >
        Топы
      </button>

      <button
        onClick={() => setTab("genres")}
        style={{
          padding: "16px 14px",
          borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(255,255,255,0.06)",
          color: "#fff",
          fontWeight: 900,
          cursor: "pointer",
          fontSize: 16,
        }}
      >
        Жанры
      </button>
    </div>

    <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 14 }}>
      Случайные треки
    </div>

    <TrackList
      tracks={randomTracks}
      currentTrackId={currentTrackId}
      favIds={favIds}
      onPlay={(id) => playTrackById(id)}
      onOpenTrackMenu={(track) => openTrackMenu(track)}
    />

    
  </div>
)}

  
 {tab === "tops" && (
  <div style={{ paddingBottom: currentTrack && hasStartedPlayback ? 110 : 24 }}>
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "96px 1fr 96px",
        alignItems: "center",
        gap: 10,
        marginBottom: 16,
        width: "100%",
        minWidth: 0,
      }}
    >
      <button
        onClick={() => {
          if (topsTab === "day") {
            setTab("home");
          } else if (topsTab === "week") {
            setTopsTab("day");
          } else {
            setTopsTab("week");
          }
        }}
        style={{
          height: 42,
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(255,255,255,0.06)",
          color: "#fff",
          cursor: "pointer",
          fontWeight: 900,
          fontSize: 13,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          whiteSpace: "nowrap",
          padding: "0 10px",
          minWidth: 0,
        }}
      >
        <span style={{ fontSize: 16, lineHeight: 1 }}>←</span>
        <span>
          {topsTab === "day"
            ? "Назад"
            : topsTab === "week"
            ? "День"
            : "Неделя"}
        </span>
      </button>

      <div
        style={{
          fontSize: 18,
          fontWeight: 900,
          textAlign: "center",
          lineHeight: 1.2,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          minWidth: 0,
        }}
      >
        {topsTab === "day"
          ? "Топ за день"
          : topsTab === "week"
          ? "Топ за неделю"
          : "Топ за месяц"}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", minWidth: 0 }}>
        {topsTab !== "month" ? (
          <button
            onClick={() => {
              if (topsTab === "day") setTopsTab("week");
              else if (topsTab === "week") setTopsTab("month");
            }}
            style={{
              width: 96,
              height: 42,
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.06)",
              color: "#fff",
              cursor: "pointer",
              fontWeight: 900,
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              whiteSpace: "nowrap",
              padding: "0 10px",
              flexShrink: 0,
            }}
          >
            <span>{topsTab === "day" ? "Неделя" : "Месяц"}</span>
            <span style={{ fontSize: 16, lineHeight: 1 }}>→</span>
          </button>
        ) : (
          <div style={{ width: 96, flexShrink: 0 }} />
        )}
      </div>
    </div>

    {popularLoading ? (
      <div style={{ padding: 16, opacity: 0.7 }}>
        Загрузка популярных треков...
      </div>
    ) : currentTopTracks.length === 0 ? (
      <div
        style={{
          padding: 16,
          borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(255,255,255,0.04)",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 8 }}>
          Пока нет данных
        </div>

        <div style={{ opacity: 0.75, marginBottom: 14, lineHeight: 1.5 }}>
          Стань первым — запусти трек и попади в топ.
        </div>

        <button
          onClick={() => setTab("home")}
          style={{
            padding: "12px 14px",
            borderRadius: 16,
            border: "none",
            background: "rgba(59,130,246,0.95)",
            color: "#000",
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          Случайные треки
        </button>
      </div>
    ) : (
      <div style={{ width: "100%", minWidth: 0 }}>
        <TrackList
          tracks={currentTopTracks}
          currentTrackId={currentTrackId}
          favIds={favIds}
          onPlay={(id) => playTrackById(id)}
          onOpenTrackMenu={(track) => openTrackMenu(track)}
        />
      </div>
    )}
  </div>
)}


{tab === "genres" && (
  <div
    style={{
      padding: 16,
      borderRadius: 18,
      border: "1px solid rgba(255,255,255,0.08)",
      background: "rgba(255,255,255,0.05)",
    }}
  >
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        marginBottom: 14,
      }}
    >
      <button
        onClick={() => {
          if (selectedGenre) {
            setSelectedGenre(null);
          } else {
            setTab("home");
          }
        }}
        style={{
          padding: "10px 12px",
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(255,255,255,0.06)",
          color: "#fff",
          cursor: "pointer",
          fontWeight: 900,
        }}
      >
        ← Назад
      </button>

      <div
        style={{
          fontSize: 18,
          fontWeight: 900,
          textAlign: "center",
          minWidth: 0,
          flex: 1,
        }}
      >
        {selectedGenre ? selectedGenre : "Жанры"}
      </div>

      <div style={{ width: 72 }} />
    </div>

    {!selectedGenre ? (
      genres.length === 0 ? (
        <div style={{ opacity: 0.7, padding: 12 }}>
          Пока нет жанров. Добавь поле genre у треков в базе.
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
          }}
        >
          {genres.map((genre) => (
            <button
              key={genre}
              onClick={() => setSelectedGenre(genre)}
              style={{
                padding: "16px 14px",
                borderRadius: 18,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.06)",
                color: "#fff",
                fontWeight: 900,
                cursor: "pointer",
                fontSize: 15,
                textAlign: "left",
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 900 }}>{genre}</div>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                {tracks.filter((t) => (t.genre || "").trim() === genre).length} треков
              </div>
            </button>
          ))}
        </div>
      )
    ) : genreTracks.length === 0 ? (
      <div style={{ opacity: 0.7, padding: 12 }}>
        В этом жанре пока нет треков.
      </div>
    ) : (
      <TrackList
        tracks={genreTracks}
        currentTrackId={currentTrackId}
        favIds={favIds}
        onPlay={(id) => playTrackById(id)}
        onOpenTrackMenu={(track) => openTrackMenu(track)}
      />
    )}
  </div>
)}


 {tab === "favorites" && (
  <>
    <div
      style={{
        fontWeight: 900,
        fontSize: 20,
        marginBottom: 12,
      }}
    >
      Favorites ({favIds.size})
    </div>

  <div style={{ position: "relative", marginBottom: 14 }}>
  <input
    value={favQuery}
    onChange={(e) => setFavQuery(e.target.value)}
    placeholder="Поиск по избранным..."
    style={{
      width: "100%",
      padding: "12px 44px 12px 14px",
      borderRadius: 16,
      border: "1px solid rgba(255,255,255,0.10)",
      background: "rgba(255,255,255,0.06)",
      color: "#fff",
      outline: "none",
    }}
  />

  {favQuery && (
    <button
      onClick={() => setFavQuery("")}
      style={{
        position: "absolute",
        right: 10,
        top: "50%",
        transform: "translateY(-50%)",
        width: 28,
        height: 28,
        borderRadius: 999,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.08)",
        color: "#fff",
        cursor: "pointer",
        fontWeight: 900,
        display: "grid",
        placeItems: "center",
        padding: 0,
      }}
      aria-label="Очистить поиск"
      title="Очистить поиск"
    >
      ✕
    </button>
  )}
</div>

    {favoriteTracks.length === 0 ? (
      <div style={{ opacity: 0.7, padding: 12 }}>
        Нет избранных треков. Нажми ♥ у трека чтобы сохранить.
      </div>
    ) : (
      <TrackList
        tracks={favoriteTracks}
        currentTrackId={currentTrackId}
        favIds={favIds}
        onPlay={(id) => playTrackById(id)}
        onOpenTrackMenu={(track) => openTrackMenu(track)}
      />
    )}
  </>
)}
    

        {tab === "profile" && (
          <div
            style={{
              padding: 16,
              borderRadius: 18,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.05)",
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 900 }}>Profile</div>

            <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    padding: 14,
                    borderRadius: 18,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(255,255,255,0.06)",
                  }}
                >
                  <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>
                    Username
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 900 }}>
                    {user?.username ? `@${user.username}` : "нет"}
                  </div>
                </div>

                <div
                  style={{
                    padding: 14,
                    borderRadius: 18,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(255,255,255,0.06)",
                  }}
                >
                  <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>
                    Прослушано треков
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1 }}>
                    {playsCount}
                  </div>
                </div>
              </div>

              <div
              style={{
                padding: 14,
                borderRadius: 18,
                border: "1px solid rgba(59,130,246,0.30)",
                background:
                  "radial-gradient(500px 180px at 20% 0%, rgba(59,130,246,0.25), rgba(255,255,255,0.04))",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>
                    Подписка
                  </div>

                  <div style={{ fontSize: 16, fontWeight: 900 }}>
                    {profile?.plan === "unlimited" ? "Unlimited ✅" : "Free"}
                  </div>

                  <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
                    {profile?.plan === "unlimited"
                      ? `Ты пригласил ${profile.referrals_count} друга`
                      : `Прослушано: ${profile?.plays_used ?? 0} / 5`}
                  </div>

                  {profile?.plan !== "unlimited" && (
                    <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
                      Пригласи 1 друга и получи безлимит
                    </div>
                  )}
                </div>

                {profile?.plan !== "unlimited" ? (
                  <button
                    onClick={shareInviteLink}
                    style={{
                      padding: "12px 14px",
                      borderRadius: 16,
                      border: "none",
                      background: "rgba(59,130,246,0.95)",
                      color: "#000",
                      fontWeight: 900,
                      cursor: "pointer",
                      boxShadow: "0 12px 30px rgba(59,130,246,0.25)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Пригласить
                  </button>
                ) : (
                  <div
                    style={{
                      padding: "12px 14px",
                      borderRadius: 16,
                      background: "rgba(255,255,255,0.08)",
                      fontWeight: 900,
                    }}
                  >
                    Активно
                  </div>
                )}
              </div>
            </div>

              <div style={{ display: "grid", gap: 12 }}>
                <button
                  onClick={() => setTab("playlists")}
                  style={{
                    textAlign: "left",
                    padding: 16,
                    borderRadius: 18,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(255,255,255,0.06)",
                    color: "#fff",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontSize: 16, fontWeight: 900 }}>Playlists</div>
                  <div style={{ opacity: 0.7, fontSize: 13, marginTop: 4 }}>
                    Открыть и управлять плейлистами
                  </div>
                </button>

                <button
                  onClick={() => setTab("upload")}
                  style={{
                    textAlign: "left",
                    padding: 16,
                    borderRadius: 18,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(255,255,255,0.06)",
                    color: "#fff",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontSize: 16, fontWeight: 900 }}>Upload</div>
                  <div style={{ opacity: 0.7, fontSize: 13, marginTop: 4 }}>
                    Загрузить новый трек и обложку
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}

        {tab === "playlists" && (
          <div
            style={{
              padding: 16,
              borderRadius: 18,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.05)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                marginBottom: 14,
              }}
            >
              <button
                onClick={() => setTab("profile")}
                style={{
                  padding: "10px 12px",
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.06)",
                  color: "#fff",
                  cursor: "pointer",
                  fontWeight: 900,
                }}
              >
                ← Назад
              </button>

              <div style={{ fontSize: 18, fontWeight: 900 }}>Playlists</div>
              <div style={{ width: 72 }} />
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <input
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                placeholder="Новый плейлист…"
                style={{
                  flex: 1,
                  padding: "12px 14px",
                  borderRadius: 16,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.06)",
                  color: "#fff",
                  outline: "none",
                }}
              />
              <Btn variant="primary" onClick={createPlaylist}>
                + Create
              </Btn>
            </div>

            <div style={{ display: "grid", gap: 14, marginTop: 16 }}>
              {playlists.length === 0 ? (
                <div style={{ opacity: 0.7 }}>У тебя пока нет плейлистов</div>
              ) : (
                playlists.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => openPlaylist(p)}
                    style={{
                      display: "flex",
                      gap: 14,
                      padding: 12,
                      borderRadius: 18,
                      border: "1px solid rgba(255,255,255,0.08)",
                      background: "rgba(255,255,255,0.04)",
                      alignItems: "center",
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        width: 64,
                        height: 64,
                        borderRadius: 12,
                        background: p.cover_url
                          ? `url(${p.cover_url}) center/cover no-repeat`
                          : "rgba(255,255,255,0.08)",
                        display: "grid",
                        placeItems: "center",
                        fontSize: 20,
                        opacity: 0.8,
                        overflow: "hidden",
                      }}
                    >
                      {!p.cover_url ? "♪" : ""}
                    </div>

                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 900 }}>{p.name}</div>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>
                        Открыть плейлист
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {tab === "playlist" && openedPlaylist && (
          <div
            style={{
              padding: 16,
              borderRadius: 18,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.05)",
            }}
          >
            <button
              onClick={() => setTab("playlists")}
              style={{
                width: 38,
                height: 38,
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.06)",
                color: "#fff",
                cursor: "pointer",
                fontWeight: 900,
                marginBottom: 14,
              }}
            >
              ←
            </button>

           <div
  style={{
    display: "grid",
    gridTemplateColumns: "110px 1fr",
    gap: 16,
    alignItems: "start",
    marginBottom: 18,
  }}
>
  {/* cover */}
  <label
  style={{
    width: 92,
    height: 92,
    borderRadius: 16,
    background: openedPlaylist.cover_url
      ? `url(${openedPlaylist.cover_url}) center/cover no-repeat`
      : "rgba(255,255,255,0.08)",
    display: "flex",

    alignItems: "center",
    justifyContent: "center",

    cursor: "pointer",
    overflow: "hidden",
    border: "1px solid rgba(255,255,255,0.08)",
    position: "relative",
  }}
>
  {!openedPlaylist.cover_url && (
    <div
      style={{
        fontSize: 28,
        fontWeight: 700,
        opacity: 0.7,
      }}
    >
      +
    </div>
  )}

  <input
    type="file"
    accept="image/*"
    style={{ display: "none" }}
    onChange={(e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setPlaylistCoverFile(file);
      uploadPlaylistCover(file);
    }}
  />
</label>

  {/* right side */}
  <div style={{ minWidth: 0 }}>
    <input
      value={playlistNameDraft}
      onChange={(e) => setPlaylistNameDraft(e.target.value)}
      onKeyDown={(e) => {
  if (e.key === "Enter") {
    savePlaylistName();
  }
}}
      placeholder="Название плейлиста"
      style={{
        width: "100%",
        padding: "12px 14px",
        borderRadius: 16,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.06)",
        color: "#fff",
        outline: "none",
        fontSize: 18,
        fontWeight: 900,
      }}
    />

    <div style={{ opacity: 0.7, marginTop: 8 }}>
      {tracks.filter((t) => playlistTrackIds.has(t.id)).length} tracks
    </div>

    {/* row 1 */}
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 10,
        marginTop: 12,
      }}
    >
  
  
    </div>

    {/* row 2 */}
    <div
  style={{
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
    marginTop: 12,
  }}
>
  <button
    onClick={() => {
      const playlistTracks = tracks.filter((t) =>
        playlistTrackIds.has(t.id)
      );
      if (!playlistTracks.length) return;
      playTrackById(playlistTracks[0].id);
    }}
    style={{
      padding: "10px 8px",
      borderRadius: 14,
      border: "none",
      background: "rgba(59,130,246,0.95)",
      color: "#000",
      fontWeight: 900,
      cursor: "pointer",
      minHeight: 42,
      fontSize: 14,
      lineHeight: 1.1,
    }}
  >
    ▶ Play
  </button>

  <button
    onClick={() => {
      const playlistTracks = tracks.filter((t) =>
        playlistTrackIds.has(t.id)
      );
      if (!playlistTracks.length) return;

      const random =
        playlistTracks[
          Math.floor(Math.random() * playlistTracks.length)
        ];

      playTrackById(random.id);
    }}
    style={{
      padding: "10px 8px",
      borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.12)",
      background: "rgba(255,255,255,0.06)",
      color: "#fff",
      fontWeight: 900,
      cursor: "pointer",
      minHeight: 42,
      fontSize: 14,
      lineHeight: 1.1,
    }}
  >
    🔀 Shuffle
  </button>
</div>
  </div>
</div>
            <TrackList
              tracks={tracks.filter((t) => playlistTrackIds.has(t.id))}
              currentTrackId={currentTrackId}
              favIds={favIds}
              onPlay={(id) => playTrackById(id)}        
              onOpenTrackMenu={(track) => openTrackMenu(track)}
            />
          </div>
        )}

        {tab === "upload" && (
          <div
            style={{
              padding: 16,
              borderRadius: 18,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.05)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                marginBottom: 14,
              }}
            >
              <button
                onClick={() => setTab("profile")}
                style={{
                  padding: "10px 12px",
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.06)",
                  color: "#fff",
                  cursor: "pointer",
                  fontWeight: 900,
                }}
              >
                ← Назад
              </button>

              <div style={{ fontSize: 18, fontWeight: 900 }}>Upload</div>
              <div style={{ width: 72 }} />
            </div>

            <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
              <input
                value={uploadTitle}
                onChange={(e) => setUploadTitle(e.target.value)}
                placeholder="Название трека"
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: 16,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.06)",
                  color: "#fff",
                  outline: "none",
                }}
              />

              <input
                value={uploadArtist}
                onChange={(e) => setUploadArtist(e.target.value)}
                placeholder="Исполнитель"
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: 16,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.06)",
                  color: "#fff",
                  outline: "none",
                }}
              />

              <input
                value={uploadGenre}
                onChange={(e) => setUploadGenre(e.target.value)}
                placeholder="Жанр"
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: 16,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.06)",
                  color: "#fff",
                  outline: "none",
                }}
              />

              <label
                style={{
                  padding: "12px 14px",
                  borderRadius: 16,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.06)",
                  cursor: "pointer",
                }}
              >
                {uploadAudioFile ? `MP3: ${uploadAudioFile.name}` : "Выбрать mp3"}
                <input
                  type="file"
                  accept="audio/mpeg,audio/mp3"
                  style={{ display: "none" }}
                  onChange={(e) => setUploadAudioFile(e.target.files?.[0] ?? null)}
                />
              </label>

              <label
                style={{
                  padding: "12px 14px",
                  borderRadius: 16,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.06)",
                  cursor: "pointer",
                }}
              >
                {uploadCoverFile
                  ? `Cover: ${uploadCoverFile.name}`
                  : "Выбрать обложку (необязательно)"}
                <input
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setPlaylistCoverFile(file);
                      uploadPlaylistCover(file);
                    }}
                  />
              </label>

              <Btn
                variant="primary"
                onClick={handleUploadTrack}
                disabled={isUploading}
                style={{ width: "100%" }}
              >
                {isUploading ? "Загрузка..." : "Upload"}
              </Btn>
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
          // ВАЖНО: нет autoPlay
        />
      )}

      {/* Bottom mini-player (click opens fullscreen) */}
      {currentTrack && hasStartedPlayback && (
        <div
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 64,
            padding: 14,
            zIndex: 10,
            background:
              "linear-gradient(to top, rgba(7,10,18,0.98), rgba(7,10,18,0.86))",
            borderTop: "1px solid rgba(255,255,255,0.08)",
            backdropFilter: "blur(10px)",
          }}
        >
          <div
            onClick={openPlayer}
            style={{
              maxWidth: 820,
              margin: "0 auto",
              display: "flex",
              alignItems: "center",
              gap: 12,
              cursor: "pointer",
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: currentTrack.cover_url
                  ? `url(${currentTrack.cover_url}) center/cover no-repeat`
                  : "linear-gradient(135deg, rgba(59,130,246,0.35), rgba(255,255,255,0.06))",
                flex: "0 0 auto",
              }}
            />

            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontWeight: 900,
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
      
      
          
            
            </div>

            {/* Controls (NO shuffle/repeat here) */}
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <IconBtn onClick={(e) => { e.stopPropagation(); prevTrack(); }}>
  ⏮
</IconBtn>

              <IconBtn
  primary
  onClick={(e) => { e.stopPropagation(); togglePlay(); }}
  style={{ width: 64, height: 64 }}
>
  {isPlaying ? "❚❚" : "▶"}
</IconBtn>

              <IconBtn onClick={(e) => { e.stopPropagation(); nextTrack(); }}>
  ⏭
</IconBtn>

              <IconBtn
  active={favIds.has(currentTrack.id)}
  onClick={(e) => { e.stopPropagation(); toggleFavorite(currentTrack.id); }}
>
  {favIds.has(currentTrack.id) ? "♥" : "♡"}
</IconBtn>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen player overlay (animated slide-up) */}
      {currentTrack && playerMounted && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
          }}
        >

          {/* Blurred cover background (Spotify-like) */}
{currentTrack?.cover_url && (
  <div
    style={{
      position: "absolute",
      inset: 0,
      backgroundImage: `url(${currentTrack.cover_url})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      filter: "blur(18px)",
      transform: "scale(1.2)",
      opacity: 0.35,
      zIndex: 0,
    }}
  />
)}

{/* Dark overlay over blurred background */}
<div
  style={{
    position: "absolute",
    inset: 0,
    background:
      "linear-gradient(to bottom, rgba(7,10,18,0.55), rgba(7,10,18,0.92))",
    zIndex: 0,
  }}
/>
          {/* Dim background */}
          <div
            onClick={closePlayer}
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0,0,0,0.55)",
              opacity: playerClosing ? 0 : 1,
              transition: "opacity 180ms ease-out",
              zIndex: 1,
            }}
          />

          {/* Sliding sheet */}
          <div
            style={{
              position: "relative",
              zIndex: 2,
              height: "100%",
              background:
                "radial-gradient(900px 500px at 20% 0%, rgba(59,130,246,0.25), transparent 60%), #070A12",
              color: "#fff",
              padding: 20,
              display: "flex",
              flexDirection: "column",
              transform: playerClosing ? "translateY(100%)" : "translateY(0%)",
              transition: "transform 180ms ease-out",
              willChange: "transform",
            }}
          >
            {/* Top bar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <button
              onClick={closePlayer}
              style={{
                border: "none",
                background: "rgba(255,255,255,0.08)",
                color: "#fff",
                width: 44,
                height: 44,
                borderRadius: 999,
                cursor: "pointer",
                fontWeight: 900,
              }}
              aria-label="Close player"
            >
              ✕
            </button>

            <div
              style={{
                fontWeight: 900,
                opacity: 0.9,
                flex: 1,
                textAlign: "center",
              }}
            >
              Now Playing
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={openCurrentTrackMenu}
                style={{
                  border: "none",
                  background: "rgba(255,255,255,0.08)",
                  color: "#fff",
                  width: 44,
                  height: 44,
                  borderRadius: 999,
                  cursor: "pointer",
                  fontWeight: 900,
                }}
                aria-label="Track menu"
                title="Меню трека"
              >
                ⋯
              </button>
            </div>
          </div>

            {/* Cover */}
            <div style={{ marginTop: 22, display: "grid", placeItems: "center" }}>
              <div
                style={{
                  width: "min(320px, 78vw)",
                  height: "min(320px, 78vw)",
                  borderRadius: 24,
                  background: currentTrack.cover_url
                    ? `url(${currentTrack.cover_url}) center/cover no-repeat`
                    : "linear-gradient(135deg, rgba(59,130,246,0.35), rgba(255,255,255,0.06))",
                  boxShadow: "0 25px 80px rgba(0,0,0,0.45)",
                }}
              />
            </div>

            {/* Title */}
            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1.2 }}>
                {currentTrack.title}
              </div>
              <div style={{ opacity: 0.75, marginTop: 6, fontSize: 14 }}>
                {currentTrack.artist}
              </div>
            </div>
          
           {/* Progress */}
          <div style={{ marginTop: 18 }}>
            <div
              onPointerDown={handleSeekStart}
              onPointerMove={handleSeekMove}
              onPointerUp={handleSeekEnd}
              onPointerCancel={handleSeekEnd}
              style={{
                height: 10,
                borderRadius: 999,
                background: "rgba(255,255,255,0.10)",
                overflow: "hidden",
                cursor: "pointer",
                touchAction: "none",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: dur ? `${(pos / dur) * 100}%` : "0%",
                  background: "rgba(59,130,246,0.95)",
                  borderRadius: 999,
                  transition: isSeeking ? "none" : "width 120ms linear",
                }}
              />
            </div>


            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 12,
                opacity: 0.75,
                marginTop: 8,
              }}
            >
              <span>{formatTime(pos)}</span>
              <span>{formatTime(dur)}</span>
            </div>
          </div>

            {/* Controls (fullscreen can keep shuffle/repeat) */}
            <div
              style={{
                marginTop: 22,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <IconBtn active={shuffle} onClick={() => setShuffle((s) => !s)}>
  🔀
</IconBtn>

              <IconBtn onClick={prevTrack} style={{ width: 62, height: 62 }}>
  ⏮
</IconBtn>

              <IconBtn primary onClick={togglePlay} style={{ width: 92, height: 92, fontSize: 22 }}>
  {isPlaying ? "❚❚" : "▶"}
</IconBtn>

              <IconBtn onClick={nextTrack} style={{ width: 62, height: 62 }}>
  ⏭
</IconBtn>

              <IconBtn
  active={repeatMode !== "off"}
  onClick={() => setRepeatMode((m) => (m === "off" ? "all" : m === "all" ? "one" : "off"))}
>
  {repeatMode === "one" ? "🔂" : "🔁"}
</IconBtn>
            </div>

            <div style={{ flex: 1 }} />

            <div
              style={{
                textAlign: "center",
                opacity: 0.55,
                fontSize: 12,
                paddingBottom: 10,
              }}
            >
              Нажми ✕ или тап по фону чтобы закрыть
            </div>
          </div>
        </div>
      )}

      {trackMenuOpen && trackMenuTrack && (
  <div
    onClick={closeTrackMenu}
    style={{
      position: "fixed",
      inset: 0,
      zIndex: 70,
      background: "rgba(0,0,0,0.55)",
      display: "flex",
      alignItems: "flex-end",
    }}
  >
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        width: "100%",
        padding: 16,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        background: "rgba(7,10,18,0.98)",
        borderTop: "1px solid rgba(255,255,255,0.10)",
      }}
    >
      <div style={{ fontWeight: 900, marginBottom: 12 }}>
        {trackMenuTrack.title}
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        <button
          onClick={() => {
            toggleFavorite(trackMenuTrack.id);
            closeTrackMenu();
          }}
          style={{
            textAlign: "left",
            padding: 14,
            borderRadius: 16,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.06)",
            color: "#fff",
            cursor: "pointer",
            fontWeight: 900,
          }}
        >
          {favIds.has(trackMenuTrack.id)
            ? "Удалить из избранного"
            : "Сохранить в избранные"}
        </button>

        <button
          onClick={() => {
            closeTrackMenu();
            openPlaylistMenu(trackMenuTrack);
          }}
          style={{
            textAlign: "left",
            padding: 14,
            borderRadius: 16,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.06)",
            color: "#fff",
            cursor: "pointer",
            fontWeight: 900,
          }}
        >
          Добавить в плейлист
        </button>

        <button
          onClick={async () => {
            await shareTrack(trackMenuTrack);
            closeTrackMenu();
          }}
          style={{
            textAlign: "left",
            padding: 14,
            borderRadius: 16,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.06)",
            color: "#fff",
            cursor: "pointer",
            fontWeight: 900,
          }}
        >
          Поделиться
        </button>
      </div>

      <button
        onClick={closeTrackMenu}
        style={{
          marginTop: 12,
          width: "100%",
          padding: 12,
          borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "transparent",
          color: "#fff",
          cursor: "pointer",
          fontWeight: 900,
        }}
      >
        Закрыть
      </button>
    </div>
  </div>
)}

      {/* Playlist menu modal */}
{playlistMenuOpen && playlistMenuTrack && (
  <div
    onClick={closePlaylistMenu}
    style={{
      position: "fixed",
      inset: 0,
      zIndex: 60,
      background: "rgba(0,0,0,0.55)",
      display: "flex",
      alignItems: "flex-end",
    }}
  >
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        width: "100%",
        padding: 16,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        background: "rgba(7,10,18,0.98)",
        borderTop: "1px solid rgba(255,255,255,0.10)",
      }}
    >
      <div style={{ fontWeight: 900, marginBottom: 10 }}>
        Добавить в плейлист
      </div>

      {playlists.length === 0 ? (
        <div style={{ opacity: 0.75 }}>Сначала создай плейлист в Profile.</div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {playlists.map((p) => (
            <button
              key={p.id}
              onClick={async () => {
                await addToPlaylist(p.id, playlistMenuTrack.id);
                setActivePlaylistId(p.id);
                closePlaylistMenu();
              }}
              style={{
                textAlign: "left",
                padding: 12,
                borderRadius: 16,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.06)",
                color: "#fff",
                cursor: "pointer",
                fontWeight: 900,
              }}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      <button
        onClick={closePlaylistMenu}
        style={{
          marginTop: 12,
          width: "100%",
          padding: 12,
          borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "transparent",
          color: "#fff",
          cursor: "pointer",
          fontWeight: 900,
        }}
      >
        Закрыть
      </button>
    </div>
  </div>
)}

      {showInvitePaywall && (
        <div
          onClick={() => setShowInvitePaywall(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 80,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "flex-end",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              padding: 16,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              background: "rgba(7,10,18,0.98)",
              borderTop: "1px solid rgba(255,255,255,0.10)",
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 10 }}>
              Лимит исчерпан
            </div>

            <div style={{ opacity: 0.8, marginBottom: 14, lineHeight: 1.5 }}>
              Ты использовал 5 из 5 прослушиваний.
              Пригласи 1 друга в Pokoro и открой Unlimited.
            </div>

            <div style={{ opacity: 0.7, marginBottom: 14 }}>
              Прогресс: {profile?.referrals_count ?? 0} / 1
            </div>

            <button
              onClick={shareInviteLink}
              style={{
                width: "100%",
                padding: 14,
                borderRadius: 16,
                border: "none",
                background: "rgba(59,130,246,0.95)",
                color: "#000",
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              Пригласить друга
            </button>

            <button
              onClick={() => setShowInvitePaywall(false)}
              style={{
                marginTop: 10,
                width: "100%",
                padding: 12,
                borderRadius: 16,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "transparent",
                color: "#fff",
                cursor: "pointer",
                fontWeight: 900,
              }}
            >
              Закрыть
            </button>
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
          background: "rgba(7,10,18,0.92)",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          backdropFilter: "blur(10px)",
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
        }}
      >
        <TabButton
          active={tab === "home"}
          onClick={() => setTab("home")}
          label="Home"
          icon="⌂"
        />
        <TabButton
          active={tab === "favorites"}
          onClick={() => setTab("favorites")}
          label="Favorites"
          icon="♥"
        />
        <TabButton
          active={tab === "profile"}
          onClick={() => setTab("profile")}
          label="Profile"
          icon="☺"
        />
      </div>
    </div>
    </div>
  );
}

function Btn({
  children,
  onClick,
  variant = "ghost",
  style,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost";
}) {
  const base: React.CSSProperties = {
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.08)",
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
    borderRadius: 16,
    padding: "12px 14px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    transition: "transform 120ms ease, background 160ms ease, border-color 160ms ease",
    userSelect: "none",
    WebkitTapHighlightColor: "transparent",
  };

  const primary: React.CSSProperties = {
    ...base,
    border: "none",
    background: "rgba(59,130,246,0.95)",
    color: "#001018",
    boxShadow: "0 12px 40px rgba(59,130,246,0.25)",
  };

  return (
    
    <button
      onClick={onClick}
      style={{
        ...(variant === "primary" ? primary : base),
        ...style,
      }}
      onMouseDown={(e) => {
        (e.currentTarget.style.transform = "scale(0.98)");
      }}
      onMouseUp={(e) => {
        (e.currentTarget.style.transform = "scale(1)");
      }}
      onMouseLeave={(e) => {
        (e.currentTarget.style.transform = "scale(1)");
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

function IconBtn({
  children,
  onClick,
  active = false,
  primary = false,
  style,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  primary?: boolean;
}) {
  const base: React.CSSProperties = {
    width: primary ? 62 : 46,
    height: primary ? 62 : 46,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: active ? "rgba(59,130,246,0.20)" : "rgba(255,255,255,0.08)",
    color: primary ? "#001018" : "#fff",
    fontWeight: 900,
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
    transition: "transform 120ms ease, background 160ms ease, border-color 160ms ease",
    userSelect: "none",
    WebkitTapHighlightColor: "transparent",
  };

  const prim: React.CSSProperties = {
    ...base,
    border: "none",
    background: "rgba(59,130,246,0.95)",
    boxShadow: "0 12px 40px rgba(59,130,246,0.25)",
  };

  const s = primary ? prim : base;

  return (
    
    <button
      onClick={onClick}
      style={{ ...s, ...style }}
      onMouseDown={(e) => {
        (e.currentTarget.style.transform = "scale(0.98)");
      }}
      onMouseUp={(e) => {
        (e.currentTarget.style.transform = "scale(1)");
      }}
      onMouseLeave={(e) => {
        (e.currentTarget.style.transform = "scale(1)");
      }}
      {...rest}
    >
      {children}
    </button>
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
        color: active ? "rgba(59,130,246,0.95)" : "rgba(255,255,255,0.75)",
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
  onOpenTrackMenu,
}: {
  tracks: Track[];
  currentTrackId: string | null;
  favIds: Set<string>;
  onPlay: (id: string) => void;
  onOpenTrackMenu: (track: Track) => void;
}) {

  if (tracks.length === 0) {
    return <div style={{ opacity: 0.75, padding: 12 }}>Пусто.</div>;
  }

  return (

    <div
      style={{
        display: "grid",
        gap: 10,
        width: "100%",
        minWidth: 0,
      }}
    >
      {tracks.map((t) => {
        const isActive = currentTrackId === t.id;

        return (

          <div
            key={t.id}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: 12,
              borderRadius: 18,
              border: isActive
                ? "1px solid rgba(59,130,246,0.55)"
                : "1px solid rgba(255,255,255,0.08)",
              background: isActive
                ? "rgba(59,130,246,0.10)"
                : "rgba(255,255,255,0.05)",
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
                    : "linear-gradient(135deg, rgba(59,130,246,0.35), rgba(255,255,255,0.06))",
                  flex: "0 0 auto",
                }}
              />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 900,
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
            </button>

            <button
              onClick={() => onOpenTrackMenu(t)}
              style={{
                width: 38,
                height: 38,
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.06)",
                color: "#fff",
                fontWeight: 900,
                cursor: "pointer",
                flex: "0 0 auto",
              }}
              aria-label="more"
              title="Ещё"
            >
              ⋯
            </button>
          </div>
        );
      })}
    </div>
  );
}