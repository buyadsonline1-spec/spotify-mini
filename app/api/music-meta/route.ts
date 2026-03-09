import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const artist = searchParams.get("artist");
  const track = searchParams.get("track");

  if (!artist || !track) {
    return NextResponse.json({ error: "artist and track required" }, { status: 400 });
  }

  try {
    const query = encodeURIComponent(`artist:${artist} recording:${track}`);

    const mbRes = await fetch(
      `https://musicbrainz.org/ws/2/recording/?query=${query}&fmt=json&limit=1`
    );

    const mbData = await mbRes.json();

    const recording = mbData.recordings?.[0];

    if (!recording) {
      return NextResponse.json({ success: false });
    }

    const release = recording.releases?.[0];

    const album = release?.title || null;
    const year = release?.date?.slice(0, 4) || null;
    const mbid = recording.id;

    return NextResponse.json({
      success: true,
      album,
      year,
      mbid,
    });
  } catch (e) {
    console.error(e);

    return NextResponse.json({ success: false });
  }
}