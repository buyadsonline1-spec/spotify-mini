import { NextResponse } from "next/server";

function normalizeTag(tag: string) {
  return tag.trim().toLowerCase();
}

function pickGenreFromTags(tags: string[]) {
  const blacklist = new Set([
    "seen live",
    "favorites",
    "favourite",
    "favorite",
    "awesome",
    "love",
    "00s",
    "10s",
    "2010s",
    "2020s",
    "male vocalists",
    "female vocalists",
  ]);

  const preferred = [
    "pop",
    "rock",
    "hip-hop",
    "rap",
    "rnb",
    "electronic",
    "dance",
    "house",
    "techno",
    "trance",
    "dubstep",
    "drum and bass",
    "indie",
    "alternative",
    "metal",
    "punk",
    "jazz",
    "blues",
    "classical",
    "ambient",
    "lo-fi",
    "lofi",
    "folk",
    "country",
    "soul",
    "funk",
    "disco",
  ];

  const clean = tags
    .map(normalizeTag)
    .filter((t) => t && !blacklist.has(t));

  for (const p of preferred) {
    const found = clean.find((t) => t === p);
    if (found) {
      if (found === "lofi") return "Lo-fi";
      if (found === "rnb") return "R&B";
      if (found === "hip-hop") return "Hip-Hop";
      return found.charAt(0).toUpperCase() + found.slice(1);
    }
  }

  const first = clean[0];
  if (!first) return null;

  if (first === "lofi") return "Lo-fi";
  if (first === "rnb") return "R&B";
  if (first === "hip-hop") return "Hip-Hop";

  return first.charAt(0).toUpperCase() + first.slice(1);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const artist = searchParams.get("artist");
  const track = searchParams.get("track");
  const lastfmKey = process.env.LASTFM_API_KEY;

  if (!artist || !track) {
    return NextResponse.json(
      { success: false, error: "artist and track required" },
      { status: 400 }
    );
  }

  let album: string | null = null;
  let year: number | null = null;
  let mbid: string | null = null;
  let genre: string | null = null;
  let tags: string[] = [];

  // MusicBrainz
  try {
    const mbQuery = encodeURIComponent(`artist:${artist} recording:${track}`);
    const mbRes = await fetch(
      `https://musicbrainz.org/ws/2/recording/?query=${mbQuery}&fmt=json&limit=1`,
      {
        headers: {
          "User-Agent": "Pokoro/1.0 (private app)",
        },
        cache: "no-store",
      }
    );

    if (mbRes.ok) {
      const mbData = await mbRes.json();
      const recordings = Array.isArray(mbData?.recordings) ? mbData.recordings : [];

      const normalizedTrack = track.trim().toLowerCase();
      const normalizedArtist = artist.trim().toLowerCase();

      const recording =
        recordings.find((r: any) => {
          const titleOk = String(r?.title || "").trim().toLowerCase() === normalizedTrack;
          const artistOk = Array.isArray(r?.["artist-credit"])
            ? r["artist-credit"].some(
                (a: any) =>
                  String(a?.name || "").trim().toLowerCase() === normalizedArtist
              )
            : false;

          return titleOk && artistOk;
        }) || recordings[0];

      const release = recording?.releases?.[0];

      album = release?.title || null;
      year = release?.date ? Number(String(release.date).slice(0, 4)) : null;
      mbid = recording?.id || null;
    }
  } catch (e) {
    console.error("MusicBrainz error:", e);
  }

  // Last.fm
  // Last.fm
  try {
    if (lastfmKey) {
      const base = "https://ws.audioscrobbler.com/2.0/";

      // 1) track.getTopTags
      const trackTagsUrl =
        `${base}?method=track.getTopTags` +
        `&artist=${encodeURIComponent(artist)}` +
        `&track=${encodeURIComponent(track)}` +
        `&api_key=${encodeURIComponent(lastfmKey)}` +
        `&format=json`;

      const trackTagsRes = await fetch(trackTagsUrl, { cache: "no-store" });

      if (trackTagsRes.ok) {
        const trackTagsData = await trackTagsRes.json();
        const trackTags = Array.isArray(trackTagsData?.toptags?.tag)
          ? trackTagsData.toptags.tag
          : [];

        tags = trackTags
          .map((t: any) => (typeof t?.name === "string" ? t.name : ""))
          .filter(Boolean);
      }

      // 2) album.getInfo → иногда там есть теги
      if (tags.length === 0 && album) {
        const albumInfoUrl =
          `${base}?method=album.getInfo` +
          `&artist=${encodeURIComponent(artist)}` +
          `&album=${encodeURIComponent(album)}` +
          `&api_key=${encodeURIComponent(lastfmKey)}` +
          `&format=json`;

        const albumInfoRes = await fetch(albumInfoUrl, { cache: "no-store" });

        if (albumInfoRes.ok) {
          const albumInfoData = await albumInfoRes.json();
          const albumTags = Array.isArray(albumInfoData?.album?.tags?.tag)
            ? albumInfoData.album.tags.tag
            : [];

          tags = albumTags
            .map((t: any) => (typeof t?.name === "string" ? t.name : ""))
            .filter(Boolean);
        }
      }

      // 3) artist.getTopTags
      if (tags.length === 0) {
        const artistTagsUrl =
          `${base}?method=artist.getTopTags` +
          `&artist=${encodeURIComponent(artist)}` +
          `&api_key=${encodeURIComponent(lastfmKey)}` +
          `&format=json`;

        const artistTagsRes = await fetch(artistTagsUrl, { cache: "no-store" });

        if (artistTagsRes.ok) {
          const artistTagsData = await artistTagsRes.json();
          const artistTags = Array.isArray(artistTagsData?.toptags?.tag)
            ? artistTagsData.toptags.tag
            : [];

          tags = artistTags
            .map((t: any) => (typeof t?.name === "string" ? t.name : ""))
            .filter(Boolean);
        }
      }

      genre = pickGenreFromTags(tags);
    }
  } catch (e) {
    console.error("Last.fm error:", e);
  }

  return NextResponse.json({
    success: Boolean(album || year || mbid || genre || tags.length),
    album,
    year,
    mbid,
    genre,
    tags,
    hasLastFmKey: Boolean(lastfmKey),
  });
}