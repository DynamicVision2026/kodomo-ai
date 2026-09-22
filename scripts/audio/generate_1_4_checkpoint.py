#!/usr/bin/env python3
"""
Story 1-4 (oyatsu) CHECKPOINT audio — Google Cloud Text-to-Speech generation, Python/stdlib
variant.

Local-machine fallback for scripts/audio/generate-1-4-checkpoint.ts (that file is unmodified and
remains the canonical source of truth — this script mirrors its LINES/VOICES/manifest logic
exactly, line for line). See that file's own header comment for the Architect-resolved たとえば
content fix applied to this script's LINES.

---- Prerequisite (already true on the Founder's Mac, nothing to set up here) ----
`gcloud auth application-default login` already run for project kodomo-ai.

---- Usage ----
  python3 scripts/audio/generate_1_4_checkpoint.py --dry-run
  python3 scripts/audio/generate_1_4_checkpoint.py
  python3 scripts/audio/generate_1_4_checkpoint.py --only=3
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
OUT_DIR = os.path.join("public", "audio", "m1", "1-4-oyatsu")
MANIFEST_PATH = os.path.join("src", "audio", "content", "oyatsu.json")

# Story 1-4 CHECKPOINT — Audio Reference Scripts rev.3, §3B, with the §3D たとえば fix applied.
# Kept byte-for-byte identical to scripts/audio/generate-1-4-checkpoint.ts's own LINES array.
LINES = [
    {"speaker": "GUIDE", "text": "ポン太も、同じところを ほってみたんだって。"},
    {"speaker": "PONTA", "text": "うん！　遠足のおやつの話。「バナナは、おやつに入りますか？」ってやつ。"},
    {"speaker": "GUIDE", "text": "ロボは、さいしょ何て言った？"},
    {"speaker": "PONTA", "text": "「おやつは、300円までって、きまってるんだよ」って。だから、わかった！って思ったの。"},
    {"speaker": "GUIDE", "text": "そのとき、自分に聞いたことば、おぼえてる？　「これで、ほんとうに……」", "pauseAfterMs": 3000},
    {"speaker": "PONTA", "text": "「……わかった？」って。そしたらね、ぜんぜんわかってなかったの。"},
    {"speaker": "GUIDE", "text": "どうして？"},
    {"speaker": "PONTA", "text": "だって、300円までって言われても、バナナがおやつなのかどうか、わかんないんだもん。"},
    {"speaker": "GUIDE", "text": "なるほど。"},
    {"speaker": "PONTA", "text": "それでね、はじめ「バナナって、何円？」って聞いちゃった。"},
    {"speaker": "GUIDE", "text": "うん。"},
    {"speaker": "PONTA", "text": "でも、それじゃ、ぜんぜんほれなかった。バナナが何円でも、おやつかどうかは、わからないから。"},
    {"speaker": "GUIDE", "text": "そういうこと、あるよね。"},
    {"speaker": "GUIDE", "text": "そのあと、自分に何て聞いた？　「まだ わからないのは……」", "pauseAfterMs": 3000},
    {"speaker": "PONTA", "text": "「……どこ？」　わからないのは、「なにがおやつで、なにがおやつじゃないか」だって思ったの。"},
    {"speaker": "GUIDE", "text": "それで、つぎは？　「じゃあ、つぎに……」", "pauseAfterMs": 3000},
    {"speaker": "PONTA", "text": "「……何を きけば いい？」　それでね、「どういうこと？」って聞いてみたの。そしたら、バナナは くだものだから、べつあつかいなんだって。"},
    {"speaker": "GUIDE", "text": "なるほど。"},
    {"speaker": "PONTA", "text": "それから「ほかにもある？」って聞いたら、おやつに するかは、クラスや学校でも ちがうって。"},
    {"speaker": "GUIDE", "text": "へえ。"},
    {"speaker": "PONTA", "text": "さいごに「なんで、ちがうの？」って聞いたら……ねっこに ついたんだ。"},
    {"speaker": "GUIDE", "text": "聞いているきみも、ねっこについたよね。"},
    {"speaker": "GUIDE", "text": "でも、ねっこまでの道は、どうだった？　ポン太と、同じだった？　ちがった？", "pauseAfterMs": 3000},
    {"speaker": "GUIDE", "text": "どっちでも、いいんだよ。同じねっこでも、ほる道は、いろいろあるからね。"},
    {"speaker": "PONTA", "text": "へえ。きみはどんなふうにほったのかな。聞いてみたいな。"},
    {"speaker": "GUIDE", "text": "こんど、ほかのきまりでも、「これは、きまりに入る？　入らない？」って、考えてみてね。"},
]

VOICES = {
    "GUIDE": {"languageCode": "ja-JP", "name": "ja-JP-Neural2-B", "pitch": 0, "speakingRate": 0.97},
    "PONTA": {"languageCode": "ja-JP", "name": "ja-JP-Neural2-C", "pitch": 2.0, "speakingRate": 1.05},
    "ROBOT": {"languageCode": "ja-JP", "name": "ja-JP-Neural2-D", "pitch": -1.0, "speakingRate": 1.0},
}

ROBOT_LINE = "おやつは、300円までって、きまってるんだよ。"


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
            "audioUrl": f"/audio/m1/1-4-oyatsu/{item['file']}", "pauseAfterMs": item["pauseAfterMs"],
        }
        if only_index is None:
            manifest_lines.append(entry)
        else:
            manifest_lines[item["index"]] = entry
        print(f"wrote {out_path}")

    manifest = {
        **existing_manifest,
        "missionId": "m1-s2-1-4",
        "role": "CHECKPOINT",
        "audioStatus": "ready",
        "robotLine": ROBOT_LINE,
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
