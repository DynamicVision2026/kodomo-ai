#!/usr/bin/env python3
"""
Story 1-1 (chanto) MODEL audio — Google Cloud Text-to-Speech generation, Python/stdlib variant.

Local-machine fallback for scripts/audio/generate-1-1-model.ts (that file is unmodified and
remains the canonical source of truth — this script mirrors its LINES/VOICES/manifest logic
exactly, line for line, so the two stay interchangeable). Written because the Founder's local
Mac has no `tsx` and npm install is off-limits there (an unrelated TLS issue) — this uses only
the Python standard library (urllib, json, base64, subprocess) plus the Founder's own existing
Google ADC session, so nothing new needs installing on either side.

---- Prerequisite (already true on the Founder's Mac, nothing to set up here) ----
`gcloud auth application-default login` already run for project kodomo-ai. This script shells
out to `gcloud auth application-default print-access-token` to get a bearer token from that
existing session — no service-account key, no new credential file, no pip install.

---- Usage ----
  python3 scripts/audio/generate_1_1_model.py --dry-run   # validate LINES/paths, no API calls
  python3 scripts/audio/generate_1_1_model.py             # the real run
  python3 scripts/audio/generate_1_1_model.py --only=38   # re-synthesize ONE line only (by
                                                            # index) — requires a full run to have
                                                            # already produced the manifest's own
                                                            # "lines" array; merges into it, leaves
                                                            # every other line's file/entry alone
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
OUT_DIR = os.path.join("public", "audio", "m1", "1-1-chanto")
MANIFEST_PATH = os.path.join("src", "audio", "content", "chanto.json")

# Story 1-1 MODEL — Audio Reference Scripts rev.3, §1B, verbatim. Kept byte-for-byte identical
# to scripts/audio/generate-1-1-model.ts's own LINES array. Both ROBOT lines (index 6, 38) are
# the mission's own authored engine strings (chanto/s2.json), copied verbatim — see that file's
# own header comment.
LINES = [
    {"speaker": "GUIDE", "text": "……おや、ポン太。どうしたの？　なんだか、こまった顔をしてるね。"},
    {"speaker": "PONTA", "text": "うん……。さっきね、お母さんに「ちゃんとしなさい！」って言われたの。"},
    {"speaker": "GUIDE", "text": "そっか。"},
    {"speaker": "PONTA", "text": "でもさ、ぼく、ちゃんとしてたつもりなんだけどな。"},
    {"speaker": "GUIDE", "text": "ふうん。……じゃあ、ロボに聞いてみる？"},
    {"speaker": "PONTA", "text": "うん！　ねえロボ、「ちゃんと」って、なに？"},
    # ROBOT — the mission's own authored layer-0 robotSays (chanto/s2.json), verbatim.
    {"speaker": "ROBOT", "text": "『ちゃんと』は、きちんとすることだよ。"},
    {"speaker": "PONTA", "text": "あ、そっか。わかった！", "pauseAfterMs": 1000},
    {"speaker": "GUIDE", "text": "これで、ほんとうに わかった？"},
    {"speaker": "PONTA", "text": "うん。まじめに、きちんと、でしょ？"},
    {"speaker": "GUIDE", "text": "うん、ロボはそう言ったね。……じゃあポン太、今から何をすればいい？"},
    {"speaker": "PONTA", "text": "え？　えっと……まじめに……。"},
    {"speaker": "GUIDE", "text": "まじめに、何をするの？"},
    {"speaker": "PONTA", "text": "……あれ？", "pauseAfterMs": 2000},
    {"speaker": "PONTA", "text": "わかったと思ったのに……何をすればいいのか、わかんない。"},
    {"speaker": "GUIDE", "text": "おもしろいね。答えをもらったのに、まだわからないことがある。"},
    {"speaker": "PONTA", "text": "ねえ、わかる？"},
    {"speaker": "GUIDE", "text": "うーん。わたしにも、よくわからないな。だから、いっしょに考えてみよう。"},
    {"speaker": "GUIDE", "text": "まだ わからないのは、どこ？"},
    # The single 4-second listener pause in this lesson.
    {"speaker": "GUIDE", "text": "聞いているきみも、いっしょに考えてみて。ポン太は、何がまだわからないのかな。", "pauseAfterMs": 4000},
    {"speaker": "PONTA", "text": "「まじめに」とか「きちんと」とか、ことばの意味は、わかるんだよ。でも……。"},
    {"speaker": "GUIDE", "text": "でも？"},
    {"speaker": "PONTA", "text": "お母さんが、ほんとは何をしてほしいのかが、わかんない。"},
    {"speaker": "GUIDE", "text": "なるほど。ことばの意味はわかった。でも、何をすればいいかは、まだわからないんだね。"},
    {"speaker": "PONTA", "text": "そう、それ！"},
    {"speaker": "GUIDE", "text": "それがわからないと、どうなるかな。"},
    {"speaker": "PONTA", "text": "うーん……。また「ちゃんとしなさい！」って言われちゃうかも。"},
    {"speaker": "GUIDE", "text": "そうかもしれないね。", "pauseAfterMs": 1000},
    {"speaker": "GUIDE", "text": "じゃあ、つぎに 何を きけば いい？"},
    {"speaker": "PONTA", "text": "えっと……「ちゃんとって、なに？」って、もう一回聞く！"},
    {"speaker": "GUIDE", "text": "それを聞いたら、何がわかりそう？"},
    {"speaker": "PONTA", "text": "……あ。さっきと同じ答えが、かえってきちゃうかも。"},
    {"speaker": "GUIDE", "text": "そうだね。同じ聞き方をしたら、同じ答えになるかもしれないね。"},
    {"speaker": "PONTA", "text": "じゃあ……ぼくが知りたいのは、「何をすればいいか」だから……。"},
    {"speaker": "GUIDE", "text": "うん。"},
    {"speaker": "PONTA", "text": "「いまの『ちゃんと』は、何をすればいいの？」って聞いてみる！"},
    {"speaker": "GUIDE", "text": "それなら、ポン太の知りたいことが聞けそうだね。"},
    {"speaker": "PONTA", "text": "ロボ。いまの「ちゃんと」は、何をすればいいの？"},
    # ROBOT's second line — resolved to the mission's own authored layer-1 robotSays
    # (chanto/s2.json: '{部屋|へや}をかたづけるときは、もとの{場所|ばしょ}にもどすことかな。'),
    # ruby markup stripped for speech, verbatim otherwise. Architect-verified against current
    # repo truth; supersedes the earlier draft wording about cleaning and eating.
    {"speaker": "ROBOT", "text": "部屋をかたづけるときは、もとの場所にもどすことかな。"},
    {"speaker": "PONTA", "text": "えっ！"},
    {"speaker": "GUIDE", "text": "おや。"},
    {"speaker": "PONTA", "text": "同じ「ちゃんと」なのに、そうじとごはんで、ちがう！"},
    {"speaker": "GUIDE", "text": "ほんとだね。さっきより、何がわかった？"},
    {"speaker": "PONTA", "text": "「ちゃんと」の中身は、ひとつじゃないってこと。", "pauseAfterMs": 1000},
    {"speaker": "GUIDE", "text": "……さあ。これで、ほんとうに わかった？"},
    {"speaker": "PONTA", "text": "うーん……。"},
    {"speaker": "GUIDE", "text": "ここから先は、聞いているきみのばんだよ。"},
]

# Three DIFFERENT ja-JP Neural2 voices — matches generate-1-1-model.ts's own VOICES exactly.
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
            # Required for user ADC credentials (as opposed to a service-account key) to bill/
            # quota the call against the right project.
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
    """`only_index` (--only=N): re-synthesizes ONLY that one line, merging its new mp3/manifest
    entry into the EXISTING `lines` array a prior full run already produced — every other line's
    file and manifest entry is left untouched. Requires that prior full run to have happened;
    refuses otherwise rather than silently writing a 1-entry manifest."""
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

    # Preconditions checked above BEFORE fetching a token — no point shelling out to gcloud if
    # --only was already going to refuse.
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
            "audioUrl": f"/audio/m1/1-1-chanto/{item['file']}", "pauseAfterMs": item["pauseAfterMs"],
        }
        if only_index is None:
            manifest_lines.append(entry)
        else:
            manifest_lines[item["index"]] = entry
        print(f"wrote {out_path}")

    robot_line = next(l["text"] for l in LINES if l["speaker"] == "ROBOT")
    manifest = {
        **existing_manifest,
        "missionId": "m1-s2-1-1",
        "role": "MODEL",
        "audioStatus": "ready",
        "robotLine": robot_line,
        "demonstratedLayers": [0],
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
