import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  const lastfmKey = process.env.LASTFM_API_KEY;

  if (!q) {
    return NextResponse.json({ success: false, results: [] }, { status: 400 });
  }

  const results: Array<{
    id: string;
    title: string;
    artist: string;
    album?: string | null;
    year?: number | null;
    source: "musicbrainz" | "lastfm";
  }> = [];

  try {
    // MusicBrainz
    try {
      const mbQuery = encodeURIComponent(q);
      const mbRes = await fetch(
        `https://musicbrainz.org/ws/2/recording?query=${mbQuery}&fmt=json&limit=8`,
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

        for (const r of recordings) {
          const artist =
            Array.isArray(r?.["artist-credit"]) && r["artist-credit"][0]?.name
              ? String(r["artist-credit"][0].name)
              : "Unknown artist";

          const release = Array.isArray(r?.releases) ? r.releases[0] : null;

          results.push({
            id: `mb-${r.id}`,
            title: String(r?.title || "Unknown title"),
            artist,
            album: release?.title || null,
            year: release?.date ? Number(String(release.date).slice(0, 4)) : null,
            source: "musicbrainz",
          });
        }
      }
    } catch (e) {
      console.error("MusicBrainz search error:", e);
    }

    // Last.fm
    try {
      if (lastfmKey) {
        const lfUrl =
          `https://ws.audioscrobbler.com/2.0/?method=track.search` +
          `&track=${encodeURIComponent(q)}` +
          `&api_key=${encodeURIComponent(lastfmKey)}` +
          `&format=json` +
          `&limit=8`;

        const lfRes = await fetch(lfUrl, { cache: "no-store" });

        if (lfRes.ok) {
          const lfData = await lfRes.json();
          const matches = Array.isArray(lfData?.results?.trackmatches?.track)
            ? lfData.results.trackmatches.track
            : [];

          for (const t of matches) {
            results.push({
              id: `lf-${t?.mbid || `${t?.artist}-${t?.name}`}`,
              title: String(t?.name || "Unknown title"),
              artist: String(t?.artist || "Unknown artist"),
              album: null,
              year: null,
              source: "lastfm",
            });
          }
        }
      }
    } catch (e) {
      console.error("Last.fm search error:", e);
    }

    // Убираем дубли
    const deduped = Array.from(
      new Map(
        results.map((r) => [
          `${r.title.toLowerCase()}__${r.artist.toLowerCase()}__${r.source}`,
          r,
        ])
      ).values()
    );

    return NextResponse.json({
      success: true,
      results: deduped.slice(0, 12),
    });
  } catch (e) {
    console.error("search-music route error:", e);
    return NextResponse.json({ success: false, results: [] });
  }
}