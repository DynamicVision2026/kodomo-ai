#!/usr/bin/env python3
"""
Bank B11 (bank-arigatou) TRANSFER audio — Google Cloud Text-to-Speech generation.

Local-machine fallback for scripts/audio/generate-b11-arigatou.ts (that file is unmodified and
remains the canonical source of truth — this script mirrors its LINES/VOICES/manifest logic
exactly, line for line, same pattern as every other Python generator in this directory).

---- Prerequisite (already true on the Founder's Mac, nothing to set up here) ----
`gcloud auth application-default login` already run for project kodomo-ai.

---- Usage ----
  python3 scripts/audio/generate_b11_arigatou.py --dry-run
  python3 scripts/audio/generate_b11_arigatou.py
  python3 scripts/audio/generate_b11_arigatou.py --only=3
"""
import base64
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

DEFAULT_GAP_MS = 350
PROJECT_ID = "kodomo-ai"
OUT_DIR = os.path.join("public", "audio", "m1", "b11-arigatou")
MANIFEST_PATH = os.path.join("src", "audio", "content", "bank-arigatou.json")

# Kept byte-for-byte identical to scripts/audio/generate-b11-arigatou.ts's own LINES array.
LINES = [
    {"speaker": "GUIDE", "text": "ポン太、買いものの「ありがとう」のところを ほってみたんだって？"},
    {"speaker": "PONTA", "text": "うん。ロボは、さいしょ「お店の人も、お金が もらえて、うれしいんだよ」って。"},
    {"speaker": "PONTA", "text": "自分に聞いたんだ。「これで、ほんとうに わかった？」って。"},
    {"speaker": "PONTA", "text": "でもね、はじめ「お金って、いくら はらったの？」って聞いちゃった。"},
    {"speaker": "PONTA", "text": "ほれなかった。いくらかじゃなくて、なんで ありがとうって 言うのかを 知りたかったのに。"},
    {"speaker": "GUIDE", "text": "そういうこと、あるよね。"},
    {"speaker": "PONTA", "text": "それで、「まだ わからないのは、どこ？」って考えて、「なんで、お店の人だけ 言うの？」って聞いたの。"},
    {"speaker": "PONTA", "text": "ロボが、「買う人も、ほしいものが 手に入って うれしいんだよ」って。"},
    {"speaker": "PONTA", "text": "え、買う人も？って、ここで また まよったんだ。"},
    {"speaker": "PONTA", "text": "「じゃあ、つぎに 何を きけば いい？」って考えて、「ほかにもある？」って聞いたら……ねっこについたんだ。"},
    {"speaker": "GUIDE", "text": "ポン太は、二回 まよったんだね。"},
    {"speaker": "GUIDE", "text": "聞いているきみは、どうだった？　すっと ほれた？　どこかで まよった？", "pauseAfterMs": 3000},
    {"speaker": "GUIDE", "text": "どっちでも、いいんだよ。"},
    {"speaker": "GUIDE", "text": "こんど お店で 買いものを したら、だれが だれに「ありがとう」って 言っているか、気づいてみてね。"},
]

VOICES = {
    "GUIDE": {"languageCode": "ja-JP", "name": "ja-JP-Neural2-B", "pitch": 0, "speakingRate": 0.97},
    "PONTA": {"languageCode": "ja-JP", "name": "ja-JP-Neural2-C", "pitch": 2.0, "speakingRate": 1.05},
    "ROBOT": {"languageCode": "ja-JP", "name": "ja-JP-Neural2-D", "pitch": -1.0, "speakingRate": 1.0},
}


def output_plan():
    plan = []
    for i, line in enumerate(LINES):
        plan.append({
            "index": i,
            "speaker": line["speaker"],
            "text": line["text"],
            "file": f"{i:02d}-{line['speaker'].lower()}.mp3",
            "pauseAfterMs": line.get("pauseAfterMs", DEFAULT_GAP_MS),
        })
    return plan


def dry_run():
    plan = output_plan()
    total_chars = sum(len(l["text"]) for l in LINES)
    print(f"{len(plan)} lines, {total_chars} characters total.")
    print(f"Output dir: {OUT_DIR}")
    print(f"Manifest:   {MANIFEST_PATH}")
    for item in plan:
        print(f"  [{item['index']:02d}] {item['speaker']:<5} (+{item['pauseAfterMs']}ms) {item['file']}  \"{item['text']}\"")


def get_access_token() -> str:
    result = subprocess.run(
        ["gcloud", "auth", "application-default", "print-access-token"],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        sys.exit(
            "Could not get an access token from gcloud ADC.\n"
            "Run: gcloud auth application-default login\n"
            f"stderr: {result.stderr.strip()}"
        )
    return result.stdout.strip()


def synthesize(token: str, text: str, voice: dict) -> bytes:
    body = json.dumps({
        "input": {"text": text},
        "voice": {"languageCode": voice["languageCode"], "name": voice["name"]},
        "audioConfig": {"audioEncoding": "MP3", "pitch": voice["pitch"], "speakingRate": voice["speakingRate"]},
    }).encode("utf-8")
    req = urllib.request.Request(
        "https://texttospeech.googleapis.com/v1/text:synthesize",
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "X-Goog-User-Project": PROJECT_ID,
        },
    )
    try:
        with urllib.request.urlopen(req) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        sys.exit(f"Cloud TTS request failed ({e.code}): {e.read().decode('utf-8')}")
    return base64.b64decode(payload["audioContent"])


def generate(only_index: int = None):
    plan = output_plan()
    targets = plan if only_index is None else [item for item in plan if item["index"] == only_index]
    if only_index is not None and not targets:
        sys.exit(f"--only={only_index}: no such line (valid range 0-{len(plan) - 1})")

    existing_manifest = {}
    if os.path.exists(MANIFEST_PATH):
        with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
            existing_manifest = json.load(f)
    if only_index is not None and not isinstance(existing_manifest.get("lines"), list):
        sys.exit("--only requires a full run to have already produced the manifest's own "
                  "\"lines\" array — run without --only first.")

    token = get_access_token()
    os.makedirs(OUT_DIR, exist_ok=True)

    manifest_lines = [] if only_index is None else list(existing_manifest["lines"])
    for item in targets:
        voice = VOICES[item["speaker"]]
        audio = synthesize(token, item["text"], voice)
        out_path = os.path.join(OUT_DIR, item["file"])
        with open(out_path, "wb") as f:
            f.write(audio)
        entry = {
            "speaker": item["speaker"], "text": item["text"],
            "audioUrl": f"/audio/m1/b11-arigatou/{item['file']}", "pauseAfterMs": item["pauseAfterMs"],
        }
        if only_index is None:
            manifest_lines.append(entry)
        else:
            manifest_lines[item["index"]] = entry
        print(f"wrote {out_path}")

    manifest = {
        **existing_manifest,
        "missionId": "bank-b11",
        "role": "TRANSFER",
        "audioStatus": "ready",
        "robotLine": "お店の人も、お金が もらえて、うれしいんだよ。",
        "lines": manifest_lines,
    }
    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"wrote {MANIFEST_PATH}")

    suffix = f" (--only={only_index})" if only_index is not None else ""
    print(f"\n{len(targets)} line(s) synthesized{suffix}.")


if __name__ == "__main__":
    argv = sys.argv[1:]
    only_arg = next((a for a in argv if a.startswith("--only=")), None)
    if "--dry-run" in argv:
        dry_run()
    elif only_arg:
        generate(only_index=int(only_arg[len("--only="):]))
    else:
        generate()
