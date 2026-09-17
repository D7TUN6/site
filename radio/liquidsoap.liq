#!/usr/bin/liquidsoap
# d7tun6 24/7 radio
# pulls playlist from local web server and streams to icecast

# ── logging ──
# stdout → journald (the systemd unit runs sandboxed with a read-only /var/log)
set("log.file", false)
set("log.stdout", true)
set("log.level", 3)

# ── config (from environment; defaults match the NixOS unit + site server) ──
playlist_host = environment.get(default = "127.0.0.1", "PLAYLIST_HOST")
playlist_port = int_of_string(environment.get(default = "3001", "PLAYLIST_PORT"))
playlist_url = "http://#{playlist_host}:#{playlist_port}/media/radio/playlist.m3u8"

icecast_host = environment.get(default = "localhost", "ICECAST_HOST")
icecast_port = int_of_string(environment.get(default = "8000", "ICECAST_PORT"))
icecast_pass = environment.get(default = "changeme-radio-source", "ICECAST_SOURCE_PASSWORD")
icecast_mount = environment.get(default = "/stream.ogg", "ICECAST_MOUNT")
icecast_name = environment.get(default = "d7tun6 radio", "ICECAST_NAME")
icecast_desc = environment.get(default = "24/7 d7tun6 broadcast", "ICECAST_DESCRIPTION")
icecast_genre = environment.get(default = "Electronic", "ICECAST_GENRE")
icecast_url = environment.get(default = "https://d7tun6.site", "ICECAST_URL")

# ── fetch playlist from local server ──
process.run("curl --retry 3 --retry-delay 5 -o /tmp/radio_playlist.m3u8 #{playlist_url}")

# ── source ──
# playlist() is fallible (e.g. while re-fetching) — fall back to silence so
# output.icecast always has an infallible source feeding it.
radio_src = playlist("/tmp/radio_playlist.m3u8")

# apply some processing
radio = amplify(1.0, fallback(track_sensitive = false, [radio_src, blank()]))

# ── output to icecast ──
# Ogg Vorbis mount: the site's <audio> player consumes a native ogg stream
# (hls.js is out of the radio path), and the "Artist - Title" tags come from
# the EXTINF entries of the playlist fetched below.
output.icecast(
  %vorbis(quality=0.5, samplerate=44100, channels=2),
  host = icecast_host,
  port = icecast_port,
  password = icecast_pass,
  mount = icecast_mount,
  name = icecast_name,
  description = icecast_desc,
  genre = icecast_genre,
  url = icecast_url,
  public = true,
  radio
)