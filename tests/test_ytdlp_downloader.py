import json
import os
import tempfile
import unittest
from pathlib import Path
from subprocess import CompletedProcess
from unittest.mock import patch

os.environ["DATABASE_URL"] = "sqlite:///:memory:"

from app.downloaders.ytdlp_downloader import YtdlpDownloader


class YtdlpDownloaderBilibiliFallbackTest(unittest.TestCase):
    def test_parse_bilibili_initial_state(self):
        html = (
            "<html><script>"
            'window.__INITIAL_STATE__={"videoData":{"bvid":"BV123","cid":456,"title":"Demo"}};'
            "(function(){})"
            "</script></html>"
        )

        state = YtdlpDownloader._parse_bilibili_initial_state(html)

        self.assertEqual(state["videoData"]["bvid"], "BV123")
        self.assertEqual(state["videoData"]["cid"], 456)

    def test_selects_highest_bandwidth_audio_url(self):
        info = {
            "bilibili_playurl": {
                "code": 0,
                "data": {
                    "dash": {
                        "audio": [
                            {"bandwidth": 64000, "baseUrl": "https://example.test/low.m4s"},
                            {"bandwidth": 128000, "baseUrl": "https://example.test/high.m4s"},
                        ]
                    }
                },
            }
        }

        audio_url = YtdlpDownloader._select_bilibili_audio_url(info)

        self.assertEqual(audio_url, "https://example.test/high.m4s")

    def test_selects_h264_video_stream_under_720p(self):
        info = {
            "bilibili_playurl": {
                "code": 0,
                "data": {
                    "dash": {
                        "video": [
                            {
                                "height": 1080,
                                "width": 1920,
                                "bandwidth": 1_000_000,
                                "codecs": "avc1.640032",
                                "baseUrl": "https://example.test/1080p-avc.m4s",
                            },
                            {
                                "height": 720,
                                "width": 1280,
                                "bandwidth": 800_000,
                                "codecs": "avc1.640028",
                                "baseUrl": "https://example.test/720p-avc.m4s",
                            },
                            {
                                "height": 720,
                                "width": 1280,
                                "bandwidth": 900_000,
                                "codecs": "hev1.1.6.L120.90",
                                "baseUrl": "https://example.test/720p-hevc.m4s",
                            },
                        ]
                    }
                },
            }
        }

        video_url = YtdlpDownloader._select_bilibili_video_url(info)

        self.assertEqual(video_url, "https://example.test/720p-avc.m4s")

    def test_bilibili_headers_include_origin_and_referer(self):
        headers = YtdlpDownloader._bilibili_headers()

        self.assertEqual(headers["Origin"], "https://www.bilibili.com")
        self.assertEqual(headers["Referer"], "https://www.bilibili.com/")
        self.assertIn("Mozilla/5.0", headers["User-Agent"])

    def test_bilibili_curl_fallback_downloads_and_converts_audio(self):
        downloader = YtdlpDownloader()
        page_html = (
            "<html><script>"
            'window.__INITIAL_STATE__={"videoData":{"bvid":"BV123","cid":456,'
            '"title":"Demo Title","duration":12,"pic":"https://example.test/cover.jpg"}};'
            "(function(){})"
            "</script></html>"
        ).encode()
        playurl_json = json.dumps(
            {
                "code": 0,
                "message": "OK",
                "data": {
                    "dash": {
                        "audio": [
                            {
                                "bandwidth": 128000,
                                "baseUrl": "https://example.test/audio.m4s",
                            }
                        ]
                    }
                },
            }
        ).encode()

        def fake_run(cmd, **kwargs):
            if cmd[0] == "curl" and "www.bilibili.com" in cmd[-1]:
                return CompletedProcess(cmd, 0, stdout=page_html, stderr=b"")
            if cmd[0] == "curl" and "api.bilibili.com" in cmd[-1]:
                return CompletedProcess(cmd, 0, stdout=playurl_json, stderr=b"")
            if cmd[0] == "curl" and any("audio.m4s" in part for part in cmd):
                output_path = Path(cmd[cmd.index("--output") + 1])
                output_path.write_bytes(b"audio")
                return CompletedProcess(cmd, 0, stdout=b"", stderr=b"")
            if cmd[0] == "ffmpeg":
                Path(cmd[-1]).write_bytes(b"mp3")
                return CompletedProcess(cmd, 0, stdout=b"", stderr=b"")
            raise AssertionError(f"Unexpected command: {cmd}")

        with tempfile.TemporaryDirectory() as temp_dir, patch("subprocess.run", side_effect=fake_run):
            result = downloader._download_bilibili_audio_with_curl(
                video_url="https://www.bilibili.com/video/BV123/",
                output_dir=temp_dir,
            )

        self.assertEqual(result.title, "Demo Title")
        self.assertEqual(result.duration, 12)
        self.assertEqual(result.video_id, "BV123")
        self.assertTrue(result.file_path.endswith(".mp3"))
        self.assertEqual(result.cover_url, "https://example.test/cover.jpg")

    def test_bilibili_curl_fallback_downloads_and_merges_video(self):
        downloader = YtdlpDownloader()
        page_html = (
            "<html><script>"
            'window.__INITIAL_STATE__={"videoData":{"bvid":"BV123","cid":456,'
            '"title":"Demo Title","duration":12,"pic":"https://example.test/cover.jpg"}};'
            "(function(){})"
            "</script></html>"
        ).encode()
        playurl_json = json.dumps(
            {
                "code": 0,
                "message": "OK",
                "data": {
                    "dash": {
                        "video": [
                            {
                                "height": 720,
                                "width": 1280,
                                "bandwidth": 800000,
                                "codecs": "avc1.640028",
                                "baseUrl": "https://example.test/video.m4s",
                            }
                        ],
                        "audio": [
                            {
                                "bandwidth": 128000,
                                "baseUrl": "https://example.test/audio.m4s",
                            }
                        ],
                    }
                },
            }
        ).encode()

        def fake_run(cmd, **kwargs):
            if cmd[0] == "curl" and "www.bilibili.com" in cmd[-1]:
                return CompletedProcess(cmd, 0, stdout=page_html, stderr=b"")
            if cmd[0] == "curl" and "api.bilibili.com" in cmd[-1]:
                return CompletedProcess(cmd, 0, stdout=playurl_json, stderr=b"")
            if cmd[0] == "curl" and any("video.m4s" in part for part in cmd):
                output_path = Path(cmd[cmd.index("--output") + 1])
                output_path.write_bytes(b"video")
                return CompletedProcess(cmd, 0, stdout=b"", stderr=b"")
            if cmd[0] == "curl" and any("audio.m4s" in part for part in cmd):
                output_path = Path(cmd[cmd.index("--output") + 1])
                output_path.write_bytes(b"audio")
                return CompletedProcess(cmd, 0, stdout=b"", stderr=b"")
            if cmd[0] == "ffmpeg":
                Path(cmd[-1]).write_bytes(b"mp4")
                return CompletedProcess(cmd, 0, stdout=b"", stderr=b"")
            raise AssertionError(f"Unexpected command: {cmd}")

        with tempfile.TemporaryDirectory() as temp_dir, patch("subprocess.run", side_effect=fake_run):
            video_path = downloader._download_bilibili_video_with_curl(
                video_url="https://www.bilibili.com/video/BV123/",
                output_dir=temp_dir,
            )
            self.assertTrue(Path(video_path).exists())

        self.assertTrue(video_path.endswith(".mp4"))


if __name__ == "__main__":
    unittest.main()
